from flask import Flask, jsonify, render_template_string, request
import urllib.request
import urllib.error
import urllib.parse
import json
import re
import time
import subprocess
import os
import threading
import sys
from html import unescape

app = Flask(__name__)

STYLE_CODE_RE = re.compile(r'[_\s]([Ss][Pp][A-Za-z0-9]{8})$')
VALID_SEASON_RE = re.compile(r'^[A-Z][0-9A-Z]$')   # e.g. G1, G2, GA - rejects numeric IDs like "18"

# ─────────────────────────────────────────────
# 무신사
# ─────────────────────────────────────────────
MUSINSA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
    "Referer": "https://www.musinsa.com/brand/spao?gf=A",
}

def fetch_musinsa():
    products = {}
    next_url = "https://api.musinsa.com/api2/dp/v2/plp/goods?brand=spao&sortCode=POPULAR&size=90&caller=FLAGSHIP&gf=A&page=1"
    while next_url:
        req = urllib.request.Request(next_url, headers=MUSINSA_HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception:
            break
        items = data.get("data", {}).get("list", [])
        if not items:
            break
        for item in items:
            name = item.get("goodsName", "")
            m = STYLE_CODE_RE.search(name)
            code = m.group(1).upper() if m else ""
            style_name = name[:m.start()].strip() if m else name
            # finalPrice = 쿠폰/즉시할인 모두 적용된 실제 결제가
            # price      = 기본 할인가 (쿠폰 미적용)
            # normalPrice= 정가
            products[code or name] = {
                "styleCode":   code,
                "styleName":   style_name,
                "price":       item.get("finalPrice") or item.get("price", 0),
                "normalPrice": item.get("normalPrice", 0),
                "saleRate":    item.get("finalDiscount") or item.get("saleRate", 0),
                "isSoldOut":   item.get("isSoldOut", False),
                "link":        item.get("goodsLinkUrl") or f"https://www.musinsa.com/products/{item.get('goodsNo')}",
            }
        pagination = data.get("data", {}).get("pagination", {})
        next_url = pagination.get("nextPageUrl") if pagination.get("hasNext") else None
        if next_url:
            time.sleep(0.25)
    return products


# ─────────────────────────────────────────────
# 지그재그 — zigzag.kr SSR(__nextDataReq) 방식
# (api.zigzag.kr GraphQL은 Lambda IP 차단 → 우회)
# ─────────────────────────────────────────────
_ZIGZAG_BASE = "https://zigzag.kr/cq-3lzn4zqy/category"
# 카테고리 ID 목록 (pageProps.root_category_list 에서 확인)
_ZIGZAG_CATS = [0, 474, 2757, 436, 547, 560, 507, 795, 845, 623, 689, 1567]

# ── 디스크 캐시 경로 (서버 재시작 후에도 데이터 유지) ──
import pathlib as _pathlib
_CACHE_DIR = _pathlib.Path(os.path.dirname(os.path.abspath(__file__))) / "cache"

def _disk_save(filename: str, data: dict):
    """캐시 데이터를 파일로 저장 (원자적 write)"""
    try:
        _CACHE_DIR.mkdir(exist_ok=True)
        tmp = _CACHE_DIR / (filename + ".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        tmp.rename(_CACHE_DIR / filename)
    except Exception as e:
        sys.stderr.write(f"[cache] save error {filename}: {e}\n")

def _disk_load(filename: str) -> dict:
    """파일에서 캐시 데이터 로드"""
    try:
        f = _CACHE_DIR / filename
        if f.exists():
            return json.loads(f.read_text(encoding="utf-8"))
    except Exception as e:
        sys.stderr.write(f"[cache] load error {filename}: {e}\n")
    return {}


_GITHUB_RAW_BASE = (
    "https://raw.githubusercontent.com/woong1-cloud/price/main/data"
)

def _github_load(filename: str) -> dict:
    """Lambda cold start 시 GitHub raw에서 캐시 로드 (disk 실패 fallback)"""
    try:
        url = f"{_GITHUB_RAW_BASE}/{filename}?t={int(time.time())}"
        req = urllib.request.Request(
            url,
            headers={"Cache-Control": "no-cache", "User-Agent": "spao-monitor/1.0"},
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read().decode("utf-8"))
            if data:
                sys.stderr.write(f"[cache] github loaded {filename}: {len(data)}개\n")
            return data
    except Exception as e:
        sys.stderr.write(f"[cache] github load error {filename}: {e}\n")
        return {}

# 지그재그 캐시 (push 데이터 수신용 + 디스크 영속)
_zigzag_cache: dict = {}
_zigzag_cache_time: float = 0.0
_zigzag_lock = threading.Lock()

# 서버 시작 시 디스크 캐시 로드 → 실패 시 GitHub raw fallback
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
_ZIGZAG_HDR = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://zigzag.kr/",
    "Accept-Language": "ko-KR,ko;q=0.9",
}

# 하위 호환성 — /api/test-connections 에서 참조
ZIGZAG_URL = "https://zigzag.kr/cq-3lzn4zqy/category/0?__nextDataReq=1"
ZIGZAG_HEADERS = _ZIGZAG_HDR

def _zlog(msg):
    try:
        sys.stderr.write(f"[zigzag] {msg}\n"); sys.stderr.flush()
    except Exception:
        pass

def fetch_zigzag():
    """
    1순위: push로 받은 캐시 반환 (로컬 PC → 클라우드 push 방식).
    2순위: zigzag.kr SSR ?__nextDataReq=1 직접 수집 (로컬 PC 환경 only).
    Lambda IP는 zigzag.kr WAF에서 403 차단 → push 데이터 없으면 빈 dict.
    """
    with _zigzag_lock:
        if _zigzag_cache:
            return dict(_zigzag_cache)

    products: dict = {}
    seen_ids: set  = set()

    for cat_id in _ZIGZAG_CATS:
        url = f"{_ZIGZAG_BASE}/{cat_id}?__nextDataReq=1"
        req = urllib.request.Request(url, headers=_ZIGZAG_HDR)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            _zlog(f"cat {cat_id} 오류: {e}")
            continue

        # 데이터 경로: pageProps → dehydrated_state → queries[0] → state.data.pages
        try:
            pages = (
                data["pageProps"]["dehydrated_state"]["queries"][0]
                ["state"]["data"]["pages"]
            )
        except (KeyError, IndexError, TypeError):
            _zlog(f"cat {cat_id}: 경로 없음 (keys={list(data.get('pageProps', {}).keys())[:5]})")
            continue

        added = 0
        for page in pages:
            for item in page.get("item_list", []):
                if item.get("type") != "PRODUCT":
                    continue
                prod = item.get("product", {})
                pid  = str(prod.get("catalog_product_id", ""))
                if not pid or pid in seen_ids:
                    continue
                seen_ids.add(pid)

                name         = prod.get("name", "")
                m            = STYLE_CODE_RE.search(name)
                if not m:
                    m = ELAND_CODE_RE.search(name)
                    if m:
                        code       = m.group(1).upper()
                        sep        = m.group(0)[0]
                        style_name = name[:m.start()+1].strip() if sep == ")" else name[:m.start()].strip().rstrip("_").strip()
                    else:
                        code, style_name = "", name
                else:
                    code       = m.group(1).upper()
                    style_name = name[:m.start()].strip()

                normal_price = prod.get("price", 0)
                final_price  = item.get("final_price") or normal_price
                disc_rate    = prod.get("discount_rate", 0)
                sold_out     = prod.get("sales_status", "") != "ON_SALE"
                link         = prod.get("url") or f"https://store.zigzag.kr/app/catalog/products/{pid}"

                key = code or name
                if key not in products:
                    products[key] = {
                        "styleCode":   code,
                        "styleName":   style_name,
                        "price":       final_price,
                        "normalPrice": normal_price,
                        "saleRate":    disc_rate,
                        "isSoldOut":   sold_out,
                        "link":        link,
                    }
                    added += 1

        _zlog(f"cat {cat_id}: +{added}개 (누적 {len(products)})")
        time.sleep(0.3)

    _zlog(f"fetch 완료: 총 {len(products)}개")
    return products


# ─────────────────────────────────────────────
# 이랜드몰
# ─────────────────────────────────────────────
ELAND_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": "https://spao.elandmall.co.kr/h/main",
}
ELAND_CATEGORIES = [
    "1711333016",  # WOMEN 전체
    "1711332978",  # MEN 전체
    "2303000300",  # KIDS 전체
    "2005450168",  # COLLABO
]
ELAND_ITEM_RE = re.compile(
    r'data-item-no="(\d+)"[^>]*'
    r'data-sellprice="(\d+)"[^>]*'
    r'data-saleprice="(\d+)"[^>]*'
    r'data-item-name="([^"]+)"'
)
# 이랜드몰 전용 - $ 없이 중간 매칭, ) 도 구분자로 허용
# 예) "(DARK GRAY)SPTJG25C51" 또는 "_SPLWF4TG01 (10color)"
ELAND_CODE_RE = re.compile(r'[_\s)]([Ss][Pp][A-Za-z0-9]{8})')

