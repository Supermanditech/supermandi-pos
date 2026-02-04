@echo off
echo ============================================
echo SuperMandi Local Stack Startup
echo ============================================
echo.

echo [1/4] Starting Docker containers...
cd /d C:\supermandi-pos\backend
docker compose up -d
if %errorlevel% neq 0 (
    echo ERROR: Docker failed to start. Is Docker Desktop running?
    pause
    exit /b 1
)
echo Docker containers started.
echo.

echo [2/4] Verifying Docker containers...
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo.

echo [3/4] Starting Backend API in new window...
start "SuperMandi Backend" cmd /k "cd /d C:\supermandi-pos\backend && pnpm dev"
timeout /t 5 /nobreak > nul
echo Backend starting on http://localhost:3000
echo.

echo [4/4] Starting Frontend portals in new windows...
start "Retailer Portal" cmd /k "cd /d C:\supermandi-pos\retailer-admin && pnpm dev"
start "Supplier Portal" cmd /k "cd /d C:\supermandi-pos\supplier-portal && pnpm dev"
start "Admin Portal" cmd /k "cd /d C:\supermandi-pos\superadmin-portal && pnpm dev"
echo.

echo ============================================
echo All services starting...
echo ============================================
echo.
echo URLs:
echo   Backend:  http://localhost:3000/api/v1/health
echo   Retailer: http://localhost:5173/retailer/
echo   Supplier: http://localhost:3001/supplier/
echo   Admin:    http://localhost:5174/admin/
echo.
echo Press any key to close this window...
pause > nul
