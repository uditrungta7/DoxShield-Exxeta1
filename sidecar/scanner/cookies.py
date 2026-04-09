"""Multi-browser cookie reader for macOS."""
import glob
import json
import os
import shutil
import sqlite3
import struct
import tempfile
from pathlib import Path


def check_fda() -> bool:
    """Test if we have Full Disk Access by reading the TCC database."""
    tcc_path = Path.home() / "Library/Application Support/com.apple.TCC/TCC.db"
    try:
        conn = sqlite3.connect(f"file:{tcc_path}?mode=ro", uri=True)
        conn.execute("SELECT 1 FROM access LIMIT 1")
        conn.close()
        return True
    except Exception:
        return False


def find_browser_profiles() -> dict[str, list[Path]]:
    home = Path.home()
    profiles: dict[str, list[Path]] = {}

    # Chromium-based browsers — check multiple profile dir patterns
    chromium_paths = {
        "Chrome":  [home / "Library/Application Support/Google/Chrome"],
        "Brave":   [home / "Library/Application Support/BraveSoftware/Brave-Browser"],
        "Edge":    [home / "Library/Application Support/Microsoft Edge"],
        "Vivaldi": [home / "Library/Application Support/Vivaldi"],
        "Arc":     [
            home / "Library/Application Support/Arc/User Data",
            home / "Library/Application Support/Arc",
        ],
        "Opera":   [
            home / "Library/Application Support/com.operasoftware.Opera",
            home / "Library/Application Support/Opera Software/Opera Stable",
        ],
    }
    for browser, bases in chromium_paths.items():
        for base in bases:
            if not base.exists():
                continue
            cookie_files = list(base.rglob("Cookies"))[:8]
            # Filter to only actual SQLite cookie DBs (not binarycookies or dirs)
            cookie_files = [p for p in cookie_files
                            if p.is_file() and not p.suffix == ".binarycookies"]
            if cookie_files:
                profiles[browser] = cookie_files
                break

    # Firefox
    ff_base = home / "Library/Application Support/Firefox/Profiles"
    if ff_base.exists():
        for d in ff_base.iterdir():
            if d.is_dir():
                db = d / "cookies.sqlite"
                if db.exists():
                    profiles.setdefault("Firefox", []).append(db)

    # Safari — try both legacy and modern macOS container paths
    safari_paths = [
        home / "Library/Cookies/Cookies.binarycookies",
        home / "Library/Containers/com.apple.Safari/Data/Library/Cookies/Cookies.binarycookies",
    ]
    for safari in safari_paths:
        try:
            if safari.exists():
                profiles["Safari"] = [safari]
                break
        except PermissionError:
            pass  # FDA not granted — skip silently

    # Electron-based apps with Chromium cookies (no FDA needed — same user)
    electron_apps = {
        "Cursor":        home / "Library/Application Support/Cursor",
        "VS Code":       home / "Library/Application Support/Code",
        "Claude":        home / "Library/Application Support/Claude",
        "Zoom":          home / "Library/Application Support/zoom.us",
    }
    for app_name, base in electron_apps.items():
        if not base.exists():
            continue
        cookie_files = list(base.rglob("Cookies"))[:3]
        cookie_files = [p for p in cookie_files
                        if p.is_file() and not p.suffix == ".binarycookies"]
        if cookie_files:
            profiles[app_name] = cookie_files

    return profiles


def _read_chromium_cookies(cookie_path: Path) -> list[dict]:
    results = []
    tmp = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            tmp = f.name
        shutil.copy2(str(cookie_path), tmp)
        conn = sqlite3.connect(tmp)
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                "SELECT host_key,name,path,expires_utc,is_secure,is_httponly,"
                "has_expires,is_persistent,samesite FROM cookies ORDER BY host_key"
            ).fetchall()
            for row in rows:
                results.append({
                    "domain": row["host_key"], "name": row["name"],
                    "is_secure": bool(row["is_secure"]),
                    "is_httponly": bool(row["is_httponly"]),
                    "is_persistent": bool(row["is_persistent"]),
                    "samesite": row["samesite"], "expires_utc": row["expires_utc"],
                })
        except sqlite3.OperationalError:
            pass
        conn.close()
    except Exception:
        pass
    finally:
        if tmp and os.path.exists(tmp):
            os.unlink(tmp)
    return results


def _read_firefox_cookies(cookie_path: Path) -> list[dict]:
    results = []
    tmp = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            tmp = f.name
        shutil.copy2(str(cookie_path), tmp)
        conn = sqlite3.connect(tmp)
        conn.row_factory = sqlite3.Row
        for row in conn.execute(
            "SELECT host,name,path,expiry,isSecure,isHttpOnly,sameSite FROM moz_cookies"
        ).fetchall():
            results.append({
                "domain": row["host"], "name": row["name"],
                "is_secure": bool(row["isSecure"]),
                "is_httponly": bool(row["isHttpOnly"]),
                "is_persistent": True, "samesite": row["sameSite"],
                "expires_utc": row["expiry"],
            })
        conn.close()
    except Exception:
        pass
    finally:
        if tmp and os.path.exists(tmp):
            os.unlink(tmp)
    return results


