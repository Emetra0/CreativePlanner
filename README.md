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

3.  **Run Local Worker (Development):**
    ```bash
    npm run dev:backend
    ```
    By default, the web app now uses `http://127.0.0.1:8787` in development. Copy `backend/.dev.vars.example` to `backend/.dev.vars` and adjust it if your local Collabora host runs elsewhere. Google OAuth also needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in that file for local auth.

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
