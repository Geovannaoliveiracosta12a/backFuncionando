@echo off
REM =========================================================
REM  INVICTA - Iniciar o backend
REM  Duplo clique para rodar o servidor.
REM  Mantenha esta janela ABERTA enquanto o ESP32 envia dados.
REM =========================================================
title INVICTA Backend

echo.
echo ========================================
echo    INVICTA BACKEND
echo ========================================
echo.

REM --- Libera a porta 5000 no Firewall do Windows (defesa extra) ---
echo Verificando Firewall do Windows (porta 5000)...
netsh advfirewall firewall delete rule name="INVICTA Backend 5000" >nul 2>&1
netsh advfirewall firewall add rule name="INVICTA Backend 5000" dir=in action=allow protocol=TCP localport=5000 >nul 2>&1
echo   Regra de firewall aplicada (se permitido).
echo.

REM --- Mostra o IP desta maquina para configurar no ESP32 ---
echo IP desta maquina (use no BACKEND_URL do ESP32):
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /c:"IPv4"') do echo   %%i
echo.

echo Iniciando servidor... (nao feche esta janela)
echo.
node server.js

echo.
echo ========================================
echo  O servidor parou. Pressione uma tecla.
echo ========================================
pause >nul