def _parse_safari_cookies(cookie_path: Path) -> list[dict]:
    results = []
    try:
        data = cookie_path.read_bytes()
        if data[:4] != b'cook':
            return results

        num_pages = struct.unpack('>I', data[4:8])[0]
        page_sizes = [struct.unpack('>I', data[8 + i*4: 12 + i*4])[0]
                      for i in range(num_pages)]
        offset = 8 + num_pages * 4

        for page_size in page_sizes:
            page = data[offset: offset + page_size]
            offset += page_size
            if len(page) < 8:
                continue

            num_cookies = struct.unpack('<I', page[4:8])[0]
            for i in range(min(num_cookies, 500)):
                try:
                    co = struct.unpack('<I', page[8 + i*4: 12 + i*4])[0]
                    cd = page[co:]
                    if len(cd) < 56:
                        continue
                    url_off    = struct.unpack('<I', cd[16:20])[0]
                    name_off   = struct.unpack('<I', cd[20:24])[0]
                    domain_off = struct.unpack('<I', cd[28:32])[0]

                    def cstr(d, off):
                        end = d.find(b'\x00', off)
                        return d[off:end].decode('utf-8', errors='replace') if end != -1 else ""

                    domain = cstr(cd, domain_off)
                    name   = cstr(cd, name_off)
                    if domain:
                        results.append({
                            "domain": domain, "name": name,
                            "is_secure": bool(struct.unpack('<I', cd[8:12])[0] & 0x01),
                            "is_httponly": False, "is_persistent": True,
                            "samesite": 0, "expires_utc": 0,
                        })
                except Exception:
                    continue
    except Exception:
        pass
    return results


def _load_trackers() -> list[dict]:
    try:
        p = Path(__file__).parent.parent / "data" / "known_trackers.json"
        return json.loads(p.read_text()) if p.exists() else []
    except Exception:
        return []


# ── TLD → (jurisdiction_code, risk_level) ────────────────────────────────────
_TLD_MAP: dict[str, tuple[str, str]] = {
    # EU / EEA / Adequacy — GDPR applies
    ".de": ("EU", "LOW"),  ".fr": ("EU", "LOW"),  ".eu": ("EU", "LOW"),
    ".nl": ("EU", "LOW"),  ".es": ("EU", "LOW"),  ".it": ("EU", "LOW"),
    ".se": ("EU", "LOW"),  ".no": ("EU", "LOW"),  ".dk": ("EU", "LOW"),
    ".fi": ("EU", "LOW"),  ".be": ("EU", "LOW"),  ".at": ("EU", "LOW"),
    ".ch": ("EU", "LOW"),  ".pl": ("EU", "LOW"),  ".pt": ("EU", "LOW"),
    ".ie": ("EU", "LOW"),  ".cz": ("EU", "LOW"),  ".hu": ("EU", "LOW"),
    ".ro": ("EU", "LOW"),  ".sk": ("EU", "LOW"),  ".si": ("EU", "LOW"),
    ".bg": ("EU", "LOW"),  ".hr": ("EU", "LOW"),  ".ee": ("EU", "LOW"),
    ".lv": ("EU", "LOW"),  ".lt": ("EU", "LOW"),  ".lu": ("EU", "LOW"),
    ".gr": ("EU", "LOW"),  ".cy": ("EU", "LOW"),  ".mt": ("EU", "LOW"),
    # High-risk surveillance states
    ".cn":    ("CN", "HIGH"),   ".com.cn": ("CN", "HIGH"),
    ".ru":    ("RU", "SEVERE"), ".рф":     ("RU", "SEVERE"),
    # Others with privacy frameworks
    ".uk":    ("GB", "MEDIUM"), ".co.uk":  ("GB", "MEDIUM"), ".org.uk": ("GB", "MEDIUM"),
    ".in":    ("IN", "MEDIUM"), ".co.in":  ("IN", "MEDIUM"),
    ".au":    ("AU", "MEDIUM"), ".com.au": ("AU", "MEDIUM"),
    ".ca":    ("CA", "MEDIUM"),
    ".jp":    ("JP", "MEDIUM"), ".co.jp":  ("JP", "MEDIUM"),
    ".kr":    ("KR", "MEDIUM"), ".co.kr":  ("KR", "MEDIUM"),
    ".sg":    ("SG", "MEDIUM"),
    ".br":    ("BR", "MEDIUM"), ".com.br": ("BR", "MEDIUM"),
    ".mx":    ("MX", "MEDIUM"),
    ".za":    ("ZA", "MEDIUM"),
    ".nz":    ("NZ", "MEDIUM"), ".co.nz":  ("NZ", "MEDIUM"),
    ".ae":    ("AE", "MEDIUM"),
    ".pk":    ("PK", "MEDIUM"),
}

