#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
CURRENT_REPO_DIR="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_REPO_URL="https://github.com/Emetra0/CreativePlanner.git"
REPO_URL="${REPO_URL:-}"
INSTALL_DIR="${INSTALL_DIR:-/opt/creative-planner}"
APP_PORT="${APP_PORT:-8080}"
PUBLIC_HOST="${PUBLIC_HOST:-}"
BRANCH="${BRANCH:-main}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"

port_in_use() {
  local port="$1"
  ss -ltnH "( sport = :${port} )" 2>/dev/null | grep -q "."
}

pick_available_port() {
  local requested_port="$1"
  local candidate="$requested_port"

  if ! [[ "$candidate" =~ ^[0-9]+$ ]] || [[ "$candidate" -lt 1 ]] || [[ "$candidate" -gt 65535 ]]; then
    echo "Invalid port: ${requested_port}" >&2
    exit 1
  fi

  while port_in_use "$candidate"; do
    candidate="$((candidate + 1))"
    if [[ "$candidate" -gt 65535 ]]; then
      echo "Unable to find a free TCP port starting from ${requested_port}" >&2
      exit 1
    fi
  done

  printf '%s\n' "$candidate"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-url)
      REPO_URL="$2"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --port)
      APP_PORT="$2"
      shift 2
      ;;
    --public-host)
      PUBLIC_HOST="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

LOCAL_REPO_AVAILABLE="false"
LOCAL_REPO_REMOTE=""
INSTALL_SOURCE_DESCRIPTION=""
USE_LOCAL_SOURCE="false"

if git -C "${CURRENT_REPO_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  LOCAL_REPO_AVAILABLE="true"
  LOCAL_REPO_REMOTE="$(git -C "${CURRENT_REPO_DIR}" remote get-url origin 2>/dev/null || true)"
fi

if [[ -z "${REPO_URL}" ]]; then
  if [[ "${LOCAL_REPO_AVAILABLE}" = "true" ]]; then
    REPO_URL="${LOCAL_REPO_REMOTE:-${DEFAULT_REPO_URL}}"
    INSTALL_SOURCE_DESCRIPTION="local checkout at ${CURRENT_REPO_DIR}"
    USE_LOCAL_SOURCE="true"
  else
    REPO_URL="${DEFAULT_REPO_URL}"
    INSTALL_SOURCE_DESCRIPTION="remote repository ${REPO_URL}"
  fi
else
  INSTALL_SOURCE_DESCRIPTION="remote repository ${REPO_URL}"
fi

if [[ -z "${PUBLIC_HOST}" ]]; then
  PUBLIC_HOST="$(hostname -I | awk '{print $1}')"
fi

if [[ -z "${PUBLIC_HOST}" ]]; then
  echo "Unable to detect a public host. Pass --public-host explicitly." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl git openssl docker.io docker-compose
systemctl enable --now docker

REQUESTED_APP_PORT="${APP_PORT}"
APP_PORT="$(pick_available_port "${APP_PORT}")"
AUTO_SELECTED_PORT="false"
if [[ "${APP_PORT}" != "${REQUESTED_APP_PORT}" ]]; then
  AUTO_SELECTED_PORT="true"
fi

COMPOSE_BIN="docker compose"
if ! docker compose version >/dev/null 2>&1; then
  COMPOSE_BIN="docker-compose"
fi

mkdir -p "$(dirname "${INSTALL_DIR}")"

if [[ -d "${INSTALL_DIR}/.git" ]]; then
  git -C "${INSTALL_DIR}" fetch --depth 1 origin "${BRANCH}"
  git -C "${INSTALL_DIR}" checkout "${BRANCH}"
  git -C "${INSTALL_DIR}" reset --hard "origin/${BRANCH}"
else
  rm -rf "${INSTALL_DIR}"
  if [[ "${USE_LOCAL_SOURCE}" = "true" ]]; then
    git clone --branch "${BRANCH}" "${CURRENT_REPO_DIR}" "${INSTALL_DIR}"
    git -C "${INSTALL_DIR}" remote set-url origin "${REPO_URL}"
    git -C "${INSTALL_DIR}" fetch --depth 1 origin "${BRANCH}" || true
    git -C "${INSTALL_DIR}" checkout "${BRANCH}"
  else
    git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
  fi
fi

