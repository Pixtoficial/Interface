@echo off
setlocal
cd /d "%~dp0\backend"

REM Remove node_modules do better-sqlite3 (incompatível com Node 24+)
if exist "node_modules\better-sqlite3" (
  echo [Pixt IA] Removendo better-sqlite3 incompativel...
  rmdir /s /q "node_modules\better-sqlite3" 2>nul
)

if not exist "node_modules\node-sqlite3-wasm" (
  echo [Pixt IA] Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo.
    echo Falha no npm install. Veja o erro acima.
    pause
    exit /b 1
  )
)

if not exist "data\pixt.db" (
  echo [Pixt IA] Criando banco de dados e conta admin...
  call npm run seed
)

echo.
echo ===============================================
echo   Pixt IA - AutoHub
echo   Frontend: http://localhost:3001/index.html
echo   Admin:    admin@pixt.ia / 12345678
echo   Para parar: feche esta janela ou Ctrl+C
echo ===============================================
echo.

start "" http://localhost:3001/index.html
call npm start
