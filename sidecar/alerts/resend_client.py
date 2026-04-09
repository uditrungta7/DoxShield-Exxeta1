"""Resend email alerts with deduplication."""
import json
import os
from datetime import datetime
from pathlib import Path

try:
    import resend as resend_lib
except ImportError:
    resend_lib = None  # type: ignore

DATA_DIR = Path.home() / ".doxshield"
ALERTS_FILE = DATA_DIR / "alerts_sent.json"
DEDUP_HOURS = 24


def _load_history() -> list[dict]:
    if ALERTS_FILE.exists():
        try:
            return json.loads(ALERTS_FILE.read_text())
        except Exception:
            pass
    return []


def _save_alert_to_history(entry: dict):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    history = _load_history()
    history.insert(0, entry)
    history = history[:500]
    ALERTS_FILE.write_text(json.dumps(history, indent=2, default=str))


def _was_recently_alerted(app_name: str, risk_level: str) -> bool:
    history = _load_history()
    cutoff = datetime.now().timestamp() - DEDUP_HOURS * 3600
    for entry in history:
        if (entry.get("app_name") == app_name and
                entry.get("risk_level") == risk_level):
            try:
                ts = datetime.fromisoformat(entry.get("sent_at", "")).timestamp()
                if ts > cutoff:
                    return True
            except Exception:
                pass
    return False


