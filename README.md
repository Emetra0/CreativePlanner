# Creative Planner App

A modern, cross-platform (Windows, macOS, Linux, Web) application for video content planning, featuring mindmaps, storyboards, and a secure self-hosted architecture.

## Prerequisites

Since this is a hybrid Next.js + Tauri application, you need the following installed:

1.  **Node.js** (v18 or newer): [Download Here](https://nodejs.org/)
2.  **Rust & Cargo** (for the Desktop App): [Download Here](https://www.rust-lang.org/tools/install)
3.  **Microsoft Visual Studio C++ Build Tools** (for Windows): Required for compiling Rust on Windows.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Run Web Version (Development):**
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) in your browser.

    For Google sign-in, copy `.env.example` to `.env` and set `VITE_GOOGLE_CLIENT_ID`.
    In Google Cloud Console, add `http://localhost:3000` as an Authorized JavaScript origin and `http://localhost:3000/auth/google/callback` as an Authorized redirect URI.

3.  **Run Local Worker (Development):**
    ```bash
    npm run dev:backend
    ```
    By default, the web app now uses `http://127.0.0.1:8787` in development. Copy `backend/.dev.vars.example` to `backend/.dev.vars` and adjust it if your local Collabora host runs elsewhere. Google OAuth also needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in that file for local auth.

## Google Sign-In Setup

Google sign-in in this app needs three values to line up:

1. `VITE_GOOGLE_CLIENT_ID` in the frontend.
2. `GOOGLE_CLIENT_ID` in the backend worker.
3. `GOOGLE_CLIENT_SECRET` in the backend worker.

The frontend starts the OAuth flow and the backend exchanges the code with Google, so both sides must use the same Google OAuth app.

For local development, configure these files:

- `.env` with `VITE_GOOGLE_CLIENT_ID=...`
- `backend/.dev.vars` with `GOOGLE_CLIENT_ID=...` and `GOOGLE_CLIENT_SECRET=...`

For the Ubuntu self-hosted install, Google sign-in is optional. If you want it, the installer writes these values into `.env.selfhost` when you provide them:

```bash
curl -fsSL https://raw.githubusercontent.com/Emetra0/CreativePlanner/main/scripts/install.sh | sudo GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com GOOGLE_CLIENT_SECRET=your-client-secret REPO_URL=https://github.com/Emetra0/CreativePlanner.git bash -s -- --port 8080 --public-host your.domain.or.ip
```

If you enable Google sign-in, use the public app URL for both values below:

- Authorized JavaScript origin: `http://your.domain.or.ip:8080`
- Authorized redirect URI: `http://your.domain.or.ip:8080/auth/google/callback`

If you run behind HTTPS, use the final HTTPS URL in both places instead.

## Run On Ubuntu

For web usage on Ubuntu, use the self-hosted Docker stack. It starts the frontend, backend, MariaDB, and Collabora automatically.

### 1. Prepare the server

- Use Ubuntu 22.04 or newer.
- Make sure ports `80` and your app port such as `8080` are reachable.
- Put the repo on GitHub or another Git host the server can clone.
- Local account login works without Google OAuth.
- Create a Google OAuth Web app only if you want Google sign-in.

### 2. Install with one command

Replace the repo URL and public host with your own values:

```bash
curl -fsSL https://raw.githubusercontent.com/Emetra0/CreativePlanner/main/scripts/install.sh | sudo REPO_URL=https://github.com/your-user/your-repo.git bash -s -- --port 8080 --public-host your.server.ip.or.domain
```

If you want optional Google sign-in too, add the Google variables before `REPO_URL`:

```bash
curl -fsSL https://raw.githubusercontent.com/Emetra0/CreativePlanner/main/scripts/install.sh | sudo GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com GOOGLE_CLIENT_SECRET=your-client-secret REPO_URL=https://github.com/your-user/your-repo.git bash -s -- --port 8080 --public-host your.server.ip.or.domain
```

What this does:

1. Installs Docker and Docker Compose.
2. Clones the repo into `/opt/creative-planner` by default.
3. Detects a free host port, starting from the requested port and moving upward if needed.
4. Creates `.env.selfhost` with generated secrets.
5. Starts `frontend`, `backend`, `mariadb`, and `collabora`.
6. Applies the bundled schema and all backend migrations automatically.

If you omit `--port`, the installer starts from `8080`. If that port is already taken, it automatically picks the next free port and prints the final URL at the end of installation.

### 3. Open the app

After the installer finishes, use the URL shown in the terminal summary. It includes:

- The detected server host
- The final app port
- The app URL
- The bootstrap-admin URL for the first login
- The `.env.selfhost` file path

If the installer kept the requested default port, the URL will be:

```text
http://your.server.ip.or.domain:8080
```

If this is the first install, create the first admin account through:

```text
http://your.server.ip.or.domain:8080/bootstrap-admin
```

After creating that first admin, go back to the main app URL and log in with the account you just created.

### 4. Manage the running app

The install directory defaults to `/opt/creative-planner`.

Check containers:

```bash
cd /opt/creative-planner
docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost ps
```

See logs:

```bash
cd /opt/creative-planner
docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost logs -f
```

Restart the stack:

```bash
cd /opt/creative-planner
docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost up -d --build
```

Stop the stack:

```bash
cd /opt/creative-planner
docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost down
```

### 5. Update the app later

Run:

```bash
cd /opt/creative-planner
sh scripts/update.sh
```

### 6. Optional Google OAuth settings

If you choose to enable Google sign-in, use:

- Authorized JavaScript origin: `http://your.server.ip.or.domain:8080`
- Authorized redirect URI: `http://your.server.ip.or.domain:8080/auth/google/callback`

If you place the app behind HTTPS, switch both entries to the final HTTPS URL.

## Cloud And Local Storage

The app now supports two storage targets at the same time:

1. Ubuntu self-hosted cloud storage per user.
2. A local sync folder chosen from the current user's own computer.

In the self-hosted stack, `/save` and `/load` now prefer a per-user JSON file under `SELFHOST_DATA_DIR` on the Ubuntu server, with the database kept as a fallback. By default that path is `/app/data/user-storage` inside the backend container and is backed by a Docker volume.

In the app Settings page, the Local Sync Folder picker lets the current user choose a folder from their own machine. The app writes a synced snapshot there in addition to the Ubuntu-hosted cloud copy, and it can load from that local sync file when the cloud is unavailable.

4.  **Run Local Collabora (Development):**
    ```bash
    docker compose up collabora
    ```
    This exposes Collabora at `http://127.0.0.1:9980/browser/dist/cool.html`, which matches the default `COLLABORA_URL` in `backend/.dev.vars.example`.

5.  **Run Desktop Version (Development):**
    ```bash
    npm run tauri dev
    ```
    This will launch the native application window.

## Architecture

*   **Frontend:** Next.js 14 (App Router), React, Tailwind CSS
*   **Desktop Engine:** Tauri v2 (Rust)
*   **State Management:** Zustand
*   **Editor:** Tiptap
*   **Mindmap:** React Flow
*   **Security (Self-Hosted):** Traefik, CrowdSec, Authentik (see `docker-compose.yml`)

## Features

*   **Local & Cloud:** Works offline with local files or syncs via self-hosted cloud.
*   **Plugin System:** Modular architecture to enable/disable features.
*   **Secure:** Enterprise-grade security for self-hosted deployments.
*   **Local Office Dev Path:** The web app can run against a local Wrangler worker plus a local Collabora container instead of requiring the deployed worker during development.

## GitHub to Ubuntu Install

If you want this repo to install as a full self-hosted service on Ubuntu from a GitHub repo, use the self-host bundle in [SELFHOST.md](SELFHOST.md).

Once the repo is on GitHub, the intended install flow is a single command like:

```bash
curl -fsSL https://raw.githubusercontent.com/Emetra0/CreativePlanner/main/scripts/install.sh | sudo REPO_URL=https://github.com/Emetra0/CreativePlanner.git bash -s -- --port 8080
```

That installer brings up the frontend, backend, MariaDB, and Collabora stack together through `docker-compose.selfhost.yml`, and the backend applies the bundled schema and migrations automatically on first boot.
