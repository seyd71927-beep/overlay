@echo off
title HEL Valorant Live Game Bridge Client (India Streamer)
color 0b
echo ===================================================================
echo     HEL VALORANT LIVE IN-GAME BRIDGE CLIENT (REMOTE SYNC)
echo ===================================================================
echo.
echo [1] Make sure VALORANT is running on this PC.
echo [2] Connecting to your remote Railway Overlay Server...
echo.
cd /d "%~dp0"
node live_valorant_bridge.js %*
echo.
echo Bridge session ended.
pause
