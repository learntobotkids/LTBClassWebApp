@echo off
echo ========================================
echo LearnToBot Class Web App
echo Starting Server...
echo ========================================
echo.

REM Navigate to the script directory
cd /d "%~dp0"

REM Check if node_modules exists, if not, install dependencies
if not exist "node_modules\" (
    echo Installing dependencies for the first time...
    call npm install
    echo.
)

REM Start the server with auto-restart
echo Starting web server with auto-restart...
echo.
echo NOTE: Server will automatically restart when server.js is updated
echo       HTML/CSS changes in public/ folder are instant (no restart needed)
echo.
call npm run dev

pause
