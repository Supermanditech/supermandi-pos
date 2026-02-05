@echo off
echo ============================================
echo SuperMandi Local Stack Shutdown
echo ============================================
echo.

echo [1/2] Stopping all Node.js processes...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo Node processes stopped.
) else (
    echo No Node processes found.
)
echo.

echo [2/2] Stopping Docker containers...
cd /d C:\supermandi-pos\backend
docker compose stop
echo Docker containers stopped.
echo.

echo ============================================
echo All services stopped.
echo ============================================
echo.
echo To restart: scripts\start-local-stack.bat
echo To reset DB: scripts\reset-local-db.bat
echo.
pause