WOPI_SECRET_VALUE="$(openssl rand -hex 32)"
COLLABORA_PASSWORD_VALUE="$(openssl rand -base64 24 | tr -d '=+/\n' | cut -c1-24)"
COLLABORA_DOMAIN_VALUE="$(printf '%s' "${PUBLIC_HOST}" | sed 's/[.[\*^$()+?{|]/\\&/g')"
DB_PASSWORD_VALUE="$(openssl rand -base64 24 | tr -d '=+/\n' | cut -c1-24)"
DB_ROOT_PASSWORD_VALUE="$(openssl rand -base64 32 | tr -d '=+/\n' | cut -c1-32)"

cat > "${INSTALL_DIR}/.env.selfhost" <<EOF
APP_PORT=${APP_PORT}
PUBLIC_HOST=${PUBLIC_HOST}
PUBLIC_URL=http://${PUBLIC_HOST}:${APP_PORT}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
VITE_GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
COLLABORA_URL=http://${PUBLIC_HOST}:${APP_PORT}/browser/dist/cool.html
COLLABORA_DOMAIN=${COLLABORA_DOMAIN_VALUE}
COLLABORA_ADMIN_USER=admin
COLLABORA_ADMIN_PASSWORD=${COLLABORA_PASSWORD_VALUE}
WOPI_SECRET=${WOPI_SECRET_VALUE}
WOPI_TOKEN_TTL_MS=3600000
DB_HOST=mariadb
DB_PORT=3306
DB_NAME=creative_planner
DB_USER=creative_planner
DB_PASSWORD=${DB_PASSWORD_VALUE}
DB_ROOT_PASSWORD=${DB_ROOT_PASSWORD_VALUE}
SELFHOST_DATA_DIR=/app/data/user-storage
EOF

cd "${INSTALL_DIR}"
${COMPOSE_BIN} -f docker-compose.selfhost.yml --env-file .env.selfhost up -d --build

cat <<EOF

Creative Planner installation completed.

Detected server host:
  ${PUBLIC_HOST}

App port:
  ${APP_PORT}

Login URL:
  http://${PUBLIC_HOST}:${APP_PORT}

First admin setup URL:
  http://${PUBLIC_HOST}:${APP_PORT}/bootstrap-admin

Login flow:
  1. Open the Login URL above.
  2. If this is the first setup, open the First admin setup URL above.
  3. Create the first admin account
  4. Return to the Login URL and sign in with that account

Collabora admin password:
  ${COLLABORA_PASSWORD_VALUE}

MariaDB database:
  creative_planner

Environment file:
  ${INSTALL_DIR}/.env.selfhost

Manage the stack:
  cd ${INSTALL_DIR}
  ${COMPOSE_BIN} -f docker-compose.selfhost.yml --env-file .env.selfhost ps
  ${COMPOSE_BIN} -f docker-compose.selfhost.yml --env-file .env.selfhost logs -f

Next steps:
  1. Use local accounts by default for this self-hosted install.
  2. If this is the first install, create the first admin through /bootstrap-admin.
  3. Keep ${INSTALL_DIR}/.env.selfhost if you need to restart or update the stack later.
  4. Install source: ${INSTALL_SOURCE_DESCRIPTION}
  5. Update source: ${REPO_URL}

EOF

if [[ "${AUTO_SELECTED_PORT}" = "true" ]]; then
  cat <<EOF
Note:
  Port ${REQUESTED_APP_PORT} was already in use on this Ubuntu server.
  The installer automatically selected port ${APP_PORT} instead.

EOF
fi

if [[ -n "${GOOGLE_CLIENT_ID}" && -n "${GOOGLE_CLIENT_SECRET}" ]]; then
  cat <<EOF
Optional Google sign-in is enabled for this install.

Google OAuth settings:
  Authorized JavaScript origin: http://${PUBLIC_HOST}:${APP_PORT}
  Authorized redirect URI: http://${PUBLIC_HOST}:${APP_PORT}/auth/google/callback

EOF
else
  cat <<EOF
Google sign-in is disabled for this install.
To enable it later, add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and VITE_GOOGLE_CLIENT_ID to:
  ${INSTALL_DIR}/.env.selfhost
Then rebuild the stack:
  cd ${INSTALL_DIR}
  ${COMPOSE_BIN} -f docker-compose.selfhost.yml --env-file .env.selfhost up -d --build

EOF
fi
