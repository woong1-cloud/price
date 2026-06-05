"""
naver_probe.py — 네이버 브랜드스토어 차단 기준 진단 (1차 무료 검증)

GitHub Actions(Azure IP) 또는 노아(AWS IP)에서 실행하여
brand.naver.com 차단의 정확한 '유형'을 판별한다.

판별 목표
  1) HTTP 상태코드        : 429 / 403 / 200 / 기타
  2) Retry-After 헤더     : 존재 → rate-limit(일시차단) / 부재+429 → IP차단(영구) 신호
  3) 응답 body            : 차단 안내 / 캡차 / 정상 __PRELOADED_STATE__ 포함 여부
  4) 요청 간격 증가 효과  : 5초·15초 간격으로 재시도 시 통과하면 rate-limit 확정
  5) 엔드포인트별 차이     : 카테고리 SSR 페이지 vs 단일 상품 페이지 vs robots.txt

결과 해석 가이드
  - 200 + __PRELOADED_STATE__ 있음        → 차단 아님! 그냥 크롤링 가능 (해당 IP OK)
  - 429 + Retry-After 헤더 있음           → rate-limit. 간격 늘리면 통과 가능성 높음
  - 429/403 + Retry-After 없음 + 즉시반복도 실패 → IP기반 차단. 국내 IP 필요
  - 간격 늘렸을 때(15초) 200 나오면       → rate-limit 확정 → 느린 폴링으로 해결
"""
import sys
import time
import urllib.request
import urllib.error

# Windows 콘솔(cp949)에서도 이모지/한글이 깨지지 않도록 UTF-8 강제
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
HDR = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": "https://brand.naver.com/spao",
}

# 진단 대상 URL (차단이 엔드포인트별로 다른지 확인)
TARGETS = [
    ("robots.txt",      "https://brand.naver.com/robots.txt"),
    ("카테고리 SSR",     "https://brand.naver.com/spao/category/ALL"),
    ("BEST 카테고리",    "https://brand.naver.com/spao/category/d5eda39831ac45d4a31a9e799b9fb048"),
]


def probe(label: str, url: str, delay: float = 0.0):
    if delay:
        print(f"    (요청 전 {delay}초 대기...)")
        time.sleep(delay)

    req = urllib.request.Request(url, headers=HDR)
    print(f"\n[{label}] GET {url}")
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            status = resp.status
            headers = dict(resp.getheaders())
            body = resp.read().decode("utf-8", errors="replace")
            _report(status, headers, body)
            return status
    except urllib.error.HTTPError as e:
        status = e.code
        headers = dict(e.headers.items()) if e.headers else {}
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            body = "(body 읽기 실패)"
        _report(status, headers, body)
        return status
    except urllib.error.URLError as e:
        print(f"    ✗ URLError: {e.reason}")
        return -1
    except Exception as e:
        print(f"    ✗ 예외: {type(e).__name__}: {e}")
        return -2


def _report(status: int, headers: dict, body: str):
    print(f"    상태코드 : {status}")

    # 차단 진단에 핵심인 헤더들
    key_hdrs = ["Retry-After", "Server", "X-Cache", "Via", "Set-Cookie",
                "Content-Type", "Content-Length", "Cache-Control"]
    for h in key_hdrs:
        # 헤더 키는 대소문자 섞일 수 있으므로 보정
        val = None
        for k, v in headers.items():
            if k.lower() == h.lower():
                val = v
                break
        if val is not None:
            shown = val if len(str(val)) < 120 else str(val)[:120] + "...(생략)"
            print(f"    {h:<16}: {shown}")

    has_retry = any(k.lower() == "retry-after" for k in headers)

    # body 분석
    body_len = len(body)
    has_state = "__PRELOADED_STATE__" in body
    has_captcha = ("captcha" in body.lower() or "캡차" in body
                   or "보안문자" in body or "자동입력 방지" in body)
    block_words = ["비정상적", "접근이 제한", "일시적으로 제한", "차단", "abuse",
                   "blocked", "Access Denied", "too many requests"]
    hit_block = [w for w in block_words if w.lower() in body.lower()]

    print(f"    body 길이: {body_len:,} bytes")
    print(f"    __PRELOADED_STATE__ 포함: {'YES ✅' if has_state else 'NO'}")
    print(f"    캡차/보안문자 감지      : {'YES ⚠️' if has_captcha else 'NO'}")
    if hit_block:
        print(f"    차단 키워드 감지        : {hit_block}")

    # body 앞부분 일부 (title 등 식별용)
    snippet = body[:300].replace("\n", " ").replace("\r", " ")
    print(f"    body 앞부분: {snippet}")

    # ── 1차 판정 ──
    if status == 200 and has_state:
        print("    ⇒ 판정: 정상 (이 IP에서 크롤링 가능) ✅✅✅")
    elif status == 200 and not has_state:
        print("    ⇒ 판정: 200이지만 데이터 없음 (캡차/차단 페이지 가능성) ⚠️")
    elif status in (429, 403):
        if has_retry:
            print("    ⇒ 판정: rate-limit(일시) 신호 — 간격 늘리면 통과 가능성 ⏱️")
        else:
            print("    ⇒ 판정: IP기반 차단 가능성 (Retry-After 없음) 🚫")
    else:
        print(f"    ⇒ 판정: 기타 상태({status}) — 추가 확인 필요")


