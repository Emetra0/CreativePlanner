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

For the Ubuntu self-hosted install, the installer now writes these into `.env.selfhost`, but you must provide them when you run it:

```bash
curl -fsSL https://raw.githubusercontent.com/Emetra0/CreativePlanner/main/scripts/install-ubuntu.sh | sudo GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com GOOGLE_CLIENT_SECRET=your-client-secret REPO_URL=https://github.com/Emetra0/CreativePlanner.git bash -s -- --port 8080 --public-host your.domain.or.ip
```

In Google Cloud Console, use the public app URL for both values below:

- Authorized JavaScript origin: `http://your.domain.or.ip:8080`
- Authorized redirect URI: `http://your.domain.or.ip:8080/auth/google/callback`

If you run behind HTTPS, use the final HTTPS URL in both places instead.

## Cloud And Local Storage

The app now supports two storage targets at the same time:

1. Ubuntu self-hosted cloud storage per user.
2. A local sync folder chosen from the current user's own computer.

In the self-hosted stack, `/save` and `/load` now prefer a per-user JSON file under `SELFHOST_DATA_DIR` on the Ubuntu server, with the database kept as a fallback. By default that path is `/app/.wrangler/user-storage` inside the backend container and is backed by a Docker volume.

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
curl -fsSL https://raw.githubusercontent.com/Emetra0/CreativePlanner/main/scripts/install-ubuntu.sh | sudo REPO_URL=https://github.com/Emetra0/CreativePlanner.git bash -s -- --port 8080
```

That installer brings up the frontend, backend, and Collabora stack together through `docker-compose.selfhost.yml`.
