@echo off
echo ============================================
echo SuperMandi Local Database Reset
echo ============================================
echo.
echo WARNING: This will destroy all local data!
echo.
set /p confirm=Type YES to confirm:
if /i not "%confirm%"=="YES" (
    echo Cancelled.
    pause
    exit /b 0
)
echo.

echo [1/4] Stopping Node.js processes...
taskkill /F /IM node.exe >nul 2>&1
echo.

echo [2/4] Destroying and recreating Docker volumes...
cd /d C:\supermandi-pos\backend
docker compose down -v
docker compose up -d
echo.

echo [3/4] Waiting for Postgres to be ready...
:wait_pg
docker exec supermandi-postgres pg_isready -U supermandi -d supermandi >nul 2>&1
if %errorlevel% neq 0 (
    echo   Waiting for Postgres...
    timeout /t 2 /nobreak > nul
    goto wait_pg
)
echo Postgres is ready.
echo.

echo [4/4] Running database migrations...
set DATABASE_URL=postgresql://supermandi:supermandi_dev_password@localhost:5432/supermandi
set DATABASE_HOST=localhost
set DATABASE_PORT=5432
set DATABASE_NAME=supermandi
set DATABASE_USER=supermandi
set DATABASE_PASSWORD=supermandi_dev_password
node scripts/migrate.js up
echo.

echo ============================================
echo Database reset complete!
echo ============================================
echo.
echo To start services: scripts\start-local-stack.bat
echo.
pause
