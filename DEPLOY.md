# Creative Planner Public Deployment Guide

This project can be made public with:

- a Cloudflare Worker backend for auth and sync
- a Cloudflare Pages frontend for the Vite web app

The backend is already wired in [src/lib/cloudSync.ts](src/lib/cloudSync.ts), so the main missing step for public sharing is deploying the frontend.

## Prerequisites

- A Cloudflare account
- Node.js installed
- Wrangler access through `npx wrangler login`

## 1. Deploy or update the backend

From the project root:

```bash
npm run deploy:backend
```

If the D1 database is not initialized yet, run:

```bash
cd backend
npx wrangler d1 execute creative-planner-db --file=./schema.sql --remote
```

## 2. Deploy the public web app

From the project root:

```bash
npm run deploy:web
```

That command will:

1. build the frontend
2. upload `dist/` to Cloudflare Pages
3. publish it to the `main` branch deployment for the Pages project `creative-planner`

## 3. SPA routing support

This repo includes [public/_redirects](public/_redirects) so deep links like:

- `/chat`
- `/mindmap/editor`
- `/settings`

continue to work on the public site.

## 4. Share the public URL

After deployment, Cloudflare Pages will return a public URL similar to:

- `https://main.creative-planner.pages.dev`

That URL can be shared immediately.

## 5. Optional: deploy backend and frontend together

```bash
npm run deploy:all
```

## 6. Optional: connect a custom domain

Inside Cloudflare Pages:

1. Open the `creative-planner` Pages project
2. Go to **Custom domains**
3. Add your domain
4. Let Cloudflare create the DNS records

## Notes

- The app currently points to the production worker in [src/lib/cloudSync.ts](src/lib/cloudSync.ts).
- Social preview metadata is set in [index.html](index.html) for cleaner sharing.
- If you want automatic deploys on every push, the next step is connecting this repo to Cloudflare Pages Git integration.
- Collabora launches through the worker now. Set `COLLABORA_URL` in [backend/wrangler.toml](backend/wrangler.toml) or in the deployed worker environment to a real Collabora `cool.html` URL, for example `https://collabora.example.com/browser/dist/cool.html`.
- The worker now serves signed office file metadata and contents from `/office/wopi/files/:id`, so your Collabora host must be able to reach the deployed worker origin publicly.
