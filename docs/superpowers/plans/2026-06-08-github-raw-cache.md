# GitHub Raw 파일 캐시 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lambda 다중 인스턴스 문제로 인한 캐시 소멸을 GitHub 레포 raw 파일을 영구 저장소로 사용해 해결한다.

**Architecture:**
- `push_local.py` (naver): 수집 후 `data/naver.json`에 저장 + git commit/push (`[skip ci]`)
- `push_data.yml` (zigzag): 수집 후 `data/zigzag.json`을 GITHUB_TOKEN으로 커밋 (무한루프 없음)
- `app.py` (Lambda): cold start 시 disk load 실패하면 `raw.githubusercontent.com`에서 로드

**Tech Stack:** Python urllib, GitHub Contents API, raw.githubusercontent.com

---

## 파일 변경 목록

| 파일 | 변경 유형 | 역할 |
|------|----------|------|
| `data/.gitkeep` | 생성 | data/ 디렉터리 추적용 |
| `data/zigzag.json` | 생성 (초기 빈값) | zigzag 영구 캐시 |
| `data/naver.json` | 생성 (초기 빈값) | naver 영구 캐시 |
| `push_local.py` | 수정 | 수집 후 data/ 저장 + git push |
| `.github/workflows/push_data.yml` | 수정 | zigzag 후 git commit 추가 |
| `spao_monitor/app.py` | 수정 | cold start 시 GitHub raw fallback |

---

### Task 1: data/ 디렉터리 및 초기 파일 생성

**Files:**
- Create: `data/.gitkeep`
- Create: `data/zigzag.json`
- Create: `data/naver.json`

- [ ] **Step 1: 파일 생성**

```bash
mkdir -p data
echo "" > data/.gitkeep
echo "{}" > data/zigzag.json
echo "{}" > data/naver.json
```

- [ ] **Step 2: git 추가**

```bash
git add data/
git status  # data/ 3파일이 Staged로 나와야 함
```

---

### Task 2: push_local.py — data/ 저장 + git push 함수 추가

**Files:**
- Modify: `push_local.py`

- [ ] **Step 1: `_save_data_json()` 및 `_git_push_data()` 함수 추가**

`push_to_cloud()` 함수 바로 아래에 추가:

```python
# ─────────────────────────────────────────────
# GitHub 영구 캐시 저장 (Lambda 다중 인스턴스 대응)
# ─────────────────────────────────────────────
_DATA_DIR = os.path.join(_SCRIPT_DIR, "data")

def _save_data_json(channel: str, products: dict) -> bool:
    """수집 데이터를 data/{channel}.json 에 저장 (CI/로컬 공통)"""
    try:
        os.makedirs(_DATA_DIR, exist_ok=True)
        filepath = os.path.join(_DATA_DIR, f"{channel}.json")
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(products, f, ensure_ascii=False, separators=(",", ":"))
        print(f"  [{channel}] data/{channel}.json 저장 완료")
        return True
    except Exception as e:
        print(f"  [{channel}] 파일 저장 실패: {e}")
        return False


def _git_push_data(channel: str):
    """data/ 파일을 git commit·push — 로컬 전용 (CI는 workflow에서 처리)"""
    import subprocess as _sp
    filepath = os.path.join(_DATA_DIR, f"{channel}.json")
    try:
        _sp.run(["git", "add", filepath], cwd=_SCRIPT_DIR, check=True,
                stdout=_sp.DEVNULL, stderr=_sp.DEVNULL)
        diff = _sp.run(["git", "diff", "--cached", "--quiet"], cwd=_SCRIPT_DIR)
        if diff.returncode == 0:
            print(f"  [{channel}] 데이터 변경 없음 (git skip)")
            return
        _sp.run(
            ["git", "commit", "-m", f"[skip ci] data: update {channel}.json"],
            cwd=_SCRIPT_DIR, check=True,
            stdout=_sp.DEVNULL, stderr=_sp.DEVNULL,
        )
        _sp.run(["git", "push", "origin", "main"], cwd=_SCRIPT_DIR, check=True,
                stdout=_sp.DEVNULL, stderr=_sp.DEVNULL)
        print(f"  [{channel}] GitHub data/{channel}.json 업데이트 완료")
    except Exception as e:
        print(f"  [{channel}] git push 실패 (무시): {e}")
```

- [ ] **Step 2: 메인 루프에서 호출 추가**

`push_to_cloud()` 호출 이후에 아래 코드를 추가:

```python
        if products:
            push_to_cloud(target, products)
            # GitHub 영구 캐시 갱신
            if _save_data_json(target, products):
                if not os.environ.get("CI"):   # 로컬 실행 시에만 git push
                    _git_push_data(target)
        else:
            print(f"[{target}] 수집된 상품 없음 -- push 생략")
```

---

### Task 3: push_data.yml — zigzag 수집 후 git commit 추가

**Files:**
- Modify: `.github/workflows/push_data.yml`

- [ ] **Step 1: permissions + git commit 스텝 추가**

```yaml
name: Auto Push Zigzag & Naver Data

on:
  schedule:
    - cron: '*/15 * * * *'
  workflow_dispatch:
  push:
    branches: [ main ]

env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true

permissions:
  contents: write          # data/ 커밋을 위해 필요

jobs:
  push-data:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install Node dependencies
        run: npm install

      - name: Install Playwright Chromium browser
        run: npx playwright install chromium --with-deps

      - name: Push Zigzag data
        env:
          CLOUD_URL: ${{ secrets.CLOUD_URL }}
          PUSH_SECRET: ${{ secrets.PUSH_SECRET }}
        run: python push_local.py zigzag

      - name: Commit zigzag cache to repo
        run: |
          git config user.email "actions@github.com"
          git config user.name "GitHub Actions"
          git add data/zigzag.json || true
          git diff --cached --quiet || git commit -m "[skip ci] data: update zigzag.json"
          git push || true

      - name: Push Naver data
        env:
          CLOUD_URL: ${{ secrets.CLOUD_URL }}
          PUSH_SECRET: ${{ secrets.PUSH_SECRET }}
        run: python push_local.py naver
```

