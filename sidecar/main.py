"""Doxshield sidecar FastAPI server — port 8765."""
import asyncio
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()

DATA_DIR = Path(os.path.expanduser("~/.doxshield"))
LAST_SCAN_FILE = DATA_DIR / "last_scan.json"
SETTINGS_FILE  = DATA_DIR / "settings.json"

_sse_queues: list[asyncio.Queue] = []
_bg_task: Optional[asyncio.Task] = None


async def broadcast(data: dict):
    for q in list(_sse_queues):
        try:
            await asyncio.wait_for(q.put(data), timeout=0.1)
        except (asyncio.TimeoutError, asyncio.QueueFull):
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _bg_task
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    _bg_task = asyncio.create_task(background_monitor())
    print("Doxshield sidecar started on port 8765")
    yield
    if _bg_task:
        _bg_task.cancel()
        try:
            await _bg_task
        except asyncio.CancelledError:
            pass
    print("Doxshield sidecar stopped")


app = FastAPI(title="Doxshield Sidecar", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Auth router ──────────────────────────────────────────────────────────────
from auth import router as auth_router
app.include_router(auth_router)


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "sidecar_version": "1.0.0",
            "timestamp": datetime.utcnow().isoformat()}


# ─── Full scan (SSE) ──────────────────────────────────────────────────────────

@app.get("/api/scan/full-stream")
async def full_scan_stream():
    async def generate():
        try:
            yield f"data: {json.dumps({'step':'apps','status':'running','detail':'Discovering installed applications...'})}\n\n"
            from scanner.apps import scan_installed_apps
            apps = scan_installed_apps()
            yield f"data: {json.dumps({'step':'apps','status':'complete','detail':f'Found {len(apps)} applications'})}\n\n"

            yield f"data: {json.dumps({'step':'permissions','status':'running','detail':'Reading TCC permission database...'})}\n\n"
            from scanner.permissions import get_app_permissions
            perm_data = get_app_permissions()
            yield f"data: {json.dumps({'step':'permissions','status':'complete','detail':'Permission data collected'})}\n\n"

            yield f"data: {json.dumps({'step':'network','status':'running','detail':'Analysing active network connections...'})}\n\n"
            from scanner.network import get_active_connections
            connections = await get_active_connections()
            yield f"data: {json.dumps({'step':'network','status':'complete','detail':f'Found {len(connections)} active connections'})}\n\n"

            yield f"data: {json.dumps({'step':'cookies','status':'running','detail':'Reading browser cookies...'})}\n\n"
            from scanner.cookies import scan_all_cookies
            cookie_result = scan_all_cookies()
            cookies = cookie_result.get("cookies", [])
            yield f"data: {json.dumps({'step':'cookies','status':'complete','detail':f'Found {len(cookies)} cookies'})}\n\n"

            unique_ips = len({c["remote_ip"] for c in connections})
            yield f"data: {json.dumps({'step':'geolocation','status':'running','detail':f'Geolocating {unique_ips} IP addresses...'})}\n\n"
            yield f"data: {json.dumps({'step':'geolocation','status':'complete','detail':'IP geolocation complete'})}\n\n"

            yield f"data: {json.dumps({'step':'ai','status':'running','detail':'Running AI policy analysis on top apps...'})}\n\n"
            from ai.policy_analyzer import analyze_policy
            policy_analyses = {}
            for a in apps[:3]:
                db = a.tools_db_entry
                if db and db.get("privacy_policy_url") and a.bundle_id:
                    yield f"data: {json.dumps({'step':'ai','status':'running','detail':f'Analysing {a.name} privacy policy...'})}\n\n"
                    try:
                        result = await analyze_policy(a.bundle_id, a.name, db["privacy_policy_url"])
                        policy_analyses[a.id] = result
                    except Exception as e:
                        print(f"Policy error {a.name}: {e}")

            yield f"data: {json.dumps({'step':'risk','status':'running','detail':'Computing risk scores...'})}\n\n"
            from ai.risk_engine import compute_app_risk, compute_overall_risk
            perms_map = perm_data.get("permissions", {})
            app_risks = []
            for a in apps:
                app_perms = perms_map.get(a.bundle_id or "", [])
                app_conns = [
                    c for c in connections
                    if c.get("process_name") in
                    (a.tools_db_entry or {}).get("mac_process_names", [a.name])
                ]
                risk = compute_app_risk(a.dict(), app_perms, app_conns,
                                        policy_analyses.get(a.id))
                app_risks.append(risk)

            overall = compute_overall_risk(app_risks, connections, cookies)

            scan_result = {
                "scanned_at": datetime.utcnow().isoformat(),
                "overall": overall,
                "apps": app_risks,
                "connections": connections,
                "cookies": cookies[:200],
                "permissions": perm_data,
                "stats": {
                    "total_apps": len(apps),
                    "total_connections": len(connections),
                    "total_cookies": len(cookies),
                    "high_risk_apps": sum(1 for r in app_risks
                                          if r.get("risk_level") in ("HIGH", "SEVERE")),
                },
            }
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            with open(LAST_SCAN_FILE, "w") as f:
                json.dump(scan_result, f, indent=2, default=str)

            # Trigger email alerts for high-risk apps
            _schedule_scan_alerts(app_risks)

            yield f"data: {json.dumps({'step':'complete','status':'done','data':scan_result}, default=str)}\n\n"

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'step':'error','status':'error','detail':str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no",
                 "Connection": "keep-alive"},
    )


