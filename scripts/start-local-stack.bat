@echo off
echo ============================================
echo SuperMandi Local Stack Startup
echo ============================================
echo.

echo [1/5] Starting Docker containers...
cd /d C:\supermandi-pos\backend
docker compose up -d
if %errorlevel% neq 0 (
    echo ERROR: Docker failed to start. Is Docker Desktop running?
    pause
    exit /b 1
)
echo Docker containers started.
echo.

echo [2/5] Verifying Docker containers...
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo.

echo [3/5] Waiting for Postgres to be ready...
:wait_pg
docker exec supermandi-postgres pg_isready -U supermandi -d supermandi >nul 2>&1
if %errorlevel% neq 0 (
    echo   Waiting for Postgres...
    timeout /t 2 /nobreak > nul
    goto wait_pg
)
echo Postgres is ready.
echo.

echo [4/5] Starting Backend (gateway + services + monolith) in new window...
start "SuperMandi Backend" cmd /k "cd /d C:\supermandi-pos\backend && pnpm dev"
timeout /t 10 /nobreak > nul
echo Backend starting...
echo   Gateway:  http://localhost:3000
echo   Monolith: http://localhost:3010
echo   Services: 3001-3009, 3011
echo.

echo [5/5] Starting Frontend portals in new windows...
start "Retailer Portal" cmd /k "cd /d C:\supermandi-pos\retailer-admin && pnpm dev"
start "Supplier Portal" cmd /k "cd /d C:\supermandi-pos\supplier-portal && pnpm dev"
start "Admin Portal" cmd /k "cd /d C:\supermandi-pos\supermandi-superadmin && pnpm dev"
echo.

echo ============================================
echo All services starting...
echo ============================================
echo.
echo Service URLs:
echo   Backend API:     http://localhost:3000/health
echo   Main Backend:    http://localhost:3010/health
echo   Retailer Admin:  http://localhost:5173
echo   Supplier Portal: http://localhost:4001
echo   SuperAdmin:      http://localhost:5174
echo.
echo Docker:
echo   Postgres:        localhost:5432
echo   Redis:           localhost:6379
echo.
echo Press any key to close this window...
pause > nul