def _eland_extract(name: str):
    """이랜드몰 상품명에서 (스타일코드, 스타일명) 추출"""
    m = ELAND_CODE_RE.search(name)
    if not m:
        return "", name
    code = m.group(1).upper()
    sep = m.group(0)[0]          # 구분자: '_', ' ', ')'
    if sep == ")":
        # 닫는 괄호까지 포함해서 스타일명 구성: "라이드 팩(DARK GRAY)"
        style_name = name[:m.start() + 1].strip()
    else:
        # '_' 또는 공백: 구분자 제외
        style_name = name[:m.start()].strip().rstrip("_").strip()
    return code, style_name

def fetch_eland():
    products = {}
    seen_items = set()

    PAGE_SIZE = 60   # 이랜드몰 서버가 pageSize 파라미터 무시 → 항상 60개씩 반환
    MAX_PAGES = 50   # 카테고리당 최대 50페이지 (무한루프 방지)
    for cat_id in ELAND_CATEGORIES:
        offset = 0
        for _ in range(MAX_PAGES):
            url = (f"https://spao.elandmall.co.kr/c/ctg"
                   f"?dispCategoryNo={cat_id}&from={offset}")
            req = urllib.request.Request(url, headers=ELAND_HEADERS)
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    html = resp.read().decode("utf-8")
            except Exception:
                break

            items = ELAND_ITEM_RE.findall(html)
            if not items:
                break

            for item_no, sell_str, sale_str, raw_name in items:
                if item_no in seen_items:
                    continue
                seen_items.add(item_no)

                name = unescape(raw_name)
                code, style_name = _eland_extract(name)

                sell_p = int(sell_str)
                sale_p = int(sale_str)
                rate = round((1 - sale_p / sell_p) * 100) if sell_p > 0 and sale_p < sell_p else 0

                products[code or item_no] = {
                    "styleCode":   code,
                    "styleName":   style_name,
                    "price":       sale_p,
                    "normalPrice": sell_p,
                    "saleRate":    rate,
                    "isSoldOut":   False,
                    "link":        f"https://spao.elandmall.co.kr/i/item?itemNo={item_no}",
                }

            offset += len(items)        # 실제 수신 개수만큼 이동
            if len(items) < PAGE_SIZE:  # 60개 미만 → 마지막 페이지
                break
            time.sleep(0.3)
        else:
            pass  # MAX_PAGES 도달 시 자연스럽게 다음 카테고리로

    return products


# ─────────────────────────────────────────────
# node.exe 탐색 (spao + naver 공용)
# ─────────────────────────────────────────────
_NODE_CANDIDATES = [
    r"C:\Program Files\nodejs\node.exe",
    r"C:\Program Files (x86)\nodejs\node.exe",
    "node",
]

def _find_node():
    import shutil
    for candidate in _NODE_CANDIDATES:
        if os.path.isabs(candidate):
            if os.path.isfile(candidate):
                return candidate
        else:
            found = shutil.which(candidate)
            if found:
                return found
    return "node"


# ─────────────────────────────────────────────
# 자사몰 (spao.com) — Playwright 백그라운드 캐시
# ─────────────────────────────────────────────
_FETCH_SPAO_JS = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fetch_spao.js")
)

# ── 캐시 상태 ──
_spao_cache: dict = {}
_spao_cache_time: float = 0.0
_spao_fetching: bool = False
_spao_error: str = ""
_spao_lock = threading.Lock()

def _slog(msg):
    try:
        sys.stderr.write(f"[spao] {msg}\n"); sys.stderr.flush()
    except Exception:
        pass

def _parse_spao_raw(raw: list) -> dict:
    """fetch_spao.js stdout JSON → 채널 상품 dict"""
    products: dict = {}
    for item in raw:
        name    = item.get("name", "")
        item_no = item.get("itemNo", "")
        sell_p  = item.get("sellP", 0)
        sale_p  = item.get("saleP", 0) or sell_p
        is_so   = item.get("isSoldOut", False)

        # 스타일코드 추출 (eland mall 과 동일)
        m = STYLE_CODE_RE.search(name)
        if not m:
            m2 = ELAND_CODE_RE.search(name)
            if m2:
                code = m2.group(1).upper()
                sep  = m2.group(0)[0]
                style_name = name[:m2.start()+1].strip() if sep == ")" else name[:m2.start()].strip().rstrip("_").strip()
            else:
                code, style_name = "", name
        else:
            code = m.group(1).upper()
            style_name = name[:m.start()].strip()

        rate = round((1 - sale_p / sell_p) * 100) if sell_p > 0 and sale_p < sell_p else 0
        key  = code or item_no
        if key and key not in products:
            products[key] = {
                "styleCode":   code,
                "styleName":   style_name,
                "price":       sale_p,
                "normalPrice": sell_p,
                "saleRate":    rate,
                "isSoldOut":   is_so,
                "link":        f"https://www.spao.com/i/item?itemNo={item_no}" if item_no else "",
            }
    return products

# ── 순수 Python SPAO 수집 (Lambda / Node.js 없는 환경 fallback) ──
_SPAO_CATEGORIES = [
    2605000006, 2605000015, 2605000023, 2605000028,
    2605000037, 2605000043, 2605000045, 2605000051,
    2605000064, 2605000068, 2605000073, 2605000084,
    2605000085, 2605000094,
    2605000102, 2605000109, 2605000122, 2605000127,
    2605000131, 2605000136, 2605000141, 2605000149,
    2605000150, 2605000159, 2605000165, 2605000172,
    2605000177, 2605000184, 2605000190, 2605000191,
    2605000195,
    2605000200, 2605000204, 2605000205,
]
_SPAO_API_HDR = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept":     "application/json",
    "Referer":    "https://www.spao.com/",
}

def _fetch_spao_all_python() -> dict:
    """순수 Python urllib — 10병렬 수집, Lambda/클라우드 호환 (~3-5초)"""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def _cat_pages(cat_no):
        items = {}
        page = 1
        while True:
            url = (
                f"https://www.spao.com/v1/search/leaf/cate/item/api"
                f"?dispMctgNo={cat_no}&page={page}&pageSize=60"
            )
            req = urllib.request.Request(url, headers=_SPAO_API_HDR)
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
            except Exception as e:
                _slog(f"cat {cat_no} p{page} ERROR: {type(e).__name__}:{e}")
                break
            # API 응답 구조: {"resultCode":"200","data":{"srchOutCome":{"item":{...}}}}
            outcome   = data.get("data", {}).get("srchOutCome", {})
            item_data = outcome.get("item", {})
            total     = item_data.get("total", 0)
            lst       = item_data.get("list", [])
            for it in lst:
                ino = str(it.get("itemNo", ""))
                if ino:
                    sell_p = it.get("orgSellprice", 0)
                    items.setdefault(ino, {
                        "itemNo":    ino,
                        "name":      it.get("itemName", ""),
                        "sellP":     sell_p,
                        "saleP":     it.get("finalDcPrice", 0) or sell_p,
                        "isSoldOut": it.get("soldOutYn", "N") == "Y",
                    })
            fetched = (page - 1) * 60 + len(lst)
            if fetched >= total or len(lst) < 60:
                break
            page += 1
        return items

    seen: dict = {}
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs = [ex.submit(_cat_pages, c) for c in _SPAO_CATEGORIES]
        for fut in as_completed(futs):
            try:
                for k, v in fut.result().items():
                    seen.setdefault(k, v)
            except Exception:
                pass
    _slog(f"Python parallel fetch: {len(seen)} raw items")
    return _parse_spao_raw(list(seen.values()))


