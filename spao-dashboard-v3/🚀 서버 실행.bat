@echo off
chcp 65001 > nul
title SPAO 대시보드 V3

echo.
echo  ================================
echo   SPAO 자사몰 주간 실적 대시보드 v3
echo  ================================
echo.
echo  서버 시작 중... (포트 3458)
echo  브라우저에서 http://localhost:3458 접속하세요
echo.

cd /d "%~dp0"
npm run dev -- --port 3458

pause
