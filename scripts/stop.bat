@echo off
chcp 936 >nul
title TRPGMaster Stop
echo ========================================
echo   TRPGMaster - Stop
echo ========================================
echo.
echo Stopping all TRPGMaster processes...
taskkill /f /im node.exe >nul 2>&1
echo.
echo ========================================
echo   All processes stopped.
echo ========================================
echo.
timeout /t 2 /nobreak >nul