def _schedule_scan_alerts(app_risks: list[dict]):
    """Fire-and-forget: send alerts for high-risk apps found in scan."""
    settings = _load_settings()
    email = settings.get("alert_email", "")
    if not email or not settings.get("email_alerts_enabled", False):
        return
    asyncio.create_task(_send_scan_alerts(app_risks, email))


async def _send_scan_alerts(app_risks: list[dict], email: str):
    from alerts.resend_client import send_risk_alert
    for app in app_risks:
        if app.get("risk_level") in ("HIGH", "SEVERE"):
            try:
                await send_risk_alert(
                    to_email=email,
                    app_name=app.get("app_name", "Unknown"),
                    risk_level=app.get("risk_level", "HIGH"),
                    risk_reasons=app.get("risk_factors", [])[:3],
                    destination_country=app.get("jurisdiction", "Unknown"),
                    destination_domains=[],
                    legal_framework="US CLOUD Act" if app.get("jurisdiction") == "US" else "Unknown",
                    recommended_actions=[
                        a.get("title", "") for a in app.get("recommended_actions", [])[:3]
                    ],
                )
            except Exception as e:
                print(f"Alert error for {app.get('app_name')}: {e}")


# ─── Risk profile ──────────────────────────────────────────────────────────────

@app.get("/api/risk/profile")
async def get_risk_profile():
    if LAST_SCAN_FILE.exists():
        with open(LAST_SCAN_FILE) as f:
            return json.load(f)
    return {"error": "no_scan", "message": "No scan data. Run a scan first."}


# ─── Apps ──────────────────────────────────────────────────────────────────────

@app.get("/api/apps")
async def get_apps():
    if LAST_SCAN_FILE.exists():
        with open(LAST_SCAN_FILE) as f:
            return json.load(f).get("apps", [])
    from scanner.apps import scan_installed_apps
    apps = scan_installed_apps()
    return [{"app_id": a.id, "app_name": a.name, "bundle_id": a.bundle_id,
             "path": a.path, "risk_level": a.risk_level or "UNVERIFIED"} for a in apps]


@app.get("/api/apps/{app_id}")
async def get_app_detail(app_id: str):
    if LAST_SCAN_FILE.exists():
        with open(LAST_SCAN_FILE) as f:
            data = json.load(f)
        for app in data.get("apps", []):
            if app.get("app_id") == app_id or app.get("id") == app_id:
                return app
    return {"error": "not_found"}


