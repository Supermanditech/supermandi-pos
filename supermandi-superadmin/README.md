# SuperMandi SuperAdmin (Cloud)

Lightweight, static-deployable operational dashboard for SuperMandi POS.

## Cloud backend

This app reads from the live backend (no localhost):

- `GET /health` → `{ status: "ok" }`
- `GET /api/v1/admin/pos/events?limit=N` → `PosEvent[]`

The backend base URL is provided **only** via Vite env.

## Environment

Create a `.env` file (or set hosting env vars):

```bash
VITE_API_BASE_URL=http://34.14.150.183:3001
# Optional (recommended): protect /api/v1/admin/*
# VITE_ADMIN_TOKEN=YOUR_STATIC_ADMIN_TOKEN
```

Notes:
- Do not hardcode URLs in code; all API calls read from `import.meta.env.VITE_API_BASE_URL`.
- This must be set in Vercel / Firebase Hosting / Cloud Run env for deployed builds.

## Run locally

```bash
cd supermandi-superadmin
npm install
npm run dev
```

## Build (static)

```bash
cd supermandi-superadmin
npm run build
```

Output is written to `dist/` (static assets).

## Deploy

### Vercel

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- Add env var: `VITE_API_BASE_URL=http://34.14.150.183:3001`

### Firebase Hosting

- Build locally: `npm run build`
- Deploy `dist/` as your hosting directory
- Set `VITE_API_BASE_URL` in your build environment (CI), then rebuild and deploy.

### Cloud Run (static)

Cloud Run can serve static files via an Nginx container.
Build `dist/` with the correct `VITE_API_BASE_URL` and serve the generated assets.
