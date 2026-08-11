@echo off
title ZENX Valorant Live Game Bridge Client
color 0c
echo ===================================================================
echo     ZENX VALORANT LIVE IN-GAME BRIDGE CLIENT (REMOTE SYNC)
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
