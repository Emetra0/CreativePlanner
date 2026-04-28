#!/usr/bin/env sh
set -eu

WORKSPACE_DIR="${SELFHOST_REPO_DIR:-$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)}"

cd "${WORKSPACE_DIR}"

if [ ! -d .git ]; then
  echo "Self-host update failed: ${WORKSPACE_DIR} is not a git repository" >&2
  exit 1
fi

if [ ! -f .env.selfhost ]; then
  echo "Self-host update failed: .env.selfhost is missing" >&2
  exit 1
fi

BRANCH="${SELFHOST_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)}"

git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"
docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost up -d --build --remove-orphans
