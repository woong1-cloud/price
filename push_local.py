"""
push_local.py — 로컬 PC에서 실행하는 데이터 push 스크립트
===============================================================
Lambda IP 차단으로 클라우드에서 수집 불가한 채널(지그재그, 네이버)을
로컬 PC에서 수집해 클라우드 서버로 전송합니다.

사용법:
    python push_local.py              # 지그재그 + 네이버 모두 push
    python push_local.py zigzag       # 지그재그만
    python push_local.py naver        # 네이버만

자동화 (10분마다):
    Windows 작업 스케줄러에 등록하거나
    while True: python push_local.py && sleep 600
"""

import sys
import os
import json
import time
import re
import urllib.request
import threading

# ── 설정 ──────────────────────────────────────────────
# 환경변수 우선, 없으면 기본값 사용
# GitHub Actions: Settings → Secrets → CLOUD_URL, PUSH_SECRET 등록
CLOUD_URL   = os.environ.get("CLOUD_URL",   "https://spao-price.noavibe.app/api/push-channel")
PUSH_SECRET = os.environ.get("PUSH_SECRET", "spao-push-key")
TIMEOUT     = 20                    # HTTP 타임아웃(초)
# ─────────────────────────────────────────────────────

STYLE_CODE_RE = re.compile(r'[_\s]([Ss][Pp][A-Za-z0-9]{8})$')
ELAND_CODE_RE = re.compile(r'[_\s)]([Ss][Pp][A-Za-z0-9]{8})')


def _extract_code(name: str):
    m = STYLE_CODE_RE.search(name)
    if m:
        return m.group(1).upper(), name[:m.start()].strip()
    m = ELAND_CODE_RE.search(name)
    if m:
        code = m.group(1).upper()
        sep  = m.group(0)[0]
        style = name[:m.start()+1].strip() if sep == ")" else name[:m.start()].strip().rstrip("_").strip()
        return code, style
    return "", name


# ─────────────────────────────────────────────
# 지그재그 수집
# 1순위: GraphQL API (로컬 한국 IP → 전체 488개 수집 가능)
# 2순위: SSR __nextDataReq (GitHub Actions Azure IP → ~267개)
# ─────────────────────────────────────────────
_ZIGZAG_API_URL = "https://api.zigzag.kr/api/2/graphql"
_ZIGZAG_BASE = "https://zigzag.kr/cq-3lzn4zqy/category"
_ZIGZAG_CATS = [0, 474, 2757, 436, 547, 560, 507, 795, 845, 623, 689, 1567]
_ZIGZAG_HDR = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://zigzag.kr/",
    "Accept-Language": "ko-KR,ko;q=0.9",
}
_ZIGZAG_API_HDR = {
    **_ZIGZAG_HDR,
    "Content-Type": "application/json",
    "Origin": "https://zigzag.kr",
    "x-app-type": "FASHION_STORE",
}
_ZIGZAG_QUERY = """
fragment Prod on ShopUxProductCardItem {
  product { catalog_product_id url name price discount_rate sales_status }
  final_price
}
query GetCategoryList($shop_id:ID! $category_id:ID $after_id:ID) {
  shop_ux_component_list(shop_id:$shop_id category_id:$category_id after_id:$after_id) {
    after_id has_next_page
    item_list { type ...Prod }
  }
}
"""

def _zigzag_item_to_product(item: dict) -> tuple:
    """GraphQL item → (pid, product_dict) 반환"""
    prod         = item.get("product", {})
    pid          = str(prod.get("catalog_product_id", ""))
    name         = prod.get("name", "")
    code, style  = _extract_code(name)
    normal_price = prod.get("price", 0)
    final_price  = item.get("final_price") or normal_price
    disc_rate    = prod.get("discount_rate", 0)
    sold_out     = prod.get("sales_status", "") != "ON_SALE"
    link         = prod.get("url") or f"https://store.zigzag.kr/app/catalog/products/{pid}"
    return pid, {
        "styleCode":   code,
        "styleName":   style,
        "price":       final_price,
        "normalPrice": normal_price,
        "saleRate":    disc_rate,
        "isSoldOut":   sold_out,
        "link":        link,
    }