_spao_last_stderr: str = ""   # 진단용 — /api/spao-status 에서 확인 가능

def _spao_worker():
    """백그라운드 스레드: fetch_spao.js 실행 → 캐시 갱신 (Node.js 없으면 Python fallback)"""
    global _spao_cache, _spao_cache_time, _spao_fetching, _spao_error, _spao_last_stderr
    import shutil as _shutil
    node_bin = _find_node()
    _node_ok = (
        os.path.isfile(node_bin) if os.path.isabs(node_bin)
        else bool(_shutil.which("node"))
    )

    # ── Lambda / 클라우드: Node.js 없음 → 순수 Python으로 수집 ──
    if not _node_ok:
        _slog("node not found — Python fallback 시작")
        try:
            parsed = _fetch_spao_all_python()
            with _spao_lock:
                _spao_cache      = parsed
                _spao_cache_time = time.time()
                _spao_error      = ""
                _spao_fetching   = False
            _slog(f"Python fallback OK: parsed={len(parsed)}")
        except Exception as e:
            _slog(f"Python fallback EXCEPTION: {e}")
            with _spao_lock:
                _spao_error    = str(e)
                _spao_fetching = False
        return

    # ── Node.js 있는 경우: 기존 JS 방식 ──
    _slog(f"worker start | node={node_bin}")
    try:
        result = subprocess.run(
            [node_bin, _FETCH_SPAO_JS],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            timeout=300,           # 카테고리 발견(~20s) + 카테고리당 ~15초
            cwd=os.path.dirname(_FETCH_SPAO_JS),
            env=_make_node_env(),
        )
        stderr_msg  = result.stderr.decode("utf-8", errors="replace")
        stdout_raw  = result.stdout.decode("utf-8", errors="replace").strip()
        _spao_last_stderr = stderr_msg[-2000:]   # 마지막 2000자 저장
        _slog(f"rc={result.returncode} stdout_len={len(stdout_raw)}")
        _slog(f"stderr tail:\n{stderr_msg[-500:]}")

        if result.returncode != 0 or not stdout_raw or stdout_raw == "[]":
            fatal = next(
                (l for l in stderr_msg.splitlines() if "Fatal" in l or "Error" in l),
                stderr_msg.strip()[-300:]
            )
            err = f"JS fatal: {fatal}"
            _slog(f"WARN: empty/error result | {fatal}")
            with _spao_lock:
                _spao_error   = err
                _spao_fetching = False
            return

        raw    = json.loads(stdout_raw)
        parsed = _parse_spao_raw(raw)
        _slog(f"OK raw={len(raw)} parsed={len(parsed)}")
        with _spao_lock:
            _spao_cache      = parsed
            _spao_cache_time = time.time()
            _spao_error      = ""
            _spao_fetching   = False

    except subprocess.TimeoutExpired:
        _slog("TIMEOUT 120s")
        with _spao_lock:
            _spao_error   = "Timeout (120s)"
            _spao_fetching = False
    except Exception as e:
        _slog(f"EXCEPTION {e}")
        with _spao_lock:
            _spao_error   = str(e)
            _spao_fetching = False
    finally:
        with _spao_lock:
            _spao_fetching = False

def start_spao_refresh() -> bool:
    global _spao_fetching
    with _spao_lock:
        if _spao_fetching:
            return False
        _spao_fetching = True
    t = threading.Thread(target=_spao_worker, daemon=True, name="spao-fetch")
    t.start()
    _slog("background refresh started")
    return True

def fetch_spao_official() -> dict:
    """자사몰 상품 반환 — 캐시 없으면 즉시 동기 수집 (Lambda/클라우드 호환)"""
    global _spao_cache, _spao_cache_time, _spao_error
    with _spao_lock:
        if _spao_cache:
            return dict(_spao_cache)
    # 캐시 비어있음 → Python으로 즉시 수집 (병렬 10 threads, ~3-5초)
    _slog("cache empty → sync fetch start")
    try:
        parsed = _fetch_spao_all_python()
        with _spao_lock:
            _spao_cache      = parsed
            _spao_cache_time = time.time()
            _spao_error      = ""
        _slog(f"sync fetch done: {len(parsed)}")
        return dict(parsed)
    except Exception as e:
        _slog(f"sync fetch error: {e}")
        with _spao_lock:
            _spao_error = str(e)
        return {}

# 서버 시작 시 자동 수집 (로컬 Windows + Node.js 있는 경우만)
# Lambda 환경에서는 백그라운드 스레드가 freeze되어 중복 요청 유발 → 요청 시 동기 수집으로 대체
import shutil as _shutil_init
if _shutil_init.which("node"):
    try:
        start_spao_refresh()
        _slog("server start - background fetch scheduled (node mode)")
    except Exception as _e:
        _slog(f"server start error: {_e}")


# ── 진단용 헬퍼 (spao-debug 에서만 사용) ──
SPAO_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": "https://www.spao.com/",
}
_SPAO_CAT_URL_RE = re.compile(r'(?:dispCategoryNo|cNo)[=:"\s]+(\d{7,12})')
_SPAO_SITEMAP_RE = re.compile(r'/c/ctg\?(?:[^"<>]*&)?dispCategoryNo=(\d{7,12})')

def _discover_spao_categories() -> list:
    """진단용 — spao-debug API 에서만 호출"""
    return []


# ─────────────────────────────────────────────
# 네이버 브랜드스토어 (백그라운드 캐시 방식)
# ─────────────────────────────────────────────
_FETCH_NAVER_JS = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fetch_naver.js")
)

# _find_node 는 위 (spao 섹션 앞)에서 정의됨

# ── 캐시 상태 ──
_naver_cache: dict = {}
_naver_cache_time: float = 0.0
_naver_fetching: bool = False
_naver_error: str = ""
_naver_error_time: float = 0.0   # 마지막 에러 발생 시각 (backoff용)
_naver_lock = threading.Lock()
_NAVER_BACKOFF = 180  # 에러 후 재시도 대기 (초)

# 서버 시작 시 디스크 캐시 로드 → 실패 시 GitHub raw fallback
_naver_cache = _disk_load("naver.json")
if _naver_cache:
    # 파일 수정 시각으로 cache_time 복원 → 재시작 후에도 타임스탬프 유지
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

def _parse_naver_raw(raw: list) -> dict:
    """네이버 raw JSON 리스트 → 채널 상품 dict 변환"""
    products: dict = {}
    for item in raw:
        name = item.get("name", "")
        m = STYLE_CODE_RE.search(name)
        if not m:
            m2 = ELAND_CODE_RE.search(name)
            if m2:
                code = m2.group(1).upper()
                sep = m2.group(0)[0]
                style_name = name[:m2.start() + 1].strip() if sep == ")" else name[:m2.start()].strip().rstrip("_").strip()
            else:
                code, style_name = "", name
        else:
            code = m.group(1).upper()
            style_name = name[:m.start()].strip()

        status    = item.get("productStatusType", "SALE")
        sold_out  = status not in ("SALE", "ON_SALE")
        prod_no   = item.get("productNo", "")
        link      = f"https://brand.naver.com/spao/products/{prod_no}" if prod_no else ""
        sale_p    = item.get("salePrice", 0)       # 실제 판매가 (프로모션 적용 후)
        orig_p    = item.get("originalPrice", 0) or sale_p  # 정가
        disc_rate = item.get("discountRate", 0)
        # 할인율 보정: JS에서 0으로 넘어왔을 때 직접 계산
        if not disc_rate and orig_p > sale_p > 0:
            disc_rate = round((1 - sale_p / orig_p) * 100)

        key = code or name
        if key not in products:
            products[key] = {
                "styleCode":   code,
                "styleName":   style_name,
                "price":       sale_p,
                "normalPrice": orig_p,
                "saleRate":    disc_rate,
                "isSoldOut":   sold_out,
                "link":        link,
            }
    return products

def _nlog(msg):
    """stderr 출력 - 인코딩 예외 무시 (모든 환경 안전)"""
    try:
        sys.stderr.write(f"[naver] {msg}\n")
        sys.stderr.flush()
    except Exception:
        pass

