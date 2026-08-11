@echo off
title ZENX TOURNAMENT OVERLAY - Cloudflare Online Tunnel
color 0c
echo ===================================================
echo   ZENX TOURNAMENT OVERLAY CLOUDFLARE TUNNEL
echo ===================================================
echo.
echo Connecting to Cloudflare global network (Worldwide / India)...
echo.
echo [!] Keep this window OPEN during your broadcast!
echo [!] Look for the https://...trycloudflare.com link below and give it to your spectator!
echo.
cd /d "%~dp0"
if exist cloudflared.exe (
    cloudflared.exe tunnel --url http://localhost:25565
) else (
    npx --yes cloudflared tunnel --url http://localhost:25565
)
pause
