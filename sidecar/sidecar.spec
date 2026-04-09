# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for the Doxshield sidecar.
Produces a single-file binary: dist/doxshield-sidecar
"""

block_cipher = None

a = Analysis(
    ['main.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('data/known_trackers.json', 'data'),
        ('data/tools_db.json',       'data'),
        ('data/ip_ranges.json',      'data'),
    ],
    hiddenimports=[
        # uvicorn internals that aren't auto-detected
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        'uvicorn.main',
        # FastAPI / Starlette
        'fastapi',
        'starlette',
        'starlette.middleware.cors',
        'starlette.responses',
        'starlette.routing',
        # Async
        'anyio',
        'anyio._backends._asyncio',
        'sniffio',
        # HTTP
        'httpx',
        'httpcore',
        'h11',
        # Parsing
        'bs4',
        'lxml',
        'lxml.etree',
        'lxml._elementpath',
        # Pydantic
        'pydantic',
        'pydantic.v1',
        # Auth / misc
        'jwt',
        'resend',
        'dotenv',
        'email.mime.text',
        'email.mime.multipart',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'numpy', 'PIL', 'cv2'],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='doxshield-sidecar',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,          # UPX can cause macOS Gatekeeper issues
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch='arm64',
    codesign_identity=None,
    entitlements_file=None,
)