def _collect_zigzag_graphql() -> dict:
    """GraphQL API 방식 — 로컬 한국 IP에서만 작동 (전체 488개 수집)"""
    products: dict = {}
    seen_ids: set  = set()
    after_id       = None

    while True:
        variables = {
            "shop_id": "25938", "category_id": "0",
            "after_id": after_id,
        }
        payload = json.dumps({"query": _ZIGZAG_QUERY, "variables": variables}).encode()
        req = urllib.request.Request(_ZIGZAG_API_URL, data=payload,
                                     headers=_ZIGZAG_API_HDR, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"  [zigzag-gql] 오류: {e}")
            return {}   # 실패 → SSR 방식으로 전환

        comp = data.get("data", {}).get("shop_ux_component_list", {})
        # GraphQL이 차단되면 data가 {} 또는 errors 반환
        if not comp or "errors" in data:
            print(f"  [zigzag-gql] 차단됨 (GraphQL 사용 불가) → SSR 방식으로 전환")
            return {}

        for item in comp.get("item_list", []):
            if item.get("type") != "PRODUCT":
                continue
            pid, prod = _zigzag_item_to_product(item)
            if pid and pid not in seen_ids:
                seen_ids.add(pid)
                key = prod["styleCode"] or prod["styleName"]
                products.setdefault(key, prod)

        has_next = comp.get("has_next_page", False)
        after_id = comp.get("after_id")
        print(f"  [zigzag-gql] 누적 {len(products)}개 (has_next={has_next})")
        if not has_next or not after_id:
            break
        time.sleep(0.3)

    return products

def _collect_zigzag_ssr() -> dict:
    """SSR __nextDataReq 방식 — GitHub Actions / 클라우드 fallback (~267개)"""
    products: dict = {}
    seen_ids: set  = set()

    for cat_id in _ZIGZAG_CATS:
        url = f"{_ZIGZAG_BASE}/{cat_id}?__nextDataReq=1"
        req = urllib.request.Request(url, headers=_ZIGZAG_HDR)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"  [zigzag-ssr] cat {cat_id} 오류: {e}")
            continue

        try:
            pages = (data["pageProps"]["dehydrated_state"]["queries"][0]
                     ["state"]["data"]["pages"])
        except (KeyError, IndexError, TypeError):
            continue

        added = 0
        for page in pages:
            for item in page.get("item_list", []):
                if item.get("type") != "PRODUCT":
                    continue
                prod_data = item.get("product", {})
                pid = str(prod_data.get("catalog_product_id", ""))
                if not pid or pid in seen_ids:
                    continue
                seen_ids.add(pid)
                pid2, prod = _zigzag_item_to_product(item)
                key = prod["styleCode"] or prod["styleName"]
                if key not in products:
                    products[key] = prod
                    added += 1

        print(f"  [zigzag-ssr] cat {cat_id}: +{added}개 (누적 {len(products)})")
        time.sleep(0.3)

    return products

def collect_zigzag() -> dict:
    """GraphQL 우선(로컬 전체 수집), 차단 시 SSR fallback"""
    print("  [zigzag] GraphQL 방식 시도 (한국 IP → 전체 수집)...")
    products = _collect_zigzag_graphql()
    if products:
        print(f"  [zigzag] GraphQL 완료: {len(products)}개")
        return products
    print("  [zigzag] SSR 방식으로 전환...")
    products = _collect_zigzag_ssr()
    print(f"  [zigzag] SSR 완료: {len(products)}개")
    return products



# ─────────────────────────────────────────────
# 네이버 수집 (Playwright JS 또는 Python SSR)
# ─────────────────────────────────────────────
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_FETCH_NAVER_JS = os.path.join(_SCRIPT_DIR, "fetch_naver.js")

_NAVER_CATS = [
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
_NAVER_HDR = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9",
}


def _parse_naver_raw(raw: list) -> dict:
    import re as _re
    products: dict = {}
    for item in raw:
        name = item.get("name", "")
        code, style = _extract_code(name)
        status   = item.get("productStatusType", "SALE")
        sold_out = status not in ("SALE", "ON_SALE")
        prod_no  = item.get("productNo", "")
        sale_p   = item.get("salePrice", 0)
        orig_p   = item.get("originalPrice", 0) or sale_p
        disc     = item.get("discountRate", 0)
        if not disc and orig_p > sale_p > 0:
            disc = round((1 - sale_p / orig_p) * 100)
        key = code or name
        if key not in products:
            products[key] = {
                "styleCode":   code,
                "styleName":   style,
                "price":       sale_p,
                "normalPrice": orig_p,
                "saleRate":    disc,
                "isSoldOut":   sold_out,
                "link":        f"https://brand.naver.com/spao/products/{prod_no}" if prod_no else "",
            }
    return products


