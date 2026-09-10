@echo off
title Multi-Account AFK Manager
cd /d "%~dp0"

:menu
cls
echo ===================================================
echo       🤖 MINECRAFT MULTI-ACCOUNT AFK MANAGER 🤖
echo ===================================================
echo.
set /p nama_akun="Masukkan Nama Akun Minecraft: "

if "%nama_akun%"=="" (
    echo [❌] Nama akun tidak boleh kosong!
    timeout /t 2 >nul
    goto menu
)

echo.
echo [⏳] Menjalankan %nama_akun% di latar belakang...

echo Set WshShell = CreateObject("WScript.Shell") > temp_run.vbs
echo WshShell.Run "cmd.exe /c node MrBot.js %nama_akun%", 0, False >> temp_run.vbs

wscript.exe temp_run.vbs

timeout /t 1 >nul
del temp_run.vbs

echo [✅] Akun %nama_akun% BERHASIL diaktifkan di latar belakang!
echo ---------------------------------------------------
echo.
set /p lagi="Ingin menjalankan akun lain lagi? (Y/T): "
if /i "%lagi%"=="Y" goto menu
if /i "%lagi%"=="y" goto menu

echo.
echo Menutup menu...
timeout /t 2 >nul
exit