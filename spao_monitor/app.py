from flask import Flask, jsonify, render_template_string
import urllib.request
import urllib.error
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
# 지그재그
# ─────────────────────────────────────────────
ZIGZAG_URL = "https://api.zigzag.kr/api/2/graphql/GetCategoryDetailComponentList"
ZIGZAG_HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://zigzag.kr/",
}
ZIGZAG_QUERY = """
fragment Prod on ShopUxProductCardItem {
  product { catalog_product_id url name price discount_rate sales_status }
  final_price is_zpay_discount
}
query GetCategoryDetailComponentList(
  $shop_id: ID! $category_id: ID $after_id: ID
  $sorting_item_id: ID $check_button_item_ids: [ID] $sub_filter_id_list: [ID]
) {
  shop_ux_component_list(
    shop_id: $shop_id category_id: $category_id after_id: $after_id
    sorting_item_id: $sorting_item_id check_button_item_ids: $check_button_item_ids
    sub_filter_id_list: $sub_filter_id_list
  ) {
    after_id has_next_page
    item_list {
      type
      ...Prod
    }
  }
}
"""

def fetch_zigzag():
    products = {}
    after_id = None
    while True:
        variables = {
            "shop_id": "25938",
            "category_id": "0",
            "after_id": after_id,
            "check_button_item_ids": [],
            "sorting_item_id": None,
            "sub_filter_id_list": []
        }
        payload = json.dumps({"query": ZIGZAG_QUERY, "variables": variables}).encode("utf-8")
        req = urllib.request.Request(ZIGZAG_URL, data=payload, headers=ZIGZAG_HEADERS, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception:
            break

        comp_list = data.get("data", {}).get("shop_ux_component_list", {})
        items = comp_list.get("item_list", [])

        for item in items:
            if item.get("type") != "PRODUCT":
                continue
            prod = item.get("product", {})
            name = prod.get("name", "")
            m = STYLE_CODE_RE.search(name)
            code = m.group(1).upper() if m else ""
            style_name = name[:m.start()].strip() if m else name
            normal_price = prod.get("price", 0)
            final_price  = item.get("final_price") or normal_price
            disc_rate    = prod.get("discount_rate", 0)
            sold_out     = prod.get("sales_status", "") != "ON_SALE"
            pid = prod.get("catalog_product_id", "")
            link = prod.get("url") or f"https://store.zigzag.kr/app/catalog/products/{pid}"

            products[code or name] = {
                "styleCode":   code,
                "styleName":   style_name,
                "price":       final_price,
                "normalPrice": normal_price,
                "saleRate":    disc_rate,
                "isSoldOut":   sold_out,
                "link":        link,
            }

        has_next = comp_list.get("has_next_page", False)
        after_id = comp_list.get("after_id")
        if not has_next or not after_id:
            break
        time.sleep(0.25)
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

    for cat_id in ELAND_CATEGORIES:
        offset = 0
        while True:
            url = f"https://spao.elandmall.co.kr/c/ctg?dispCategoryNo={cat_id}&from={offset}"
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

            offset += 60
            if len(items) < 60:
                break
            time.sleep(0.3)

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
            outcome   = data.get("srchOutCome", {})
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

# 서버 시작 시 자동 수집
try:
    start_spao_refresh()
    _slog("server start - background fetch scheduled")
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
_naver_lock = threading.Lock()

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
    global _naver_cache, _naver_cache_time, _naver_error
    with _naver_lock:
        if _naver_cache:
            return dict(_naver_cache)
    # 캐시 없음 → Python fallback 시도
    _nlog("cache empty → Python fallback start")
    try:
        parsed = _fetch_naver_all_python()
        if parsed:
            with _naver_lock:
                _naver_cache      = parsed
                _naver_cache_time = time.time()
                _naver_error      = ""
            _nlog(f"Python fallback done: {len(parsed)}")
            return dict(parsed)
        else:
            _nlog("Python fallback: empty (JS rendering required or bot-blocked)")
            with _naver_lock:
                _naver_error = "Python fallback: no data"
            return {}
    except Exception as e:
        _nlog(f"Python fallback error: {e}")
        return {}

# 서버 시작 시 자동 수집
try:
    start_naver_refresh()
    _nlog("server start - background fetch scheduled")
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
# 라우트
# ─────────────────────────────────────────────
@app.route("/")
def index():
    return render_template_string(open(__file__.replace("app.py", "index.html"), encoding="utf-8").read())


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
        lst = data.get("srchOutCome", {}).get("item", {}).get("list", [])
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

    # Zigzag
    def _zigzag():
        vars_ = {"shop_id": "25938", "category_id": "0", "after_id": None,
                 "check_button_item_ids": [], "sorting_item_id": None, "sub_filter_id_list": []}
        payload = json.dumps({"query": ZIGZAG_QUERY, "variables": vars_}).encode("utf-8")
        req = urllib.request.Request(ZIGZAG_URL, data=payload, headers=ZIGZAG_HEADERS, method="POST")
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read().decode("utf-8", errors="replace")
        data = json.loads(raw)
        comp = data.get("data", {}).get("shop_ux_component_list", {})
        lst  = comp.get("item_list", [])
        return {
            "ok": True, "status": r.getcode(), "items": len(lst),
            "top_keys": list(data.keys()),
            "comp_keys": list(comp.keys()) if isinstance(comp, dict) else [],
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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"SPAO 모니터링 서버: http://localhost:{port}")
    app.run(debug=False, host="0.0.0.0", port=port)