_PW_BROWSERS_PATH = os.path.join(os.path.dirname(_FETCH_NAVER_JS), "pw-browsers")

def _make_node_env() -> dict:
    """
    node.exe 에 넘길 환경변수 dict.

    우선순위:
      1. 프로젝트 로컬 pw-browsers/ 폴더 (git clone 후 setup.bat 실행 or 직접 설치)
      2. 환경변수 PLAYWRIGHT_BROWSERS_PATH (이미 설정된 경우)
      3. AppData/Local/ms-playwright (Playwright 기본 설치 경로)
         ※ Softcamp 등 보안SW가 AppData 접근을 차단하는 환경에서는 1번 사용 권장
    """
    env = dict(os.environ)

    if os.path.isdir(_PW_BROWSERS_PATH):
        # 프로젝트 로컬 pw-browsers/ 존재 → 우선 사용
        env["PLAYWRIGHT_BROWSERS_PATH"] = _PW_BROWSERS_PATH
        _nlog(f"PLAYWRIGHT_BROWSERS_PATH={_PW_BROWSERS_PATH} (local)")
    else:
        # 없으면 시스템 기본 경로 사용 (npm install 후 npx playwright install 한 경우)
        env.pop("PLAYWRIGHT_BROWSERS_PATH", None)
        _nlog("PLAYWRIGHT_BROWSERS_PATH: using system default (pw-browsers/ not found)")
    return env


# ── 순수 Python 네이버 수집 (SSR HTML __PRELOADED_STATE__ 파싱) ──
_NAVER_CATS_PY = [
    'ALL',
    'b6a9188b831343bf8c3cb2133b668ad2',  # 여성
    '64e83fd96df44c71a0802e094dcb395f',  # 남성
    'd09aab8f2f3d45b19f4235941b549e1c',  # 잡화
    'd5eda39831ac45d4a31a9e799b9fb048',  # BEST
    '8d39073c3dcb42e5b9c8dbaccf545a9f',  # 콜라보
    'b67e4e95989e47908dff9ddfcc36b49c',  # 네이버단독
    '87a025edbac74a148a9bb86ef524f7b7',  # N배송
    'd549391f0a4440c783d810ed6d9ed5be',  # 특가
]
_NAVER_HDR_PY = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
}
_NAVER_STATE_RE = re.compile(r'window\.__PRELOADED_STATE__\s*=\s*')

def _extract_naver_state(html: str) -> dict:
    """HTML에서 __PRELOADED_STATE__ JSON 추출"""
    m = _NAVER_STATE_RE.search(html)
    if not m:
        return {}
    start = m.end()
    sub = html[start:start + 20].lstrip()
    # Object.freeze({...}) 감싸는 경우
    if sub.startswith("Object.freeze("):
        freeze_idx = html.find("Object.freeze(", m.end())
        start = freeze_idx + len("Object.freeze(")
    elif sub.startswith("JSON.parse("):
        return {}  # minified string — JS 실행 필요
    try:
        decoder = json.JSONDecoder()
        state, _ = decoder.raw_decode(html, start)
        return state if isinstance(state, dict) else {}
    except (json.JSONDecodeError, ValueError):
        return {}

def _state_to_naver_raw(state: dict) -> list:
    cp      = state.get("categoryProducts", {}).get("simpleProducts", [])
    bs_a    = state.get("bsProductCollection", {}).get("A", {})
    all_p   = cp + bs_a.get("newProducts", []) + bs_a.get("bestProducts", []) + bs_a.get("bestReviewProducts", [])
    result  = []
    for p in all_p:
        prod_no = str(p.get("id") or p.get("productNo", ""))
        if not prod_no:
            continue
        orig_p = p.get("salePrice", 0)
        bv     = p.get("benefitsView") or {}
        promo  = bv.get("discountedSalePrice", 0)
        sale_p = promo if promo and promo < orig_p else orig_p
        result.append({
            "productNo":         prod_no,
            "name":              p.get("name", ""),
            "salePrice":         sale_p,
            "originalPrice":     orig_p,
            "discountRate":      bv.get("discountedRatio", 0),
            "productStatusType": p.get("productStatusType") or p.get("channelProductDisplayStatus") or "SALE",
        })
    return result

def _fetch_naver_all_python() -> dict:
    """순수 Python urllib — Naver SSR HTML에서 __PRELOADED_STATE__ 파싱"""
    seen: dict = {}
    for cat_id in _NAVER_CATS_PY:
        url = f"https://brand.naver.com/spao/category/{cat_id}"
        req = urllib.request.Request(url, headers=_NAVER_HDR_PY)
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                html = resp.read().decode("utf-8", errors="replace")
        except Exception as e:
            _nlog(f"Python Naver fetch error {cat_id[:8]}: {e}")
            continue
        state = _extract_naver_state(html)
        if not state:
            _nlog(f"No __PRELOADED_STATE__ in {cat_id[:8]}")
            continue
        raw_list = _state_to_naver_raw(state)
        new_cnt  = sum(1 for p in raw_list if p["productNo"] not in seen)
        for p in raw_list:
            seen.setdefault(p["productNo"], p)
        _nlog(f"Python Naver {cat_id[:8]}: {len(raw_list)}개 (신규 {new_cnt})")
        time.sleep(0.2)
    _nlog(f"Python Naver fetch done: {len(seen)} products")
    return _parse_naver_raw(list(seen.values()))


def _naver_worker():
    """백그라운드 스레드: node 실행 -> 캐시 갱신"""
    global _naver_cache, _naver_cache_time, _naver_fetching, _naver_error
    node_bin = _find_node()
    _nlog(f"worker start | node={node_bin}")

    try:
        result = subprocess.run(
            [node_bin, _FETCH_NAVER_JS],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            timeout=300,
            cwd=os.path.dirname(_FETCH_NAVER_JS),
            env=_make_node_env(),
        )
        stderr_msg = result.stderr.decode("utf-8", errors="replace")
        stdout_raw = result.stdout.decode("utf-8", errors="replace").strip()

        _nlog(f"rc={result.returncode} stdout_len={len(stdout_raw)}")

        if result.returncode != 0:
            err = f"node exit {result.returncode}"
            _nlog(f"ERROR: {err}")
            with _naver_lock:
                _naver_error   = err
                _naver_fetching = False
            return

        # "[]" = fetch_naver.js catch() 핸들러 -> Playwright Fatal 에러
        if not stdout_raw or stdout_raw == "[]":
            # stderr 에서 Fatal 메시지 추출 (ASCII 범위만)
            fatal_line = next(
                (l for l in stderr_msg.splitlines() if "Fatal" in l or "Error" in l or "exist" in l),
                stderr_msg.strip()[-200:]
            )
            err = f"JS fatal: {fatal_line}"
            _nlog(f"FATAL stdout=[{stdout_raw[:10]}] | {fatal_line}")
            with _naver_lock:
                _naver_error   = err
                _naver_fetching = False
            return

        raw    = json.loads(stdout_raw)
        parsed = _parse_naver_raw(raw)
        _nlog(f"OK raw={len(raw)} parsed={len(parsed)}")

        with _naver_lock:
            _naver_cache      = parsed
            _naver_cache_time = time.time()
            _naver_error      = ""
            _naver_fetching   = False

    except subprocess.TimeoutExpired:
        _nlog("TIMEOUT 300s")
        with _naver_lock:
            _naver_error   = "Timeout (300s)"
            _naver_fetching = False
    except Exception as e:
        _nlog(f"EXCEPTION {e}")
        with _naver_lock:
            _naver_error   = str(e)
            _naver_fetching = False
    finally:
        # 어떤 예외가 발생해도 fetching 플래그는 반드시 해제
        with _naver_lock:
            _naver_fetching = False

def start_naver_refresh() -> bool:
    """백그라운드 수집 시작 (이미 실행 중이면 False 반환)"""
    global _naver_fetching
    with _naver_lock:
        if _naver_fetching:
            return False
        _naver_fetching = True
    t = threading.Thread(target=_naver_worker, daemon=True, name="naver-fetch")
    t.start()
    _nlog("background refresh started")
    return True

