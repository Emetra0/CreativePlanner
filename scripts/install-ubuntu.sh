#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-}"
INSTALL_DIR="${INSTALL_DIR:-/opt/creative-planner}"
APP_PORT="${APP_PORT:-8080}"
PUBLIC_HOST="${PUBLIC_HOST:-}"
BRANCH="${BRANCH:-main}"

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

if [[ -z "${REPO_URL}" ]]; then
  echo "REPO_URL is required. Example:" >&2
  echo "  sudo REPO_URL=https://github.com/Emetra0/CreativePlanner.git bash scripts/install-ubuntu.sh --port 8080" >&2
  exit 1
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

mkdir -p "$(dirname "${INSTALL_DIR}")"

if [[ -d "${INSTALL_DIR}/.git" ]]; then
  git -C "${INSTALL_DIR}" fetch --depth 1 origin "${BRANCH}"
  git -C "${INSTALL_DIR}" checkout "${BRANCH}"
  git -C "${INSTALL_DIR}" reset --hard "origin/${BRANCH}"
else
  rm -rf "${INSTALL_DIR}"
  git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
fi

WOPI_SECRET_VALUE="$(openssl rand -hex 32)"
COLLABORA_PASSWORD_VALUE="$(openssl rand -base64 24 | tr -d '=+/\n' | cut -c1-24)"
COLLABORA_DOMAIN_VALUE="$(printf '%s' "${PUBLIC_HOST}" | sed 's/[.[\*^$()+?{|]/\\&/g')"

cat > "${INSTALL_DIR}/.env.selfhost" <<EOF
APP_PORT=${APP_PORT}
PUBLIC_HOST=${PUBLIC_HOST}
PUBLIC_URL=http://${PUBLIC_HOST}:${APP_PORT}
COLLABORA_URL=http://${PUBLIC_HOST}:${APP_PORT}/browser/dist/cool.html
COLLABORA_DOMAIN=${COLLABORA_DOMAIN_VALUE}
COLLABORA_ADMIN_USER=admin
COLLABORA_ADMIN_PASSWORD=${COLLABORA_PASSWORD_VALUE}
WOPI_SECRET=${WOPI_SECRET_VALUE}
WOPI_TOKEN_TTL_MS=3600000
EOF

cd "${INSTALL_DIR}"
docker-compose -f docker-compose.selfhost.yml --env-file .env.selfhost up -d --build

cat <<EOF

Creative Planner is installing on:
  http://${PUBLIC_HOST}:${APP_PORT}

Collabora admin password:
  ${COLLABORA_PASSWORD_VALUE}

Next steps:
  1. Open the app in your browser.
  2. Create the first admin account through /bootstrap-admin if you have not done that yet.
  3. Commit this repo to GitHub and use this script as your one-command installer.

EOF
