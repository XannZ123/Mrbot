@echo off
chcp 65001 >nul
title [SERVER CADANGAN PC] Bot Minecraft & Discord Manager
color 0a

echo ======================================================================
echo    🤖 BOT MC MANAGER - SERVER CADANGAN LOKAL (PC)
echo ======================================================================
echo.
echo  [!] PERHATIAN:
echo      Pastikan bot di panel Anjas sedang OFF / MATI sebelum
echo      menjalankan bot di PC agar akun Minecraft tidak saling tabrak!
echo.
echo ======================================================================
echo.

cd /d "d:\Botmc"

echo [*] Mengecek update script & data sewa terbaru dari GitHub...
git pull origin main
echo.

echo [*] Meluncurkan Bot Minecraft & Discord Manager di PC...
echo [*] Tekan Ctrl + C atau tutup jendela ini jika ingin mematikan bot di PC.
echo.
echo ======================================================================
echo.

node manager.js

echo.
echo ======================================================================
echo [INFO] Bot telah berhenti.
echo ======================================================================
pause
