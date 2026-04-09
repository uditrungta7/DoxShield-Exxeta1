"""Network connection monitor — uses netstat -nv for connection discovery."""
import asyncio
import json
import re
import socket
import subprocess
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from .ip_geo import geolocate_ip, check_domain_tracker

DATA_DIR = Path(__file__).parent.parent / "data"


class Connection(BaseModel):
    pid: int
    process_name: str
    app_name: Optional[str] = None
    bundle_id: Optional[str] = None
    remote_ip: str
    remote_port: int
    remote_domain: Optional[str] = None
    country: str = "Unknown"
    country_code: str = "XX"
    jurisdiction: str = "Unknown"
    is_known_tracker: bool = False
    tracker_category: Optional[str] = None
    risk_level: str = "LOW"
    timestamp: str = ""


connection_history: deque[dict] = deque(maxlen=500)
_previous_connection_keys: set[str] = set()
_new_connection_callbacks: list = []


def register_new_connection_callback(cb):
    _new_connection_callbacks.append(cb)


def unregister_new_connection_callback(cb):
    if cb in _new_connection_callbacks:
        _new_connection_callbacks.remove(cb)


def _get_active_connections_raw() -> list[dict]:
    """Use netstat -nv -p tcp to get ESTABLISHED connections with process info.

    macOS netstat -v includes a ProcessName:PID column which works even when
    lsof is restricted by Electron's Hardened Runtime sandbox.

    Output format (per line):
        tcp4  0  0  local.ip.port  remote.ip.port  STATE  [buf sizes]  Name:PID  [flags]

    The remote address uses dots as separators: last segment is the port.
    The process column is Name:PID where Name may contain spaces.
    """
    try:
        result = subprocess.run(
            ["netstat", "-n", "-v", "-p", "tcp"],
            capture_output=True, text=True, timeout=15,
        )
        output = result.stdout
    except Exception:
        return []

    connections = []
    seen: set[str] = set()

    for line in output.strip().split("\n"):
        parts = line.split()
        # Minimum: tcp4 recvQ sendQ local remote state [buffers] proc:pid flags
        if len(parts) < 7:
            continue
        if parts[5] != "ESTABLISHED":
            continue

        # Remote address: dots as separator, last segment = port
        remote_raw = parts[4]
        dot_idx = remote_raw.rfind(".")
        if dot_idx == -1:
            continue
        remote_ip = remote_raw[:dot_idx]
        try:
            remote_port = int(remote_raw[dot_idx + 1:])
        except ValueError:
            continue

        # Skip loopback / link-local
        if (remote_ip.startswith("127.") or remote_ip == "::1"
                or remote_ip.startswith("169.254.")):
            continue

        # Find the ProcessName:PID field — the one matching \S+:\d+ pattern
        # It may be split if process name has spaces, e.g. "Vivaldi Helper:12195"
        pid = 0
        process_name = "Unknown"
        for i in range(6, len(parts)):
            m = re.search(r":(\d+)$", parts[i])
            if m:
                try:
                    pid = int(m.group(1))
                except ValueError:
                    continue
                # Process name = everything before ':pid', possibly multiple tokens
                name_end = parts[i][: -len(m.group(0))]
                # Prepend any preceding non-numeric tokens from after index 6
                name_tokens = []
                for j in range(6, i):
                    if not re.match(r"^\d+$", parts[j]):
                        name_tokens.append(parts[j])
                process_name = " ".join(name_tokens + [name_end]) if name_tokens else name_end
                break

        key = f"{pid}:{remote_ip}:{remote_port}"
        if key in seen:
            continue
        seen.add(key)

        connections.append({
            "pid": pid,
            "process_name": process_name,
            "remote_ip": remote_ip,
            "remote_port": remote_port,
        })

    return connections


def _get_app_for_process(process_name: str) -> tuple[Optional[str], Optional[str]]:
    try:
        with open(DATA_DIR / "tools_db.json") as f:
            tools_db = json.load(f)
        for entry in tools_db:
            if process_name in entry.get("mac_process_names", []):
                return entry["name"], entry.get("mac_bundle_id")
            if process_name.lower() == entry["name"].lower():
                return entry["name"], entry.get("mac_bundle_id")
    except Exception:
        pass
    return None, None