@app.get("/api/apps/{bundle_id}/icon")
async def get_app_icon(bundle_id: str):
    """Extract and return app icon as base64 PNG."""
    import base64
    import subprocess
    import tempfile

    icon_cache = DATA_DIR / "icons"
    icon_cache.mkdir(parents=True, exist_ok=True)
    cached = icon_cache / f"{bundle_id.replace('/', '_')}.b64"

    if cached.exists():
        return {"icon": cached.read_text(), "from_cache": True}

    # Find app path
    try:
        result = subprocess.run(
            ["mdfind", f"kMDItemCFBundleIdentifier == '{bundle_id}'"],
            capture_output=True, text=True, timeout=5
        )
        paths = [p for p in result.stdout.strip().split('\n') if p.endswith('.app')]
        if not paths:
            raise FileNotFoundError

        app_path = paths[0]
        # Find icon file
        import plistlib
        info_plist = Path(app_path) / "Contents" / "Info.plist"
        icon_name = ""
        if info_plist.exists():
            with open(info_plist, 'rb') as f:
                info = plistlib.load(f)
                icon_name = info.get("CFBundleIconFile", "AppIcon")

        if not icon_name.endswith('.icns'):
            icon_name += '.icns'

        icns_path = Path(app_path) / "Contents" / "Resources" / icon_name
        if not icns_path.exists():
            # Try common names
            for name in ["AppIcon.icns", "app.icns", "Icon.icns"]:
                candidate = Path(app_path) / "Contents" / "Resources" / name
                if candidate.exists():
                    icns_path = candidate
                    break

        if icns_path.exists():
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
                tmp_path = tmp.name
            subprocess.run(
                ["sips", "-s", "format", "png", str(icns_path),
                 "--out", tmp_path, "--resampleWidth", "32"],
                capture_output=True, timeout=5
            )
            if Path(tmp_path).exists():
                icon_b64 = base64.b64encode(Path(tmp_path).read_bytes()).decode()
                Path(tmp_path).unlink()
                cached.write_text(icon_b64)
                return {"icon": icon_b64, "from_cache": False}
    except Exception as e:
        print(f"Icon error for {bundle_id}: {e}")

    return {"icon": None}


# ─── Network ───────────────────────────────────────────────────────────────────

@app.get("/api/network/live")
async def get_live_connections():
    from scanner.network import get_active_connections
    return await get_active_connections()


@app.get("/api/network/history")
async def get_connection_history():
    from scanner.network import connection_history
    return list(connection_history)


@app.get("/api/network/stream")
async def network_stream():
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    _sse_queues.append(queue)

    async def generate():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        finally:
            if queue in _sse_queues:
                _sse_queues.remove(queue)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── Cookies ───────────────────────────────────────────────────────────────────

@app.get("/api/cookies/status")
async def cookies_status():
    from scanner.cookies import check_fda, find_browser_profiles
    fda = check_fda()
    profiles = find_browser_profiles()
    return {"fda_granted": fda, "browsers_found": list(profiles.keys())}


@app.get("/api/cookies")
async def get_cookies(
    browser: str = Query("all"),
    risk: str = Query("all"),
):
    from scanner.cookies import scan_all_cookies
    result = scan_all_cookies()
    cookies = result.get("cookies", [])
    if browser.lower() != "all":
        cookies = [c for c in cookies if c.get("browser", "").lower() == browser.lower()]
    if risk.lower() != "all":
        cookies = [c for c in cookies if c.get("risk_level", "").upper() == risk.upper()]
    return {**result, "cookies": cookies}


# ─── AI ────────────────────────────────────────────────────────────────────────

@app.get("/api/ai/status")
async def ai_status():
    from ai.ollama_client import check_ollama_health
    return await check_ollama_health()


@app.post("/api/ai/analyze/{app_id}")
async def analyze_app(app_id: str):
    from scanner.apps import scan_installed_apps
    apps = scan_installed_apps()
    target = next((a for a in apps if a.id == app_id or a.bundle_id == app_id), None)
    if not target or not target.tools_db_entry:
        return {"error": "app_not_found_or_no_policy"}
    url = target.tools_db_entry.get("privacy_policy_url", "")
    if not url:
        return {"error": "no_policy_url"}
    from ai.policy_analyzer import analyze_policy
    return await analyze_policy(target.bundle_id or target.id, target.name, url)


# ─── Alerts ────────────────────────────────────────────────────────────────────

