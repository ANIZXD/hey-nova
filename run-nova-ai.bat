@echo off
title Hey Nova - one-click setup
cd /d "%~dp0"

echo ================================================
echo   Hey Nova - AI Server  ^(one-click setup^)
echo   After this finishes, Nova runs at:
echo   http://localhost:3000
echo ================================================
echo.

rem ============ 1. Node.js ============
where node >nul 2>&1
if errorlevel 1 (
    echo [1/4] Node.js not found - installing it...
    echo       Note: Windows may show a UAC prompt - click Yes.
    where winget >nul 2>&1
    if errorlevel 1 (
        echo.
        echo [X] Windows Package Manager is unavailable on this PC.
        echo     Please install Node.js manually from:
        echo     https://nodejs.org  ^(LTS^)
        echo     then double-click this file again.
        echo.
        pause
        exit /b 1
    )
    winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
)
rem make node usable in this window even right after install
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"

rem ============ 2. Ollama ============
where ollama >nul 2>&1
if errorlevel 1 (
    echo [2/4] Ollama not found - installing it...
    where winget >nul 2>&1
    if not errorlevel 1 (
        winget install -e --id Ollama.Ollama --silent --accept-package-agreements --accept-source-agreements
    ) else (
        echo.
        echo [!] Install Ollama manually from https://ollama.com to
        echo     enable smarter AI. The server can still run without it.
        echo.
    )
)
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "PATH=%LOCALAPPDATA%\Programs\Ollama;%PATH%"

rem ============ 3. AI model ============
if not "%PATH%"=="%PATH:Ollama=%" (
    echo [3/4] Pulling the AI model ^(only first time, ~500 MB^)...
    call ollama pull qwen3:0.6b
) else (
    echo [3/4] Ollama not ready yet - restart the PC once, then run me
    echo       again to download the AI model. The server still works now.
)
echo.

rem ============ 4. Server ============
if not exist node_modules (
    echo [4/4] Installing dependencies ^(first time only^)...
    call npm install
) else (
    echo [4/4] Dependencies ready.
)
echo.
echo       Starting Nova's AI server...
echo       Leave this window open. Close it to stop the server.
echo.
call npm start

echo.
echo Server stopped. Press any key to close.
pause >nul