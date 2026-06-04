@echo off
chcp 65001 > nul
title SPAO Price Monitor

echo.
echo  ====================================
echo   SPAO Price Monitor Server
echo  ====================================
echo.

cd /d "%~dp0"

:: Python 확인
python --version > nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python이 설치되어 있지 않습니다.
    echo  https://www.python.org 에서 Python 3.10 이상을 설치하세요.
    pause
    exit /b 1
)

:: Flask 확인 및 설치
python -c "import flask" > nul 2>&1
if errorlevel 1 (
    echo  [SETUP] Flask 설치 중...
    pip install -r requirements.txt
    echo.
)

:: Node.js 확인
node --version > nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js가 설치되어 있지 않습니다.
    echo  https://nodejs.org 에서 Node.js 18 LTS 이상을 설치하세요.
    pause
    exit /b 1
)

:: node_modules 확인 (없으면 설치)
if not exist "..\node_modules\" (
    echo  [SETUP] Node.js 패키지 설치 중...
    cd ..
    npm install
    cd spao_monitor
    echo.
)

echo  서버 시작 중...
echo  접속 주소: http://localhost:5000
echo  종료: Ctrl+C
echo.

python app.py

echo.
echo  서버가 종료되었습니다.
pause
