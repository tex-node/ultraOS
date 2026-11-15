"""Installer configuration (Prompt 5c-vii).

Two deliberate changes to the shell's bundle config:

  * NSIS only. An `.msi` needs WiX and gives the pilot nothing; a single setup `.exe` is what an organizer can be sent.
  * `installMode: currentUser`. A venue laptop's coach may not be an administrator, and an installer that demands elevation is an
    installer that gets abandoned.

`windows: []` stays. The window is built in Rust (lib.rs) because it needs a user agent marker for the agent handshake, and a
config-declared window would duplicate it and fail at startup with "webview with label 'main' already exists".
"""
import json
import pathlib

path = pathlib.Path("desktop/src-tauri/tauri.conf.json")
config = json.loads(path.read_text(encoding="utf-8"))

config["version"] = "1.0.0"
config["bundle"]["targets"] = ["nsis"]
config["bundle"]["windows"] = {
    "webviewInstallMode": {"type": "downloadBootstrapper"},
    "nsis": {
        "installMode": "currentUser",
        "displayLanguageSelector": False,
    },
}
config["bundle"]["icon"] = [
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.icns",
    "icons/icon.ico",
]

path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
print("tauri.conf.json: version 1.0.0, NSIS only, currentUser install")