> **참고:** GITHUB_TOKEN 으로 커밋한 push는 GitHub Actions의 `on: push` 를 재트리거하지 않음 (GitHub 공식 동작). `[skip ci]` 는 이중 안전장치.

---

### Task 4: app.py — cold start 시 GitHub raw fallback

**Files:**
- Modify: `spao_monitor/app.py`

- [ ] **Step 1: `_github_load()` 함수 추가**

`_disk_load()` 함수 바로 아래에 추가:

```python
_GITHUB_RAW_BASE = (
    "https://raw.githubusercontent.com/woong1-cloud/price/main/data"
)

def _github_load(filename: str) -> dict:
    """Lambda cold start 시 GitHub raw에서 캐시 로드 (disk 실패 fallback)"""
    try:
        import time as _time
        url = f"{_GITHUB_RAW_BASE}/{filename}?t={int(_time.time())}"
        req = urllib.request.Request(
            url,
            headers={"Cache-Control": "no-cache", "User-Agent": "spao-monitor/1.0"},
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read().decode("utf-8"))
            sys.stderr.write(f"[cache] github loaded {filename}: {len(data)}개\n")
            return data
    except Exception as e:
        sys.stderr.write(f"[cache] github load error {filename}: {e}\n")
        return {}
```

- [ ] **Step 2: zigzag 시작 로드에 fallback 추가**

기존:
```python
_zigzag_cache = _disk_load("zigzag.json")
if _zigzag_cache:
    _zigzag_cache_f = _CACHE_DIR / "zigzag.json"
    try:
        _zigzag_cache_time = _zigzag_cache_f.stat().st_mtime
    except Exception:
        _zigzag_cache_time = time.time()
    sys.stderr.write(f"[zigzag] disk cache loaded: {len(_zigzag_cache)}개\n")
```

변경 후:
```python
_zigzag_cache = _disk_load("zigzag.json")
if _zigzag_cache:
    _zigzag_cache_f = _CACHE_DIR / "zigzag.json"
    try:
        _zigzag_cache_time = _zigzag_cache_f.stat().st_mtime
    except Exception:
        _zigzag_cache_time = time.time()
    sys.stderr.write(f"[zigzag] disk cache loaded: {len(_zigzag_cache)}개\n")
else:
    _zigzag_cache = _github_load("zigzag.json")
    if _zigzag_cache:
        _zigzag_cache_time = time.time()
```

- [ ] **Step 3: naver 시작 로드에 fallback 추가**

기존:
```python
_naver_cache = _disk_load("naver.json")
if _naver_cache:
    _naver_cache_f = _CACHE_DIR / "naver.json"
    try:
        _naver_cache_time = _naver_cache_f.stat().st_mtime
    except Exception:
        _naver_cache_time = time.time()
    sys.stderr.write(f"[naver] disk cache loaded: {len(_naver_cache)}개\n")
```

변경 후:
```python
_naver_cache = _disk_load("naver.json")
if _naver_cache:
    _naver_cache_f = _CACHE_DIR / "naver.json"
    try:
        _naver_cache_time = _naver_cache_f.stat().st_mtime
    except Exception:
        _naver_cache_time = time.time()
    sys.stderr.write(f"[naver] disk cache loaded: {len(_naver_cache)}개\n")
else:
    _naver_cache = _github_load("naver.json")
    if _naver_cache:
        _naver_cache_time = time.time()
```

---

### Task 5: deploy.zip 재생성 + 전체 커밋

- [ ] **Step 1: deploy.zip 재생성**

```bash
cd C:\Users\han_jiwoong\Desktop\agent
python -c "
import zipfile, os
src = 'spao_monitor'
with zipfile.ZipFile('deploy.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d != '__pycache__']
        for f in files:
            fp = os.path.join(root, f)
            z.write(fp, os.path.relpath(fp, src))
"
```

- [ ] **Step 2: 전체 커밋 및 push**

```bash
git add data/ push_local.py .github/workflows/push_data.yml spao_monitor/app.py
git commit -m "feat: GitHub raw 파일 캐시 — Lambda 다중 인스턴스 캐시 소멸 해결"
git push origin main
```

- [ ] **Step 3: 노아바이브에 deploy.zip 업로드**

- [ ] **Step 4: 동작 검증**

```bash
# 1. push-status 0 확인 (방금 배포)
python -c "import urllib.request,json; print(json.loads(urllib.request.urlopen('https://spao-price.noavibe.app/api/push-status').read()))"

# 2. git push가 GH Actions 트리거 → zigzag 자동 push
# 3. 로컬 naver push
python push_local.py naver

# 4. push-status 확인 (둘 다 > 0)
python -c "import urllib.request,json; print(json.loads(urllib.request.urlopen('https://spao-price.noavibe.app/api/push-status').read()))"

# 5. 15~30분 후 서버 인스턴스 교체를 흉내내서 다시 push-status 확인
# → 새 인스턴스가 raw.githubusercontent.com 에서 로드하므로 여전히 > 0 이어야 함
```
