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

## Run On Ubuntu

For web usage on Ubuntu, use the self-hosted Docker stack. It starts the frontend, backend, MariaDB, and Collabora automatically.

### 1. Prepare the server

- Use Ubuntu 22.04 or newer.
- Make sure ports `80` and your app port such as `8080` are reachable.
- Put the repo on GitHub or another Git host the server can clone.
- Local account login is the intended self-host path for this version.

### 2. Preferred install path

Clone the repo on the Ubuntu server and run the installer from that local checkout:

```bash
git clone https://github.com/Emetra0/CreativePlanner.git
cd CreativePlanner
sudo bash scripts/install.sh
```

If you want to force a specific public host instead of using the server's detected IP:

```bash
git clone https://github.com/Emetra0/CreativePlanner.git
cd CreativePlanner
sudo bash scripts/install.sh --public-host your.server.ip.or.domain
```

### 3. Alternative remote install

If you prefer not to clone first, you can still stream the installer directly from GitHub:

```bash
curl -fsSL https://raw.githubusercontent.com/Emetra0/CreativePlanner/main/scripts/install.sh | sudo bash -s --
```

With a fixed public host:

```bash
curl -fsSL https://raw.githubusercontent.com/Emetra0/CreativePlanner/main/scripts/install.sh | sudo bash -s -- --public-host your.server.ip.or.domain
```

What this does:

1. Installs Docker and a modern Docker Compose v2 package (`docker-compose-v2` on Ubuntu, or `docker-compose-plugin` when available).
2. Installs the app into `/opt/creative-planner` by default.
3. Uses the local cloned repo as the install source when you run `scripts/install.sh` from a checkout.
4. Keeps the GitHub repo as the update source for later `scripts/update.sh` runs.
5. Uses HTTPS by default on port `8443`, and automatically moves upward if that port is already in use.
6. Creates `.env.selfhost` with generated secrets.
7. Generates a self-signed TLS certificate for the detected public host.
8. Verifies that the HTTPS page actually responds before reporting success.
9. Starts `frontend`, `backend`, `mariadb`, and `collabora`.
10. Applies the bundled schema and all backend migrations automatically.

If you omit `--port`, the installer starts from `8443`. If that port is already taken, it automatically picks the next free port and prints the final HTTPS URL at the end of installation.

### 4. Open the app

After the installer finishes, use the URL shown in the terminal summary. It includes:

- The detected server host
- The final app port
- The exact Login URL
- The exact First admin setup URL
- The `.env.selfhost` file path

If the installer kept the requested default port, the URL will be:

```text
https://your.server.ip.or.domain:8443
```

If this is the first install, create the first admin account through:

```text
https://your.server.ip.or.domain:8443/bootstrap-admin
```

That bootstrap page is only available until the first admin account is created. After that, it is locked for the lifetime of that installation and visitors are sent to the normal login page instead. Because the installer creates a self-signed certificate automatically, the browser will show a trust warning until you replace it with your own certificate.

### 5. Manage the running app

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

### 6. Update the app later

Run:

```bash
cd /opt/creative-planner
sudo sh scripts/update.sh
```

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
git clone https://github.com/Emetra0/CreativePlanner.git
cd CreativePlanner
sudo bash scripts/install.sh --port 8080
```

That installer brings up the frontend, backend, MariaDB, and Collabora stack together through `docker-compose.selfhost.yml`, and the backend applies the bundled schema and migrations automatically on first boot.
