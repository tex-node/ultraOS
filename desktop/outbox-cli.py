"""Read and clear the desktop agent's outbox from outside the app (acceptance tooling).

Usage:
  python desktop/outbox-cli.py dump            rows: key, type, attempts, syncedAt
  python desktop/outbox-cli.py count           pending / total
  python desktop/outbox-cli.py clear           delete every row (test setup only)
"""
import os
import sqlite3
import sys

DB = os.path.join(os.environ["APPDATA"], "ng.neonultra.scoring", "ultraos", "outbox.db")


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else "dump"
    connection = sqlite3.connect(DB)
    try:
        if command == "clear":
            connection.execute("DELETE FROM outbox")
            connection.commit()
            print("cleared")
        elif command == "count":
            total = connection.execute("SELECT COUNT(*) FROM outbox").fetchone()[0]
            pending = connection.execute(
                "SELECT COUNT(*) FROM outbox WHERE syncedAt IS NULL AND deadLetteredAt IS NULL"
            ).fetchone()[0]
            print(f"total={total} pending={pending}")
        else:
            rows = connection.execute(
                "SELECT idempotencyKey, entityType, attemptCount, syncedAt FROM outbox ORDER BY localId"
            ).fetchall()
            if not rows:
                print("(empty)")
            for row in rows:
                print(" | ".join("NULL" if value is None else str(value) for value in row))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
