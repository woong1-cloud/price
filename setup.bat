@echo off
chcp 65001 > nul
title SPAO Monitor - 초기 설정

echo.
echo  ============================================
echo   SPAO Monitor 초기 설정 (최초 1회만 실행)
echo  ============================================
echo.

cd /d "%~dp0"

:: ── Python 확인 ──
python --version > nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python이 설치되어 있지 않습니다.
    echo          https://www.python.org 에서 Python 3.10 이상을 설치하세요.
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo  [OK] %%v

:: ── Node.js 확인 ──
node --version > nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js가 설치되어 있지 않습니다.
    echo          https://nodejs.org 에서 Node.js 18 LTS 이상을 설치하세요.
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo  [OK] Node.js %%v

echo.
echo  [1/3] Python 패키지 설치 중...
pip install -r spao_monitor\requirements.txt
if errorlevel 1 ( echo  [ERROR] pip install 실패 & pause & exit /b 1 )
echo  [OK] Python 패키지 완료

echo.
echo  [2/3] Node.js 패키지 설치 중...
npm install
if errorlevel 1 ( echo  [ERROR] npm install 실패 & pause & exit /b 1 )
echo  [OK] Node.js 패키지 완료

echo.
echo  [3/3] Playwright 브라우저 설치 중 (약 150MB, 시간이 걸립니다)...
npx playwright install chromium
if errorlevel 1 ( echo  [ERROR] Playwright 설치 실패 & pause & exit /b 1 )
echo  [OK] Playwright Chromium 완료

echo.
echo  ============================================
echo   설정 완료! 이제 start_server.bat 을 실행하세요.
echo  ============================================
echo.
pause
