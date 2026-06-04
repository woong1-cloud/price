/**
 * Fetches SPAO products from Naver brand store.
 * Navigates to multiple category pages and sort orders to maximize coverage.
 * SSR embeds ~40 products per page. We collect from all categories + sort types.
 * Outputs JSON array of products to stdout.
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

// ─── 브라우저 실행파일 탐색 ───
// Playwright 자동 경로 탐색이 일부 환경(bat 실행 Flask)에서 실패하는 경우
// 직접 경로를 스캔해서 executablePath 로 지정한다.
function findHeadlessShellExe() {
  // 1) PLAYWRIGHT_BROWSERS_PATH → 2) LOCALAPPDATA\ms-playwright → 3) APPDATA\ms-playwright
  const candidates = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    candidates.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  }
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, 'ms-playwright'));
  }
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, '..', 'Local', 'ms-playwright'));
  }

  for (const base of candidates) {
    try {
      const dirs = fs.readdirSync(base);
      for (const dir of dirs) {
        if (!dir.startsWith('chromium_headless_shell-') && !dir.startsWith('chromium-headless-shell-')) continue;
        // Windows
        const winExe = path.join(base, dir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
        if (fs.existsSync(winExe)) {
          process.stderr.write(`[playwright] executablePath found: ${winExe}\n`);
          return winExe;
        }
        // Linux/Mac fallback
        const linExe = path.join(base, dir, 'chrome-headless-shell-linux', 'chrome-headless-shell');
        if (fs.existsSync(linExe)) {
          process.stderr.write(`[playwright] executablePath found: ${linExe}\n`);
          return linExe;
        }
      }
    } catch(e) {
      process.stderr.write(`[playwright] scan error for ${base}: ${e.message}\n`);
    }
  }
  process.stderr.write('[playwright] executablePath not found manually, letting Playwright auto-detect\n');
  return null;
}

// 네이버 브랜드스토어 전체 카테고리 (하위 없음 — 최대 커버리지)
const CATEGORIES = [
  { id: 'ALL',                                 label: '전체' },
  { id: 'b6a9188b831343bf8c3cb2133b668ad2',    label: '여성' },
  { id: '64e83fd96df44c71a0802e094dcb395f',    label: '남성' },
  { id: 'd09aab8f2f3d45b19f4235941b549e1c',    label: '잡화' },
  { id: 'd5eda39831ac45d4a31a9e799b9fb048',    label: 'BEST' },
  { id: '8d39073c3dcb42e5b9c8dbaccf545a9f',    label: '콜라보' },
  { id: 'b67e4e95989e47908dff9ddfcc36b49c',    label: '네이버단독' },
  { id: '87a025edbac74a148a9bb86ef524f7b7',    label: 'N배송' },
  { id: 'd549391f0a4440c783d810ed6d9ed5be',    label: '특가' },
  { id: '46c532fa9cda4e4485ddbc76aa221320',    label: 'COOL LINE' },
  { id: '21cef90acdc34212a76a5bb7fc01a84a',    label: '인기아우터' },
  { id: '906b4e9cd3ea45acad2dd4482ba1fa4c',    label: '이너웨어' },
  { id: '7a4af3b0d78a470587b35e612373cc37',    label: '프렌치테리' },
];

(async () => {
  const executablePath = findHeadlessShellExe();
  const launchOpts = { headless: true };
  if (executablePath) launchOpts.executablePath = executablePath;

  process.stderr.write(`[playwright] launching chromium headless (executablePath=${executablePath || 'auto'})\n`);

  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const allProducts = new Map(); // productNo → product

  for (const cat of CATEGORIES) {
    let url;
    if (cat.id === 'ALL' && cat.sort) {
      url = `https://brand.naver.com/spao/category/ALL?sortType=${cat.sort}`;
    } else if (cat.id === 'ALL') {
      url = 'https://brand.naver.com/spao/category/ALL';
    } else {
      url = `https://brand.naver.com/spao/category/${cat.id}`;
    }

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
      await page.waitForTimeout(600);
    } catch(e) {
      process.stderr.write(`[SKIP] ${cat.label}: ${e.message.substring(0, 60)}\n`);
      continue;
    }

    const { products, debugFirst } = await page.evaluate(() => {
      const state = window.__PRELOADED_STATE__;
      const cp   = state?.categoryProducts?.simpleProducts || [];
      const bsNew    = state?.bsProductCollection?.A?.newProducts || [];
      const bsBest   = state?.bsProductCollection?.A?.bestProducts || [];
      const bsReview = state?.bsProductCollection?.A?.bestReviewProducts || [];
      const all = [...cp, ...bsNew, ...bsBest, ...bsReview];

      // 첫 번째 상품의 가격 관련 필드 전체 덤프 (디버그용)
      const first = all[0] || {};
      const priceFields = {};
      for (const k of Object.keys(first)) {
        if (/price|discount|sale|benefit|coupon|rate/i.test(k)) {
          priceFields[k] = first[k];
        }
      }

      return {
        debugFirst: { productNo: first.id || first.productNo, name: first.name, priceFields },
        products: all.map(p => {
          // 네이버 브랜드스토어 가격 구조 (실측):
          //   salePrice                          = 정가 (원가, 프로모션 미적용)
          //   benefitsView.discountedSalePrice   = 프로모션 적용 후 실제 판매가  ← 우리가 쓸 값
          //   benefitsView.discountedRatio        = 할인율 (%)
          //   benefitPrice 류                     = 사용자별 쿠폰가 (개인화 - 제외)
          const origP    = p.salePrice || 0;   // 정가
          const promoP   = p.benefitsView?.discountedSalePrice || 0;
          // 프로모션가가 있고 정가보다 낮을 때만 사용, 그 외엔 정가
          const saleP    = (promoP > 0 && promoP < origP) ? promoP : origP;
          const discRate = p.benefitsView?.discountedRatio || 0;

          return {
            productNo:         p.id || p.productNo || '',
            name:              p.name || '',
            salePrice:         saleP,   // 실제 판매가 (프로모션 적용 후)
            originalPrice:     origP,   // 정가
            discountRate:      discRate,
            productStatusType: p.productStatusType || p.channelProductDisplayStatus || 'SALE',
          };
        }).filter(p => p.productNo && p.name),
      };
    });

    if (allProducts.size === 0 && debugFirst?.priceFields) {
      process.stderr.write(`[DEBUG price fields] ${JSON.stringify(debugFirst)}\n`);
    }

    let added = 0;
    products.forEach(p => {
      if (!allProducts.has(p.productNo)) {
        allProducts.set(p.productNo, p);
        added++;
      }
    });
    process.stderr.write(`${cat.label}: ${products.length}개 (신규 ${added}개, 누적 ${allProducts.size}개)\n`);
  }

  const result = Array.from(allProducts.values());
  process.stderr.write(`\n최종 고유 상품: ${result.length}개\n`);
  await browser.close();
  process.stdout.write(JSON.stringify(result));
})().catch(e => {
  process.stderr.write(`Fatal: ${e.message}\n`);
  process.stdout.write(JSON.stringify([]));
  process.exit(0);
});
