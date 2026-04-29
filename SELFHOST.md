# Self-Hosted Ubuntu Install

This repo can be installed on an Ubuntu server with one script after it is uploaded to GitHub.

## Preferred install

Clone the repo on Ubuntu and run the installer locally:

```bash
git clone https://github.com/Emetra0/CreativePlanner.git
cd CreativePlanner
sudo bash scripts/install.sh
```

With a fixed public host:

```bash
git clone https://github.com/Emetra0/CreativePlanner.git
cd CreativePlanner
sudo bash scripts/install.sh --public-host your.server.ip.or.domain
```

## Alternative remote install

If you want to stream the installer directly from GitHub instead:

```bash
curl -fsSL https://raw.githubusercontent.com/Emetra0/CreativePlanner/main/scripts/install.sh | sudo bash -s --
```

This default install uses local account login only.

The installer is already pinned to this GitHub repo by default, so you do not need to pass `REPO_URL` for normal installs.

Optional flags:

```bash
--public-host your.server.ip.or.domain
--install-dir /opt/creative-planner
--branch main
```

If `--port` is omitted, the installer starts from `8443`. If that port is already busy, it automatically selects the next free host port and prints the final HTTPS URL at the end.

## What the installer does

1. Installs `docker.io` and a modern Docker Compose v2 package (`docker-compose-v2` on Ubuntu, or `docker-compose-plugin` when available).
2. Installs the app into `/opt/creative-planner`.
3. Uses the local checkout as the install source when you run it from a cloned repo.
4. Keeps the GitHub origin as the update source.
5. Detects a free HTTPS host port for the web app, starting from `8443`.
6. Writes `.env.selfhost` with generated secrets for WOPI, Collabora, and MariaDB.
7. Generates a self-signed TLS certificate for the detected public host.
8. Builds and starts the full stack from `docker-compose.selfhost.yml`.
9. Verifies that the HTTPS login page is reachable before reporting success.

## Services included

- `frontend`: the built Vite app behind Nginx
- `backend`: the self-host Node runtime for the existing API
- `mariadb`: the persistent application database used by the backend
- `collabora`: the bundled Collabora CODE server

The frontend proxies both `/api` and the Collabora `/browser`, `/cool`, and `/hosting` endpoints, so the full app is exposed on a single public HTTPS port.

## Notes

- MariaDB state is persisted in the Docker volume `mariadb_data`.
- The backend automatically creates the database and applies `schema.sql` plus all `migration_*.sql` files on first boot.
- User cloud files are stored under `SELFHOST_DATA_DIR` in the `backend_user_storage` Docker volume.
- The first admin must be created through the public `/bootstrap-admin` page on a fresh install.
- That bootstrap page automatically locks as soon as the first admin exists, and it does not reopen unless you reinstall with a fresh database.
- The installer-generated certificate is self-signed, so browsers will warn until you replace it with a trusted certificate.

## What You See At The End

When installation finishes, the terminal prints:

- the Ubuntu server host it detected
- the final app port it chose
- the exact Login URL
- the exact First admin setup URL
- the path to `.env.selfhost`
- quick `docker compose` commands for status and logs

If the requested port was already in use, the terminal also tells you which replacement port was selected automatically.
