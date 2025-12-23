@echo off
setlocal EnableDelayedExpansion

REM ========================================================
REM MassInstall.bat - Smart Silent Installer
REM ========================================================
REM 1. Detects if running from network/UNC path
REM 2. Copies to local TEMP folder if needed
REM 3. Auto-elevates to Administrator
REM 4. Installs silently
REM ========================================================

REM --- CHECK 1: ADMIN PRIVILEGES ---
net session >nul 2>&1
if %errorLevel% equ 0 (
    goto :INSTALL_NOW
)

REM --- CHECK 2: ARE WE ON NETWORK? ---
echo Checking environment...
pushd "%~dp0"
set "SCRIPT_DIR=%~dp0"
popd

echo Script location: !SCRIPT_DIR!

REM If we are NOT Admin, we need to elevate.
REM But if we are on a network share, standard RunAs will fail.
REM We will ALWAYS copy to TEMP to be safe and simple.

set "TEMP_INSTALL_DIR=%TEMP%\LTB_Install"

REM If we are already in the temp dir, just try to elevate
if /i "!SCRIPT_DIR:~0,4!"=="%TEMP:~0,4%" (
   if "!SCRIPT_DIR!"=="!TEMP_INSTALL_DIR!\" (
        goto :ELEVATE
   )
)

echo.
echo Running from network or protected location.
echo Staging files to local temporary folder...
echo.

if not exist "!TEMP_INSTALL_DIR!" mkdir "!TEMP_INSTALL_DIR!"

REM Copy files to temp
copy /Y "%~dp0OpenStudentFolder.bat" "!TEMP_INSTALL_DIR!\" >nul
copy /Y "%~dp0OpenStudentFile.bat" "!TEMP_INSTALL_DIR!\" >nul
copy /Y "%~dp0RegisterProtocols.reg" "!TEMP_INSTALL_DIR!\" >nul
copy /Y "%~dp0MassInstall.bat" "!TEMP_INSTALL_DIR!\" >nul

echo Files staged. Launching Administrator prompt...
echo.
echo ******************************************************
echo PLEASE CLICK "YES" ON THE POPUP WINDOW
echo ******************************************************
echo.

REM Execute the LOCAL copy as Admin
powershell -Command "Start-Process -FilePath '!TEMP_INSTALL_DIR!\MassInstall.bat' -Verb RunAs"

exit /b 0

:ELEVATE
echo Requesting Administrator privileges...
powershell -Command "Start-Process -FilePath '%~dp0MassInstall.bat' -Verb RunAs"
exit /b 0

:INSTALL_NOW
REM We are now Admin.
echo.
echo Installing LearnToBot Protocol Handlers...
echo.

pushd "%~dp0"

REM Create directory silently
if not exist "C:\LearnToBot" (
    mkdir "C:\LearnToBot" >nul 2>&1
)

REM Copy files silently
copy /Y OpenStudentFolder.bat "C:\LearnToBot\" >nul
copy /Y OpenStudentFile.bat "C:\LearnToBot\" >nul

REM Register protocols silently (/s)
regedit /s RegisterProtocols.reg

echo.
echo ======================================================
echo INSTALLATION SUCCESSFUL
echo ======================================================
echo.
echo Window will close in 3 seconds...
timeout /t 3
exit /b 0
