# Self-Hosted Ubuntu Install

This repo can be installed on an Ubuntu server with one script after it is uploaded to GitHub.

## One-command install

Replace the repo URL with your real GitHub repository:

```bash
curl -fsSL https://raw.githubusercontent.com/Emetra0/CreativePlanner/main/scripts/install-ubuntu.sh | sudo REPO_URL=https://github.com/Emetra0/CreativePlanner.git bash -s -- --port 8080
```

Optional flags:

```bash
--public-host your.server.ip.or.domain
--install-dir /opt/creative-planner
--branch main
```

## What the installer does

1. Installs `docker.io` and `docker-compose`.
2. Clones or updates the GitHub repository.
3. Writes `.env.selfhost` with a generated WOPI secret and Collabora admin password.
4. Builds and starts the full stack from `docker-compose.selfhost.yml`.

## Services included

- `frontend`: the built Vite app behind Nginx
- `backend`: the current Wrangler/D1/Durable Object backend runtime
- `collabora`: the bundled Collabora CODE server

The frontend proxies both `/api` and the Collabora `/browser`, `/cool`, and `/hosting` endpoints, so the full app is exposed on a single public port.

## Notes

- Backend state is persisted in the Docker volume `backend_state`.
- The install script does a first-run schema initialization for the local D1 state.
- The first admin can still be created through the existing `/bootstrap-admin` flow.
