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

set_env_value() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" .env.selfhost; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env.selfhost
  else
    printf '%s=%s\n' "${key}" "${value}" >> .env.selfhost
  fi
}

generate_self_signed_cert() {
  local cert_dir="$1"
  local host="$2"
  local cert_path="${cert_dir}/selfhost.crt"
  local key_path="${cert_dir}/selfhost.key"
  local san_prefix="DNS"

  if [ -f "${cert_path}" ] && [ -f "${key_path}" ]; then
    return 0
  fi

  mkdir -p "${cert_dir}"

  case "${host}" in
    *:*) san_prefix="IP" ;;
    *)
      if printf '%s' "${host}" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
        san_prefix="IP"
      fi
      ;;
  esac

  openssl req -x509 -nodes -newkey rsa:2048 -sha256 \
    -days 825 \
    -keyout "${key_path}" \
    -out "${cert_path}" \
    -subj "/CN=${host}" \
    -addext "subjectAltName=${san_prefix}:${host}" >/dev/null 2>&1
}

wait_for_url() {
  url="$1"
  attempts="${2:-30}"
  attempt=1

  while [ "${attempt}" -le "${attempts}" ]; do
    if curl -kfsS --connect-timeout 5 "${url}" >/dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 2
  done

  return 1
}

random_secret() {
  openssl rand -base64 24 | tr -d '=+/\n' | cut -c1-24
}

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

APP_PORT="$(grep '^APP_PORT=' .env.selfhost | tail -n 1 | cut -d= -f2-)"
PUBLIC_HOST="$(grep '^PUBLIC_HOST=' .env.selfhost | tail -n 1 | cut -d= -f2-)"
DEFAULT_ADMIN_USERNAME="$(grep '^SELFHOST_DEFAULT_ADMIN_USERNAME=' .env.selfhost | tail -n 1 | cut -d= -f2-)"
DEFAULT_ADMIN_EMAIL="$(grep '^SELFHOST_DEFAULT_ADMIN_EMAIL=' .env.selfhost | tail -n 1 | cut -d= -f2-)"
DEFAULT_ADMIN_PASSWORD="$(grep '^SELFHOST_DEFAULT_ADMIN_PASSWORD=' .env.selfhost | tail -n 1 | cut -d= -f2-)"

if [ -z "${APP_PORT}" ]; then
  APP_PORT="8443"
fi

if [ -z "${PUBLIC_HOST}" ]; then
  echo "Self-host update failed: PUBLIC_HOST is missing from .env.selfhost" >&2
  exit 1
fi

if [ -z "${DEFAULT_ADMIN_USERNAME}" ]; then
  DEFAULT_ADMIN_USERNAME="admin"
  set_env_value "SELFHOST_DEFAULT_ADMIN_USERNAME" "${DEFAULT_ADMIN_USERNAME}"
fi

if [ -z "${DEFAULT_ADMIN_EMAIL}" ]; then
  DEFAULT_ADMIN_EMAIL="admin@local"
  set_env_value "SELFHOST_DEFAULT_ADMIN_EMAIL" "${DEFAULT_ADMIN_EMAIL}"
fi

if [ -z "${DEFAULT_ADMIN_PASSWORD}" ]; then
  DEFAULT_ADMIN_PASSWORD="$(random_secret)"
  set_env_value "SELFHOST_DEFAULT_ADMIN_PASSWORD" "${DEFAULT_ADMIN_PASSWORD}"
fi

TLS_CERT_DIR_RELATIVE="./.selfhost/certs"
TLS_CERT_DIR_ABSOLUTE="${WORKSPACE_DIR}/.selfhost/certs"
generate_self_signed_cert "${TLS_CERT_DIR_ABSOLUTE}" "${PUBLIC_HOST}"

set_env_value "PUBLIC_URL" "https://${PUBLIC_HOST}:${APP_PORT}"
set_env_value "COLLABORA_URL" "https://${PUBLIC_HOST}:${APP_PORT}/browser/dist/cool.html"
set_env_value "TLS_CERT_DIR" "${TLS_CERT_DIR_RELATIVE}"

git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"
${COMPOSE_BIN} -f docker-compose.selfhost.yml --env-file .env.selfhost up -d --build --remove-orphans

if ! wait_for_url "https://${PUBLIC_HOST}:${APP_PORT}" 45; then
  echo "Self-host update finished, but the HTTPS page is not reachable at https://${PUBLIC_HOST}:${APP_PORT}." >&2
  ${COMPOSE_BIN} -f docker-compose.selfhost.yml --env-file .env.selfhost ps >&2 || true
  ${COMPOSE_BIN} -f docker-compose.selfhost.yml --env-file .env.selfhost logs --tail=80 frontend backend >&2 || true
  exit 1
fi

cat <<EOF

Self-host update completed.

Login URL:
  https://${PUBLIC_HOST}:${APP_PORT}

Default local admin account:
  Login username: ${DEFAULT_ADMIN_USERNAME}
  Login email: ${DEFAULT_ADMIN_EMAIL}
  Login password: ${DEFAULT_ADMIN_PASSWORD}

EOF
