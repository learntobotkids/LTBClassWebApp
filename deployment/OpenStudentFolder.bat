@echo off
setlocal EnableDelayedExpansion

REM ========================================================
REM OpenStudentFolder.bat - DEBUG MODE
REM ========================================================

echo.
echo DEBUG: Script Started.
echo Raw Argument: "%~1"
echo.

if "%~1"=="" (
    echo ERROR: No URL argument provided.
    echo Usage: studentfolder://hostname/folder
    exit /b 1
)

echo Step 1: Input received.

REM --- STEP 2: Safe URL Parsing ---
set "RAW_URL=%~1"
echo.
echo Parsing URL: !RAW_URL!
echo.

REM Remove protocol prefix
set "CLEAN_URL=!RAW_URL:studentfolder://=!"

REM Remove trailing slashes if any
if "!CLEAN_URL:~-1!"=="/" set "CLEAN_URL=!CLEAN_URL:~0,-1!"

echo Clean URL: !CLEAN_URL!

REM Use PowerShell to split string safely
REM We write to a temporary file to avoid complex for-loop escaping issues
echo Parsing with PowerShell...

powershell -NoProfile -Command "$u='%CLEAN_URL%'; $p=$u.Split('/', 2); if($p.Count -eq 0){'ERROR'}else{$p[0] + '|' + ([Uri]::UnescapeDataString($p[1]))}" > "%TEMP%\ltb_parse.txt"

if %errorlevel% neq 0 (
    echo ERROR: PowerShell execution failed.
    exit /b 1
)

echo PowerShell finished. Reading result...
set /p PARSE_RESULT=<"%TEMP%\ltb_parse.txt"
echo Raw Result from PS: !PARSE_RESULT!

if "!PARSE_RESULT!"=="ERROR" (
    echo ERROR: Failed to parse hostname and folder.
    exit /b 1
)

REM Split result into variables
for /f "tokens=1,2 delims=|" %%a in ("!PARSE_RESULT!") do (
    set "SERVER_HOST=%%a"
    set "TARGET_FOLDER=%%b"
)

echo.
echo =================================
echo PARSED VALUES:
echo Server: [!SERVER_HOST!]
echo Folder: [!TARGET_FOLDER!]
echo =================================
echo.
echo Step 2 Complete.

REM --- STEP 3: Path Construction ---
set "SHARE_PATH=\SHARED\FINAL KIDS FILES"
set "FULL_UNC=\\!SERVER_HOST!%SHARE_PATH%\!TARGET_FOLDER!"

echo.
echo Constructing UNC Path...
echo Full Path: "!FULL_UNC!"
echo.

echo Step 3 Complete.

REM --- STEP 4: Launch Explorer ---
echo.
echo Launching Windows Explorer...

if not exist "!FULL_UNC!" (
    echo WARNING: The path does not seem to exist/is not accessible from this computer.
    echo Path checked: "!FULL_UNC!"
    echo.
    echo We will try to open it anyway, but it might fail.
    echo Possible reasons:
    echo 1. You are not on the same network.
    echo 2. The folder 'SHARED' is not shared on the server '!SERVER_HOST!'.
    echo 3. The folder name '!TARGET_FOLDER!' is incorrect.
    echo.

)

start "" explorer.exe "!FULL_UNC!"

echo.
echo Command executed.
echo.
echo If Explorer didn't open, please check the network share settings on the server.
echo.

