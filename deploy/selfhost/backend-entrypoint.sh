#!/bin/sh
set -eu

cd /app

STATE_DIR="/app/.wrangler/state"
SCHEMA_SENTINEL="${STATE_DIR}/schema.initialized"

mkdir -p "${STATE_DIR}"

if [ ! -f "${SCHEMA_SENTINEL}" ]; then
  npx wrangler d1 execute creative-planner-db --local --file=./schema.sql
  touch "${SCHEMA_SENTINEL}"
fi

if [ -d "${SELFHOST_REPO_DIR:-/workspace}" ]; then
  /usr/local/bin/update-watcher.sh &
fi

exec npx wrangler dev --local --ip 0.0.0.0 --port 8787 --local-protocol=http --persist-to "${STATE_DIR}" --show-interactive-dev-session=false
