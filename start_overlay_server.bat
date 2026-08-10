@echo off
title HEL Valorant Tournament Overlay Host
color 0b
echo ===================================================
echo     HEL VALORANT TOURNAMENT OVERLAY HOST
echo ===================================================
echo.
echo Starting Node.js Server...
cd /d "%~dp0"
node server.js
pause