def fetch_naver() -> dict:
    """네이버 상품 반환 — 캐시 없으면 Python HTML 파싱 시도 (Lambda 호환)"""
    global _naver_cache, _naver_cache_time, _naver_error, _naver_error_time, _naver_fetching
    with _naver_lock:
        if _naver_cache:
            return dict(_naver_cache)
        if _naver_fetching:
            return {}
        # 최근 에러 → backoff (Lambda IP 차단 시 반복 요청 방지)
        if _naver_error and (time.time() - _naver_error_time) < _NAVER_BACKOFF:
            return {}
        _naver_fetching = True
    _nlog("cache empty → Python fallback start")
    try:
        parsed = _fetch_naver_all_python()
        if parsed:
            with _naver_lock:
                _naver_cache      = parsed
                _naver_cache_time = time.time()
                _naver_error      = ""
                _naver_fetching   = False
            _nlog(f"Python fallback done: {len(parsed)}")
            return dict(parsed)
        else:
            _nlog("Python fallback: empty (IP blocked or JS-only)")
            with _naver_lock:
                _naver_error      = "no data (IP blocked or JS-only)"
                _naver_error_time = time.time()
                _naver_fetching   = False
            return {}
    except Exception as e:
        _nlog(f"Python fallback error: {e}")
        with _naver_lock:
            _naver_error      = str(e)
            _naver_error_time = time.time()
            _naver_fetching   = False
        return {}

# 서버 시작 시 자동 수집 (로컬 Windows + Node.js 있는 경우만)
# Lambda 환경에서는 동시 요청 → 429 유발, fetch_naver()의 on-demand 수집으로 대체
if _shutil_init.which("node"):
    try:
        start_naver_refresh()
        _nlog("server start - background fetch scheduled (node mode)")
    except Exception as _e:
        _nlog(f"server start error: {_e}")


# ─────────────────────────────────────────────
# 채널 병합 (스타일코드 기준)
# ─────────────────────────────────────────────
def merge_products(channels: dict) -> list:
    """channels = {"musinsa": {...}, "zigzag": {...}, ...}"""
    all_codes = {}
    for ch_name, ch_data in channels.items():
        for key, prod in ch_data.items():
            code = prod["styleCode"] or key
            if code not in all_codes:
                all_codes[code] = {"styleCode": code, "styleName": prod["styleName"], "channels": {}}
            # 스타일명 우선순위: 코드 있는 것
            if prod["styleCode"] and not all_codes[code]["styleCode"]:
                all_codes[code]["styleName"] = prod["styleName"]
            all_codes[code]["channels"][ch_name] = {
                "price":       prod["price"],
                "normalPrice": prod["normalPrice"],
                "saleRate":    prod["saleRate"],
                "isSoldOut":   prod["isSoldOut"],
                "link":        prod["link"],
            }

    result = []
    for code, item in all_codes.items():
        chs = item["channels"]
        active_prices = [v["price"] for v in chs.values() if not v["isSoldOut"] and v["price"] > 0]
        item["lowestPrice"]   = min(active_prices) if active_prices else 0
        item["lowestChannel"] = next(
            (k for k, v in chs.items() if v["price"] == item["lowestPrice"] and not v["isSoldOut"]),
            ""
        ) if active_prices else ""
        # 자사몰 가격이 등록되면 hasAlert 계산에 사용; 지금은 placeholder
        official = chs.get("official", {}).get("price", 0)
        item["officialPrice"] = official
        item["hasAlert"] = official > 0 and item["lowestPrice"] < official
        # 시즌: 스타일코드 5~6번째 자리 (0-index [4:6])
        # 유효성 검증: 반드시 대문자 + 숫자/대문자 형태여야 함 (e.g. G1, G2, GA)
        # 스타일코드 없는 상품의 숫자 키(e.g. "2511187075") → "18" 같은 무효값 방지
        _raw_season = code[4:6].upper() if len(code) >= 6 else ""
        item["season"] = _raw_season if VALID_SEASON_RE.match(_raw_season) else ""
        result.append(item)

    result.sort(key=lambda x: (x["styleCode"] or "zzz"))
    return result


# ─────────────────────────────────────────────
# 프로모션 계획표 (구글시트 5개 채널 탭)
#   각 탭 = 그 채널이 "할인하기로 의도된" 스타일 목록 + 기간
#   대시보드는 이 계획과 실제 가격을 대조해 위반을 탐지
# ─────────────────────────────────────────────
_PROMO_SHEET_ID = "1wm8HPxj4SH8Fnvp9IDCLwZ2HMB44Phm6dDrgalH5K-0"
# 채널 id → 구글시트 탭 이름
_PROMO_TABS = {
    "official": "자사몰",
    "musinsa":  "무신사",
    "zigzag":   "지그재그",
    "eland":    "이랜드몰",
    "naver":    "네이버",
}
# 한글 채널명 → 채널 id (자사몰 '할인허용채널' 파싱용)
_PROMO_CH_ALIAS = {
    "자사몰": "official", "공홈": "official", "official": "official",
    "무신사": "musinsa",  "musinsa": "musinsa",
    "지그재그": "zigzag", "지그제그": "zigzag", "zigzag": "zigzag",
    "이랜드몰": "eland",  "이랜드": "eland",   "eland": "eland",
    "네이버": "naver",    "naver": "naver",
}
_PROMO_ALL_CH = ["official", "musinsa", "zigzag", "eland", "naver"]
_PROMO_PERIOD_TAB = "기간할인 적용리스트"   # 전채널 동일 적용 마스터 리스트

_promo_cache: dict = {}
_promo_cache_time: float = 0.0
_promo_error: str = ""
_promo_lock = threading.Lock()
_PROMO_TTL = 300   # 5분 캐시


def _promo_norm_date(s: str) -> str:
    """날짜 문자열 정규화 → YYYY-MM-DD (빈값/파싱불가 → '')"""
    s = (s or "").strip()
    if not s:
        return ""
    # 2026-06-01 / 2026.06.01 / 2026/6/1 모두 허용
    m = re.match(r"(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})", s)
    if m:
        y, mo, d = m.groups()
        return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"
    return ""


def _parse_ch_list(raw: str) -> list:
    """'전채널' / '무신사,지그재그' 같은 셀 → 채널 id 리스트"""
    raw = (raw or "").strip()
    if not raw:
        return []
    if "전채널" in raw or "전체" in raw:
        return list(_PROMO_ALL_CH)
    res = []
    for t in re.split(r"[,/·\s]+", raw):
        cid = _PROMO_CH_ALIAS.get(t.strip())
        if cid and cid not in res:
            res.append(cid)
    return res


