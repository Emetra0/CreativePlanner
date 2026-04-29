#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
CURRENT_REPO_DIR="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_REPO_URL="https://github.com/Emetra0/CreativePlanner.git"
REPO_URL="${REPO_URL:-}"
INSTALL_DIR="${INSTALL_DIR:-/opt/creative-planner}"
APP_PORT="${APP_PORT:-8443}"
PUBLIC_HOST="${PUBLIC_HOST:-}"
BRANCH="${BRANCH:-main}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
SELFHOST_DEFAULT_ADMIN_USERNAME="${SELFHOST_DEFAULT_ADMIN_USERNAME:-admin}"
SELFHOST_DEFAULT_ADMIN_EMAIL="${SELFHOST_DEFAULT_ADMIN_EMAIL:-admin@local}"
SELFHOST_DEFAULT_ADMIN_PASSWORD="${SELFHOST_DEFAULT_ADMIN_PASSWORD:-}"
PORT_WAS_EXPLICIT="false"

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

generate_self_signed_cert() {
  local cert_dir="$1"
  local host="$2"
  local cert_path="${cert_dir}/selfhost.crt"
  local key_path="${cert_dir}/selfhost.key"
  local san_prefix="DNS"

  if [[ -f "${cert_path}" && -f "${key_path}" ]]; then
    return 0
  fi

  mkdir -p "${cert_dir}"

  if [[ "${host}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [[ "${host}" == *:* ]]; then
    san_prefix="IP"
  fi

  openssl req -x509 -nodes -newkey rsa:2048 -sha256 \
    -days 825 \
    -keyout "${key_path}" \
    -out "${cert_path}" \
    -subj "/CN=${host}" \
    -addext "subjectAltName=${san_prefix}:${host}" >/dev/null 2>&1
}

wait_for_url() {
  local url="$1"
  local attempts="${2:-30}"
  local attempt

  for attempt in $(seq 1 "${attempts}"); do
    if curl -kfsS --connect-timeout 5 "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  return 1
}

read_env_value() {
  local env_file="$1"
  local key="$2"

  if [[ ! -f "${env_file}" ]]; then
    return 1
  fi

  grep "^${key}=" "${env_file}" | tail -n 1 | cut -d= -f2-
}

stop_existing_stack() {
  local install_dir="$1"
  local compose_bin="$2"
  local env_file="${install_dir}/.env.selfhost"

  if [[ ! -f "${env_file}" || ! -f "${install_dir}/docker-compose.selfhost.yml" ]]; then
    return 0
  fi

  (
    cd "${install_dir}"
    ${compose_bin} -f docker-compose.selfhost.yml --env-file .env.selfhost down --remove-orphans
  ) >/dev/null 2>&1 || true
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
      PORT_WAS_EXPLICIT="true"
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

ensure_compose_plugin() {
  if docker compose version >/dev/null 2>&1; then
    return 0
  fi

  local compose_pkg=""
  for candidate in docker-compose-v2 docker-compose-plugin; do
    if apt-cache show "${candidate}" >/dev/null 2>&1; then
      compose_pkg="${candidate}"
      break
    fi
  done

  if [[ -z "${compose_pkg}" ]]; then
    echo "Unable to find a modern Docker Compose v2 package in the configured apt repositories." >&2
    echo "Install either 'docker-compose-v2' or 'docker-compose-plugin', then rerun this installer." >&2
    exit 1
  fi

  if ! apt-get install -y "${compose_pkg}"; then
    echo "Failed to install ${compose_pkg}. The self-host installer requires the modern 'docker compose' command." >&2
    exit 1
  fi

  if ! docker compose version >/dev/null 2>&1; then
    echo "Installed ${compose_pkg}, but 'docker compose' is still unavailable." >&2
    exit 1
  fi
}

apt-get update
apt-get install -y ca-certificates curl git openssl docker.io
systemctl enable --now docker
ensure_compose_plugin
apt-get remove -y docker-compose >/dev/null 2>&1 || true

COMPOSE_BIN="docker compose"
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is not available. Install 'docker-compose-v2' or 'docker-compose-plugin', then rerun the installer." >&2
  exit 1
fi

if [[ "${PORT_WAS_EXPLICIT}" != "true" ]]; then
  EXISTING_APP_PORT="$(read_env_value "${INSTALL_DIR}/.env.selfhost" "APP_PORT" || true)"
  if [[ -n "${EXISTING_APP_PORT}" ]]; then
    APP_PORT="${EXISTING_APP_PORT}"
  fi
fi

stop_existing_stack "${INSTALL_DIR}" "${COMPOSE_BIN}"

REQUESTED_APP_PORT="${APP_PORT}"
APP_PORT="$(pick_available_port "${APP_PORT}")"
AUTO_SELECTED_PORT="false"
if [[ "${APP_PORT}" != "${REQUESTED_APP_PORT}" ]]; then
  AUTO_SELECTED_PORT="true"
fi
LOGIN_URL="https://${PUBLIC_HOST}:${APP_PORT}"

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

TLS_CERT_DIR_RELATIVE="./.selfhost/certs"
TLS_CERT_DIR_ABSOLUTE="${INSTALL_DIR}/.selfhost/certs"
generate_self_signed_cert "${TLS_CERT_DIR_ABSOLUTE}" "${PUBLIC_HOST}"

WOPI_SECRET_VALUE="$(openssl rand -hex 32)"
COLLABORA_PASSWORD_VALUE="$(openssl rand -base64 24 | tr -d '=+/\n' | cut -c1-24)"
COLLABORA_DOMAIN_VALUE="$(printf '%s' "${PUBLIC_HOST}" | sed 's/[.[\*^$()+?{|]/\\&/g')"
DB_PASSWORD_VALUE="$(openssl rand -base64 24 | tr -d '=+/\n' | cut -c1-24)"
DB_ROOT_PASSWORD_VALUE="$(openssl rand -base64 32 | tr -d '=+/\n' | cut -c1-32)"
DEFAULT_ADMIN_PASSWORD_VALUE="${SELFHOST_DEFAULT_ADMIN_PASSWORD}"

if [[ -z "${DEFAULT_ADMIN_PASSWORD_VALUE}" ]]; then
  DEFAULT_ADMIN_PASSWORD_VALUE="$(openssl rand -base64 24 | tr -d '=+/\n' | cut -c1-24)"
fi

cat > "${INSTALL_DIR}/.env.selfhost" <<EOF
APP_PORT=${APP_PORT}
PUBLIC_HOST=${PUBLIC_HOST}
PUBLIC_URL=https://${PUBLIC_HOST}:${APP_PORT}
COLLABORA_URL=https://${PUBLIC_HOST}:${APP_PORT}/browser/dist/cool.html
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
TLS_CERT_DIR=${TLS_CERT_DIR_RELATIVE}
SELFHOST_DEFAULT_ADMIN_USERNAME=${SELFHOST_DEFAULT_ADMIN_USERNAME}
SELFHOST_DEFAULT_ADMIN_EMAIL=${SELFHOST_DEFAULT_ADMIN_EMAIL}
SELFHOST_DEFAULT_ADMIN_PASSWORD=${DEFAULT_ADMIN_PASSWORD_VALUE}
EOF

cd "${INSTALL_DIR}"
${COMPOSE_BIN} -f docker-compose.selfhost.yml --env-file .env.selfhost up -d --build

if ! wait_for_url "${LOGIN_URL}" 45; then
  echo "Creative Planner started, but the HTTPS page did not become reachable at ${LOGIN_URL}." >&2
  ${COMPOSE_BIN} -f docker-compose.selfhost.yml --env-file .env.selfhost ps >&2 || true
  ${COMPOSE_BIN} -f docker-compose.selfhost.yml --env-file .env.selfhost logs --tail=80 frontend backend >&2 || true
  exit 1
fi

cat <<EOF

Creative Planner installation completed.

Detected server host:
  ${PUBLIC_HOST}

HTTPS app port:
  ${APP_PORT}

Login URL:
  ${LOGIN_URL}

Login flow:
  1. Open the Login URL shown at the end of this installer output.
  2. Sign in with the default local admin credentials printed below.
  3. Change or replace that admin account after you finish first-time setup.
  4. Future users should use the same normal login page.

Default local admin account:
  Login username: ${SELFHOST_DEFAULT_ADMIN_USERNAME}
  Login email: ${SELFHOST_DEFAULT_ADMIN_EMAIL}
  Login password: ${DEFAULT_ADMIN_PASSWORD_VALUE}

Collabora admin password:
  ${COLLABORA_PASSWORD_VALUE}

MariaDB database:
  creative_planner

Environment file:
  ${INSTALL_DIR}/.env.selfhost

TLS certificate files:
  ${TLS_CERT_DIR_ABSOLUTE}/selfhost.crt
  ${TLS_CERT_DIR_ABSOLUTE}/selfhost.key

Manage the stack:
  cd ${INSTALL_DIR}
  ${COMPOSE_BIN} -f docker-compose.selfhost.yml --env-file .env.selfhost ps
  ${COMPOSE_BIN} -f docker-compose.selfhost.yml --env-file .env.selfhost logs -f

Next steps:
  1. Use local accounts by default for this self-hosted install.
  2. Sign in with the default local admin account printed above.
  3. Your browser will show a certificate warning at first because the installer creates a self-signed HTTPS certificate.
  4. Keep ${INSTALL_DIR}/.env.selfhost if you need to restart or update the stack later.
  5. Install source: ${INSTALL_SOURCE_DESCRIPTION}
  6. Update source: ${REPO_URL}

EOF

if [[ "${AUTO_SELECTED_PORT}" = "true" ]]; then
  cat <<EOF
Note:
  Port ${REQUESTED_APP_PORT} was still in use after the old Creative Planner stack was stopped.
  The installer automatically selected port ${APP_PORT} instead.

EOF
fi