def main():
    print("=" * 70)
    print("네이버 브랜드스토어 차단 기준 진단 (naver_probe.py)")
    print("실행 환경 IP 기준으로 차단 유형을 판별합니다.")
    print("=" * 70)

    # ── 1단계: 즉시 요청 (간격 0) ──
    print("\n\n###### 1단계: 즉시 요청 (rate-limit 트리거 확인) ######")
    results = {}
    for label, url in TARGETS:
        results[("즉시", label)] = probe(label, url, delay=0.0)

    # ── 2단계: 5초 간격 ──
    print("\n\n###### 2단계: 5초 간격 재시도 ######")
    for label, url in TARGETS:
        results[("5초", label)] = probe(label, url, delay=5.0)

    # ── 3단계: 15초 간격 (rate-limit 회복 확인) ──
    print("\n\n###### 3단계: 15초 간격 재시도 (rate-limit 회복 여부) ######")
    for label, url in TARGETS:
        results[("15초", label)] = probe(label, url, delay=15.0)

    # ── 종합 ──
    print("\n\n" + "=" * 70)
    print("종합 결과표 (상태코드)")
    print("=" * 70)
    print(f"{'간격':<8}{'robots':<12}{'ALL':<12}{'BEST':<12}")
    for gap in ("즉시", "5초", "15초"):
        row = [str(results.get((gap, lbl), "-")) for lbl, _ in TARGETS]
        print(f"{gap:<8}{row[0]:<12}{row[1]:<12}{row[2]:<12}")

    # ── 4단계: 실제 브라우저(Playwright) 대조군 ──
    pw = run_playwright_probe()

    print("\n" + "=" * 70)
    print("핵심 비교: urllib(평문) vs Playwright(실제 브라우저)")
    print("=" * 70)
    url_all = results.get(("즉시", "카테고리 SSR"), "-")
    print(f"  urllib  ALL 카테고리 : {url_all}")
    if pw and pw.get("results"):
        for r in pw["results"]:
            mark = "200+STATE ✅" if (r["status"] == 200 and r["hasState"]) else f"{r['status']}"
            print(f"  Playwright {r['label']:<5}        : {mark}  (len={r['bodyLen']:,})")
        pw_ok = any(r["status"] == 200 and r["hasState"] for r in pw["results"])
        print()
        if pw_ok and url_all != 200:
            print("  ⇒ 결론: '브라우저 지문' 차단. 이 IP는 정상이며 실제 브라우저는 통과.")
            print("           → 이 환경에서 Playwright로 크롤링 가능 (urllib fallback은 무의미)")
        elif pw_ok and url_all == 200:
            print("  ⇒ 결론: 차단 없음. 이 IP에서 자유롭게 크롤링 가능.")
        elif not pw_ok:
            print("  ⇒ 결론: 실제 브라우저도 차단됨 → 'IP/네트워크' 기반 차단.")
            print("           → 이 IP로는 불가. 국내 주거용/다른 IP 필요.")
    else:
        print("  Playwright: 실행 불가/오류 (위 stderr 로그 확인)")

    print("\n[종합 해석 가이드]")
    print("  · GitHub Actions(Azure)에서 Playwright도 429 → 데이터센터 IP 차단 확정")
    print("  · 로컬(국내)에서 Playwright 200 → 지문이 아니라 'IP+브라우저' 조합 문제")
    print("  · 국내 데이터센터 VM에서 돌려봐야 '해외IP vs 데이터센터ASN' 최종 판별 가능")


def run_playwright_probe():
    """naver_probe.js(실제 브라우저)를 호출해 결과 JSON 반환."""
    import json as _json
    import shutil
    import subprocess
    import os as _os

    node = shutil.which("node")
    js = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "naver_probe.js")
    if not node or not _os.path.isfile(js):
        print("\n[Playwright 대조군] node 또는 naver_probe.js 없음 — 건너뜀")
        return None

    print("\n\n###### 4단계: 실제 브라우저(Playwright) 대조군 ######")
    try:
        proc = subprocess.run(
            [node, js],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL, timeout=120,
            cwd=_os.path.dirname(js),
        )
        err = proc.stderr.decode("utf-8", errors="replace").strip()
        if err:
            print(err)
        out = proc.stdout.decode("utf-8", errors="replace").strip()
        if out:
            return _json.loads(out)
    except Exception as e:
        print(f"  [Playwright 대조군] 실패: {e}")
    return None


if __name__ == "__main__":
    main()
