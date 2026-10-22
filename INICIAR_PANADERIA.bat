@echo off
chcp 65001 > nul
title Dulce Menta - Sistema de Panader¡a & Reposter¡a Artesanal
color 0B

echo =========================================================
echo    ?? DULCE MENTA - SISTEMA DE GESTION INTEGRAL ??
echo        (Mobile-First / Recetas / Inventario / Pedidos)
echo =========================================================
echo.

cd /d "%~dp0"

if not exist "node_modules\" (
    echo [INFO] Instalando dependencias de Node.js por primera vez...
    call npm.cmd install
    if errorlevel 1 (
        echo [ERROR] Ocurri¢ un error instalando dependencias.
        pause
        exit /b %errorlevel%
    )
)

echo [INFO] Iniciando servidor Node.js...
start "" "http://localhost:4000"
call node src/server.js

if errorlevel 1 (
    echo [ERROR] El servidor se detuvo con errores.
    pause
)
