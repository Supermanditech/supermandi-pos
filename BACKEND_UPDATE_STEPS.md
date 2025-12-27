# Backend Update Steps (Google VM)

## Critical: Prisma client must be regenerated after every code update

The backend uses Prisma 5.22.0 with SQLite. After pulling new code from GitHub, you **must** regenerate the Prisma client and rebuild the backend to avoid runtime errors.

## Update procedure (run on Google VM)

SSH into the VM and navigate to the repo folder:

```bash
cd /home/supermanditech/supermandi-pos
```

### 1) Pull latest code

```bash
git pull
```

### 2) Ensure backend environment file exists

Check that `backend/.env` exists and contains:

```bash
cat backend/.env
```

Required variables:
- `DATABASE_URL=file:./dev.db`
- `JWT_SECRET=<your-secret>`
- `PORT=3001`

If missing, copy from template:

```bash
cp backend/.env.example backend/.env
```

Then edit `backend/.env` to set a real `JWT_SECRET`.

### 3) Install dependencies (with pinned Prisma 5.22.0)

```bash
cd backend
npm ci
```

### 4) Clean stale Prisma artifacts

```bash
rm -rf dist node_modules/.prisma
```

### 5) Regenerate Prisma client

```bash
npx prisma generate
```

### 6) Apply database migrations

```bash
npx prisma migrate deploy
```

### 7) Rebuild backend

```bash
npm run build
```

### 8) Restart PM2 process

```bash
pm2 restart supermandi-backend
```

(Replace `supermandi-backend` with your actual PM2 process name. Check with `pm2 list`.)

### 9) Verify backend is running

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{"status":"OK","service":"SuperMandi Backend","time":"..."}
```

### 10) Test auth endpoint from mobile device

From the Redmi 13C browser (or any device on the internet):

```
http://34.14.150.183:3001/health
```

Should return the same JSON response.

## Why this is required

- Prisma generates TypeScript types and runtime query builders based on [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma:1).
- If the generated client is stale (from a different Prisma version or schema), you'll see runtime errors like:
  - `Invalid prisma.user.findUnique() invocation`
  - `Environment variable not found: DATABASE_URL`
- The backend now defaults to `file:./prisma/dev.db` if `DATABASE_URL` is missing (see [`backend/src/lib/prisma.ts`](backend/src/lib/prisma.ts:1)), but you should still set it explicitly in `backend/.env`.

## Troubleshooting

If the backend still crashes after following these steps:

1) Check PM2 logs:
   ```bash
   pm2 logs supermandi-backend --lines 50
   ```

2) Verify Prisma client was regenerated:
   ```bash
   ls -la backend/node_modules/.prisma/client
   ```

3) Verify DATABASE_URL is loaded:
   ```bash
   cd backend && node -e "require('dotenv').config(); console.log(process.env.DATABASE_URL)"
   ```

4) Manually test the compiled backend:
   ```bash
   cd backend && node dist/server.js
   ```
   Then `curl http://localhost:3001/health` from another terminal.