# ── Registered-domain → company info ─────────────────────────────────────────
# Covers the most common domains users actually encounter.
_DOMAIN_DB: dict[str, dict] = {
    # ── China (HIGH risk) ────────────────────────────────────────────────────
    "deepseek.com":      {"jurisdiction": "CN", "company": "DeepSeek",           "category": "AI Service",   "risk_level": "HIGH"},
    "baidu.com":         {"jurisdiction": "CN", "company": "Baidu",              "category": "Search",       "risk_level": "HIGH"},
    "tencent.com":       {"jurisdiction": "CN", "company": "Tencent",            "category": "Tech",         "risk_level": "HIGH"},
    "qq.com":            {"jurisdiction": "CN", "company": "Tencent",            "category": "Social",       "risk_level": "HIGH"},
    "wechat.com":        {"jurisdiction": "CN", "company": "Tencent",            "category": "Social",       "risk_level": "HIGH"},
    "weixin.qq.com":     {"jurisdiction": "CN", "company": "Tencent",            "category": "Social",       "risk_level": "HIGH"},
    "alibaba.com":       {"jurisdiction": "CN", "company": "Alibaba",            "category": "Commerce",     "risk_level": "HIGH"},
    "taobao.com":        {"jurisdiction": "CN", "company": "Alibaba",            "category": "Commerce",     "risk_level": "HIGH"},
    "alipay.com":        {"jurisdiction": "CN", "company": "Alibaba (Ant)",      "category": "Payments",     "risk_level": "HIGH"},
    "aliexpress.com":    {"jurisdiction": "CN", "company": "Alibaba",            "category": "Commerce",     "risk_level": "HIGH"},
    "jd.com":            {"jurisdiction": "CN", "company": "JD.com",             "category": "Commerce",     "risk_level": "HIGH"},
    "bytedance.com":     {"jurisdiction": "CN", "company": "ByteDance",          "category": "Tech",         "risk_level": "HIGH"},
    "tiktok.com":        {"jurisdiction": "CN", "company": "ByteDance",          "category": "Social",       "risk_level": "HIGH"},
    "douyin.com":        {"jurisdiction": "CN", "company": "ByteDance",          "category": "Social",       "risk_level": "HIGH"},
    "bilibili.com":      {"jurisdiction": "CN", "company": "Bilibili",           "category": "Media",        "risk_level": "HIGH"},
    "weibo.com":         {"jurisdiction": "CN", "company": "Sina",               "category": "Social",       "risk_level": "HIGH"},
    "zhihu.com":         {"jurisdiction": "CN", "company": "Zhihu",              "category": "Social",       "risk_level": "HIGH"},
    "xiaomi.com":        {"jurisdiction": "CN", "company": "Xiaomi",             "category": "Tech",         "risk_level": "HIGH"},
    "huawei.com":        {"jurisdiction": "CN", "company": "Huawei",             "category": "Tech",         "risk_level": "HIGH"},
    "pinduoduo.com":     {"jurisdiction": "CN", "company": "PDD Holdings",       "category": "Commerce",     "risk_level": "HIGH"},
    "temu.com":          {"jurisdiction": "CN", "company": "PDD Holdings",       "category": "Commerce",     "risk_level": "HIGH"},
    "shein.com":         {"jurisdiction": "CN", "company": "Shein",              "category": "Commerce",     "risk_level": "HIGH"},
    "netease.com":       {"jurisdiction": "CN", "company": "NetEase",            "category": "Tech",         "risk_level": "HIGH"},
    "163.com":           {"jurisdiction": "CN", "company": "NetEase",            "category": "Tech",         "risk_level": "HIGH"},
    "qiniu.com":         {"jurisdiction": "CN", "company": "Qiniu Cloud",        "category": "Cloud",        "risk_level": "HIGH"},
    # ── Russia (SEVERE risk) ─────────────────────────────────────────────────
    "yandex.com":        {"jurisdiction": "RU", "company": "Yandex",             "category": "Search",       "risk_level": "SEVERE"},
    "yandex.ru":         {"jurisdiction": "RU", "company": "Yandex",             "category": "Search",       "risk_level": "SEVERE"},
    "vk.com":            {"jurisdiction": "RU", "company": "VK",                 "category": "Social",       "risk_level": "SEVERE"},
    "mail.ru":           {"jurisdiction": "RU", "company": "VK Group",           "category": "Email",        "risk_level": "SEVERE"},
    "ok.ru":             {"jurisdiction": "RU", "company": "VK Group",           "category": "Social",       "risk_level": "SEVERE"},
    # ── United States ────────────────────────────────────────────────────────
    "google.com":        {"jurisdiction": "US", "company": "Google (Alphabet)",  "category": "Search",       "risk_level": "MEDIUM"},
    "youtube.com":       {"jurisdiction": "US", "company": "Google (Alphabet)",  "category": "Media",        "risk_level": "MEDIUM"},
    "googleapis.com":    {"jurisdiction": "US", "company": "Google (Alphabet)",  "category": "Infrastructure","risk_level": "MEDIUM"},
    "gstatic.com":       {"jurisdiction": "US", "company": "Google (Alphabet)",  "category": "Infrastructure","risk_level": "MEDIUM"},
    "googletagmanager.com": {"jurisdiction": "US", "company": "Google",          "category": "Analytics",    "risk_level": "MEDIUM"},
    "googlesyndication.com":{"jurisdiction": "US", "company": "Google",          "category": "Advertising",  "risk_level": "HIGH"},
    "doubleclick.net":   {"jurisdiction": "US", "company": "Google",             "category": "Advertising",  "risk_level": "HIGH"},
    "gmail.com":         {"jurisdiction": "US", "company": "Google (Alphabet)",  "category": "Email",        "risk_level": "MEDIUM"},
    "microsoft.com":     {"jurisdiction": "US", "company": "Microsoft",          "category": "Tech",         "risk_level": "MEDIUM"},
    "live.com":          {"jurisdiction": "US", "company": "Microsoft",          "category": "Email",        "risk_level": "MEDIUM"},
    "outlook.com":       {"jurisdiction": "US", "company": "Microsoft",          "category": "Email",        "risk_level": "MEDIUM"},
    "office.com":        {"jurisdiction": "US", "company": "Microsoft",          "category": "Productivity", "risk_level": "MEDIUM"},
    "office365.com":     {"jurisdiction": "US", "company": "Microsoft",          "category": "Productivity", "risk_level": "MEDIUM"},
    "sharepoint.com":    {"jurisdiction": "US", "company": "Microsoft",          "category": "Productivity", "risk_level": "MEDIUM"},
    "windows.com":       {"jurisdiction": "US", "company": "Microsoft",          "category": "OS",           "risk_level": "MEDIUM"},
    "bing.com":          {"jurisdiction": "US", "company": "Microsoft",          "category": "Search",       "risk_level": "MEDIUM"},
    "msn.com":           {"jurisdiction": "US", "company": "Microsoft",          "category": "Media",        "risk_level": "MEDIUM"},
    "azure.com":         {"jurisdiction": "US", "company": "Microsoft",          "category": "Cloud",        "risk_level": "MEDIUM"},
    "microsoftonline.com":{"jurisdiction": "US", "company": "Microsoft",         "category": "Auth",         "risk_level": "MEDIUM"},
    "linkedin.com":      {"jurisdiction": "US", "company": "Microsoft (LinkedIn)","category": "Social",      "risk_level": "MEDIUM"},
    "apple.com":         {"jurisdiction": "US", "company": "Apple",              "category": "Tech",         "risk_level": "MEDIUM"},
    "icloud.com":        {"jurisdiction": "US", "company": "Apple",              "category": "Cloud",        "risk_level": "MEDIUM"},
    "apple-cloudkit.com":{"jurisdiction": "US", "company": "Apple",              "category": "Cloud",        "risk_level": "MEDIUM"},
    "amazon.com":        {"jurisdiction": "US", "company": "Amazon",             "category": "Commerce",     "risk_level": "MEDIUM"},
    "amazonaws.com":     {"jurisdiction": "US", "company": "Amazon (AWS)",       "category": "Cloud",        "risk_level": "MEDIUM"},
    "amazon.jobs":       {"jurisdiction": "US", "company": "Amazon",             "category": "Recruiting",   "risk_level": "MEDIUM"},
    "meta.com":          {"jurisdiction": "US", "company": "Meta",               "category": "Social",       "risk_level": "MEDIUM"},
    "facebook.com":      {"jurisdiction": "US", "company": "Meta",               "category": "Social",       "risk_level": "MEDIUM"},
    "instagram.com":     {"jurisdiction": "US", "company": "Meta",               "category": "Social",       "risk_level": "MEDIUM"},
    "whatsapp.com":      {"jurisdiction": "US", "company": "Meta",               "category": "Messaging",    "risk_level": "MEDIUM"},
    "whatsapp.net":      {"jurisdiction": "US", "company": "Meta",               "category": "Messaging",    "risk_level": "MEDIUM"},
    "messenger.com":     {"jurisdiction": "US", "company": "Meta",               "category": "Messaging",    "risk_level": "MEDIUM"},
    "fb.com":            {"jurisdiction": "US", "company": "Meta",               "category": "Infrastructure","risk_level": "MEDIUM"},
    "fbcdn.net":         {"jurisdiction": "US", "company": "Meta",               "category": "CDN",          "risk_level": "MEDIUM"},
    "twitter.com":       {"jurisdiction": "US", "company": "X Corp",             "category": "Social",       "risk_level": "MEDIUM"},
    "x.com":             {"jurisdiction": "US", "company": "X Corp",             "category": "Social",       "risk_level": "MEDIUM"},
    "twimg.com":         {"jurisdiction": "US", "company": "X Corp",             "category": "CDN",          "risk_level": "MEDIUM"},
    "netflix.com":       {"jurisdiction": "US", "company": "Netflix",            "category": "Media",        "risk_level": "MEDIUM"},
    "openai.com":        {"jurisdiction": "US", "company": "OpenAI",             "category": "AI Service",   "risk_level": "MEDIUM"},
    "chatgpt.com":       {"jurisdiction": "US", "company": "OpenAI",             "category": "AI Service",   "risk_level": "MEDIUM"},
    "anthropic.com":     {"jurisdiction": "US", "company": "Anthropic",          "category": "AI Service",   "risk_level": "MEDIUM"},
    "claude.ai":         {"jurisdiction": "US", "company": "Anthropic",          "category": "AI Service",   "risk_level": "MEDIUM"},
    "github.com":        {"jurisdiction": "US", "company": "Microsoft (GitHub)", "category": "Dev Tools",    "risk_level": "MEDIUM"},
    "github.io":         {"jurisdiction": "US", "company": "Microsoft (GitHub)", "category": "Dev Tools",    "risk_level": "MEDIUM"},
    "githubusercontent.com":{"jurisdiction": "US", "company": "Microsoft (GitHub)","category": "Dev Tools",  "risk_level": "MEDIUM"},
    "cloudflare.com":    {"jurisdiction": "US", "company": "Cloudflare",         "category": "Infrastructure","risk_level": "MEDIUM"},
    "cloudflareinsights.com":{"jurisdiction": "US", "company": "Cloudflare",     "category": "Analytics",    "risk_level": "MEDIUM"},
    "zoom.us":           {"jurisdiction": "US", "company": "Zoom",               "category": "Video Conf.",  "risk_level": "MEDIUM"},
    "slack.com":         {"jurisdiction": "US", "company": "Salesforce (Slack)", "category": "Messaging",    "risk_level": "MEDIUM"},
    "dropbox.com":       {"jurisdiction": "US", "company": "Dropbox",            "category": "Cloud Storage","risk_level": "MEDIUM"},
    "salesforce.com":    {"jurisdiction": "US", "company": "Salesforce",         "category": "CRM",          "risk_level": "MEDIUM"},
    "force.com":         {"jurisdiction": "US", "company": "Salesforce",         "category": "CRM",          "risk_level": "MEDIUM"},
    "adobe.com":         {"jurisdiction": "US", "company": "Adobe",              "category": "Creative",     "risk_level": "MEDIUM"},
    "typekit.com":       {"jurisdiction": "US", "company": "Adobe",              "category": "Fonts",        "risk_level": "MEDIUM"},
    "paypal.com":        {"jurisdiction": "US", "company": "PayPal",             "category": "Payments",     "risk_level": "MEDIUM"},
    "stripe.com":        {"jurisdiction": "US", "company": "Stripe",             "category": "Payments",     "risk_level": "MEDIUM"},
    "grammarly.com":     {"jurisdiction": "US", "company": "Grammarly",          "category": "Productivity", "risk_level": "MEDIUM"},
    "udemy.com":         {"jurisdiction": "US", "company": "Udemy",              "category": "Education",    "risk_level": "MEDIUM"},
    "skillshare.com":    {"jurisdiction": "US", "company": "Skillshare",         "category": "Education",    "risk_level": "MEDIUM"},
    "coursera.com":      {"jurisdiction": "US", "company": "Coursera",           "category": "Education",    "risk_level": "MEDIUM"},
    "notion.so":         {"jurisdiction": "US", "company": "Notion",             "category": "Productivity", "risk_level": "MEDIUM"},
    "figma.com":         {"jurisdiction": "US", "company": "Adobe (Figma)",      "category": "Design",       "risk_level": "MEDIUM"},
    "vercel.com":        {"jurisdiction": "US", "company": "Vercel",             "category": "Hosting",      "risk_level": "MEDIUM"},
    "netlify.com":       {"jurisdiction": "US", "company": "Netlify",            "category": "Hosting",      "risk_level": "MEDIUM"},
    "discord.com":       {"jurisdiction": "US", "company": "Discord",            "category": "Social",       "risk_level": "MEDIUM"},
    "twitch.tv":         {"jurisdiction": "US", "company": "Amazon (Twitch)",    "category": "Media",        "risk_level": "MEDIUM"},
    "reddit.com":        {"jurisdiction": "US", "company": "Reddit",             "category": "Social",       "risk_level": "MEDIUM"},
    "pinterest.com":     {"jurisdiction": "US", "company": "Pinterest",          "category": "Social",       "risk_level": "MEDIUM"},
    "snapchat.com":      {"jurisdiction": "US", "company": "Snap Inc.",          "category": "Social",       "risk_level": "MEDIUM"},
    "wordpress.com":     {"jurisdiction": "US", "company": "Automattic",         "category": "Publishing",   "risk_level": "MEDIUM"},
    "wordpress.org":     {"jurisdiction": "US", "company": "WordPress Foundation","category": "Publishing",  "risk_level": "LOW"},
    "wix.com":           {"jurisdiction": "US", "company": "Wix",                "category": "Website Builder","risk_level": "MEDIUM"},
    "squarespace.com":   {"jurisdiction": "US", "company": "Squarespace",        "category": "Website Builder","risk_level": "MEDIUM"},
    "hubspot.com":       {"jurisdiction": "US", "company": "HubSpot",            "category": "Marketing",    "risk_level": "MEDIUM"},
    "mailchimp.com":     {"jurisdiction": "US", "company": "Intuit (Mailchimp)", "category": "Marketing",    "risk_level": "MEDIUM"},
    "zendesk.com":       {"jurisdiction": "US", "company": "Zendesk",            "category": "Support",      "risk_level": "MEDIUM"},
    "intercom.com":      {"jurisdiction": "US", "company": "Intercom",           "category": "Support",      "risk_level": "MEDIUM"},
    "hotjar.com":        {"jurisdiction": "US", "company": "Hotjar",             "category": "Analytics",    "risk_level": "MEDIUM"},
    "mixpanel.com":      {"jurisdiction": "US", "company": "Mixpanel",           "category": "Analytics",    "risk_level": "MEDIUM"},
    "segment.com":       {"jurisdiction": "US", "company": "Twilio (Segment)",   "category": "Analytics",    "risk_level": "MEDIUM"},
    "amplitude.com":     {"jurisdiction": "US", "company": "Amplitude",          "category": "Analytics",    "risk_level": "MEDIUM"},
    "okta.com":          {"jurisdiction": "US", "company": "Okta",               "category": "Auth",         "risk_level": "MEDIUM"},
    "auth0.com":         {"jurisdiction": "US", "company": "Okta (Auth0)",       "category": "Auth",         "risk_level": "MEDIUM"},
    "airbnb.com":        {"jurisdiction": "US", "company": "Airbnb",             "category": "Travel",       "risk_level": "MEDIUM"},
    "uber.com":          {"jurisdiction": "US", "company": "Uber",               "category": "Transport",    "risk_level": "MEDIUM"},
    "lyft.com":          {"jurisdiction": "US", "company": "Lyft",               "category": "Transport",    "risk_level": "MEDIUM"},
    "doordash.com":      {"jurisdiction": "US", "company": "DoorDash",           "category": "Food Delivery","risk_level": "MEDIUM"},
    "mongodb.com":       {"jurisdiction": "US", "company": "MongoDB",            "category": "Dev Tools",    "risk_level": "MEDIUM"},
    "twilio.com":        {"jurisdiction": "US", "company": "Twilio",             "category": "Messaging",    "risk_level": "MEDIUM"},
    "sendgrid.com":      {"jurisdiction": "US", "company": "Twilio (SendGrid)",  "category": "Email",        "risk_level": "MEDIUM"},
    "braze.com":         {"jurisdiction": "US", "company": "Braze",              "category": "Marketing",    "risk_level": "MEDIUM"},
    "klaviyo.com":       {"jurisdiction": "US", "company": "Klaviyo",            "category": "Marketing",    "risk_level": "MEDIUM"},
    "airtable.com":      {"jurisdiction": "US", "company": "Airtable",           "category": "Productivity", "risk_level": "MEDIUM"},
    "asana.com":         {"jurisdiction": "US", "company": "Asana",              "category": "Productivity", "risk_level": "MEDIUM"},
    "atlassian.com":     {"jurisdiction": "US", "company": "Atlassian",          "category": "Dev Tools",    "risk_level": "MEDIUM"},
    "jira.com":          {"jurisdiction": "US", "company": "Atlassian",          "category": "Dev Tools",    "risk_level": "MEDIUM"},
    "confluence.com":    {"jurisdiction": "US", "company": "Atlassian",          "category": "Dev Tools",    "risk_level": "MEDIUM"},
    "medium.com":        {"jurisdiction": "US", "company": "Medium",             "category": "Publishing",   "risk_level": "MEDIUM"},
    "substack.com":      {"jurisdiction": "US", "company": "Substack",           "category": "Publishing",   "risk_level": "MEDIUM"},
    "shopify.com":       {"jurisdiction": "CA", "company": "Shopify",            "category": "Commerce",     "risk_level": "MEDIUM"},
    "canva.com":         {"jurisdiction": "AU", "company": "Canva",              "category": "Design",       "risk_level": "MEDIUM"},
    # ── European Union ───────────────────────────────────────────────────────
    "sap.com":           {"jurisdiction": "EU", "company": "SAP (Germany)",      "category": "Enterprise",   "risk_level": "LOW"},
    "spotify.com":       {"jurisdiction": "EU", "company": "Spotify (Sweden)",   "category": "Media",        "risk_level": "LOW"},
    "booking.com":       {"jurisdiction": "EU", "company": "Booking.com (NL)",   "category": "Travel",       "risk_level": "LOW"},
    "philips.com":       {"jurisdiction": "EU", "company": "Philips (NL)",       "category": "Tech",         "risk_level": "LOW"},
    "siemens.com":       {"jurisdiction": "EU", "company": "Siemens (Germany)",  "category": "Enterprise",   "risk_level": "LOW"},
    "dhl.com":           {"jurisdiction": "EU", "company": "DHL (Germany)",      "category": "Logistics",    "risk_level": "LOW"},
    "jobteaser.com":     {"jurisdiction": "EU", "company": "JobTeaser (France)", "category": "Recruiting",   "risk_level": "LOW"},
    "transferwise.com":  {"jurisdiction": "EU", "company": "Wise (UK/EU)",       "category": "Fintech",      "risk_level": "LOW"},
    "wise.com":          {"jurisdiction": "EU", "company": "Wise",               "category": "Fintech",      "risk_level": "LOW"},
    "adyen.com":         {"jurisdiction": "EU", "company": "Adyen (NL)",         "category": "Payments",     "risk_level": "LOW"},
    "klarna.com":        {"jurisdiction": "EU", "company": "Klarna (Sweden)",    "category": "Fintech",      "risk_level": "LOW"},
    "trivago.com":       {"jurisdiction": "EU", "company": "Trivago (Germany)",  "category": "Travel",       "risk_level": "LOW"},
    "skyscanner.com":    {"jurisdiction": "GB", "company": "Skyscanner (UK)",    "category": "Travel",       "risk_level": "MEDIUM"},
    "revolut.com":       {"jurisdiction": "GB", "company": "Revolut (UK)",       "category": "Fintech",      "risk_level": "MEDIUM"},
    "bbc.co.uk":         {"jurisdiction": "GB", "company": "BBC",                "category": "Media",        "risk_level": "MEDIUM"},
    "bbc.com":           {"jurisdiction": "GB", "company": "BBC",                "category": "Media",        "risk_level": "MEDIUM"},
    # ── India (MEDIUM) ───────────────────────────────────────────────────────
    "easemytrip.com":    {"jurisdiction": "IN", "company": "EaseMyTrip",         "category": "Travel",       "risk_level": "MEDIUM"},
    "makemytrip.com":    {"jurisdiction": "IN", "company": "MakeMyTrip",         "category": "Travel",       "risk_level": "MEDIUM"},
    "mokobara.com":      {"jurisdiction": "IN", "company": "Mokobara",           "category": "Commerce",     "risk_level": "MEDIUM"},
    "zomato.com":        {"jurisdiction": "IN", "company": "Zomato",             "category": "Food Delivery","risk_level": "MEDIUM"},
    "swiggy.com":        {"jurisdiction": "IN", "company": "Swiggy",             "category": "Food Delivery","risk_level": "MEDIUM"},
    "flipkart.com":      {"jurisdiction": "IN", "company": "Flipkart (Walmart)", "category": "Commerce",     "risk_level": "MEDIUM"},
    "paytm.com":         {"jurisdiction": "IN", "company": "Paytm",              "category": "Fintech",      "risk_level": "MEDIUM"},
    "ola.com":           {"jurisdiction": "IN", "company": "Ola",                "category": "Transport",    "risk_level": "MEDIUM"},
    "oyo.com":           {"jurisdiction": "IN", "company": "OYO",                "category": "Travel",       "risk_level": "MEDIUM"},
    "meesho.com":        {"jurisdiction": "IN", "company": "Meesho",             "category": "Commerce",     "risk_level": "MEDIUM"},
    "nykaa.com":         {"jurisdiction": "IN", "company": "Nykaa",              "category": "Commerce",     "risk_level": "MEDIUM"},
    "cricbuzz.com":      {"jurisdiction": "IN", "company": "Cricbuzz",           "category": "Sports",       "risk_level": "MEDIUM"},
    "hotstar.com":       {"jurisdiction": "IN", "company": "Disney+ Hotstar",    "category": "Media",        "risk_level": "MEDIUM"},
    "jiocinema.com":     {"jurisdiction": "IN", "company": "Reliance Jio",       "category": "Media",        "risk_level": "MEDIUM"},
    "redbus.in":         {"jurisdiction": "IN", "company": "redBus",             "category": "Travel",       "risk_level": "MEDIUM"},
    "irctc.co.in":       {"jurisdiction": "IN", "company": "IRCTC (Govt India)", "category": "Travel",       "risk_level": "MEDIUM"},
    "cleartax.in":       {"jurisdiction": "IN", "company": "ClearTax",           "category": "Fintech",      "risk_level": "MEDIUM"},
    # ── Japan / South Korea / Singapore ─────────────────────────────────────
    "sony.com":          {"jurisdiction": "JP", "company": "Sony",               "category": "Tech",         "risk_level": "MEDIUM"},
    "nintendo.com":      {"jurisdiction": "JP", "company": "Nintendo",           "category": "Gaming",       "risk_level": "MEDIUM"},
    "rakuten.com":       {"jurisdiction": "JP", "company": "Rakuten",            "category": "Commerce",     "risk_level": "MEDIUM"},
    "samsung.com":       {"jurisdiction": "KR", "company": "Samsung",            "category": "Tech",         "risk_level": "MEDIUM"},
    "kakao.com":         {"jurisdiction": "KR", "company": "Kakao",              "category": "Social",       "risk_level": "MEDIUM"},
    "naver.com":         {"jurisdiction": "KR", "company": "Naver",              "category": "Search",       "risk_level": "MEDIUM"},
    "sea.com":           {"jurisdiction": "SG", "company": "Sea Limited",        "category": "Tech",         "risk_level": "MEDIUM"},
    "shopee.com":        {"jurisdiction": "SG", "company": "Sea Limited",        "category": "Commerce",     "risk_level": "MEDIUM"},
}

