@echo off
title HEL Valorant Cloudflare Online Tunnel (Unlimited Hours - Qatar to India)
color 0b
echo ===================================================
echo   VALORANT OVERLAY CLOUDFLARE TUNNEL (UNLIMITED)
echo ===================================================
echo.
echo Connecting to Cloudflare global network (Qatar to India)...
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
