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

run_privileged() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    return 1
  fi
}

ensure_compose_plugin() {
  if docker compose version >/dev/null 2>&1; then
    return 0
  fi

  if command -v apt-get >/dev/null 2>&1 && command -v apt-cache >/dev/null 2>&1; then
    run_privileged apt-get update >/dev/null 2>&1 || true
    for candidate in docker-compose-v2 docker-compose-plugin; do
      if apt-cache show "${candidate}" >/dev/null 2>&1; then
        if run_privileged apt-get install -y "${candidate}"; then
          break
        fi
      fi
    done
    run_privileged apt-get remove -y docker-compose >/dev/null 2>&1 || true
  fi

  if ! docker compose version >/dev/null 2>&1; then
    echo "Self-host update requires Docker Compose v2 ('docker compose')." >&2
    echo "Install either 'docker-compose-v2' or 'docker-compose-plugin', then rerun scripts/update.sh." >&2
    exit 1
  fi
}

COMPOSE_BIN="docker compose"
ensure_compose_plugin

git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"
${COMPOSE_BIN} -f docker-compose.selfhost.yml --env-file .env.selfhost up -d --build --remove-orphans
