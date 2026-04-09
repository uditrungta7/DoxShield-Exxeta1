"""macOS TCC permission database reader."""
import os
import sqlite3
from typing import Optional

TCC_DB_USER = os.path.expanduser("~/Library/Application Support/com.apple.TCC/TCC.db")
TCC_DB_SYSTEM = "/Library/Application Support/com.apple.TCC/TCC.db"

SERVICE_MAP = {
    "kTCCServiceCamera": "Camera",
    "kTCCServiceMicrophone": "Microphone",
    "kTCCServiceAddressBook": "Contacts",
    "kTCCServiceCalendar": "Calendar",
    "kTCCServiceReminders": "Reminders",
    "kTCCServiceScreenCapture": "Screen Recording",
    "kTCCServiceSystemPolicyAllFiles": "Full Disk Access",
    "kTCCServiceLocation": "Location",
    "kTCCServicePhotos": "Photos",
    "kTCCServiceAccessibility": "Accessibility",
    "kTCCServiceListenEvent": "Input Monitoring",
    "kTCCServicePostEvent": "Automation",
    "kTCCServiceMediaLibrary": "Media Library",
    "kTCCServiceBluetoothAlways": "Bluetooth",
    "kTCCServiceUserTracking": "User Tracking",
    "kTCCServiceDesktopFolder": "Desktop Folder",
    "kTCCServiceDownloadsFolder": "Downloads Folder",
    "kTCCServiceDocumentsFolder": "Documents Folder",
}


def _read_tcc_db(db_path: str) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=3.0)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT client, service, auth_value FROM access WHERE auth_value = 2"
        )
        for client, service, _ in cursor.fetchall():
            perm = SERVICE_MAP.get(service, service)
            if client not in result:
                result[client] = []
            if perm not in result[client]:
                result[client].append(perm)
        conn.close()
    except sqlite3.OperationalError:
        pass
    except Exception as e:
        print(f"Warning: TCC read error {db_path}: {e}")
    return result


def get_app_permissions() -> dict:
    permissions: dict[str, list[str]] = {}
    fda_available = False

    user_perms = _read_tcc_db(TCC_DB_USER)
    for bundle_id, perms in user_perms.items():
        if bundle_id not in permissions:
            permissions[bundle_id] = []
        for p in perms:
            if p not in permissions[bundle_id]:
                permissions[bundle_id].append(p)

    if os.access(TCC_DB_SYSTEM, os.R_OK):
        fda_available = True
        sys_perms = _read_tcc_db(TCC_DB_SYSTEM)
        for bundle_id, perms in sys_perms.items():
            if bundle_id not in permissions:
                permissions[bundle_id] = []
            for p in perms:
                if p not in permissions[bundle_id]:
                    permissions[bundle_id].append(p)

    try:
        os.stat(TCC_DB_USER)
        fda_available = True
    except PermissionError:
        fda_available = False

    return {
        "permissions": permissions,
        "fda_available": fda_available,
        "error": None if fda_available else "fda_required",
    }


def get_permissions_for_bundle(bundle_id: str) -> list[str]:
    return get_app_permissions()["permissions"].get(bundle_id, [])
