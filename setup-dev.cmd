@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ==========================================================
echo   SGA TI - Setup do ambiente de desenvolvimento (SQLite)
echo ==========================================================
echo.

rem ---------- Pre-requisitos ----------
where node >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo [ERRO] Node.js nao encontrado no PATH.
  echo        Instale o Node LTS em https://nodejs.org e rode este arquivo de novo.
  goto :fim
)
for /f "tokens=*" %%v in ('node -v') do echo Node.js  : %%v
for /f "tokens=*" %%v in ('npm -v')  do echo npm      : %%v
echo Pasta    : %CD%
echo.

if not exist ".env" (
  echo [ERRO] Arquivo .env nao encontrado nesta pasta.
  goto :fim
)

rem ---------- Sanidade da pasta node_modules ----------
rem Um link simbolico ou junction sobrando faz o npm falhar com EACCES.
if exist "node_modules" (
  fsutil reparsepoint query "node_modules" >nul 2>&1
  if "!ERRORLEVEL!"=="0" (
    echo [AVISO] node_modules e um link simbolico. Removendo...
    rmdir "node_modules" >nul 2>&1
    if exist "node_modules" (
      echo [ERRO] Nao foi possivel remover o link node_modules.
      echo        Apague a pasta node_modules manualmente e rode de novo.
      goto :fim
    )
    echo         Removido.
    echo.
  )
)

rem ---------- 1. Dependencias ----------
echo [1/5] Instalando dependencias...
call npm.cmd install
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo [ERRO] npm install falhou ^(codigo %RC%^).
  echo        Causas comuns: antivirus bloqueando a pasta, OneDrive sincronizando,
  echo        ou uma pasta node_modules corrompida.
  echo        Tente: apagar node_modules e package-lock.json e rodar de novo.
  goto :erro
)
echo.

rem ---------- 2. Schema de desenvolvimento ----------
echo [2/5] Gerando o schema de desenvolvimento ^(SQLite^)...
call node sandbox\gerarSchemaDev.js
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" goto :erro
echo.

rem ---------- 3. Prisma Client ----------
echo [3/5] Gerando o Prisma Client...
call npx.cmd prisma generate --schema prisma\schema.dev.prisma
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo [ERRO] prisma generate falhou ^(codigo %RC%^).
  echo        Se a mensagem citar download de engines, verifique a conexao
  echo        e se o antivirus nao esta bloqueando o npm.
  goto :erro
)
echo.

rem ---------- 4. Banco e migrations ----------
echo [4/5] Criando o banco e aplicando as migrations...
call npx.cmd prisma migrate dev --schema prisma\schema.dev.prisma --name inicial
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" goto :erro
echo.

rem ---------- 5. Seed ----------
echo [5/5] Populando com os dados iniciais...
call node prisma\seed.js
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" goto :erro
echo.

echo ==========================================================
echo   Pronto. Para subir o sistema:
echo.
echo       npm run dev
echo.
echo   Acesse http://localhost:3000
echo   Login: admin   Senha: admin123
echo ==========================================================
goto :fim

:erro
echo.
echo ==========================================================
echo   [FALHOU] Veja a mensagem de erro acima.
echo   Copie o texto do erro e me mande que eu ajusto.
echo ==========================================================

:fim
echo.
pause
endlocal
