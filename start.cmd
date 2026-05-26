@echo off
cd /d "%~dp0"

echo -- astro-photo-renamer --

where node >nul 2>&1 || echo Warning: Node.js is not installed.

for /f "tokens=*" %%v in ('node --version 2^>nul') do set NODE_VER=%%v
if defined NODE_VER (
    for /f "tokens=1 delims=." %%m in ("%NODE_VER:v=%") do set NODE_MAJOR=%%m
    if %NODE_MAJOR% LSS 24 (
        echo Warning: Node.js 24+ required ^(found %NODE_VER%^).
    )
)

if not exist .env echo Warning: .env not found. Run: copy .env.example .env

if not exist credentials.json (
    echo Warning: credentials.json not found. OAuth will fail. See README.
)

if not exist node_modules\.bin\tsx.cmd (
    echo Installing dependencies...
    call npm install
)

echo.
echo astro-photo-renamer is a CLI tool -- there is no server to start.
echo.
echo Usage:
echo   npm run dev -- ^<command^> [options]
echo.
echo Commands:
echo   run            Download + identify + rename in one shot
echo   run --local    Skip download; process images already in staging/
echo   download       Open Google Photos Picker and download selected images
echo   identify       Identify and rename images already in staging/
echo.
echo Examples:
echo   npm run dev -- run
echo   npm run dev -- run --local
echo.

exit /b 1
