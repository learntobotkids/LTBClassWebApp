@echo off
REM Debug pause to confirm script start
echo Starting installation...
pause

echo ========================================
echo LearnToBot Protocol Handler Installer
echo ========================================
echo.

REM Change to the script's directory (supports UNC paths)
pushd "%~dp0"

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator!
    echo Right-click Install.bat and select "Run as Administrator"
    echo.
    pause
    exit /b 1
)

echo Installing protocol handlers...
echo.

REM Create directory if it doesn't exist
if not exist "C:\LearnToBot" (
    echo Creating C:\LearnToBot directory...
    mkdir "C:\LearnToBot"
)

REM Copy batch files
echo Copying protocol handler scripts...
copy /Y OpenStudentFolder.bat "C:\LearnToBot\" >nul
copy /Y OpenStudentFile.bat "C:\LearnToBot\" >nul

REM Import registry keys
echo Registering protocol handlers in Windows registry...
echo A popup will appear asking to confirm. Please click YES.
regedit RegisterProtocols.reg

echo.
echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo Protocol handlers have been installed:
echo - studentfolder:// - Opens folders in Explorer
echo - studentfile:// - Opens files with default program
echo.
echo You can now use these protocols in your web browser.
echo.
pause
