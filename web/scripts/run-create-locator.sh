#!/bin/bash
cd /opt/ultraleagueos/current/web
set -a
source /opt/ultraleagueos/shared/web.env
set +a
npx tsx scripts/create-event-locator.ts
