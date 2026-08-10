@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22.13 or newer is required.
  pause
  exit /b 1
)
where pnpm.cmd >nul 2>&1
if errorlevel 1 (
  echo pnpm is required. Install it with: npm install -g pnpm
  pause
  exit /b 1
)
if not exist node_modules\vite\bin\vite.js (
  call pnpm.cmd install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Luck Resume: http://127.0.0.1:5174
call pnpm.cmd dev
