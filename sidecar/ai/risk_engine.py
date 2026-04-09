"""Multi-layer risk scoring engine."""
import re
from typing import Optional

HIGH_SENSITIVITY = {"Camera", "Microphone", "Screen Recording"}
MEDIUM_SENSITIVITY = {"Contacts", "Calendar", "Full Disk Access", "Accessibility", "Input Monitoring"}
LOW_SENSITIVITY = {"Photos", "Location", "Reminders", "Media Library", "Bluetooth"}

# Known EU-based or privacy-respecting alternatives with their URLs
EU_ALT_URLS: dict[str, str] = {
    "Element": "https://element.io",
    "Mattermost": "https://mattermost.com",
    "Nextcloud": "https://nextcloud.com",
    "Outline": "https://www.getoutline.com",
    "Obsidian": "https://obsidian.md",
    "Jitsi Meet": "https://meet.jit.si",
    "Jitsi": "https://meet.jit.si",
    "BigBlueButton": "https://bigbluebutton.org",
    "Tresorit": "https://tresorit.com",
    "Firefox": "https://www.mozilla.org/firefox",
    "Brave": "https://brave.com",
    "Bitwarden": "https://bitwarden.com",
    "KeePassXC": "https://keepassxc.org",
    "Penpot": "https://penpot.app",
    "Plane": "https://plane.so",
    "Taiga": "https://taiga.io",
    "GitLab": "https://about.gitlab.com",
    "Gitea": "https://gitea.io",
    "Forgejo": "https://forgejo.org",
    "VSCodium": "https://vscodium.com",
    "LanguageTool": "https://languagetool.org",
    "Revolt": "https://revolt.chat",
    "Signal": "https://signal.org",
    "ProtonMail": "https://proton.me/mail",
    "Proton Mail": "https://proton.me/mail",
    "Tutanota": "https://tuta.com",
    "Tuta": "https://tuta.com",
    "Proton VPN": "https://protonvpn.com",
    "Mullvad": "https://mullvad.net",
    "DuckDuckGo": "https://duckduckgo.com",
    "Startpage": "https://www.startpage.com",
    "Vivaldi": "https://vivaldi.com",
    "Bear": "https://bear.app",
    "Things 3": "https://culturedcode.com/things",
    "Things": "https://culturedcode.com/things",
    "Veed.io": "https://www.veed.io",
    "Tasks.org": "https://tasks.org",
    "Cryptomator": "https://cryptomator.org",
    "Matrix": "https://matrix.org",
    "Fathom": "https://usefathom.com",
    "Plausible": "https://plausible.io",
    "Matomo": "https://matomo.org",
    "Seafile": "https://www.seafile.com",
    "Syncthing": "https://syncthing.net",
    "Standard Notes": "https://standardnotes.com",
    "Cryptpad": "https://cryptpad.fr",
    "Kolibri": "https://kolibri.app",
    "Skiff": "https://skiff.com",
    "ONLYOFFICE": "https://www.onlyoffice.com",
    "Collabora": "https://www.collaboraoffice.com",
    "LibreOffice": "https://www.libreoffice.org",
    "Thunderbird": "https://www.thunderbird.net",
    "Fairphone": "https://www.fairphone.com",
    "Adjust": "https://www.adjust.com",
}


def _parse_eu_alternatives(alt_string: str) -> list[dict]:
    """Parse an eu_alternative string like 'Element (details) or Mattermost' into [{name, url}]."""
    if not alt_string:
        return []
    results = []
    # Split on ' or ' (case-insensitive)
    parts = re.split(r'\s+or\s+', alt_string, flags=re.IGNORECASE)
    for part in parts:
        # Extract name: everything before the first ' ('
        name = re.split(r'\s*\(', part)[0].strip()
        if not name:
            continue
        # Look up URL — try exact match first, then partial
        url = EU_ALT_URLS.get(name)
        if not url:
            for key, val in EU_ALT_URLS.items():
                if key.lower() in name.lower() or name.lower() in key.lower():
                    url = val
                    break
        results.append({"name": name, "url": url})
    return results


def _jurisdiction_score(jurisdiction: Optional[str]) -> tuple[int, str]:
    if not jurisdiction:
        return 20, "Unknown jurisdiction — data handling unclear"
    j = jurisdiction.upper()
    if j in ("CN", "PRC"):
        return 40, "Chinese jurisdiction — mandatory data access under national security laws"
    if j == "RU":
        return 40, "Russian jurisdiction — subject to SORM surveillance laws"
    if j == "US":
        return 30, "US jurisdiction — subject to CLOUD Act, potential government data access"
    if j == "UK":
        return 15, "UK jurisdiction — post-Brexit, Investigatory Powers Act applies"
    if j in ("EU", "EEA"):
        return 0, ""
    if j == "FVEY":
        return 12, "Five Eyes nation — intelligence sharing agreements may apply"
    return 20, f"Jurisdiction '{jurisdiction}' — data protection standards unclear"


