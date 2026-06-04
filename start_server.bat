@echo off
chcp 65001 > nul
title SPAO Price Monitor

echo.
echo  ====================================
echo   SPAO Price Monitor
echo  ====================================
echo.

cd /d "%~dp0"

:: setup 여부 확인 (node_modules 없으면 안내)
if not exist "node_modules\" (
    echo  [경고] 초기 설정이 필요합니다. setup.bat 을 먼저 실행하세요.
    pause & exit /b 1
)

echo  서버 시작 중...
echo  접속 주소: http://localhost:5000
echo  종료: Ctrl+C
echo.

python spao_monitor\app.py

echo.
echo  서버가 종료되었습니다.
pause