async def send_risk_alert(
    to_email: str,
    app_name: str,
    risk_level: str,
    risk_reasons: list,
    destination_country: str,
    destination_domains: list,
    legal_framework: str,
    recommended_actions: list,
    data_categories: list | None = None,
) -> bool:
    """Send a styled risk alert email via Resend. Returns True on success."""
    if not to_email:
        return False

    if _was_recently_alerted(app_name, risk_level):
        print(f"[Alerts] Skipping duplicate alert for {app_name} ({risk_level})")
        return True

    api_key = os.getenv("RESEND_API_KEY", "")
    if not api_key:
        print(f"[Alerts] No RESEND_API_KEY — would alert: {app_name} ({risk_level})")
        _save_alert_to_history({
            "app_name": app_name, "risk_level": risk_level, "to_email": to_email,
            "sent_at": datetime.now().isoformat(), "destination_country": destination_country,
            "domains": destination_domains, "skipped": True, "reason": "no_api_key",
        })
        return True

    if resend_lib is None:
        print("[Alerts] resend package not installed")
        return False

    risk_colour = {"HIGH": "#EF4444", "SEVERE": "#DC2626", "MEDIUM": "#F59E0B"}.get(
        risk_level, "#6B7280")
    data_cats = data_categories or []

    reasons_html  = "".join(f"<li style='margin:4px 0;color:#F0F0F5'>{r}</li>" for r in risk_reasons)
    data_html     = "".join(
        f"<span style='display:inline-block;background:#1A1A24;border:1px solid #2A2A38;"
        f"border-radius:4px;padding:2px 8px;font-size:12px;margin:2px;color:#F0F0F5'>{d}</span>"
        for d in data_cats)
    actions_html  = "".join(f"<li style='margin:6px 0;color:#F0F0F5'>{a}</li>" for a in recommended_actions)
    domains_html  = " ".join(
        f"<code style='background:#1A1A24;padding:1px 4px;border-radius:3px;"
        f"font-size:12px;color:#A0A0B0'>{d}</code>" for d in destination_domains)

    html_body = f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0A0A0F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#111118;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.1)">
    <div style="background:#0A0A0F;padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;gap:12px">
      <div style="width:32px;height:32px;background:{risk_colour};border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px">⚠</div>
      <div>
        <div style="color:#F0F0F5;font-size:15px;font-weight:600">Doxshield Alert</div>
        <div style="color:#A0A0B0;font-size:12px">Data Sovereignty Risk Detected</div>
      </div>
      <div style="margin-left:auto;background:{risk_colour}20;color:{risk_colour};border:1px solid {risk_colour}40;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600">{risk_level}</div>
    </div>
    <div style="padding:24px">
      <p style="color:#F0F0F5;font-size:16px;font-weight:600;margin:0 0 8px">{app_name} is transmitting data outside the EU</p>
      <p style="color:#A0A0B0;font-size:14px;margin:0 0 20px">We detected that <strong style="color:#F0F0F5">{app_name}</strong> is transferring data to servers in <strong style="color:#F0F0F5">{destination_country}</strong>.</p>
      <div style="background:#0A0A0F;border-radius:8px;padding:16px;margin:0 0 20px;border-left:3px solid {risk_colour}">
        <div style="color:#A0A0B0;font-size:11px;font-weight:600;letter-spacing:0.08em;margin:0 0 8px">WHY THIS MATTERS</div>
        <p style="color:#F0F0F5;font-size:13px;margin:0">Data stored outside the EU may be subject to foreign laws such as the <strong>US CLOUD Act</strong>, which can allow access by non-EU authorities without notification.</p>
      </div>
      {"<div style='margin:0 0 20px'><div style='color:#A0A0B0;font-size:11px;font-weight:600;letter-spacing:0.08em;margin:0 0 8px'>DATA INVOLVED</div><div>" + data_html + "</div></div>" if data_html else ""}
      <div style="margin:0 0 20px">
        <div style="color:#A0A0B0;font-size:11px;font-weight:600;letter-spacing:0.08em;margin:0 0 8px">RISK FACTORS</div>
        <ul style="margin:0;padding-left:20px">{reasons_html}</ul>
      </div>
      <div style="margin:0 0 20px">
        <div style="color:#A0A0B0;font-size:11px;font-weight:600;letter-spacing:0.08em;margin:0 0 8px">WHAT YOU CAN DO</div>
        <ol style="margin:0;padding-left:20px">{actions_html}</ol>
      </div>
      <div style="background:#0A0A0F;border-radius:8px;padding:16px;border:1px solid rgba(255,255,255,0.06)">
        <div style="color:#A0A0B0;font-size:11px;font-weight:600;letter-spacing:0.08em;margin:0 0 8px">TECHNICAL DETAILS</div>
        <table style="color:#A0A0B0;font-size:12px;width:100%;border-collapse:collapse">
          <tr><td style="padding:3px 0;width:140px;color:#606070">Destination</td><td style="color:#F0F0F5">{destination_country}</td></tr>
          <tr><td style="padding:3px 0;color:#606070">Domains</td><td>{domains_html}</td></tr>
          <tr><td style="padding:3px 0;color:#606070">Framework</td><td style="color:#F0F0F5">{legal_framework}</td></tr>
          <tr><td style="padding:3px 0;color:#606070">Detected</td><td style="color:#F0F0F5">{datetime.now().strftime('%Y-%m-%d %H:%M')}</td></tr>
        </table>
      </div>
    </div>
    <div style="padding:16px 24px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;color:#606070;font-size:11px">
      Doxshield · Protecting European data sovereignty
    </div>
  </div>
</body>
</html>"""

    try:
        resend_lib.api_key = api_key
        response = resend_lib.Emails.send({
            "from": "Doxshield <onboarding@resend.dev>",
            "to": [to_email],
            "subject": f"⚠️ Data Risk: {app_name} ({risk_level})",
            "html": html_body,
        })
        resp_id = (response.get("id", "") if isinstance(response, dict)
                   else getattr(response, "id", ""))
        _save_alert_to_history({
            "id": str(resp_id), "app_name": app_name, "risk_level": risk_level,
            "to_email": to_email, "sent_at": datetime.now().isoformat(),
            "destination_country": destination_country, "domains": destination_domains,
        })
        return True
    except Exception as e:
        print(f"[Alerts] Resend error: {e}")
        return False


def get_alert_history() -> list[dict]:
    return _load_history()
