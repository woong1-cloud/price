# ============================================
#  SPAO Monitor 배포 패키지 생성 스크립트
#  실행: 우클릭 → PowerShell로 실행
# ============================================
$ErrorActionPreference = "Stop"

$ROOT   = Split-Path -Parent $MyInvocation.MyCommand.Path
$OUTZIP = Join-Path $ROOT "spao_monitor_deploy.zip"
$TMPDIR = Join-Path $ROOT "_deploy_tmp"

Write-Host ""
Write-Host " SPAO Monitor 배포 패키지 생성" -ForegroundColor Cyan
Write-Host " =============================" -ForegroundColor Cyan
Write-Host ""

# 이전 파일 정리
if (Test-Path $TMPDIR) { Remove-Item $TMPDIR -Recurse -Force }
if (Test-Path $OUTZIP) { Remove-Item $OUTZIP -Force }
New-Item -ItemType Directory -Path $TMPDIR | Out-Null

# ── [1] 소스 파일 복사 ──
Write-Host " [1/3] 소스 파일 복사 중..." -ForegroundColor Yellow
Copy-Item (Join-Path $ROOT "fetch_spao.js")  $TMPDIR
Copy-Item (Join-Path $ROOT "fetch_naver.js") $TMPDIR
Copy-Item (Join-Path $ROOT "package.json")   $TMPDIR

$monDst = Join-Path $TMPDIR "spao_monitor"
New-Item -ItemType Directory -Path $monDst | Out-Null
Copy-Item (Join-Path $ROOT "spao_monitor\app.py")           $monDst
Copy-Item (Join-Path $ROOT "spao_monitor\index.html")       $monDst
Copy-Item (Join-Path $ROOT "spao_monitor\requirements.txt") $monDst
Copy-Item (Join-Path $ROOT "spao_monitor\서버시작.bat")     $monDst
Write-Host "    소스 파일 완료" -ForegroundColor Gray

# ── [2] pw-browsers 복사 ──
Write-Host " [2/3] pw-browsers 복사 중 (270 MB)..." -ForegroundColor Yellow
$pwSrc = Join-Path $ROOT "pw-browsers"
if (Test-Path $pwSrc) {
    Copy-Item $pwSrc (Join-Path $TMPDIR "pw-browsers") -Recurse
    Write-Host "    pw-browsers 완료" -ForegroundColor Gray
} else {
    Write-Host "    [경고] pw-browsers 없음 — 네이버 수집 불가" -ForegroundColor Red
}

# ── [3] ZIP 압축 (.NET 직접 사용 — 안정적) ──
Write-Host " [3/3] ZIP 압축 중..." -ForegroundColor Yellow
Add-Type -Assembly "System.IO.Compression.FileSystem"
[System.IO.Compression.ZipFile]::CreateFromDirectory($TMPDIR, $OUTZIP, [System.IO.Compression.CompressionLevel]::Optimal, $false)

# 임시 폴더 정리
Remove-Item $TMPDIR -Recurse -Force

$zipSize = [math]::Round((Get-Item $OUTZIP).Length / 1MB, 1)
Write-Host ""
Write-Host " ✅ 완료!" -ForegroundColor Green
Write-Host "    파일: $OUTZIP" -ForegroundColor Green
Write-Host "    크기: $zipSize MB" -ForegroundColor Green
Write-Host ""
Write-Host " ─── 서버 설치 순서 ─────────────────────────────────" -ForegroundColor Cyan
Write-Host "  사전 조건 (서버에 미리 설치 필요)"
Write-Host "    - Python 3.10+  : https://www.python.org"
Write-Host "    - Node.js 18+   : https://nodejs.org"
Write-Host ""
Write-Host "  배포 단계"
Write-Host "  1. spao_monitor_deploy.zip 서버에 업로드"
Write-Host "  2. 원하는 폴더에 압축 해제"
Write-Host "  3. 압축 해제한 폴더에서 CMD 열고:"
Write-Host "       npm install          # playwright 설치 (인터넷 필요, 최초 1회)"
Write-Host "  4. spao_monitor\서버시작.bat 실행"
Write-Host " ────────────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host ""
