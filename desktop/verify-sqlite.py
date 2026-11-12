"""Verify the desktop agent's SQLite outbox.

Starts the agent (assumes the app is already running or launches it), then exercises the allow-list and reads the database file
directly - because "the data is really in SQLite" is the entire point of Prompt 4, not something to infer from an HTTP reply.

Run: python desktop/verify-sqlite.py [path-to-exe]
"""
import http.cookiejar
import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.request

BASE = "http://127.0.0.1:8012"
ORIGIN = "https://app.neonultra.ng"
EXE = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\XPS\apex-court-target\debug\ultraos-desktop.exe"
DB = os.path.join(os.environ["APPDATA"], "ng.neonultra.scoring", "ultraos", "outbox.db")


def start_app():
    process = subprocess.Popen([EXE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(40):
        try:
            urllib.request.urlopen(f"{BASE}/offline", timeout=1)
            return process
        except Exception:
            time.sleep(0.5)
    raise SystemExit("agent did not come up on 127.0.0.1:8012")


def query(sql, params=()):
    connection = sqlite3.connect(DB)
    try:
        return list(connection.execute(sql, params))
    finally:
        connection.close()


def main():
    process = start_app()
    try:
        jar = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        opener.addheaders = [("Origin", ORIGIN)]
        opener.open(f"{BASE}/handshake", timeout=5).read()
        # The cookie is Secure and this is http://127.0.0.1: a browser (and WebView2) treats loopback as trustworthy and sends it,
        # Python's cookiejar does not. Send it explicitly, exactly as curl must.
        token = next((cookie.value for cookie in jar if cookie.name == "ultraos_agent"), None)
        if not token:
            raise SystemExit("handshake did not set the agent cookie")
        print(f"handshake: cookie set ({len(token)} chars); sent explicitly because Secure cookies are not replayed over http")

        def agent(action, payload=None):
            body = json.dumps({"action": action, "payload": payload}).encode()
            request = urllib.request.Request(
                f"{BASE}/api/local/agent",
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "Origin": ORIGIN,
                    "Cookie": f"ultraos_agent={token}",
                },
            )
            try:
                return json.loads(opener.open(request, timeout=5).read())
            except urllib.error.HTTPError as error:
                return {"http": error.code, "body": json.loads(error.read())}

        print(f"\ndatabase: {DB} · exists={os.path.exists(DB)}")
        # synchronous is per-connection, so only the agent can report its own durability setting; journal_mode is in the file.
        print("pragmas (agent's connection):", agent("PING").get("data", {}).get("pragmas"))
        print("pragmas (separate connection):", query("PRAGMA journal_mode"))

        print("\n== clear")
        print(" ", agent("CLEAR_OUTBOX"))

        print("\n== SAVE_OUTBOX x3 (two unique keys, one duplicate)")
        records = [
            {"idempotencyKey": "k-1", "entityType": "GameEvent", "entityId": "e1", "operation": "CREATE",
             "clientUpdatedAt": "2026-11-12T06:00:00Z", "payload": {"points": 2}},
            {"idempotencyKey": "k-2", "entityType": "GameEvent", "entityId": "e2", "operation": "CREATE",
             "clientUpdatedAt": "2026-11-12T06:00:01Z", "payload": {"points": 3}},
            {"idempotencyKey": "k-2", "entityType": "GameEvent", "entityId": "e2", "operation": "CREATE",
             "clientUpdatedAt": "2026-11-12T06:00:01Z", "payload": {"points": 3}},
        ]
        print(" ", agent("SAVE_OUTBOX", records))
        for row in query("SELECT idempotencyKey, attemptCount, syncedAt FROM outbox ORDER BY idempotencyKey"):
            print("   sqlite:", row)

        print("\n== READ_OUTBOX")
        print(" ", agent("READ_OUTBOX"))

        print("\n== MARK_SYNCED k-1 APPLIED")
        print(" ", agent("MARK_SYNCED", {"idempotencyKeys": ["k-1"], "status": "APPLIED"}))
        for row in query("SELECT idempotencyKey, syncedAt IS NOT NULL, attemptCount, deadLetteredAt FROM outbox ORDER BY idempotencyKey"):
            print("   sqlite:", row)

        print("\n== READ_OUTBOX (pending only)")
        print(" ", agent("READ_OUTBOX"))

        print("\n== MARK_SYNCED k-2 FAILED x5 (dead-letters at 5)")
        for _ in range(5):
            agent("MARK_SYNCED", {"idempotencyKeys": ["k-2"], "status": "FAILED", "failureReason": "signature mismatch"})
        for row in query("SELECT idempotencyKey, attemptCount, failureReason, deadLetteredAt IS NOT NULL FROM outbox ORDER BY idempotencyKey"):
            print("   sqlite:", row)
        print("  pending after dead-letter:", agent("READ_OUTBOX").get("data"))

        print("\n== RETRY_DEAD_LETTERED")
        print(" ", agent("RETRY_DEAD_LETTERED"))
        for row in query("SELECT idempotencyKey, attemptCount, failureReason, deadLetteredAt FROM outbox ORDER BY idempotencyKey"):
            print("   sqlite:", row)

        print("\n== unknown action")
        print(" ", agent("DELETE_EVERYTHING"))
    finally:
        process.terminate()


if __name__ == "__main__":
    main()