def _parse_promo_csv(text: str, channel: str, is_period: bool = False) -> dict:
    """탭 CSV → {styleCode: {start, end, name, allow, ...}}
       is_period=True : 기간할인 적용리스트 (반영 채널/중복 외부채널 파싱)"""
    import csv as _csv, io as _io
    rows = list(_csv.reader(_io.StringIO(text)))
    if not rows:
        return {}
    header = [h.strip() for h in rows[0]]
    # 열 인덱스 매핑 (헤더 이름 기반, 순서 바뀌어도 동작)
    def col(*names):
        for nm in names:
            if nm in header:
                return header.index(nm)
        return -1
    i_code  = col("스타일코드")
    i_name  = col("스타일명")
    i_start = col("시작일")
    i_end   = col("종료일")
    i_allow = col("할인허용채널")   # 자사몰 탭 전용 (없으면 -1)
    i_promo = col("프로모션명", "프로모션", "행사명", "비고(프로모션)", "비고")   # 없으면 -1
    i_norm  = col("정상가")
    i_rate  = col("할인율")
    i_disc  = col("할인가")
    i_coup  = col("쿠폰할인", "쿠폰")
    i_final = col("최종할인가(예측)", "최종할인가", "최종가")
    i_apply = col("반영 채널", "반영채널")           # 기간할인 리스트 전용
    i_extdup = col("중복 외부채널", "중복외부채널")   # 참고용 메모

    def _num(idx):
        """셀 → 정수 (콤마/원/% 제거). 비정상이면 0"""
        if idx < 0 or idx >= len(row):
            return 0
        s = re.sub(r"[^\d.]", "", row[idx] or "")
        try:
            return int(float(s)) if s else 0
        except Exception:
            return 0

    def _cell(idx):
        return (row[idx].strip() if 0 <= idx < len(row) else "")

    def _planned(normal, rate, sale, coupon_raw, final_given):
        """계획 최종가·최종할인율 계산
           정상가 → (할인율 or 할인가) → 쿠폰(%/원) 순차 반영 = 프로모션 가격"""
        if final_given > 0:
            final = final_given
        else:
            base = sale if sale > 0 else (round(normal * (1 - rate / 100)) if rate > 0 else normal)
            cs = (coupon_raw or "").strip()
            cnum = re.sub(r"[^\d.]", "", cs)
            cval = float(cnum) if cnum else 0
            if cval > 0:
                if "%" in cs:
                    base = round(base * (1 - cval / 100))
                else:
                    base = base - int(cval)
            final = base
        if normal > 0 and 0 < final < normal:
            prate = round((1 - final / normal) * 100)
        else:
            prate = 0
        return int(final), prate

    out: dict = {}
    for row in rows[1:]:
        if i_code < 0 or i_code >= len(row):
            continue
        code = (row[i_code] or "").strip().upper()
        if not code:
            continue
        start = _promo_norm_date(row[i_start]) if 0 <= i_start < len(row) else ""
        end   = _promo_norm_date(row[i_end])   if 0 <= i_end   < len(row) else ""
        name  = (row[i_name].strip() if 0 <= i_name < len(row) else "")
        promo_name = (row[i_promo].strip() if 0 <= i_promo < len(row) else "")
        # 할인허용채널 파싱 (자사몰 탭) — 기본 자기 채널
        allow = _parse_ch_list(_cell(i_allow)) or [channel]
        # 반영 채널 (기간할인 리스트) — 비우면 전채널
        apply = _parse_ch_list(_cell(i_apply))
        if is_period and not apply:
            apply = list(_PROMO_ALL_CH)
        _normal = _num(i_norm)
        _rate   = _num(i_rate)
        _sale   = _num(i_disc)
        _final, _prate = _planned(_normal, _rate, _sale, _cell(i_coup), _num(i_final))
        out[code] = {"start": start, "end": end, "name": name,
                     "promo": promo_name, "allow": allow,
                     "apply": apply,                 # 반영 채널 (기간할인)
                     "extDup": _cell(i_extdup),      # 중복 외부채널 메모
                     "normalPrice": _normal,
                     "rate": _rate,
                     "salePrice": _sale,
                     "plannedPrice": _final,    # 쿠폰까지 반영한 최종 프로모션가
                     "plannedRate":  _prate}    # 최종 할인율(%)
    return out


