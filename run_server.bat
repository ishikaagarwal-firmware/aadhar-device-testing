@echo off
title L89 GNSS Tester Local Server
cd /d "%~dp0"
echo Starting local web server...
powershell -NoProfile -ExecutionPolicy Bypass -File "serve.ps1"
if %errorlevel% neq 0 (
    echo.
    echo Server stopped with error or was terminated.
    pause
)