def _policy_score(policy: Optional[dict]) -> tuple[int, str]:
    if not policy:
        return 15, "No privacy policy analysis available"
    rl = policy.get("risk_level", "MEDIUM")
    if rl in ("SEVERE", "HIGH"):
        return 20, "AI analysis: high-risk data practices declared in privacy policy"
    if rl == "MEDIUM":
        return 10, "AI analysis: moderate data collection practices"
    if rl == "LOW":
        return 0, ""
    return 15, "AI analysis incomplete"


def _permissions_score(perms: list[str]) -> tuple[int, list[str]]:
    score = 0
    reasons = []
    for p in perms:
        if p in HIGH_SENSITIVITY:
            score += 10
            reasons.append(f"Granted {p} access — highly sensitive permission")
        elif p in MEDIUM_SENSITIVITY:
            score += 7
            reasons.append(f"Granted {p} access — sensitive permission")
        elif p in LOW_SENSITIVITY:
            score += 4
    return min(score, 25), reasons


def _network_score(connections: list[dict]) -> tuple[int, list[str]]:
    score = 0
    reasons = []
    jurisdictions = {c.get("jurisdiction") for c in connections}
    tracker_cats = {c.get("tracker_category") for c in connections if c.get("is_known_tracker")}
    us_domains = {c.get("remote_domain") or c.get("remote_ip") for c in connections if c.get("jurisdiction") == "US"}
    cn_ru_domains = {c.get("remote_domain") or c.get("remote_ip") for c in connections if c.get("jurisdiction") in ("CN", "RU")}

    if cn_ru_domains or "CN" in jurisdictions or "RU" in jurisdictions:
        score += 25
        reasons.append(f"Transfers data to authoritarian jurisdiction ({', '.join(list(cn_ru_domains)[:2]) or 'CN/RU'})")

    if us_domains or "US" in jurisdictions:
        score += 15
        sample = list(us_domains)[:2]
        reasons.append(f"Connects to US servers{(' (' + ', '.join(sample) + ')') if sample else ''} — subject to CLOUD Act")

    for cat in tracker_cats:
        if cat:
            score += 10
            reasons.append(f"Sends data to {cat.lower()} trackers")

    if len(connections) > 50:
        score += 5
        reasons.append("High frequency of network connections")

    return min(score, 25), reasons


def compute_app_risk(
    app_info: dict,
    permissions: list[str],
    connections: list[dict],
    policy_analysis: Optional[dict] = None,
) -> dict:
    jurisdiction = app_info.get("jurisdiction") or (
        (app_info.get("tools_db_entry") or {}).get("jurisdiction")
    )

    j_score, j_reason = _jurisdiction_score(jurisdiction)
    p_score, p_reason = _policy_score(policy_analysis)
    perm_score, perm_reasons = _permissions_score(permissions)
    net_score, net_reasons = _network_score(connections)

    raw = int(
        (j_score / 40) * 30 +
        (p_score / 20) * 20 +
        (perm_score / 25) * 25 +
        (net_score / 25) * 25
    )
    risk_score = max(0, min(raw, 100))

    if risk_score <= 25:
        risk_level = "LOW"
    elif risk_score <= 50:
        risk_level = "MEDIUM"
    elif risk_score <= 75:
        risk_level = "HIGH"
    else:
        risk_level = "SEVERE"

    risk_factors = [r for r in [j_reason, p_reason] if r] + perm_reasons + net_reasons
    actions = _generate_actions(app_info, risk_level, jurisdiction, permissions, connections)

    return {
        "app_id": app_info.get("id", "unknown"),
        "app_name": app_info.get("name", "Unknown"),
        "risk_score": risk_score,
        "risk_level": risk_level,
        "jurisdiction": jurisdiction or "Unknown",
        "risk_factors": risk_factors,
        "recommended_actions": actions,
        "layer_scores": {
            "jurisdiction": j_score,
            "policy": p_score,
            "permissions": perm_score,
            "network": net_score,
        },
    }


