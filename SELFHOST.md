# Self-Hosted Ubuntu Install

This repo can be installed on an Ubuntu server with one script after it is uploaded to GitHub.

## Preferred install

Clone the repo on Ubuntu and run the installer locally:

```bash
git clone https://github.com/Emetra0/CreativePlanner.git
cd CreativePlanner
sudo bash scripts/install.sh --port 8080
```

With a fixed public host:

```bash
git clone https://github.com/Emetra0/CreativePlanner.git
cd CreativePlanner
sudo bash scripts/install.sh --port 8080 --public-host your.server.ip.or.domain
```

## Alternative remote install

If you want to stream the installer directly from GitHub instead:

```bash
curl -fsSL https://raw.githubusercontent.com/Emetra0/CreativePlanner/main/scripts/install.sh | sudo bash -s -- --port 8080
```

This default install uses local account login only. Google sign-in is optional, not required.

The installer is already pinned to this GitHub repo by default, so you do not need to pass `REPO_URL` for normal installs.

Optional flags:

```bash
--public-host your.server.ip.or.domain
--install-dir /opt/creative-planner
--branch main
```

If `--port` is omitted, the installer starts from `8080`. If that port is already busy, it automatically selects the next free host port and prints the final URL at the end.

## What the installer does

1. Installs `docker.io` and `docker-compose`.
2. Installs the app into `/opt/creative-planner`.
3. Uses the local checkout as the install source when you run it from a cloned repo.
4. Keeps the GitHub origin as the update source.
5. Detects a free host port for the web app.
6. Writes `.env.selfhost` with generated secrets for WOPI, Collabora, and MariaDB.
7. Builds and starts the full stack from `docker-compose.selfhost.yml`.

## Services included

- `frontend`: the built Vite app behind Nginx
- `backend`: the self-host Node runtime for the existing API
- `mariadb`: the persistent application database used by the backend
- `collabora`: the bundled Collabora CODE server

The frontend proxies both `/api` and the Collabora `/browser`, `/cool`, and `/hosting` endpoints, so the full app is exposed on a single public port.

## Notes

- MariaDB state is persisted in the Docker volume `mariadb_data`.
- The backend automatically creates the database and applies `schema.sql` plus all `migration_*.sql` files on first boot.
- User cloud files are stored under `SELFHOST_DATA_DIR` in the `backend_user_storage` Docker volume.
- The first admin can still be created through the existing `/bootstrap-admin` flow.

## Optional Google Sign-In

If you want Google sign-in, create a Google OAuth Web application in Google Cloud Console and provide:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Run the installer like this:

```bash
curl -fsSL https://raw.githubusercontent.com/Emetra0/CreativePlanner/main/scripts/install.sh | sudo GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com GOOGLE_CLIENT_SECRET=your-client-secret bash -s -- --port 8080 --public-host your.domain.or.ip
```

Use these OAuth app settings in Google Cloud Console:

- Authorized JavaScript origin: `http://your.domain.or.ip:8080`
- Authorized redirect URI: `http://your.domain.or.ip:8080/auth/google/callback`

If the app is served over HTTPS, those entries must use the final HTTPS URL instead.

If you do not provide those variables, the self-hosted install still works and uses local account login only.

## What You See At The End

When installation finishes, the terminal prints:

- the Ubuntu server host it detected
- the final app port it chose
- the main app URL
- the `/bootstrap-admin` URL for creating the first admin
- the path to `.env.selfhost`
- quick `docker compose` commands for status and logs
- whether Google sign-in is enabled or disabled for that install

If the requested port was already in use, the terminal also tells you which replacement port was selected automatically.
