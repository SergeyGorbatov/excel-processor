@echo off

:: Проверка наличия Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo Node.js не найден. Установка Node.js...
    curl -o node-installer.msi https://nodejs.org/dist/latest/node-v16.13.0-x64.msi
    msiexec /i node-installer.msi /quiet /norestart
    del node-installer.msi
    echo Node.js установлен.
    set "NODE_PATH=C:\Program Files\nodejs"
    set PATH=%NODE_PATH%;%PATH%
) else (
    echo Node.js уже установлен.
)

:: Проверка наличия Yarn
where yarn >nul 2>&1
if %errorLevel% neq 0 (
    echo Yarn не найден. Установка Yarn...
    npm install -g yarn
    set "YARN_PATH=%APPDATA%\npm"
    set PATH=%YARN_PATH%;%PATH%
    echo Yarn установлен.
) else (
    echo Yarn уже установлен.
)

:: Установка зависимостей
yarn install