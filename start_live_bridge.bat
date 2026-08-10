@echo off
title HEL Valorant Live Game Bridge Client
color 0a
echo ===================================================
echo     HEL VALORANT LIVE IN-GAME BRIDGE CLIENT
echo ===================================================
echo.
echo Connecting to live Valorant client...
cd /d "%~dp0"
node live_valorant_bridge.js %*
pause
