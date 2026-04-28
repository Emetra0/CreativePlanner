#!/bin/sh
set -eu

WORKSPACE_DIR="${SELFHOST_REPO_DIR:-/workspace}"
STATE_FILE="${SELFHOST_UPDATE_STATE_FILE:-${WORKSPACE_DIR}/.selfhost-update-state.json}"
REQUEST_FILE="${SELFHOST_UPDATE_REQUEST_FILE:-${WORKSPACE_DIR}/.selfhost-update-request.json}"
LOG_FILE="${SELFHOST_UPDATE_LOG_FILE:-${WORKSPACE_DIR}/.selfhost-update.log}"

json_bool() {
  if [ "$1" = "true" ]; then
    printf 'true'
  else
    printf 'false'
  fi
}

write_state() {
  status="$1"
  branch="$2"
  current_commit="$3"
  remote_commit="$4"
  update_available="$5"
  last_error="$6"
  last_checked="$(date +%s)"

  cat > "${STATE_FILE}" <<EOF
{"status":"${status}","branch":"${branch}","currentCommit":"${current_commit}","remoteCommit":"${remote_commit}","updateAvailable":$(json_bool "${update_available}"),"lastError":"${last_error}","lastChecked":${last_checked}}
EOF
}

refresh_status() {
  branch="${SELFHOST_BRANCH:-$(git -C "${WORKSPACE_DIR}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)}"
  current_commit="$(git -C "${WORKSPACE_DIR}" rev-parse HEAD 2>/dev/null || echo '')"
  remote_commit="$(git -C "${WORKSPACE_DIR}" ls-remote origin "refs/heads/${branch}" 2>/dev/null | awk 'NR==1 {print $1}')"
  update_available="false"

  if [ -n "${current_commit}" ] && [ -n "${remote_commit}" ] && [ "${current_commit}" != "${remote_commit}" ]; then
    update_available="true"
  fi

  write_state "idle" "${branch}" "${current_commit}" "${remote_commit}" "${update_available}" ""
}

mkdir -p "$(dirname "${STATE_FILE}")"
touch "${LOG_FILE}"
refresh_status

while true; do
  if [ -f "${REQUEST_FILE}" ]; then
    branch="${SELFHOST_BRANCH:-$(git -C "${WORKSPACE_DIR}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)}"
    current_commit="$(git -C "${WORKSPACE_DIR}" rev-parse HEAD 2>/dev/null || echo '')"
    remote_commit="$(git -C "${WORKSPACE_DIR}" ls-remote origin "refs/heads/${branch}" 2>/dev/null | awk 'NR==1 {print $1}')"
    write_state "updating" "${branch}" "${current_commit}" "${remote_commit}" "true" ""
    rm -f "${REQUEST_FILE}"

    if sh "${WORKSPACE_DIR}/scripts/update.sh" >> "${LOG_FILE}" 2>&1; then
      refresh_status
    else
      write_state "error" "${branch}" "${current_commit}" "${remote_commit}" "true" "Update failed. Check .selfhost-update.log"
    fi
  else
    refresh_status
  fi

  sleep 60
done