def _fetch_promotions(force: bool = False) -> dict:
    """구글시트 5개 탭을 읽어 채널별 프로모션 맵 반환 (5분 캐시)"""
    global _promo_cache, _promo_cache_time, _promo_error
    now = time.time()
    with _promo_lock:
        if not force and _promo_cache and (now - _promo_cache_time) < _PROMO_TTL:
            return _promo_cache

    result: dict = {}
    errors = []
    for ch, tab in _PROMO_TABS.items():
        try:
            # headers=1 : 전부 텍스트 열일 때 gviz가 헤더 행을 여러 줄로
            # 잘못 합치는 문제 방지 (헤더를 정확히 1행으로 강제)
            url = (
                f"https://docs.google.com/spreadsheets/d/{_PROMO_SHEET_ID}"
                f"/gviz/tq?tqx=out:csv&headers=1&sheet={urllib.parse.quote(tab)}"
            )
            req = urllib.request.Request(url, headers={"User-Agent": "spao-monitor/1.0"})
            with urllib.request.urlopen(req, timeout=10) as r:
                text = r.read().decode("utf-8")
            result[ch] = _parse_promo_csv(text, ch)
        except Exception as e:
            result[ch] = {}
            errors.append(f"{tab}:{e}")

    # 기간할인 적용리스트 (전채널 동일 적용)
    try:
        url = (
            f"https://docs.google.com/spreadsheets/d/{_PROMO_SHEET_ID}"
            f"/gviz/tq?tqx=out:csv&headers=1&sheet={urllib.parse.quote(_PROMO_PERIOD_TAB)}"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "spao-monitor/1.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            text = r.read().decode("utf-8")
        result["_period"] = _parse_promo_csv(text, "_period", is_period=True)
    except Exception as e:
        result["_period"] = {}
        errors.append(f"{_PROMO_PERIOD_TAB}:{e}")

    with _promo_lock:
        # 일부라도 읽혔으면 갱신 (전부 실패면 기존 캐시 유지)
        if any(result.values()) or not _promo_cache:
            _promo_cache = result
            _promo_cache_time = now
        _promo_error = "; ".join(errors)
        return _promo_cache


# ─────────────────────────────────────────────
# 라우트
# ─────────────────────────────────────────────
@app.route("/")
def index():
    return render_template_string(open(__file__.replace("app.py", "index.html"), encoding="utf-8").read())


@app.route("/api/promotions")
def api_promotions():
    """프로모션 계획표 (구글시트) — 채널별 {styleCode: {start,end,name,allow}}"""
    force = request.args.get("refresh") == "1"
    data = _fetch_promotions(force=force)
    channels = {k: v for k, v in data.items() if k != "_period"}
    return jsonify({
        "channels":   channels,
        "periodList": data.get("_period", {}),
        "lastFetch":  _promo_cache_time,
        "error":      _promo_error,
        "sheetUrl":   f"https://docs.google.com/spreadsheets/d/{_PROMO_SHEET_ID}/edit",
    })


@app.route("/api/products")
def api_products():
    musinsa  = fetch_musinsa()
    zigzag   = fetch_zigzag()
    official = fetch_spao_official()
    eland    = fetch_eland()
    naver    = fetch_naver()
    merged   = merge_products({
        "official": official,
        "musinsa":  musinsa,
        "zigzag":   zigzag,
        "eland":    eland,
        "naver":    naver,
    })
    return jsonify(merged)


@app.route("/api/channels")
def api_channels():
    return jsonify([
        {"id": "official", "name": "자사몰",   "color": "#38bdf8", "url": "https://www.spao.com"},
        {"id": "musinsa",  "name": "무신사",   "color": "#94a3b8", "url": "https://www.musinsa.com/brand/spao"},
        {"id": "zigzag",   "name": "지그재그",  "color": "#ff4081", "url": "https://zigzag.kr/cq-3lzn4zqy/category/0"},
        {"id": "eland",    "name": "이랜드몰",  "color": "#fdba74", "url": "https://spao.elandmall.co.kr/h/main"},
        {"id": "naver",    "name": "네이버",    "color": "#03C75A", "url": "https://brand.naver.com/spao"},
    ])


@app.route("/api/naver-status")
def api_naver_status():
    """네이버 캐시 상태 - UI 폴링용"""
    with _naver_lock:
        return jsonify({
            "fetching":   _naver_fetching,
            "items":      len(_naver_cache),
            "lastFetch":  _naver_cache_time,
            "error":      _naver_error,
        })


@app.route("/api/naver-refresh")
def api_naver_refresh():
    """수동 갱신 트리거"""
    started = start_naver_refresh()
    return jsonify({"started": started})


@app.route("/api/naver-debug")
def api_naver_debug():
    """진단 정보 - 실패 원인 파악용"""
    import shutil
    node_bin = _find_node()
    return jsonify({
        "node_bin":    node_bin,
        "node_exists": os.path.isfile(node_bin) if os.path.isabs(node_bin) else bool(shutil.which("node")),
        "js_path":     _FETCH_NAVER_JS,
        "js_exists":   os.path.isfile(_FETCH_NAVER_JS),
        "cache_items": len(_naver_cache),
        "is_fetching": _naver_fetching,
        "last_error":  _naver_error,
        "cwd":              os.getcwd(),
        "env_PATH":         os.environ.get("PATH", "")[:300],
        "env_LOCALAPPDATA": os.environ.get("LOCALAPPDATA", "NOT_SET"),
        "env_APPDATA":      os.environ.get("APPDATA", "NOT_SET"),
        "env_USERPROFILE":  os.environ.get("USERPROFILE", "NOT_SET"),
    })


@app.route("/api/naver-env-test")
def api_naver_env_test():
    """Flask 환경의 env 변수 + fs.existsSync 결과 확인용"""
    node_bin = _find_node()
    js_cwd   = os.path.dirname(_FETCH_NAVER_JS)
    exe_path = r"C:\Users\han_jiwoong\AppData\Local\ms-playwright\chromium_headless_shell-1223\chrome-headless-shell-win64\chrome-headless-shell.exe"
    js_dir      = js_cwd   # C:\Users\han_jiwoong\Desktop\agent
    project_exe = os.path.join(js_dir, "browsers", "chromium_headless_shell-1223",
                               "chrome-headless-shell-win64", "chrome-headless-shell.exe")
    test_code = (
        f"const fs=require('fs');"
        f"const p={json.dumps(exe_path)};"
        f"const p2={json.dumps(project_exe)};"
        f"console.log(JSON.stringify({{"
        f"  existsSync_appdata: fs.existsSync(p),"
        f"  existsSync_project: fs.existsSync(p2),"
        f"  canReadDir_appdata: (()=>{{try{{fs.readdirSync({json.dumps(os.path.dirname(exe_path))});return true;}}catch(e){{return e.message;}}}})(),"
        f"  canReadDir_project: (()=>{{try{{fs.readdirSync({json.dumps(js_dir)});return true;}}catch(e){{return e.message;}}}})(),"
        f"  LOCALAPPDATA: process.env.LOCALAPPDATA,"
        f"  PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH||null"
        f"}}))"
    )
    try:
        result = subprocess.run(
            [node_bin, "-e", test_code],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL, timeout=10,
            cwd=js_cwd,
            env=_make_node_env(),
        )
        out = result.stdout.decode("utf-8", errors="replace").strip()
        err = result.stderr.decode("utf-8", errors="replace")
        return jsonify({"output": out, "stderr": err, "rc": result.returncode,
                        "py_LOCALAPPDATA": os.environ.get("LOCALAPPDATA","NOT_SET"),
                        "py_PLAYWRIGHT_BROWSERS_PATH": os.environ.get("PLAYWRIGHT_BROWSERS_PATH","NOT_SET")})
    except Exception as e:
        return jsonify({"error": str(e)})


@app.route("/api/naver-price-debug")
def api_naver_price_debug():
    """네이버 상품 가격 필드 확인 - fetch_naver.js 의 stderr 로그 포함"""
    node_bin = _find_node()
    js_cwd   = os.path.dirname(_FETCH_NAVER_JS)
    # 가격 구조 확인용 미니 스크립트
    mini_js = r"""
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
function findExe() {
  const b = process.env.PLAYWRIGHT_BROWSERS_PATH || '';
  if (!b) return null;
  try {
    for (const d of fs.readdirSync(b)) {
      if (!d.startsWith('chromium_headless_shell-')) continue;
      const e = path.join(b, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
      if (fs.existsSync(e)) return e;
    }
  } catch(e) {}
  return null;
}
(async () => {
  const exe = findExe();
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}) });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' });
  const page = await ctx.newPage();

  // 여성 카테고리 (실제 상품 많음)
  await page.goto('https://brand.naver.com/spao/category/b6a9188b831343bf8c3cb2133b668ad2', { waitUntil: 'networkidle', timeout: 30000 });

  const result = await page.evaluate(() => {
    const state = window.__PRELOADED_STATE__;
    if (!state) return { error: 'no state', stateKeys: null };

    // state 최상위 키 확인
    const stateKeys = Object.keys(state);

    // 모든 경로에서 상품 수집
    const cp      = state?.categoryProducts?.simpleProducts || [];
    const bsNew   = state?.bsProductCollection?.A?.newProducts || [];
    const bsBest  = state?.bsProductCollection?.A?.bestProducts || [];
    const all = [...cp, ...bsNew, ...bsBest];

    if (all.length === 0) {
      return {
        error: 'no products',
        stateKeys,
        cpLen: cp.length, bsNewLen: bsNew.length, bsBestLen: bsBest.length,
        categoryProductsKeys: Object.keys(state?.categoryProducts || {}),
      };
    }

    // 첫 번째 상품 전체 필드 덤프
    const p = all[0];
    return {
      stateKeys,
      productCount: all.length,
      firstProductAllFields: p,
    };
  });

  await browser.close();
  process.stdout.write(JSON.stringify(result));
})().catch(e => { process.stderr.write('Fatal:' + e.message); process.stdout.write(JSON.stringify({error: e.message})); });
"""
    tmp_js = os.path.join(js_cwd, "_price_debug_tmp.js")
    try:
        with open(tmp_js, "w", encoding="utf-8") as f:
            f.write(mini_js)
        result = subprocess.run(
            [node_bin, tmp_js],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL, timeout=60,
            cwd=js_cwd, env=_make_node_env(),
        )
        out = result.stdout.decode("utf-8", errors="replace").strip()
        err = result.stderr.decode("utf-8", errors="replace")
        return jsonify({"data": json.loads(out) if out and out != "[]" else [], "stderr": err})
    except Exception as e:
        return jsonify({"error": str(e)})
    finally:
        try:
            os.remove(tmp_js)
        except Exception:
            pass


@app.route("/api/spao-status")
def api_spao_status():
    """자사몰 캐시 상태 — UI 폴링용"""
    with _spao_lock:
        return jsonify({
            "fetching":    _spao_fetching,
            "items":       len(_spao_cache),
            "lastFetch":   _spao_cache_time,
            "error":       _spao_error,
            "last_stderr": _spao_last_stderr[-800:],  # 마지막 로그 800자
        })


@app.route("/api/spao-refresh")
def api_spao_refresh():
    """자사몰 수동 갱신"""
    started = start_spao_refresh()
    return jsonify({"started": started})


@app.route("/api/spao-debug")
def api_spao_debug():
    """
    자사몰(spao.com) HTML 구조 심층 진단.
    /c/ctg 가 실제로 어떤 HTML 을 반환하는지 분석해
    상품 데이터 추출 방법을 결정한다.
    """
    # ─ /c/ctg HTML 전체 분석 ─
    target_urls = [
        "https://www.spao.com/c/ctg",
        "https://www.spao.com/h/women",
    ]

    result = {}
    for url in target_urls:
        entry = {"url": url, "status": None, "html_len": 0,
                 "error": None, "analysis": {}}
        try:
            req = urllib.request.Request(url, headers=SPAO_HEADERS)
            with urllib.request.urlopen(req, timeout=20) as resp:
                html = resp.read().decode("utf-8", errors="replace")
                entry["status"] = resp.getcode()
            entry["html_len"] = len(html)

            # ── 패턴 탐색 ──
            a = entry["analysis"]

            # 1) ELAND_ITEM_RE 매칭 (현재 방식)
            eland_matches = ELAND_ITEM_RE.findall(html)
            a["eland_item_re_matches"] = len(eland_matches)
            if eland_matches:
                a["eland_sample"] = [
                    {"no": m[0], "sell": m[1], "sale": m[2], "name": unescape(m[3][:50])}
                    for m in eland_matches[:3]
                ]

            # 2) data-item-no 존재 여부 및 주변 50자 샘플
            idx = html.find('data-item-no="')
            a["data_item_no_found"] = idx >= 0
            if idx >= 0:
                a["data_item_no_context"] = html[max(0, idx-10):idx+200]

            # 3) goodsNo / productNo / itemNo 등 다른 상품번호 패턴
            for pat_name, pat in [
                ("goodsNo",   r'"goodsNo"\s*:\s*"(\d+)"'),
                ("productNo", r'"productNo"\s*:\s*"(\d+)"'),
                ("itemNo",    r'itemNo=(\d+)'),
                ("data-goods-no", r'data-goods-no="(\d+)"'),
            ]:
                m = re.search(pat, html)
                a[pat_name] = m.group(1) if m else None

            # 4) 가격 관련 패턴
            for pat_name, pat in [
                ("sellPrice",  r'sellPrice["\s:=]+(\d{4,6})'),
                ("salePrice",  r'salePrice["\s:=]+(\d{4,6})'),
                ("normalPrice",r'normalPrice["\s:=]+(\d{4,6})'),
                ("data-price", r'data-price="(\d{4,6})"'),
            ]:
                m = re.search(pat, html)
                a[pat_name] = m.group(1) if m else None

            # 5) JSON embedded (window.__STATE__ 등)
            for js_key in ["__PRELOADED_STATE__", "__INITIAL_STATE__", "window.state"]:
                a[f"has_{js_key.replace('.','_')}"] = js_key in html

            # 6) dispCategoryNo 파라미터 탐색
            cat_ids_found = list(dict.fromkeys(_SPAO_CAT_URL_RE.findall(html)))
            a["cat_ids_found"] = cat_ids_found[:10]

            # 7) 최초 200자 HTML 스니펫 (구조 파악)
            a["html_head_200"] = html[:200]

            # 8) data-item-no 이후 1200자 (상품 HTML 구조 파악)
            if idx >= 0:
                a["item_block_sample"] = html[idx:idx+1200]

        except Exception as e:
            entry["error"] = str(e)

        key = url.split("/")[-1] or "root"
        result[key] = entry

    return jsonify(result)


@app.route("/api/naver-run-test")
def api_naver_run_test():
    """
    node fetch_naver.js 를 직접 실행해 stdout/stderr 전체를 반환.
    root cause 파악용 - fetch_naver.js의 Fatal 에러 내용을 확인할 수 있음.
    """
    node_bin = _find_node()
    js_cwd   = os.path.dirname(_FETCH_NAVER_JS)
    try:
        result = subprocess.run(
            [node_bin, _FETCH_NAVER_JS],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            timeout=300,
            cwd=js_cwd,
            env=_make_node_env(),
        )
        stdout_raw = result.stdout.decode("utf-8", errors="replace").strip()
        stderr_raw = result.stderr.decode("utf-8", errors="replace")

        # Fatal 에러 여부 확인 (stdout == "[]" 이지만 stderr에 에러 있음)
        is_fatal = stdout_raw in ("", "[]") and bool(stderr_raw.strip())

        return jsonify({
            "returncode":   result.returncode,
            "stdout_len":   len(stdout_raw),
            "stdout_start": stdout_raw[:200],
            "stderr_full":  stderr_raw,          # 전체 stderr (Fatal 메시지 포함)
            "is_fatal":     is_fatal,
            "node_bin":     node_bin,
            "js_cwd":       js_cwd,
        })
    except subprocess.TimeoutExpired:
        return jsonify({"error": "timeout (300s)"})
    except Exception as e:
        return jsonify({"error": str(e)})


@app.route("/api/test-connections")
def api_test_connections():
    """각 데이터 소스 HTTP 연결 직접 테스트 — Lambda IP 차단 여부 확인용"""
    out = {}

    def _try(name, fn):
        try:
            out[name] = fn()
        except Exception as e:
            out[name] = {"ok": False, "error": f"{type(e).__name__}: {e}"[:300]}

    # SPAO
    def _spao():
        url = "https://www.spao.com/v1/search/leaf/cate/item/api?dispMctgNo=2605000006&page=1&pageSize=60"
        req = urllib.request.Request(url, headers=_SPAO_API_HDR)
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read().decode("utf-8", errors="replace")
        data = json.loads(raw)
        lst = data.get("data", {}).get("srchOutCome", {}).get("item", {}).get("list", [])
        return {
            "ok": True, "status": r.getcode(), "items": len(lst),
            "top_keys": list(data.keys()),
            "raw_preview": raw[:800],
        }
    _try("spao", _spao)

    # Musinsa
    def _musinsa():
        url = "https://api.musinsa.com/api2/dp/v2/plp/goods?brand=spao&sortCode=POPULAR&size=5&caller=FLAGSHIP&gf=A&page=1"
        req = urllib.request.Request(url, headers=MUSINSA_HEADERS)
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode("utf-8"))
        lst = data.get("data", {}).get("list", [])
        return {"ok": True, "status": r.getcode(), "items": len(lst)}
    _try("musinsa", _musinsa)

    # Zigzag (SSR __nextDataReq 방식 — GraphQL API 우회)
    def _zigzag():
        url = f"{_ZIGZAG_BASE}/0?__nextDataReq=1"
        req = urllib.request.Request(url, headers=_ZIGZAG_HDR)
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read().decode("utf-8", errors="replace")
        data = json.loads(raw)
        try:
            pages = data["pageProps"]["dehydrated_state"]["queries"][0]["state"]["data"]["pages"]
            items = [i for p in pages for i in p.get("item_list", []) if i.get("type") == "PRODUCT"]
        except (KeyError, IndexError, TypeError):
            items = []
        return {
            "ok": True, "status": r.getcode(), "items": len(items),
            "top_keys": list(data.keys()),
            "raw_preview": raw[:800],
        }
    _try("zigzag", _zigzag)

    # Eland
    def _eland():
        url = "https://spao.elandmall.co.kr/c/ctg?dispCategoryNo=1711333016&from=0"
        req = urllib.request.Request(url, headers=ELAND_HEADERS)
        with urllib.request.urlopen(req, timeout=10) as r:
            html = r.read().decode("utf-8", errors="replace")
        items = ELAND_ITEM_RE.findall(html)
        return {"ok": True, "status": r.getcode(), "items": len(items)}
    _try("eland", _eland)

    # Naver
    def _naver():
        url = "https://brand.naver.com/spao/category/ALL"
        req = urllib.request.Request(url, headers=_NAVER_HDR_PY)
        with urllib.request.urlopen(req, timeout=10) as r:
            html = r.read().decode("utf-8", errors="replace")
        has_state = "__PRELOADED_STATE__" in html
        state = _extract_naver_state(html)
        return {"ok": True, "status": r.getcode(), "html_len": len(html),
                "has_preloaded_state": has_state, "state_keys": list(state.keys())[:10]}
    _try("naver", _naver)

    return jsonify(out)


