@echo off
chcp 936 >nul
title TRPGMaster Start
echo ========================================
echo   TRPGMaster - Start
echo ========================================
echo.
echo [1/3] Cleanup old processes...
taskkill /f /im node.exe >nul 2>&1
timeout /t 1 /nobreak >nul
echo.
echo [2/3] Starting server...
pushd "%~dp0..\server"
start "TRPGMaster-Server" cmd /c npm run dev
popd
timeout /t 3 /nobreak >nul
echo.
echo [3/3] Starting Expo app...
pushd "%~dp0..\app"
start "TRPGMaster-App" cmd /c npx expo start
popd
echo.
echo ========================================
echo   Done!
echo   Server: http://localhost:3000
echo   Expo: see QR code in App window
echo ----------------------------------------
echo   To stop: run stop.bat
echo ========================================
echo.
pause