def collect_naver_python() -> dict:
    """Python urllib으로 네이버 SSR HTML 파싱 (로컬에서는 차단 없음)"""
    import json as _json
    seen: dict = {}
    state_re   = re.compile(r'window\.__PRELOADED_STATE__\s*=\s*')

    for cat_id in _NAVER_CATS:
        url = f"https://brand.naver.com/spao/category/{cat_id}"
        req = urllib.request.Request(url, headers=_NAVER_HDR)
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                html = resp.read().decode("utf-8", errors="replace")
        except Exception as e:
            print(f"  [naver] {cat_id[:8]} 오류: {e}")
            continue

        m = state_re.search(html)
        if not m:
            print(f"  [naver] {cat_id[:8]}: __PRELOADED_STATE__ 없음")
            continue

        start = m.end()
        sub   = html[start:start + 20].lstrip()
        if sub.startswith("Object.freeze("):
            fi    = html.find("Object.freeze(", m.end())
            start = fi + len("Object.freeze(")
        elif sub.startswith("JSON.parse("):
            # JS 실행 필요 — Playwright 방식으로 넘어감
            print(f"  [naver] {cat_id[:8]}: minified JSON.parse — Playwright 필요")
            continue

        try:
            decoder = _json.JSONDecoder()
            state, _ = decoder.raw_decode(html, start)
        except Exception:
            print(f"  [naver] {cat_id[:8]}: JSON parse 실패")
            continue

        cp    = state.get("categoryProducts", {}).get("simpleProducts", [])
        bs_a  = state.get("bsProductCollection", {}).get("A", {})
        all_p = cp + bs_a.get("newProducts", []) + bs_a.get("bestProducts", []) + bs_a.get("bestReviewProducts", [])

        raw_list = []
        for p in all_p:
            prod_no = str(p.get("id") or p.get("productNo", ""))
            if not prod_no:
                continue
            orig_p = p.get("salePrice", 0)
            bv     = p.get("benefitsView") or {}
            promo  = bv.get("discountedSalePrice", 0)
            sale_p = promo if promo and promo < orig_p else orig_p
            raw_list.append({
                "productNo":         prod_no,
                "name":              p.get("name", ""),
                "salePrice":         sale_p,
                "originalPrice":     orig_p,
                "discountRate":      bv.get("discountedRatio", 0),
                "productStatusType": p.get("productStatusType") or "SALE",
            })

        new_cnt = sum(1 for p in raw_list if p["productNo"] not in seen)
        for p in raw_list:
            seen.setdefault(p["productNo"], p)
        print(f"  [naver] {cat_id[:8]}: {len(raw_list)}개 (신규 {new_cnt})")
        time.sleep(0.2)

    return _parse_naver_raw(list(seen.values()))


def collect_naver() -> dict:
    """네이버: fetch_naver.js (Playwright) 우선, 실패시 Python fallback"""
    import shutil, subprocess

    node = shutil.which("node")
    if node and os.path.isfile(_FETCH_NAVER_JS):
        print("  [naver] Playwright JS 방식 시도...")
        try:
            result = subprocess.run(
                [node, _FETCH_NAVER_JS],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL, timeout=300,
                cwd=_SCRIPT_DIR,
            )
            stdout = result.stdout.decode("utf-8", errors="replace").strip()
            if stdout and stdout != "[]":
                raw  = json.loads(stdout)
                prod = _parse_naver_raw(raw)
                print(f"  [naver] Playwright 완료: {len(prod)}개")
                return prod
        except Exception as e:
            print(f"  [naver] Playwright 실패: {e}")

    print("  [naver] Python HTML 파싱 방식 시도...")
    prod = collect_naver_python()
    print(f"  [naver] Python 완료: {len(prod)}개")
    return prod


# ─────────────────────────────────────────────
# 클라우드로 push
# ─────────────────────────────────────────────
def push_to_cloud(channel: str, products: dict) -> bool:
    payload = json.dumps({
        "secret":   PUSH_SECRET,
        "channel":  channel,
        "products": products,
    }).encode("utf-8")
    req = urllib.request.Request(
        CLOUD_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        print(f"  → 클라우드 push 성공: {result}")
        return True
    except Exception as e:
        print(f"  → 클라우드 push 실패: {e}")
        return False


# ─────────────────────────────────────────────
# 메인
# ─────────────────────────────────────────────
if __name__ == "__main__":
    targets = sys.argv[1:] or ["zigzag", "naver"]

    for target in targets:
        target = target.lower()
        print(f"\n{'='*40}")
        print(f"[{target}] 수집 시작...")
        t0 = time.time()

        if target == "zigzag":
            products = collect_zigzag()
        elif target == "naver":
            products = collect_naver()
        else:
            print(f"  알 수 없는 채널: {target} (zigzag 또는 naver)")
            continue

        elapsed = time.time() - t0
        print(f"[{target}] 수집 완료: {len(products)}개 ({elapsed:.1f}초)")

        if products:
            push_to_cloud(target, products)
        else:
            print(f"[{target}] 수집된 상품 없음 — push 생략")

    print("\n완료.")
