# Database Setup Guide

## Current Issue

The backend requires PostgreSQL, but it's not installed on this machine. You have two options:

---

## Option 1: Install PostgreSQL Locally (Recommended for Development)

### Step 1: Download PostgreSQL
- Download from: https://www.postgresql.org/download/windows/
- Recommended version: PostgreSQL 15 or 16
- During installation:
  - Set password for `postgres` user (remember this!)
  - Default port: 5432
  - Install Stack Builder components if needed

### Step 2: Create Database
After installation, open Command Prompt as Administrator:

```cmd
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE supermandi;

# Exit psql
\q
```

### Step 3: Update .env file
The `.env` file has been updated with:
```
DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/supermandi?sslmode=disable"
```

**IMPORTANT**: If you set a different password during installation, update `postgres:postgres` to `postgres:YOUR_PASSWORD`

### Step 4: Run Database Migration
```cmd
cd backend
psql -U postgres -d supermandi < migrations\2026-01-10_add_missing_indexes.sql
```

### Step 5: Start Backend
```cmd
cd backend
npm run dev
```

---

## Option 2: Use Remote Database (If Available)

If you have a remote PostgreSQL database (like on the VM at 34.14.150.183):

### Step 1: Get Database Credentials
You need:
- Host (e.g., `34.14.150.183`)
- Port (usually `5432`)
- Database name (e.g., `supermandi`)
- Username
- Password

### Step 2: Update .env file
Replace the `DATABASE_URL` in `backend/.env`:

```
DATABASE_URL="postgres://USERNAME:PASSWORD@HOST:PORT/DATABASE?sslmode=disable"
```

Example:
```
DATABASE_URL="postgres://supermandi_user:secret123@34.14.150.183:5432/supermandi?sslmode=disable"
```

### Step 3: Test Connection
```cmd
psql "postgres://USERNAME:PASSWORD@HOST:PORT/DATABASE"
```

### Step 4: Run Migration Remotely
```cmd
cd backend
psql "postgres://USERNAME:PASSWORD@HOST:PORT/DATABASE" < migrations\2026-01-10_add_missing_indexes.sql
```

### Step 5: Start Backend
```cmd
cd backend
npm run dev
```

---

## Quick Verification

After setup, verify the backend is working:

```cmd
# Test health endpoint
curl http://localhost:3001/health
```

Expected response:
```json
{"status":"ok"}
```

---

## Next Steps After Database is Running

1. ✅ Backend will start successfully
2. ✅ Rate limiting will be active on enrollment endpoint
3. ✅ All security fixes will be applied
4. ✅ Database indexes will improve query performance

---

## Current Status

- ❌ PostgreSQL not installed locally
- ✅ Backend code fixed (cryptographic security, rate limiting, transaction isolation)
- ✅ Database migration created ([migrations/2026-01-10_add_missing_indexes.sql](backend/migrations/2026-01-10_add_missing_indexes.sql))
- ⏳ Waiting for database setup

---

## Troubleshooting

### Error: "psql: command not found"
- PostgreSQL is not installed or not in PATH
- Add PostgreSQL bin directory to PATH: `C:\Program Files\PostgreSQL\15\bin`

### Error: "ECONNREFUSED ::1:5432"
- PostgreSQL service is not running
- Start it: `pg_ctl start` or via Windows Services

### Error: "password authentication failed"
- Wrong password in DATABASE_URL
- Update the password in backend/.env

### Error: "database does not exist"
- Create database: `createdb -U postgres supermandi`
