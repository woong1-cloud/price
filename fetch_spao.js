/**
 * fetch_spao.js — spao.com 자사몰 상품 가격 수집 (직접 HTTP 방식)
 *
 * 발견된 API: https://www.spao.com/v1/search/leaf/cate/item/api
 * - dispMctgNo: 카테고리 번호
 * - page: 페이지 번호 (1부터, 60개씩)
 * Playwright 불필요 — Node.js https 모듈로 직접 호출
 */
const https = require('https');

// ─── 알려진 카테고리 (직접 스캔으로 확인된 활성 카테고리) ───
const CATEGORIES = [
  // 1~100 구간
  2605000006, 2605000015, 2605000023, 2605000028,
  2605000037, 2605000043, 2605000045, 2605000051,
  2605000064, 2605000068, 2605000073, 2605000084,
  2605000085, 2605000094,
  // 101~199 구간 (셔츠·바지 등 세부 카테고리)
  2605000102, 2605000109, 2605000122, 2605000127,
  2605000131, 2605000136, 2605000141, 2605000149,
  2605000150, 2605000159, 2605000165, 2605000172,
  2605000177, 2605000184, 2605000190, 2605000191,
  2605000195,
  // 200+ 구간
  2605000200, 2605000204, 2605000205,
];

const PAGE_SIZE = 60; // API 고정값

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.spao.com/',
        'Accept': 'application/json, */*',
      },
    };
    https.get(url, opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
}

function log(msg) { process.stderr.write(`[spao] ${msg}\n`); }

(async () => {
  const allProducts = new Map(); // itemNo → product

  for (const catNo of CATEGORIES) {
    let page = 1;
    let fetched = 0;

    while (true) {
      const url = `https://www.spao.com/v1/search/leaf/cate/item/api?dispMctgNo=${catNo}&page=${page}`;
      let json;
      try {
        const { status, body } = await httpGet(url);
        if (status !== 200) { log(`cat=${catNo} page=${page} HTTP ${status} — skip`); break; }
        json = JSON.parse(body);
      } catch (e) {
        log(`cat=${catNo} page=${page} ERR: ${e.message}`);
        break;
      }

      const outcome = json?.data?.srchOutCome?.item;
      if (!outcome) break;

      const total = outcome.total || 0;
      const list  = outcome.list  || [];

      if (list.length === 0) break;

      list.forEach(item => {
        if (!allProducts.has(item.itemNo)) {
          allProducts.set(item.itemNo, {
            itemNo:     item.itemNo,
            name:       item.itemName || '',
            sellP:      item.orgSellprice   || 0,  // 정가
            saleP:      item.finalDcPrice   || 0,  // 최종 할인가
            isSoldOut:  false,
          });
        }
      });

      fetched += list.length;
      log(`cat=${catNo} page=${page}: ${list.length}개 (누적 ${fetched}/${total})`);

      // 더 가져올 게 없으면 종료
      if (fetched >= total || list.length < PAGE_SIZE) break;
      page++;
    }
  }

  const result = Array.from(allProducts.values());
  log(`\n최종 고유 상품: ${result.length}개`);
  process.stdout.write(JSON.stringify(result));
})().catch(e => {
  process.stderr.write(`Fatal: ${e.message}\n`);
  process.stdout.write(JSON.stringify([]));
  process.exit(0);
});