# Multi-segment TLDs that need 3 parts for the registered domain
_MULTI_TLDS = {
    ".co.uk", ".co.in", ".com.au", ".com.br", ".co.kr", ".co.jp",
    ".org.uk", ".me.uk", ".net.au", ".com.cn", ".co.nz", ".co.za",
}

TRACKING_NAMES = {'_ga', '_gid', '_fbp', '_fbc', '__utm', 'track',
                  'analytics', 'pixel', 'beacon', '_hjid', 'amplitude',
                  '_ttp', '_tt_', 'ttclid', 'msclkid', 'gclid', 'fbclid'}


def _get_registered_domain(clean: str) -> str:
    """Extract eTLD+1 from a clean (no-leading-dot) domain string."""
    parts = clean.split(".")
    if len(parts) < 2:
        return clean
    two_seg = "." + ".".join(parts[-2:])
    if len(parts) >= 3 and two_seg in _MULTI_TLDS:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def _classify_cookie(domain: str, name: str, trackers: list[dict]) -> dict:
    clean = domain.lstrip(".")

    # 1. Known tracker DB (highest priority — includes ad networks etc.)
    for t in trackers:
        pattern = t.get("pattern", "").replace("*.", "")
        if clean.endswith(pattern) or clean == pattern:
            return {
                "jurisdiction":   t.get("jurisdiction", "Unknown"),
                "company":        t.get("company", "Unknown"),
                "category":       t.get("category", "Tracker"),
                "is_third_party": True,
                "risk_level":     t.get("risk_level", "MEDIUM"),
                "known_tracker":  True,
                "tracker_name":   t.get("name", ""),
            }

    # 2. Comprehensive domain lookup (registered domain → company info)
    reg = _get_registered_domain(clean)
    if reg in _DOMAIN_DB:
        info = _DOMAIN_DB[reg]
        jur  = info["jurisdiction"]
        risk = info.get("risk_level", "MEDIUM")
        # Override risk for known surveillance-state companies
        if jur == "CN" and risk not in ("HIGH", "SEVERE"):
            risk = "HIGH"
        elif jur == "RU":
            risk = "SEVERE"
        return {
            "jurisdiction":   jur,
            "company":        info["company"],
            "category":       info.get("category", "Functional"),
            "is_third_party": False,
            "risk_level":     risk,
            "known_tracker":  False,
            "tracker_name":   "",
        }

    # 3. TLD-based detection (catches any ccTLD domain not in DB)
    # Check multi-segment TLDs first (e.g. .co.uk before .uk)
    tld_match = None
    for seg_count in (3, 2):
        parts = clean.split(".")
        if len(parts) >= seg_count:
            candidate = "." + ".".join(parts[-seg_count:])
            if candidate in _TLD_MAP:
                tld_match = _TLD_MAP[candidate]
                break
    if tld_match:
        jur, risk = tld_match
        return {
            "jurisdiction":   jur,
            "company":        f"Unknown ({jur})",
            "category":       "Functional",
            "is_third_party": False,
            "risk_level":     risk,
            "known_tracker":  False,
        }

    # 4. Tracking-name heuristic — last resort
    name_lower = name.lower()
    is_tracker = any(t in name_lower for t in TRACKING_NAMES)
    return {
        "jurisdiction":   "Unknown",
        "company":        "Unknown",
        "category":       "Analytics" if is_tracker else "Functional",
        "is_third_party": is_tracker,
        "risk_level":     "MEDIUM" if is_tracker else "UNVERIFIED",
        "known_tracker":  False,
    }


