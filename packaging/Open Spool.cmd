@echo off
setlocal
title Spool - Video downloader
cd /d "%~dp0"
if not exist "runtime\node.exe" (
  echo Extract the entire ZIP to a folder, then open Spool from that folder.
  pause
  exit /b 1
)
set "NODE_OPTIONS="
set "NODE_PATH="
"runtime\node.exe" "app\server.mjs" --open-browser
if errorlevel 1 pause
