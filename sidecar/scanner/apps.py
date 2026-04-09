"""Installed app scanner for macOS."""
import json
import os
import plistlib
import subprocess
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

DATA_DIR = Path(__file__).parent.parent / "data"


class AppInfo(BaseModel):
    id: str
    name: str
    bundle_id: Optional[str] = None
    version: Optional[str] = None
    category: Optional[str] = None
    path: str
    install_date: Optional[str] = None
    last_used: Optional[str] = None
    in_tools_db: bool = False
    tools_db_entry: Optional[dict] = None
    developer: Optional[str] = None
    jurisdiction: Optional[str] = None
    risk_level: Optional[str] = None


_tools_db: list[dict] = []
_tools_db_by_bundle: dict[str, dict] = {}

# ─── Embedded jurisdiction fallback DB ───────────────────────────────────────
# Keyed by mac_bundle_id → (developer, jurisdiction, risk_level)
_BUNDLE_JURISDICTION_DB: dict[str, tuple[str, str, str]] = {
    # Google
    "com.google.Chrome":                      ("Google LLC",             "US", "HIGH"),
    "com.google.Chrome.canary":               ("Google LLC",             "US", "HIGH"),
    "com.google.android.studio":              ("Google LLC",             "US", "HIGH"),
    "com.google.GoogleDrive":                 ("Google LLC",             "US", "HIGH"),
    "com.google.Meet":                        ("Google LLC",             "US", "HIGH"),
    # Microsoft
    "com.microsoft.VSCode":                   ("Microsoft Corp.",        "US", "MEDIUM"),
    "com.microsoft.edgemac":                  ("Microsoft Corp.",        "US", "HIGH"),
    "com.microsoft.Excel":                    ("Microsoft Corp.",        "US", "HIGH"),
    "com.microsoft.Word":                     ("Microsoft Corp.",        "US", "HIGH"),
    "com.microsoft.Powerpoint":               ("Microsoft Corp.",        "US", "HIGH"),
    "com.microsoft.teams":                    ("Microsoft Corp.",        "US", "HIGH"),
    "com.microsoft.autoupdate4":              ("Microsoft Corp.",        "US", "MEDIUM"),
    "com.microsoft.OneDrive":                 ("Microsoft Corp.",        "US", "HIGH"),
    "com.microsoft.onenote.mac":              ("Microsoft Corp.",        "US", "HIGH"),
    # Mozilla
    "org.mozilla.firefox":                    ("Mozilla Foundation",     "US", "MEDIUM"),
    "org.mozilla.firefoxdeveloperedition":    ("Mozilla Foundation",     "US", "MEDIUM"),
    "org.mozilla.nightly":                    ("Mozilla Foundation",     "US", "MEDIUM"),
    # Anthropic
    "com.anthropic.claudefordesktop":         ("Anthropic PBC",          "US", "MEDIUM"),
    # OpenAI
    "com.openai.chat":                        ("OpenAI LLC",             "US", "HIGH"),
    # Cursor
    "com.todesktop.230313mzl4w4u92":          ("Anysphere Inc.",         "US", "MEDIUM"),
    # JetBrains (individual entries; prefix catch-all below)
    "com.jetbrains.intellij":                 ("JetBrains s.r.o.",       "EU", "LOW"),
    "com.jetbrains.intellij.ce":              ("JetBrains s.r.o.",       "EU", "LOW"),
    "com.jetbrains.WebStorm":                 ("JetBrains s.r.o.",       "EU", "LOW"),
    "com.jetbrains.pycharm":                  ("JetBrains s.r.o.",       "EU", "LOW"),
    "com.jetbrains.rider":                    ("JetBrains s.r.o.",       "EU", "LOW"),
    "com.jetbrains.CLion":                    ("JetBrains s.r.o.",       "EU", "LOW"),
    "com.jetbrains.GoLand":                   ("JetBrains s.r.o.",       "EU", "LOW"),
    "com.jetbrains.DataGrip":                 ("JetBrains s.r.o.",       "EU", "LOW"),
    "com.jetbrains.toolbox":                  ("JetBrains s.r.o.",       "EU", "LOW"),
    # Vivaldi
    "com.vivaldi.Vivaldi":                    ("Vivaldi Technologies AS","NO", "LOW"),
    # Opera
    "com.operasoftware.Opera":                ("Opera Software AS",      "NO", "MEDIUM"),
    "com.operasoftware.OperaGX":              ("Opera Software AS",      "NO", "MEDIUM"),
    # Arc
    "company.thebrowser.Browser":             ("The Browser Company",    "US", "MEDIUM"),
    # Brave
    "com.brave.Browser":                      ("Brave Software Inc.",    "US", "LOW"),
    # Spotify
    "com.spotify.client":                     ("Spotify AB",             "SE", "MEDIUM"),
    # Discord
    "com.hnc.Discord":                        ("Discord Inc.",           "US", "HIGH"),
    # WhatsApp / Meta
    "net.whatsapp.WhatsApp":                  ("Meta Platforms Inc.",    "US", "HIGH"),
    "com.facebook.archon":                    ("Meta Platforms Inc.",    "US", "HIGH"),
    "com.facebook.Messenger":                 ("Meta Platforms Inc.",    "US", "HIGH"),
    # Telegram
    "ru.keepcoder.Telegram":                  ("Telegram Inc.",          "AE", "MEDIUM"),
    # Signal
    "org.whispersystems.signal-desktop":      ("Signal Foundation",      "US", "LOW"),
    # Zoom
    "us.zoom.xos":                            ("Zoom Video Communications","US","HIGH"),
    # Dropbox
    "com.getdropbox.dropbox":                 ("Dropbox Inc.",           "US", "HIGH"),
    # 1Password
    "com.1password.1password":                ("1Password",              "CA", "MEDIUM"),
    "com.agilebits.onepassword7-osx":         ("1Password",              "CA", "MEDIUM"),
    # Bitwarden
    "com.bitwarden.desktop":                  ("Bitwarden Inc.",         "US", "LOW"),
    # GitHub Desktop
    "com.github.GitHubClient":                ("GitHub Inc.",            "US", "MEDIUM"),
    # Figma
    "com.figma.Desktop":                      ("Figma Inc.",             "US", "MEDIUM"),
    # Sketch
    "com.bohemiancoding.sketch3":             ("Bohemian BV",            "NL", "LOW"),
    # iTerm2
    "com.googlecode.iterm2":                  ("George Nachman",         "US", "LOW"),
    # Tower
    "com.fournova.Tower3":                    ("fournova Software GmbH", "DE", "LOW"),
    "com.fournova.Tower2":                    ("fournova Software GmbH", "DE", "LOW"),
    # Sourcetree
    "com.torusknot.SourceTreeNotMAS":         ("Atlassian",              "AU", "MEDIUM"),
    # Bear
    "net.shinyfrog.bear":                     ("Shiny Frog Ltd.",        "IT", "LOW"),
    # Obsidian
    "md.obsidian":                            ("Obsidian",               "CA", "LOW"),
    # Linear
    "com.linear.linear":                      ("Linear Inc.",            "US", "MEDIUM"),
    # Loom
    "com.loom.desktop":                       ("Loom Inc.",              "US", "MEDIUM"),
    # Grammarly
    "com.grammarly.osx.Grammarly":            ("Grammarly Inc.",         "US", "HIGH"),
    # Warp terminal
    "dev.warp.Warp-Stable":                   ("Warp Inc.",              "US", "MEDIUM"),
    # Things
    "com.culturedcode.ThingsMac":             ("Cultured Code GmbH",     "DE", "LOW"),
    # Fantastical
    "com.flexibits.fantastical2.mac":         ("Flexibits Inc.",         "US", "LOW"),
    # Raycast
    "com.raycast.macos":                      ("Raycast Technologies",   "DE", "LOW"),
    # Alfred
    "com.runningwithcrayons.Alfred":          ("Running with Crayons Ltd.","GB","LOW"),
    # Bartender
    "com.surteesstudios.Bartender":           ("Surtees Studios",        "GB", "LOW"),
    # CleanMyMac
    "com.macpaw.CleanMyMac4":                 ("MacPaw Inc.",            "UA", "MEDIUM"),
    "com.macpaw.CleanMyMac-mas":              ("MacPaw Inc.",            "UA", "MEDIUM"),
    # Amphetamine
    "com.if.Amphetamine":                     ("William Gustafson",      "US", "LOW"),
    # TablePlus
    "com.tinyapp.TablePlus":                  ("Tobias Müller",          "DE", "LOW"),
    # Reeder
    "com.reederapp.5.macOS":                  ("Reeder",                 "CH", "LOW"),
    # Superhuman
    "com.superhuman.Superhuman":              ("Superhuman Inc.",        "US", "HIGH"),
    # Basecamp / Hey
    "com.basecamp.hey-macos":                 ("Basecamp LLC",           "US", "MEDIUM"),
    # Notion (also in tools_db, keeping for completeness)
    "notion.id":                              ("Notion Labs Inc.",       "US", "HIGH"),
    # Slack (also in tools_db)
    "com.tinyspeck.slackmacgap":              ("Salesforce Inc.",        "US", "HIGH"),
    # Pycharm CE
    "com.jetbrains.pycharm-ce":               ("JetBrains s.r.o.",       "EU", "LOW"),
    # Xcode comes from Apple, handled by prefix
    # Airmail
    "it.bloop.airmail2":                      ("Bloop Srl",              "IT", "LOW"),
    # Mimestream
    "com.mimestream.Mimestream":              ("Mimestream Inc.",        "US", "MEDIUM"),
    # Tot
    "com.iconfactory.Tot":                    ("The Iconfactory",        "US", "LOW"),
    # Proxyman
    "com.proxyman.NSProxy":                   ("Proxyman",               "VN", "LOW"),
    # Charles Proxy
    "com.xk72.charles":                       ("XK72 Ltd",               "AU", "LOW"),
    # Wireshark
    "org.wireshark.Wireshark":                ("Wireshark Foundation",   "US", "LOW"),
    # Postman
    "com.postmanlabs.mac":                    ("Postman Inc.",           "US", "MEDIUM"),
    # Insomnia
    "com.insomnia.app":                       ("Kong Inc.",              "US", "MEDIUM"),
    # Docker
    "com.docker.docker":                      ("Docker Inc.",            "US", "MEDIUM"),
    # Sequel Pro
    "com.sequelpro.SequelPro":                ("Sequel Pro",             "US", "LOW"),
    # Dataflare / TableFlip
    "app.dataflare.desktop":                  ("Dataflare",              "DE", "LOW"),
    # Franz
    "com.meetfranz.Franz":                    ("Franz GmbH",             "AT", "MEDIUM"),
    # Station
    "co.getstation.station":                  ("Station Inc.",           "FR", "LOW"),
    # Pockity
    "com.pockity.mac":                        ("Pockity",                "DE", "LOW"),
    # PDF Expert
    "com.readdle.PDFExpert-Mac":              ("Readdle Inc.",           "IE", "LOW"),
    # GoodNotes
    "com.goodnotesapp.GoodNotes5":            ("GoodNotes Ltd.",         "HK", "MEDIUM"),
    # Harvest
    "com.getharvest.Harvest":                 ("Harvest",                "US", "MEDIUM"),
    # Canva
    "com.canva.CanvaDesktop":                 ("Canva Pty Ltd",          "AU", "MEDIUM"),
    # Lottie Files
    "com.airbnb.lottie-files":                ("Airbnb Inc.",            "US", "MEDIUM"),
    # Clipboard Manager — Pasta
    "com.randomapps.Pasta":                   ("Random Apps",            "DE", "LOW"),
}