def scan_all_cookies() -> dict:
    """Main entry point — scan all browsers and return classified cookies."""
    fda = check_fda()
    profiles = find_browser_profiles()
    trackers = _load_trackers()
    all_cookies: list[dict] = []

    for browser, paths in profiles.items():
        for path in paths:
            if browser == "Safari":
                raw = _parse_safari_cookies(path)
            elif browser == "Firefox":
                raw = _read_firefox_cookies(path)
            else:
                raw = _read_chromium_cookies(path)

            for cookie in raw:
                cls = _classify_cookie(cookie["domain"], cookie["name"], trackers)
                # Convert Chromium microseconds-since-1601 → Unix ms for JS sorting
                raw_ts = cookie.get("expires_utc", 0) or 0
                expires_unix = max(0, (raw_ts - 11_644_473_600_000_000) // 1000) if raw_ts > 0 else 0
                all_cookies.append({
                    **cookie, **cls, "browser": browser,
                    "expires_unix": expires_unix,
                    "id": f"{browser}_{cookie['domain']}_{cookie['name']}",
                })

    total       = len(all_cookies)
    third_party = sum(1 for c in all_cookies if c.get("is_third_party"))
    cross_border = sum(1 for c in all_cookies
                       if c.get("jurisdiction") not in ("EU", "Unknown"))
    eu_only     = sum(1 for c in all_cookies if c.get("jurisdiction") == "EU")
    high_risk   = sum(1 for c in all_cookies
                      if c.get("risk_level") in ("HIGH", "SEVERE"))

    return {
        "fda_granted": fda,
        "browsers_found": list(profiles.keys()),
        "cookies": all_cookies,
        "stats": {
            "total": total, "third_party": third_party,
            "cross_border": cross_border, "eu_only": eu_only,
            "high_risk": high_risk,
        },
    }


def read_all_cookies(browser_filter: str = "all") -> list[dict]:
    """Legacy-compatible wrapper used by main.py."""
    result = scan_all_cookies()
    cookies = result["cookies"]
    if browser_filter and browser_filter.lower() != "all":
        cookies = [c for c in cookies
                   if c.get("browser", "").lower() == browser_filter.lower()]
    return cookies
