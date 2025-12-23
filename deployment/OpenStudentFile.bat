@echo off
setlocal EnableDelayedExpansion

REM OpenStudentFile.bat - Opens student file with default program
REM Usage: studentfile://HOSTNAME/FolderName/FileName.ext

if "%~1"=="" (
    echo ERROR: No URL argument provided.
    exit /b 1
)

set "RAW_URL=%~1"
set "CLEAN_URL=!RAW_URL:studentfile://=!"

REM Use PowerShell to split string safely: Server | FilePath
powershell -NoProfile -Command "$u='%CLEAN_URL%'; $p=$u.Split('/', 2); if($p.Count -lt 2){'ERROR'}else{$p[0] + '|' + ([Uri]::UnescapeDataString($p[1]))}" > "%TEMP%\ltb_file_parse.txt"

if %errorlevel% neq 0 ( exit /b 1 )

set /p PARSE_RESULT=<"%TEMP%\ltb_file_parse.txt"

if "!PARSE_RESULT!"=="ERROR" (
    echo ERROR: Failed to parse hostname and file path.
    exit /b 1
)

for /f "tokens=1,2 delims=|" %%a in ("!PARSE_RESULT!") do (
    set "SERVER_HOST=%%a"
    set "FILE_PATH=%%b"
)

REM Convert forward slashes to backslashes in FILE_PATH
set "FILE_PATH=!FILE_PATH:/=\!"

set "SHARE_PATH=\SHARED\FINAL KIDS FILES"
set "UNC_PATH=\\!SERVER_HOST!%SHARE_PATH%\!FILE_PATH!"

echo Launching: "!UNC_PATH!"
start "" "!UNC_PATH!"

exit
