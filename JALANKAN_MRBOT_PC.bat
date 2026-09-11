@echo off
chcp 65001 >nul
title [BOT PRIBADI PC] Mrbotszx01 Standalone
color 0b

echo ======================================================================
echo    🤖 MRBOT PC - AKUN PRIBADI (Mrbotszx01)
echo ======================================================================
echo.
echo  • Akun Bot   : Mrbotszx01
echo  • Server     : relxmc.com:25565
echo  • Mode       : Standalone di PC kamu
echo.
echo  [Petunjuk]:
echo  - Ketik: spam <pesan>     untuk mulai spam chat dengan pesan bebas
echo  - Ketik: stopspam         untuk berhenti spam chat
echo  - Ketik: /<perintah>      untuk kirim perintah game (contoh: /home 1)
echo  - Ketik: status           untuk cek koordinat dan status bot
echo.
echo ======================================================================
echo.

cd /d "d:\Botmc"
node MrBot.js
pause