def _get_vpn_connections_raw() -> list[dict]:
    """Detect active VPN tunnels that are invisible to netstat (kernel-level).

    Supports:
    - Cisco Secure Client / AnyConnect  (reads profile XMLs)
    - WireGuard, Mullvad, NordVPN, ExpressVPN, ProtonVPN, Tunnelblick (process scan)
    """
    results: list[dict] = []
    seen: set[str] = set()

    # ── Cisco Secure Client / AnyConnect ────────────────────────────────────
    cisco_profile_dir = Path('/opt/cisco/secureclient/vpn/profile')
    cisco_running = False
    try:
        ps = subprocess.run(['pgrep', '-x', 'vpnagentd'], capture_output=True, text=True, timeout=3)
        cisco_running = ps.returncode == 0
    except Exception:
        pass

    if cisco_running and cisco_profile_dir.exists():
        for xml_file in cisco_profile_dir.glob('*.xml'):
            try:
                content = xml_file.read_text()
                hosts = re.findall(r'<HostAddress>(.*?)</HostAddress>', content)
                names = re.findall(r'<HostName>(.*?)</HostName>', content)
                seen_hosts: set[str] = set()
                for i, host in enumerate(hosts):
                    host = host.strip()
                    if not host or host in seen_hosts:
                        continue
                    seen_hosts.add(host)
                    display = names[i].strip() if i < len(names) else host
                    endpoint_key = f"cisco:{host}"
                    if endpoint_key in seen:
                        continue
                    seen.add(endpoint_key)
                    # Resolve hostname → IP for geolocation
                    try:
                        ip = socket.gethostbyname(host)
                    except Exception:
                        ip = host
                    results.append({
                        "pid": 0,
                        "process_name": "Cisco Secure Client",
                        "app_name": f"Cisco VPN → {display}",
                        "remote_ip": ip,
                        "remote_port": 443,
                        "remote_domain": host,
                        "is_vpn": True,
                    })
            except Exception:
                pass

    # ── Other VPN clients — detect by process name ──────────────────────────
    OTHER_VPN = [
        ("wireguard",     "WireGuard"),
        ("mullvad",       "Mullvad VPN"),
        ("nordvpnd",      "NordVPN"),
        ("expressvpn",    "ExpressVPN"),
        ("protonvpn",     "ProtonVPN"),
        ("openvpn",       "OpenVPN"),
        ("tunnelblick",   "Tunnelblick"),
        ("openfortivpn",  "FortiVPN"),
        ("vpnagentd",     "Cisco AnyConnect"),  # fallback if no profile found
    ]
    try:
        ps_out = subprocess.run(["ps", "aux"], capture_output=True, text=True, timeout=5)
        for line in ps_out.stdout.splitlines():
            line_lower = line.lower()
            for proc_key, vpn_name in OTHER_VPN:
                if proc_key in line_lower:
                    # Skip if we already added a richer Cisco entry
                    if vpn_name == "Cisco AnyConnect" and any(
                        r["process_name"] == "Cisco Secure Client" for r in results
                    ):
                        break
                    endpoint_key = f"proc:{vpn_name}"
                    if endpoint_key in seen:
                        break
                    seen.add(endpoint_key)
                    parts = line.split()
                    pid = int(parts[1]) if len(parts) > 1 else 0
                    results.append({
                        "pid": pid,
                        "process_name": vpn_name,
                        "app_name": vpn_name,
                        "remote_ip": "0.0.0.0",
                        "remote_port": 0,
                        "remote_domain": None,
                        "is_vpn": True,
                    })
                    break
    except Exception:
        pass

    return results


_RISK_SCORE = {"SEVERE": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}


def _compute_risk(jurisdiction: str, is_tracker: bool) -> str:
    if jurisdiction in ("CN", "RU"):
        return "SEVERE"
    elif jurisdiction == "US":
        return "HIGH" if is_tracker else "MEDIUM"
    elif is_tracker:
        return "MEDIUM"
    elif jurisdiction == "EU":
        return "LOW"
    return "MEDIUM"


async def get_active_connections() -> list[dict]:
    raw = _get_active_connections_raw() + _get_vpn_connections_raw()

    enriched = []
    for conn in raw:
        ip = conn["remote_ip"]
        is_vpn = conn.get("is_vpn", False)

        # Skip geolocation for placeholder IPs
        if ip == "0.0.0.0" or ip.startswith("("):
            geo: dict = {"country": "Unknown", "country_code": "XX", "jurisdiction": "Unknown"}
        else:
            geo = await geolocate_ip(ip)

        tracker = check_domain_tracker(conn.get("remote_domain") or ip)
        # For regular connections, look up the friendly app name from tools_db
        if is_vpn:
            app_name = conn.get("app_name") or conn["process_name"]
            bundle_id = None
        else:
            app_name_db, bundle_id = _get_app_for_process(conn["process_name"])
            app_name = app_name_db or conn["process_name"]

        is_tracker = tracker is not None
        tracker_cat = tracker.get("category") if tracker else None
        jurisdiction = geo.get("jurisdiction", "Unknown")
        risk_level = _compute_risk(jurisdiction, is_tracker)

        c = {
            "pid": conn["pid"],
            "process_name": conn["process_name"],
            "app_name": app_name,
            "bundle_id": bundle_id,
            "remote_ip": ip,
            "remote_port": conn["remote_port"],
            "remote_domain": conn.get("remote_domain"),
            "country": geo.get("country", "Unknown"),
            "country_code": geo.get("country_code", "XX"),
            "jurisdiction": jurisdiction,
            "is_known_tracker": is_tracker,
            "tracker_category": tracker_cat,
            "risk_level": risk_level,
            "risk_score": _RISK_SCORE.get(risk_level, 2),
            "is_vpn": is_vpn,
            "timestamp": datetime.utcnow().isoformat(),
        }
        enriched.append(c)

        key = f"{conn['pid']}:{ip}:{conn['remote_port']}"
        if key not in _previous_connection_keys:
            _previous_connection_keys.add(key)
            connection_history.append(c)
            for cb in list(_new_connection_callbacks):
                try:
                    await cb(c)
                except Exception:
                    pass

    return enriched


async def poll_connections_loop():
    while True:
        try:
            await get_active_connections()
        except Exception as e:
            print(f"Network poll error: {e}")
        await asyncio.sleep(10)
