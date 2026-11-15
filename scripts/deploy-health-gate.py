"""Fix the deploy smoke race (Prompt 5c-vii Action 4).

The production deploy printed "SMOKE FAILED (1) — roll back now" while the release was still switching, and the identical smoke test
passed a minute later. A rollback instruction that fires on a healthy release is worse than no instruction: an operator following it
reverts a good deploy.

The fix is a health gate between the service restart and the smoke run: poll the app's own health endpoint until it answers 200, and
only then assert. The smoke test still runs against the real routes; it just no longer races the restart. If the gate itself times
out, the failure is reported as "did not come up", which is a different and truthful message.
"""
import pathlib

path = pathlib.Path("deploy/deploy.sh")
source = pathlib.Path("deploy/deploy.sh").read_text(encoding="utf-8")

if "health gate" in source:
    print("health gate already present")
    raise SystemExit(0)

old = '''systemctl restart "$SERVICE"
sleep 4
echo "[deploy] service: $(systemctl is-active "$SERVICE")"'''

new = '''systemctl restart "$SERVICE"
sleep 4
echo "[deploy] service: $(systemctl is-active "$SERVICE")"

# Health gate before the smoke test.
#
# A restart means the new process is still compiling routes, warming caches and (for this app) resolving the tenant for the
# homepage. Running the smoke assertions immediately after `sleep 4` raced that window: a production deploy printed
# "SMOKE FAILED (1) - roll back now" while the release was fine, and the same test passed a minute later. Poll the health
# endpoint first, and only assert once it answers.
PORT_FOR_HEALTH="$(systemctl cat "$SERVICE" | sed -n 's/.*--port \\([0-9]*\\).*/\\1/p' | head -1)"
HEALTH_URL="http://127.0.0.1:${PORT_FOR_HEALTH:-3000}/api/v1/live"
HEALTH_OK=0
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null -m 3 "$HEALTH_URL" 2>/dev/null; then HEALTH_OK=1; break; fi
  sleep 1
done
if [[ "$HEALTH_OK" -ne 1 ]]; then
  {
    echo ""
    echo "##########################################################################"
    echo "# DEPLOY FAILED THE HEALTH GATE - the service did not answer $HEALTH_URL within 30s."
    echo "# Roll back now:"
    echo "#   ln -sfn $PREV $APP_ROOT/current && systemctl restart $SERVICE"
    echo "# (previous release: ${PREV:-none})"
    echo "##########################################################################"
  } >&2
  exit 5
fi
echo "[deploy] health: ok ($HEALTH_URL)"'''

if old not in source:
    raise SystemExit("restart block not found")

path.write_text(source.replace(old, new, 1), encoding="utf-8", newline="\n")
print("deploy.sh: health gate added before the smoke test")