def _jurisdiction_fallback(bundle_id: Optional[str]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Return (developer, jurisdiction, risk_level) from embedded DB, or (None, None, None)."""
    if not bundle_id:
        return None, None, None
    # Exact match first
    entry = _BUNDLE_JURISDICTION_DB.get(bundle_id)
    if entry:
        return entry
    # Prefix catch-alls
    if bundle_id.startswith("com.apple."):
        return "Apple Inc.", "US", "MEDIUM"
    if bundle_id.startswith("com.jetbrains."):
        return "JetBrains s.r.o.", "EU", "LOW"
    if bundle_id.startswith("com.microsoft."):
        return "Microsoft Corp.", "US", "HIGH"
    if bundle_id.startswith("com.google."):
        return "Google LLC", "US", "HIGH"
    if bundle_id.startswith("com.adobe."):
        return "Adobe Inc.", "US", "HIGH"
    if bundle_id.startswith("com.amazon."):
        return "Amazon.com Inc.", "US", "HIGH"
    if bundle_id.startswith("com.github."):
        return "GitHub Inc.", "US", "MEDIUM"
    return None, None, None


def _load_tools_db():
    global _tools_db, _tools_db_by_bundle
    try:
        with open(DATA_DIR / "tools_db.json") as f:
            _tools_db = json.load(f)
        _tools_db_by_bundle = {
            entry.get("mac_bundle_id", ""): entry
            for entry in _tools_db
            if entry.get("mac_bundle_id")
        }
    except Exception as e:
        print(f"Warning: Could not load tools_db.json: {e}")
        _tools_db = []
        _tools_db_by_bundle = {}


_load_tools_db()


def _fuzzy_match_app(name: str) -> Optional[dict]:
    best_ratio = 0.0
    best_match = None
    name_lower = name.lower()
    for entry in _tools_db:
        ratio = SequenceMatcher(None, name_lower, entry["name"].lower()).ratio()
        if ratio > best_ratio and ratio >= 0.7:
            best_ratio = ratio
            best_match = entry
    return best_match


def _read_info_plist(app_path: str) -> dict:
    plist_path = os.path.join(app_path, "Contents", "Info.plist")
    try:
        with open(plist_path, "rb") as f:
            return plistlib.load(f)
    except Exception:
        return {}


def _get_install_date(app_path: str) -> Optional[str]:
    try:
        stat = os.stat(app_path)
        ts = getattr(stat, "st_birthtime", stat.st_mtime)
        return datetime.fromtimestamp(ts).isoformat()
    except Exception:
        return None


def _get_last_used(app_path: str) -> Optional[str]:
    try:
        result = subprocess.run(
            ["mdls", "-name", "kMDItemLastUsedDate", "-raw", app_path],
            capture_output=True,
            text=True,
            timeout=3,
        )
        date_str = result.stdout.strip()
        if date_str and date_str != "(null)":
            return date_str
    except Exception:
        pass
    return None


def _scan_directory(directory: str) -> list[AppInfo]:
    apps = []
    try:
        for entry in os.scandir(directory):
            if not (entry.name.endswith(".app") and entry.is_dir()):
                continue
            app_path = entry.path
            plist = _read_info_plist(app_path)

            name = (
                plist.get("CFBundleDisplayName")
                or plist.get("CFBundleName")
                or entry.name.replace(".app", "")
            )
            bundle_id = plist.get("CFBundleIdentifier")
            version = plist.get("CFBundleShortVersionString") or plist.get("CFBundleVersion")
            category = plist.get("LSApplicationCategoryType")

            db_entry = None
            if bundle_id:
                db_entry = _tools_db_by_bundle.get(bundle_id)
            if not db_entry:
                db_entry = _fuzzy_match_app(name)

            app_id = bundle_id or name.lower().replace(" ", "_")

            # Jurisdiction: tools_db wins, then our embedded DB, then None
            fb_dev, fb_j, fb_rl = _jurisdiction_fallback(bundle_id)
            apps.append(
                AppInfo(
                    id=app_id,
                    name=name,
                    bundle_id=bundle_id,
                    version=version,
                    category=category,
                    path=app_path,
                    install_date=_get_install_date(app_path),
                    last_used=_get_last_used(app_path),
                    in_tools_db=db_entry is not None,
                    tools_db_entry=db_entry,
                    developer=(
                        db_entry.get("developer") if db_entry
                        else fb_dev or plist.get("NSHumanReadableCopyright")
                    ),
                    jurisdiction=db_entry.get("jurisdiction") if db_entry else fb_j,
                    risk_level=db_entry.get("risk_level") if db_entry else fb_rl,
                )
            )
    except PermissionError:
        pass
    except Exception as e:
        print(f"Warning: Error scanning {directory}: {e}")
    return apps


def scan_installed_apps() -> list[AppInfo]:
    seen: set[str] = set()
    all_apps: list[AppInfo] = []

    dirs = [
        "/Applications",
        os.path.expanduser("~/Applications"),
    ]
    for d in dirs:
        if os.path.exists(d):
            for app in _scan_directory(d):
                key = app.bundle_id or app.name
                if key not in seen:
                    seen.add(key)
                    all_apps.append(app)

    return sorted(all_apps, key=lambda a: a.name.lower())
