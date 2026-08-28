#!/usr/bin/env bash
# Hey Nova - AI Server
# Running at: http://localhost:3000
set -e
cd "$(dirname "$0")"

echo "================================================"
echo "  Hey Nova - AI Server"
echo "  Running at: http://localhost:3000"
echo "================================================"
echo

if ! command -v node >/dev/null 2>&1; then
    echo "[X] Node.js is not installed."
    echo "    Download it from https://nodejs.org (LTS),"
    echo "    install it, then run this script again."
    echo
    exit 1
fi

if ! command -v ollama >/dev/null 2>&1; then
    echo "[!] Ollama not found - skipping the AI model."
    echo "    Install it from https://ollama.com to enable smarter AI."
    echo
else
    echo "[1/3] Pulling the AI model (only first time, ~500 MB)..."
    ollama pull qwen3:0.6b
    echo
fi

if [ ! -d node_modules ]; then
    echo "[2/3] Installing dependencies (first time only)..."
    npm install
    echo
fi

echo "[3/3] Starting the server..."
echo
echo "      Leave this window open. Close it to stop the server."
echo
npm start