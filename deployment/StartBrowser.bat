@echo off
REM Debug pause to confirm script start
echo Starting browser launcher...
pause

REM Change to the script's directory (supports UNC paths)
pushd "%~dp0"

echo ===================================================
echo   LearnToBot - Secure Browser Launcher
echo ===================================================
echo.
echo This script launches your browser with special flags
echo to allow opening local files from the website.
echo.
echo NOTE: Close all other browser windows first!
echo.

:CHOICE
echo Choose your browser:
echo [1] Google Chrome
echo [2] Microsoft Edge
echo.
set /P C="Enter choice (1 or 2): "

if "%C%"=="1" goto CHROME
if "%C%"=="2" goto EDGE
goto CHOICE

:CHROME
echo Launching Chrome...
start "" "chrome.exe" --disable-web-security --user-data-dir="C:\LearnToBot\ChromeDev" --allow-file-access-from-files "http://%COMPUTERNAME%:3000"
goto END

:EDGE
echo Launching Edge...
start "" "msedge.exe" --disable-web-security --user-data-dir="C:\LearnToBot\EdgeDev" --allow-file-access-from-files "http://%COMPUTERNAME%:3000"
goto END

:END
echo.
echo Browser launched! You can now use the website.
echo.
pause