def _generate_actions(app_info, risk_level, jurisdiction, permissions, connections):
    actions = []
    app_name = app_info.get("name", "this app")
    db = app_info.get("tools_db_entry") or {}

    # ── Sensitive permissions ──────────────────────────────────────────────────
    sensitive = HIGH_SENSITIVITY.intersection(set(permissions))
    if sensitive:
        perm_list = ", ".join(sorted(sensitive))
        actions.append({
            "type": "limit_permissions",
            "priority": "HIGH",
            "title": f"Restrict {perm_list} access",
            "description": f"{app_name} has {perm_list} access. Open System Settings → Privacy & Security to revoke.",
            "action_url": "x-apple.systempreferences:com.apple.preference.security?Privacy",
            "alternatives": [],
        })

    # ── EU alternative ─────────────────────────────────────────────────────────
    if jurisdiction in ("US", "CN", "RU"):
        alt_str = db.get("eu_alternative") or ""
        alts = _parse_eu_alternatives(alt_str)
        if alts:
            alt_names = " or ".join(a["name"] for a in alts)
            actions.append({
                "type": "use_alternative",
                "priority": "HIGH" if jurisdiction in ("CN", "RU") else "MEDIUM",
                "title": f"Switch to EU alternative: {alt_names}",
                "description": f"Replace {app_name} with a GDPR-compliant alternative that keeps your data in the EU.",
                "action_url": alts[0].get("url"),
                "alternatives": alts,
            })
        elif jurisdiction in ("CN", "RU"):
            actions.append({
                "type": "use_alternative",
                "priority": "HIGH",
                "title": f"Replace {app_name} — data sent to {jurisdiction}",
                "description": f"This app is subject to {('Chinese data laws' if jurisdiction == 'CN' else 'Russian surveillance laws')}. Find a privacy-respecting alternative.",
                "action_url": "https://privacyguides.org",
                "alternatives": [{"name": "Privacy Guides", "url": "https://privacyguides.org"}],
            })

    # ── CN / RU specific ───────────────────────────────────────────────────────
    cn_ru_conns = [c for c in connections if c.get("jurisdiction") in ("CN", "RU")]
    if cn_ru_conns:
        countries = ", ".join({c.get("country", c.get("jurisdiction")) for c in cn_ru_conns})
        actions.append({
            "type": "block_connection",
            "priority": "HIGH",
            "title": f"Block transmissions to {countries}",
            "description": f"{app_name} is actively sending data to servers in {countries}. Consider a firewall or VPN.",
            "action_url": "https://mullvad.net",
            "alternatives": [
                {"name": "Mullvad VPN", "url": "https://mullvad.net"},
                {"name": "Proton VPN", "url": "https://protonvpn.com"},
                {"name": "Little Snitch", "url": "https://www.obdev.at/products/littlesnitch"},
            ],
        })

    # ── Review data sharing ────────────────────────────────────────────────────
    if risk_level in ("HIGH", "SEVERE"):
        actions.append({
            "type": "review_data",
            "priority": "HIGH",
            "title": "Review privacy settings",
            "description": f"Open {app_name}'s settings and disable analytics, telemetry, and cross-app tracking.",
            "action_url": db.get("privacy_policy_url"),
            "alternatives": [],
        })

    # ── Uninstall for SEVERE ───────────────────────────────────────────────────
    if risk_level == "SEVERE":
        actions.append({
            "type": "uninstall",
            "priority": "HIGH",
            "title": f"Remove {app_name}",
            "description": f"This app poses a severe risk to your data sovereignty. Consider removing it.",
            "action_url": f"file://{app_info.get('path', '/Applications')}",
            "alternatives": [],
        })

    return actions


def compute_overall_risk(
    app_risks: list[dict],
    connections: list[dict],
    cookies: list[dict],
) -> dict:
    if not app_risks and not connections and not cookies:
        return {
            "sovereignty_score": 100,
            "risk_score": 0,
            "risk_level": "LOW",
            "app_risk_score": 0,
            "network_risk_score": 0,
            "cookie_risk_score": 0,
            "top_risk_apps": [],
        }

    sorted_apps = sorted(app_risks, key=lambda a: a.get("risk_score", 0), reverse=True)
    top5 = sorted_apps[:5]
    app_risk = sum(a.get("risk_score", 0) for a in top5) / max(len(top5), 1)

    if connections:
        high_risk = sum(1 for c in connections if c.get("jurisdiction") in ("US", "CN", "RU"))
        net_risk = min((high_risk / len(connections)) * 100, 100)
    else:
        net_risk = 0.0

    if cookies:
        risky = sum(1 for c in cookies if c.get("risk_level") in ("HIGH", "MEDIUM"))
        cookie_risk = min((risky / len(cookies)) * 100, 100)
    else:
        cookie_risk = 0.0

    overall = app_risk * 0.40 + net_risk * 0.35 + cookie_risk * 0.25
    sovereignty_score = max(0, min(100, int(100 - overall)))

    if overall <= 25:
        risk_level = "LOW"
    elif overall <= 50:
        risk_level = "MEDIUM"
    elif overall <= 75:
        risk_level = "HIGH"
    else:
        risk_level = "SEVERE"

    return {
        "sovereignty_score": sovereignty_score,
        "risk_score": int(overall),
        "risk_level": risk_level,
        "app_risk_score": int(app_risk),
        "network_risk_score": int(net_risk),
        "cookie_risk_score": int(cookie_risk),
        "top_risk_apps": [
            {"name": a["app_name"], "risk_score": a["risk_score"], "risk_level": a["risk_level"]}
            for a in top5
        ],
    }