@app.post("/api/alerts/send")
async def send_alert(payload: dict):
    from alerts.resend_client import send_risk_alert
    ok = await send_risk_alert(
        to_email=payload.get("email", ""),
        app_name=payload.get("app_name", "Test App"),
        risk_level=payload.get("risk_level", "HIGH"),
        risk_reasons=payload.get("risk_reasons", ["Test risk"]),
        destination_country=payload.get("destination_country", "US"),
        destination_domains=payload.get("destination_domains", []),
        legal_framework=payload.get("legal_framework", "US CLOUD Act"),
        recommended_actions=payload.get("recommended_actions", ["Review settings"]),
    )
    return {"success": ok}


@app.post("/api/alerts/test")
async def send_test_alert(payload: dict):
    """Quick test alert for Settings page."""
    from alerts.resend_client import send_risk_alert
    email = payload.get("email", "")
    if not email:
        return {"success": False, "error": "no email"}
    ok = await send_risk_alert(
        to_email=email,
        app_name="Doxshield Test",
        risk_level="HIGH",
        risk_reasons=["This is a test alert from Doxshield", "Your email alerts are working correctly"],
        destination_country="United States",
        destination_domains=["test.doxshield.app"],
        legal_framework="US CLOUD Act",
        recommended_actions=["No action needed — this is a test", "Configure alert settings in Doxshield"],
        data_categories=["Test data"],
    )
    return {"success": ok}


@app.get("/api/alerts/history")
async def alerts_history():
    from alerts.resend_client import get_alert_history
    return get_alert_history()


# ─── Settings ──────────────────────────────────────────────────────────────────

DEFAULT_SETTINGS = {
    "auto_scan_on_launch": True,
    "scan_interval_minutes": 60,
    "scan_browsers": True,
    "alerts_enabled": True,
    "email_alerts_enabled": False,
    "alert_email": "",
    "alert_min_level": "HIGH",
    "ollama_model": "mistral",
    "auto_analyze": False,
    "start_minimised": False,
    "telemetry_enabled": False,
}


def _load_settings() -> dict:
    if SETTINGS_FILE.exists():
        try:
            return {**DEFAULT_SETTINGS, **json.loads(SETTINGS_FILE.read_text())}
        except Exception:
            pass
    return DEFAULT_SETTINGS.copy()


@app.get("/api/settings")
async def get_settings():
    return _load_settings()


@app.post("/api/settings")
async def save_settings(payload: dict):
    current = _load_settings()
    current.update(payload)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(current, indent=2))
    return {"success": True, "settings": current}


# ─── Background monitor ────────────────────────────────────────────────────────

async def background_monitor():
    from scanner.network import get_active_connections
    seen_high: set[str] = set()

    while True:
        try:
            connections = await get_active_connections()
            settings = _load_settings()
            email = settings.get("alert_email", "")

            for conn in connections:
                key = f"{conn.get('remote_ip')}:{conn.get('remote_port')}"
                if conn.get("risk_level") in ("HIGH", "SEVERE") and key not in seen_high:
                    seen_high.add(key)
                    await broadcast({"type": "new_high_risk_connection", "data": conn})

                    # Email alert for new high-risk connections
                    if email and settings.get("email_alerts_enabled") and settings.get("alerts_enabled"):
                        from alerts.resend_client import send_risk_alert
                        asyncio.create_task(send_risk_alert(
                            to_email=email,
                            app_name=conn.get("app_name") or conn.get("process_name", "Unknown"),
                            risk_level=conn.get("risk_level", "HIGH"),
                            risk_reasons=[f"Connection to {conn.get('country', 'Unknown')} detected"],
                            destination_country=conn.get("country", "Unknown"),
                            destination_domains=[conn.get("remote_domain") or conn.get("remote_ip", "")],
                            legal_framework="US CLOUD Act" if conn.get("country_code") == "US" else "Unknown",
                            recommended_actions=["Review this app's network activity"],
                        ))
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"Background monitor error: {e}")

        await asyncio.sleep(10)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", os.getenv("SIDECAR_PORT", "8765")))
    # Use the app object directly (required when running from a PyInstaller bundle,
    # where module-string form "main:app" cannot be resolved from the filesystem).
    uvicorn.run(app, host="127.0.0.1", port=port, reload=False)