# ─────────────────────────────────────────────
# 로컬 PC → 클라우드 데이터 push 엔드포인트
# 지그재그/네이버처럼 Lambda IP 차단된 채널을
# 로컬 PC에서 수집해 push_local.py 로 전송
# ─────────────────────────────────────────────
_PUSH_SECRET = os.environ.get("PUSH_SECRET", "spao-push-key")

@app.route("/api/push-channel", methods=["POST"])
def api_push_channel():
    """
    로컬 PC에서 채널 데이터를 직접 전송.
    body: { "secret": "...", "channel": "zigzag"|"naver", "products": {...} }
    """
    global _zigzag_cache, _zigzag_cache_time
    global _naver_cache, _naver_cache_time, _naver_error

    try:
        data = request.get_json(force=True, silent=True) or {}
    except Exception:
        return jsonify({"ok": False, "error": "invalid JSON"}), 400

    if data.get("secret") != _PUSH_SECRET:
        return jsonify({"ok": False, "error": "unauthorized"}), 401

    channel  = data.get("channel", "")
    products = data.get("products", {})

    if not channel or not isinstance(products, dict):
        return jsonify({"ok": False, "error": "channel/products missing"}), 400

    if channel == "zigzag":
        with _zigzag_lock:
            _zigzag_cache      = products
            _zigzag_cache_time = time.time()
        _disk_save("zigzag.json", products)   # 디스크 저장 → 재시작 후에도 유지
        return jsonify({"ok": True, "channel": "zigzag", "items": len(products)})

    elif channel == "naver":
        with _naver_lock:
            _naver_cache      = products
            _naver_cache_time = time.time()
            _naver_error      = ""
        _disk_save("naver.json", products)    # 디스크 저장
        return jsonify({"ok": True, "channel": "naver", "items": len(products)})

    else:
        return jsonify({"ok": False, "error": f"unknown channel: {channel}"}), 400


@app.route("/api/push-status")
def api_push_status():
    """push 캐시 현황 확인"""
    with _zigzag_lock:
        zz_items = len(_zigzag_cache)
        zz_time  = _zigzag_cache_time
    with _naver_lock:
        nv_items = len(_naver_cache)
        nv_time  = _naver_cache_time
    return jsonify({
        "zigzag": {"items": zz_items, "lastPush": zz_time},
        "naver":  {"items": nv_items, "lastPush": nv_time},
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"SPAO 모니터링 서버: http://localhost:{port}")
    app.run(debug=False, host="0.0.0.0", port=port)
