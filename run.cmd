@echo off
cd /d "%~dp0"
where node >nul 2>nul
if not errorlevel 1 (
  node tools\serve.mjs --open
  pause
  exit /b
)
where py >nul 2>nul
if not errorlevel 1 (
  echo Open http://127.0.0.1:8080 in your browser after the server starts.
  py -m http.server 8080 --bind 127.0.0.1
  pause
  exit /b
)
echo Browser86 needs Node.js 22+ or Python 3 to serve the static website.
echo Install either, then run this file again. No npm install is required.
pause
