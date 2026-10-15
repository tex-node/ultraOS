#!/usr/bin/env bash
# deploy/ops/send-alert.sh
#
# Send one email using the SMTP settings the app already uses. Body on stdin,
# subject as $1. Settings are read from the production env file (root-readable);
# no credentials in git. Recipient defaults to ALERT_EMAIL.
#
# Usage: printf 'body' | send-alert.sh "subject line"
set -uo pipefail

SUBJECT="${1:?usage: send-alert.sh <subject>  (body on stdin)}"
ENV_FILE="${ALERT_ENV_FILE:-/opt/ultraleagueos/shared/web.env}"
TO="${ALERT_EMAIL:-texdevices@gmail.com}"
BODY="$(cat)"

if [ ! -r "$ENV_FILE" ]; then
  echo "send-alert: cannot read ${ENV_FILE}" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a

TO="$TO" SUBJECT="$SUBJECT" BODY="$BODY" python3 - <<'PY'
import os, smtplib, ssl
from email.message import EmailMessage

to = os.environ["TO"]
subject = os.environ["SUBJECT"]
body = os.environ["BODY"]
host = os.environ.get("SMTP_HOST")
port = int(os.environ.get("SMTP_PORT", "587"))
user = os.environ.get("SMTP_USER")
pw = os.environ.get("SMTP_PASSWORD")
frm = os.environ.get("EMAIL_FROM") or user
secure = os.environ.get("SMTP_SECURE", "").strip().lower() in ("1", "true", "yes")

msg = EmailMessage()
msg["From"] = frm
msg["To"] = to
msg["Subject"] = subject
msg.set_content(body)

ctx = ssl.create_default_context()
if secure or port == 465:
    s = smtplib.SMTP_SSL(host, port, context=ctx, timeout=30)
else:
    s = smtplib.SMTP(host, port, timeout=30)
    s.starttls(context=ctx)
s.login(user, pw)
s.send_message(msg)
s.quit()
print(f"alert sent to {to}: {subject}")
PY
