/**
 * naver_probe.js — 실제 브라우저(Playwright)로 네이버 차단 여부 진단.
 * urllib 평문요청과 비교하기 위한 대조군.
 *
 * 출력(stdout): JSON  { engine, results: [{label, status, hasState, bodyLen}] }
 * stderr: 진행 로그
 *
 * 핵심 비교:
 *   - urllib(평문) 429  +  Playwright(브라우저) 200  → '브라우저 지문' 차단 (IP는 OK)
 *   - urllib 429        +  Playwright 429            → 'IP/네트워크' 차단
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

function findHeadlessShellExe() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) candidates.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'ms-playwright'));
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, '..', 'Local', 'ms-playwright'));
  for (const base of candidates) {
    try {
      for (const dir of fs.readdirSync(base)) {
        if (!dir.startsWith('chromium_headless_shell-') && !dir.startsWith('chromium-headless-shell-')) continue;
        const winExe = path.join(base, dir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
        if (fs.existsSync(winExe)) return winExe;
        const linExe = path.join(base, dir, 'chrome-headless-shell-linux', 'chrome-headless-shell');
        if (fs.existsSync(linExe)) return linExe;
      }
    } catch (e) { /* skip */ }
  }
  return null;
}

const TARGETS = [
  { label: 'ALL',  url: 'https://brand.naver.com/spao/category/ALL' },
  { label: 'BEST', url: 'https://brand.naver.com/spao/category/d5eda39831ac45d4a31a9e799b9fb048' },
];

(async () => {
  const executablePath = findHeadlessShellExe();
  const launchOpts = { headless: true };
  if (executablePath) launchOpts.executablePath = executablePath;
  process.stderr.write(`[probe-js] executablePath=${executablePath || 'auto'}\n`);

  let browser;
  try {
    browser = await chromium.launch(launchOpts);
  } catch (e) {
    process.stderr.write(`[probe-js] launch 실패: ${e.message}\n`);
    process.stdout.write(JSON.stringify({ engine: 'playwright', error: e.message, results: [] }));
    process.exit(0);
  }

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  const results = [];

  for (const t of TARGETS) {
    let status = -1, hasState = false, bodyLen = 0;
    try {
      const resp = await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      status = resp ? resp.status() : -1;
      const html = await page.content();
      bodyLen = html.length;
      hasState = html.includes('__PRELOADED_STATE__');
    } catch (e) {
      process.stderr.write(`[probe-js] ${t.label} 오류: ${e.message.substring(0, 80)}\n`);
    }
    process.stderr.write(`[probe-js] ${t.label}: status=${status} hasState=${hasState} len=${bodyLen}\n`);
    results.push({ label: t.label, status, hasState, bodyLen });
    await page.waitForTimeout(800);
  }

  await browser.close();
  process.stdout.write(JSON.stringify({ engine: 'playwright', executablePath: !!executablePath, results }));
})().catch(e => {
  process.stderr.write(`[probe-js] Fatal: ${e.message}\n`);
  process.stdout.write(JSON.stringify({ engine: 'playwright', error: e.message, results: [] }));
  process.exit(0);
});
