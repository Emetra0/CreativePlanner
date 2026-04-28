#!/bin/sh
set -eu

cd /app
mkdir -p "${SELFHOST_DATA_DIR:-/app/data/user-storage}"

if [ -d "${SELFHOST_REPO_DIR:-/workspace}" ]; then
  /usr/local/bin/update-watcher.sh &
fi

exec npm run start:selfhost
