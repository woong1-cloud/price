# 스파오 키즈 트랙2 — 수기 업로드(3채널 xlsb 파싱) MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 키즈 전용 신규 Supabase 프로젝트에, 지금 쓰는 실적판 xlsb 파일을 그대로 업로드하면 자사몰(공홈)·이랜드몰·네이버 3채널의 "당일" 원본 시트를 자동으로 파싱·집계해 `kids_channel_daily`(일자×채널) 테이블에 저장하고, 바로 화면에서 확인할 수 있는 최소 대시보드를 만든다.

**Architecture:** 새 Supabase 프로젝트(키즈 전용, 성인 프로젝트와 완전 분리) + 신규 `spao-kids-dashboard`(Vite+React) 앱. 3채널 각각의 파서(`gonghomParser`/`elandParser`/`naverParser`)가 원본 시트를 공통 아이템 모양 `{date, styleCode, status, qty, amt}`으로 정규화하면, 채널-무관 집계 유틸 `aggregateChannelDaily`가 일자별로 합산하고, `uploadKidsChannelDaily`가 Supabase에 upsert한다. **이 파이프라인은 "수동 업로드"와 "향후 자동화(API)"가 같은 함수를 공유하도록 설계** — 자동화 어댑터는 나중에 `items[]`를 만드는 새 소스(예: 네이버 API 응답 매핑)만 추가하면 되고, 집계·업로드·화면은 손대지 않는다. 채널별로 자동화가 준비되는 대로 하나씩 그 채널만 교체하고, 그동안은 수기 업로드와 자동화가 같은 테이블에 공존한다(`_source` 컬럼으로 어느 경로로 채워졌는지 구분).

**Tech Stack:** Supabase(신규 프로젝트, Postgres), Vite + React 19, `xlsx`(SheetJS, .xlsb 읽기), Vitest, `@supabase/supabase-js`.

**스코프 밖(후속 계획으로 분리):**
- 자사몰 N.E.E.D 자동 연동, 네이버 커머스 API 자동 연동, 이랜드몰 자동 추출 — 전부 이번 계획 이후 채널별로 하나씩.
- 당월 누적/목표달성율 등 고급 화면 — 이번 계획은 "업로드하면 값이 들어가고, 최근 실적을 볼 수 있다"까지만.

**중요 — 검증 필요 가정(코드에도 주석으로 남김):**
1. 이랜드몰 "판매금액"은 라인 합계(단가×수량)라고 가정한다(관찰 표본이 전부 수량=1이라 단가와 값이 같아 구분이 안 됨).
2. 공홈(자사몰) "취소신청 구분" 컬럼 값이 있으면(비어있지 않으면) 취소로 간주한다 — 실제 취소 건 표본을 아직 못 봐서, 실제 값(예: `'Y'`)을 확인하면 조건을 좁혀야 할 수 있다.
3. 네이버 "주문상태"에 `'취소'` 문자열이 포함되면 취소로 간주한다 — 관찰 표본에 취소 건이 없어(전부 `발송대기`/`신규주문`) 실제 취소 상태 문자열을 확인하면 재검증해야 한다.
4. 네이버 상품명은 스타일코드 앞에 언더바가 없다(예: `...반팔 티셔츠 SPHWG24KU1`) — 공홈·이랜드몰(`_스타일코드` 접미사)과 추출 규칙이 다르다.

---

### Task 1: 키즈 전용 Supabase 프로젝트 생성 + 테이블

**Files:**
- Create: `spao-kids-dashboard/supabase/step1_channel_daily.sql`

- [ ] **Step 1: Supabase에 새 프로젝트 생성 (사람이 직접)**

https://supabase.com/dashboard → "New Project" → 이름 `spao-kids` → 리전은 기존 성인 프로젝트와 같은 곳(Northeast Asia/Seoul 등 가까운 곳) 선택 → 생성 대기(1~2분).

- [ ] **Step 2: URL·anon 키 확보**

프로젝트 생성 후 Project Settings > API 에서 **Project URL**과 **anon public 키**를 복사해 둔다(Task 2에서 `.env.local`에 넣음).

- [ ] **Step 3: 테이블 마이그레이션 SQL 작성**

```sql
-- ════════════════════════════════════════════════════════════════════════
-- 키즈 트랙2 — 일자×채널 공통 실적 테이블 (신규 키즈 전용 Supabase 프로젝트)
-- ────────────────────────────────────────────────────────────────────────
-- 자사몰·이랜드몰·네이버 3채널의 "당일/당월" 실적을 하나의 스키마로 통합.
-- 지금은 수기 업로드(xlsb 파싱)로 채우고, 채널별 자동화가 준비되면 같은
-- 테이블에 같은 방식으로 upsert하는 어댑터로 하나씩 교체한다(_source로 구분).
-- 키:   (stat_date, channel) upsert — 같은 날 재적재해도 멱등.
-- 권한: authenticated 읽기·쓰기(팀 공유 도구 — 성인 대시보드처럼 로그인 필요).
-- 실행: Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.kids_channel_daily (
  stat_date        date not null,
  channel          text not null check (channel in ('자사몰', '이랜드몰', '네이버')),
  order_cnt        int not null default 0,
  order_amt        bigint not null default 0,
  real_order_cnt   int not null default 0,
  real_amt         bigint not null default 0,
  cancel_amt       bigint not null default 0,
  discount_amt     bigint,
  _source          text,  -- 'gonghom_upload' | 'eland_upload' | 'naver_upload' | (후속) 'naver_api' 등
  _ingested_at     timestamptz not null default now(),
  primary key (stat_date, channel)
);

create index if not exists idx_kids_channel_daily_date on public.kids_channel_daily (stat_date);

alter table public.kids_channel_daily enable row level security;
drop policy if exists "auth rw kids_channel_daily" on public.kids_channel_daily;
create policy "auth rw kids_channel_daily" on public.kids_channel_daily
  for all to authenticated using (true) with check (true);
```

- [ ] **Step 4: 새 프로젝트의 SQL Editor에서 실행**

- [ ] **Step 5: 테이블 생성 확인**

```sql
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'kids_channel_daily'
order by ordinal_position;
```
Expected: `stat_date, channel, order_cnt, order_amt, real_order_cnt, real_amt, cancel_amt, discount_amt, _source, _ingested_at` 10개 행.

- [ ] **Step 6: 커밋**

```bash
git add spao-kids-dashboard/supabase/step1_channel_daily.sql
git commit -m "feat: 키즈 트랙2 kids_channel_daily 테이블(신규 키즈 프로젝트)"
```

---

### Task 2: `spao-kids-dashboard` 앱 스캐폴드 (Vite+React)

**Files:**
- Create: `spao-kids-dashboard/package.json`
- Create: `spao-kids-dashboard/vite.config.js`
- Create: `spao-kids-dashboard/vitest.config.js`
- Create: `spao-kids-dashboard/index.html`
- Create: `spao-kids-dashboard/src/main.jsx`
- Create: `spao-kids-dashboard/src/lib/supabase.js`
- Create: `spao-kids-dashboard/.env.example`
- Create: `spao-kids-dashboard/.gitignore`

- [ ] **Step 1: `package.json` 작성**

```json
{
  "name": "spao-kids-dashboard",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.108.1",
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^6.0.1",
    "vite": "^8.0.12",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 2: `vite.config.js` 작성**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

- [ ] **Step 3: `vitest.config.js` 작성**

```js
import { defineConfig } from 'vitest/config'

// 유닛 테스트는 순수 유틸 함수만 대상으로 한다(노드 환경, jsdom 불필요).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/utils/**/*.test.js'],
  },
})
```

- [ ] **Step 4: `index.html` 작성**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SPAO 키즈 실적 업로드</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 5: `src/lib/supabase.js` 작성** (spao-dashboard-v3와 동일 패턴, 새 키즈 프로젝트를 가리킴)

```js
import { createClient } from '@supabase/supabase-js'

const url     = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = (url && anonKey)
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export const cloudEnabled = !!supabase
```

- [ ] **Step 6: `.env.example` 작성**

```
# ─── 키즈 트랙2 환경변수 ───────────────────────────────────────
# Task 1에서 만든 "키즈 전용" Supabase 프로젝트(성인 프로젝트와 다름!)의 값을 넣으세요.
#   cp .env.example .env.local

VITE_SUPABASE_URL=여기에_키즈_프로젝트_URL
VITE_SUPABASE_ANON_KEY=여기에_키즈_프로젝트_anon_public_키
```

- [ ] **Step 7: `.gitignore` 작성**

```
node_modules
dist
*.local
.env.local
```

- [ ] **Step 8: `src/main.jsx` 최소 진입점 작성** (App.jsx는 Task 10에서 실제 내용 채움 — 지금은 렌더만 되는 자리표시자)

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/App.jsx`는 아직 만들지 않는다 — Task 10에서 실제 업로드 화면으로 채운다. 지금 단계에서 `npm run dev`를 돌리면 `App.jsx`가 없어 에러가 나는 게 정상이다(Task 10 완료 후 확인).

- [ ] **Step 9: 의존성 설치**

```bash
cd spao-kids-dashboard
npm install
```
Expected: `node_modules` 생성, 에러 없이 종료.

- [ ] **Step 10: `.env.local` 생성 (Task 1에서 받은 값 채우기)**

```bash
cp .env.example .env.local
```
`.env.local`을 열어 Task 1 Step 2에서 복사해 둔 URL·anon 키로 채운다.

- [ ] **Step 11: 커밋** (`.env.local`은 `.gitignore`로 제외되어 커밋되지 않음)

```bash
git add spao-kids-dashboard/package.json spao-kids-dashboard/vite.config.js spao-kids-dashboard/vitest.config.js spao-kids-dashboard/index.html spao-kids-dashboard/src/main.jsx spao-kids-dashboard/src/lib/supabase.js spao-kids-dashboard/.env.example spao-kids-dashboard/.gitignore
git commit -m "feat: spao-kids-dashboard 앱 스캐폴드(Vite+React)"
```

---

### Task 3: `styleCodeParser.js` 이식

**Files:**
- Create: `spao-kids-dashboard/src/utils/styleCodeParser.js`
- Test: `spao-kids-dashboard/src/utils/styleCodeParser.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// spao-kids-dashboard/src/utils/styleCodeParser.test.js
import { describe, it, expect } from 'vitest'
import { parseStyleCode } from './styleCodeParser'

describe('parseStyleCode', () => {
  it('8번째 문자(성별코드)가 K이면 키즈로 분류한다', () => {
    const parsed = parseStyleCode('SPPPF4VKU2')
    expect(parsed.genderCode).toBe('K')
    expect(parsed.gender).toBe('키즈')
  })

  it('8자 미만이면 안전한 기본값을 반환한다', () => {
    const parsed = parseStyleCode('SP')
    expect(parsed.gender).toBe('기타')
    expect(parsed.genderCode).toBe('')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx vitest run src/utils/styleCodeParser.test.js
```
Expected: FAIL — `Cannot find module './styleCodeParser'`.

- [ ] **Step 3: `styleCodeParser.js` 작성** (spao-dashboard-v3에서 이식, dev 콘솔 자가진단 블록은 제외)

```js
export const GENDER_CODE_TABLE = {
  G: '여성', W: '여성', M: '남성', C: '공용', K: '키즈', U: '콜라보',
}

// 예시: SPRWG25G01 — [7](8번째 문자) = 성별코드
export function parseStyleCode(code) {
  const c = String(code || '')
  if (c.length < 8) {
    return { brand: 'SPAO', genderCode: '', gender: '기타' }
  }
  const brand = c.slice(0, 2) === 'SP' ? 'SPAO' : c.slice(0, 2)
  const genderCode = c[7].toUpperCase()
  return { brand, genderCode, gender: GENDER_CODE_TABLE[genderCode] || '기타' }
}
```

> 이 앱은 성별 필터링(키즈 판별)에만 스타일코드를 쓰므로, 원본의 `ITEM_CODE_TABLE`/품목 파싱 부분은 가져오지 않는다(YAGNI). 필요해지면 그때 추가한다.

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
npx vitest run src/utils/styleCodeParser.test.js
```
Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
git add spao-kids-dashboard/src/utils/styleCodeParser.js spao-kids-dashboard/src/utils/styleCodeParser.test.js
git commit -m "feat: styleCodeParser 이식(성별코드 판별용, spao-dashboard-v3에서 축약)"
```

---

### Task 4: 엑셀 날짜 변환 공용 유틸

**Files:**
- Create: `spao-kids-dashboard/src/utils/excelDate.js`
- Test: `spao-kids-dashboard/src/utils/excelDate.test.js`

**배경**: 이랜드몰 원본은 날짜가 이미 문자열(`"2025-12-15 17:22:23"`)이지만, 공홈·네이버 원본은 Excel 날짜/시간 셀(직렬 일련번호, 예 `46106.0005787037`)이라 변환이 필요하다. 두 형태를 모두 받아 `YYYY-MM-DD`로 정규화하는 공용 유틸을 하나 만들어 3개 파서가 공유한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// spao-kids-dashboard/src/utils/excelDate.test.js
import { describe, it, expect } from 'vitest'
import { excelSerialToDateStr } from './excelDate'

describe('excelSerialToDateStr', () => {
  it('이미 YYYY-MM-DD 문자열이면 그대로(날짜 부분만) 반환한다', () => {
    expect(excelSerialToDateStr('2025-12-15 17:22:23')).toBe('2025-12-15')
  })

  it('Excel 날짜 직렬번호를 YYYY-MM-DD로 변환한다', () => {
    // 실제 '공홈 당일' 시트에서 관찰한 값 — 같은 행의 MM-DD 헬퍼 컬럼이 '03-25'였고
    // 해당 워크북 기준연도가 2026이므로 2026-03-25가 정답이어야 한다.
    expect(excelSerialToDateStr(46106.0005787037)).toBe('2026-03-25')
  })

  it('숫자도 문자열도 아니면 빈 문자열을 반환한다', () => {
    expect(excelSerialToDateStr(undefined)).toBe('')
    expect(excelSerialToDateStr('')).toBe('')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx vitest run src/utils/excelDate.test.js
```
Expected: FAIL — `Cannot find module './excelDate'`.

- [ ] **Step 3: `excelDate.js` 작성**

```js
import * as XLSX from 'xlsx'

// 이랜드몰(문자열 "YYYY-MM-DD HH:mm:ss")과 공홈·네이버(Excel 날짜 직렬번호)를
// 모두 받아 'YYYY-MM-DD'로 정규화한다.
export function excelSerialToDateStr(value) {
  const asStr = String(value ?? '')
  const strMatch = asStr.match(/^(\d{4}-\d{2}-\d{2})/)
  if (strMatch) return strMatch[1]

  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  const d = XLSX.SSF.parse_date_code(n)
  if (!d) return ''
  const pad = (v) => String(v).padStart(2, '0')
  return `${d.y}-${pad(d.m)}-${pad(d.d)}`
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
npx vitest run src/utils/excelDate.test.js
```
Expected: PASS (3 tests). **2번째 테스트가 다른 날짜로 실패하면**(예: 2026-03-24) — SSF 변환 자체는 정상이니 테스트의 기대값을 SSF가 실제로 반환한 날짜로 고쳐라(이 값은 워크북 헬퍼 컬럼을 참고해 적어둔 것이라 오차가 있을 수 있음). 그 외 사유로 실패하면 구현을 의심할 것.

- [ ] **Step 5: 커밋**

```bash
git add spao-kids-dashboard/src/utils/excelDate.js spao-kids-dashboard/src/utils/excelDate.test.js
git commit -m "feat: Excel 날짜 직렬번호/문자열 공용 변환 유틸 추가"
```

---

### Task 5: 채널별 일자 집계 유틸 (`aggregateChannelDaily`)

**Files:**
- Create: `spao-kids-dashboard/src/utils/aggregateChannelDaily.js`
- Test: `spao-kids-dashboard/src/utils/aggregateChannelDaily.test.js`

**설계**: 채널 고유 로직(취소 판정)은 `isCanceled` 콜백으로 주입받는 채널-불특정 유틸로 만든다. 스타일코드 성별코드 필터(기본 `K`)도 여기서 한 번 더 건다(각 파서가 이미 키즈만 걸러 왔어도 안전망으로 유지).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// spao-kids-dashboard/src/utils/aggregateChannelDaily.test.js
import { describe, it, expect } from 'vitest'
import { aggregateChannelDaily } from './aggregateChannelDaily'

const isCanceled = (item) => item.status === '취소완료'

describe('aggregateChannelDaily', () => {
  it('같은 날짜의 항목을 합산하고 취소 건은 cancelAmt로 분리한다', () => {
    const items = [
      { date: '2026-07-01', styleCode: 'SPPPF4VKU2', status: '결제완료', qty: 1, amt: 39900 },
      { date: '2026-07-01', styleCode: 'SPPPE49KU1', status: '취소완료', qty: 1, amt: 29900 },
      { date: '2026-07-02', styleCode: 'SPPPF4VKU2', status: '결제완료', qty: 2, amt: 79800 },
    ]
    const out = aggregateChannelDaily(items, { channel: '이랜드몰', isCanceled })
    expect(out).toEqual([
      { date: '2026-07-01', channel: '이랜드몰', discountAmt: null, orderCnt: 2, orderAmt: 69800, realOrderCnt: 1, realAmt: 39900, cancelAmt: 29900 },
      { date: '2026-07-02', channel: '이랜드몰', discountAmt: null, orderCnt: 2, orderAmt: 79800, realOrderCnt: 2, realAmt: 79800, cancelAmt: 0 },
    ])
  })

  it('성별코드가 다른 상품은 걸러낸다(안전망)', () => {
    const items = [
      { date: '2026-07-01', styleCode: 'SPPPF4VKU2', status: '결제완료', qty: 1, amt: 39900 }, // 키즈(K)
      { date: '2026-07-01', styleCode: 'SPRWG25G01', status: '결제완료', qty: 1, amt: 29900 }, // 여성(G)
    ]
    const out = aggregateChannelDaily(items, { channel: '이랜드몰', isCanceled })
    expect(out).toEqual([
      { date: '2026-07-01', channel: '이랜드몰', discountAmt: null, orderCnt: 1, orderAmt: 39900, realOrderCnt: 1, realAmt: 39900, cancelAmt: 0 },
    ])
  })

  it('빈 배열이면 빈 배열을 반환한다', () => {
    expect(aggregateChannelDaily([], { channel: '이랜드몰', isCanceled })).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx vitest run src/utils/aggregateChannelDaily.test.js
```
Expected: FAIL — `Cannot find module './aggregateChannelDaily'`.

- [ ] **Step 3: `aggregateChannelDaily.js` 작성**

```js
import { parseStyleCode } from './styleCodeParser'

// items: { date, styleCode, status, qty, amt, ... } 배열(채널 무관 공통 모양)
// isCanceled(item): 그 채널에서 "취소"로 볼 상태 판정 콜백(채널마다 상태값이 다름)
// genderCode: 상품 필터(기본 'K'=키즈) — 원본이 이미 필터돼 있어도 안전망으로 항상 적용
export function aggregateChannelDaily(items, { channel, isCanceled, genderCode = 'K' }) {
  const byDate = new Map()
  for (const it of items) {
    if (genderCode && parseStyleCode(it.styleCode).genderCode !== genderCode) continue
    if (!byDate.has(it.date)) {
      byDate.set(it.date, { orderCnt: 0, orderAmt: 0, realOrderCnt: 0, realAmt: 0, cancelAmt: 0 })
    }
    const acc = byDate.get(it.date)
    const canceled = isCanceled(it)
    acc.orderCnt += it.qty
    acc.orderAmt += it.amt
    if (canceled) {
      acc.cancelAmt += it.amt
    } else {
      acc.realOrderCnt += it.qty
      acc.realAmt += it.amt
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, acc]) => ({ date, channel, discountAmt: null, ...acc }))
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
npx vitest run src/utils/aggregateChannelDaily.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add spao-kids-dashboard/src/utils/aggregateChannelDaily.js spao-kids-dashboard/src/utils/aggregateChannelDaily.test.js
git commit -m "feat: 채널 무관 일자 집계 유틸 aggregateChannelDaily 추가"
```

---

### Task 6: 이랜드몰 "당일" 시트 파서

**Files:**
- Create: `spao-kids-dashboard/src/utils/elandParser.js`
- Test: `spao-kids-dashboard/src/utils/elandParser.test.js`

**실제 컬럼(2026-07-10, 실제 워크북 `이랜드몰 당일` 시트에서 확보)**: `NO, 전시몰, 주문번호, 배송유형, 상품번호, 상품명, 단품명, 주문상태, 지연종류, 상품권주문취소접수여부, 상품순번, 주문자, 주문유형, 배송정보, 외부몰명, 외부몰주문번호, 품명 및 모델명, ERP단품코드, 변경ERP단품코드, 판매금액, 주문수량, 취소수량, 반품수량, 판매단가, 주문일시, ...`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// spao-kids-dashboard/src/utils/elandParser.test.js
import { describe, it, expect } from 'vitest'
import { parseElandOrders, isElandCanceled } from './elandParser'

const HEADER = [
  'NO', '전시몰', '주문번호', '배송유형', '상품번호', '상품명', '단품명', '주문상태',
  '지연종류', '상품권주문취소접수여부', '상품순번', '주문자', '주문유형', '배송정보',
  '외부몰명', '외부몰주문번호', '품명 및 모델명', 'ERP단품코드', '변경ERP단품코드',
  '판매금액', '주문수량', '취소수량', '반품수량', '판매단가', '주문일시',
]

describe('parseElandOrders', () => {
  it('주문 행에서 날짜·스타일코드·금액·상태를 추출한다', () => {
    const rows = [
      HEADER,
      [
        1, '이랜드몰', '202512154294487', '일반', '2509109426',
        '[키즈] (망그러진곰) 수면 파자마_SPPPF4VKU2', '(26)Light Pink/150', '결제완료',
        '', 'N', 1, '민*은', '일반', '부산 연제구 ***',
        '', '', 'SPPPF4VKU2', 'SPPPF4VKU226150', '',
        39900, 1, 0, 0, 39900, '2025-12-15 17:22:23',
      ],
    ]
    const items = parseElandOrders(rows)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      date: '2025-12-15', styleCode: 'SPPPF4VKU2', status: '결제완료', qty: 1, amt: 39900,
    })
  })

  it('취소완료 행도 파싱은 그대로 하고(집계 단계에서 필터링), isElandCanceled가 true를 반환한다', () => {
    const rows = [
      HEADER,
      [
        1, 'KIDIKIDI', '202412166811283', '일반', '2407359384',
        '[키즈] (산리오캐릭터즈) 긴팔 파자마(LIGHT BLUE)_SPPPE49KU1', '(51)Light Blue/120', '취소완료',
        '', 'N', 4, '김*아', '일반', '',
        '', '', 'SPPPE49KU1', '', '',
        29900, 1, 1, 0, 29900, '2024-12-16 23:10:00',
      ],
    ]
    const items = parseElandOrders(rows)
    expect(isElandCanceled(items[0])).toBe(true)
  })

  it('행/헤더가 없으면 빈 배열을 반환한다', () => {
    expect(parseElandOrders([])).toEqual([])
    expect(parseElandOrders(null)).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx vitest run src/utils/elandParser.test.js
```
Expected: FAIL — `Cannot find module './elandParser'`.

- [ ] **Step 3: `elandParser.js` 작성**

```js
import { excelSerialToDateStr } from './excelDate'

// (2026-07-10 실행 중 코드 리뷰로 수정됨: trim 누락 시 상태값 공백으로 취소판정 실패,
//  콤마 미제거 시 "39,900" 같은 값이 0으로 조용히 깨지는 문제 발견 — 아래가 수정판)
function toStr(v) { return v == null ? '' : String(v).trim() }
function toNum(v) {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

// 상품명 끝의 '_스타일코드' 추출
function extractStyleCode(name) {
  const m = toStr(name).match(/_([A-Za-z0-9]+)\s*$/)
  return m ? m[1] : ''
}

// 이랜드몰(통합몰) 주문상세 엑셀 rows(헤더 포함 2차원 배열) → 정규화된 주문 아이템 배열.
// "판매금액"은 라인 합계(단가×수량)라고 가정 — 수량>1인 실제 행으로 재검증 필요(계획 문서 참고).
export function parseElandOrders(rows) {
  if (!rows || rows.length < 2) return []
  const headers = rows[0].map(toStr)
  const idx = {
    name:      headers.findIndex(h => h === '상품명'),
    status:    headers.findIndex(h => h.includes('주문상태')),
    amt:       headers.findIndex(h => h.includes('판매금액')),
    qty:       headers.findIndex(h => h.includes('주문수량')),
    orderedAt: headers.findIndex(h => h.includes('주문일시')),
  }

  const items = []
  for (const row of rows.slice(1)) {
    if (!row || row.length === 0) continue
    const date = excelSerialToDateStr(row[idx.orderedAt])
    if (!date) continue
    const name = toStr(row[idx.name])
    items.push({
      date,
      styleCode: extractStyleCode(name),
      name,
      status: toStr(row[idx.status]),
      qty:    toNum(row[idx.qty]),
      amt:    toNum(row[idx.amt]),
    })
  }
  return items
}

export function isElandCanceled(item) {
  return item.status === '취소완료'
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
npx vitest run src/utils/elandParser.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add spao-kids-dashboard/src/utils/elandParser.js spao-kids-dashboard/src/utils/elandParser.test.js
git commit -m "feat: 이랜드몰 당일 시트 파서 추가"
```

---

### Task 7: 공홈(자사몰) "당일" 시트 파서

**Files:**
- Create: `spao-kids-dashboard/src/utils/gonghomParser.js`
- Test: `spao-kids-dashboard/src/utils/gonghomParser.test.js`

**실제 컬럼(2026-07-10, `공홈 당일` 시트에서 확보)**: `품목별 주문번호, 주문상태정보, 결제자, 결제일시(입금확인일), 주문상품명, 수량, 품목별 결제금액, 판매가, 상품구매금액, 상품구매금액(KRW), 총 상품구매금액, 총 상품구매금액(KRW), 마켓 자체 품목 코드, 자체상품코드, 자체분류, 자체품목코드, ..., 취소신청 구분`. **`결제일시(입금확인일)`는 Excel 날짜 직렬번호**라 Task 4의 `excelSerialToDateStr`가 필요하다.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// spao-kids-dashboard/src/utils/gonghomParser.test.js
import { describe, it, expect } from 'vitest'
import { parseGonghomOrders, isGonghomCanceled } from './gonghomParser'

const HEADER = [
  '품목별 주문번호', '주문상태정보', '결제자', '결제일시(입금확인일)', '주문상품명', '수량',
  '품목별 결제금액', '판매가', '상품구매금액', '상품구매금액(KRW)', '총 상품구매금액', '총 상품구매금액(KRW)',
  '마켓 자체 품목 코드', '자체상품코드', '자체분류', '자체품목코드', '자체품목코드(세트구성상품)',
  '상품옵션', '상품옵션(기본)', '옵션+판매가', '옵션추가 가격', '옵션형태',
  '주문상품명(옵션포함)', '추가입력옵션', '추가입력옵션(상세)', '취소신청 구분',
]

describe('parseGonghomOrders', () => {
  it('주문 행에서 날짜(Excel 직렬번호)·스타일코드·금액을 추출한다', () => {
    const rows = [
      HEADER,
      [
        '20260325-0000068-01', '', '박혜미', 46106.0005787037,
        '[키즈] (산리오캐릭터즈) 반팔 파자마(LIGHT BLUE)_SPPPG25KU1', 1,
        30524, 39900, 39900, 39900, 111700, 111700,
        '', 'SPPPG25KU1', '기본 자체분류', 'SPPPG25KU151110', '',
        'Color=(51)LIGHT BLUE, Size=110', 'Color=(51)LIGHT BLUE, Size=110', 39900, 0, '조합형',
        '[키즈] (산리오캐릭터즈) 반팔 파자마(LIGHT BLUE)_SPPPG25KU1(Color=(51)LIGHT BLUE, Size=110)', '', '', '',
      ],
    ]
    const items = parseGonghomOrders(rows)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      date: '2026-03-25', styleCode: 'SPPPG25KU1', qty: 1, amt: 30524,
    })
    expect(isGonghomCanceled(items[0])).toBe(false)
  })

  it('취소신청 구분에 값이 있으면 취소로 판정한다', () => {
    const rows = [
      HEADER,
      [
        '20260325-0000999-01', '', '김철수', 46106.5,
        '[키즈] 후드 집업_SPMZG25KU1', 1,
        29900, 29900, 29900, 29900, 29900, 29900,
        '', 'SPMZG25KU1', '기본 자체분류', 'SPMZG25KU151110', '',
        '', '', 29900, 0, '조합형', '', '', '', 'Y',
      ],
    ]
    const items = parseGonghomOrders(rows)
    expect(isGonghomCanceled(items[0])).toBe(true)
  })

  it('행/헤더가 없으면 빈 배열을 반환한다', () => {
    expect(parseGonghomOrders([])).toEqual([])
    expect(parseGonghomOrders(null)).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx vitest run src/utils/gonghomParser.test.js
```
Expected: FAIL — `Cannot find module './gonghomParser'`.

- [ ] **Step 3: `gonghomParser.js` 작성**

```js
import { excelSerialToDateStr } from './excelDate'

// (2026-07-10 실행 중 코드 리뷰로 수정됨: trim 누락 시 상태값 공백으로 취소판정 실패,
//  콤마 미제거 시 "39,900" 같은 값이 0으로 조용히 깨지는 문제 발견 — 아래가 수정판)
function toStr(v) { return v == null ? '' : String(v).trim() }
function toNum(v) {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function extractStyleCode(name) {
  const m = toStr(name).match(/_([A-Za-z0-9]+)\s*$/)
  return m ? m[1] : ''
}

// 공홈(자사몰) 주문상세 엑셀 rows → 정규화된 주문 아이템 배열.
// '취소신청 구분'에 값이 있으면 취소로 간주 — 실제 취소값(예: 'Y') 확인 전 임시 가정(계획 문서 참고).
export function parseGonghomOrders(rows) {
  if (!rows || rows.length < 2) return []
  const headers = rows[0].map(toStr)
  const idx = {
    name:       headers.findIndex(h => h === '주문상품명'),
    qty:        headers.findIndex(h => h === '수량'),
    amt:        headers.findIndex(h => h.includes('품목별 결제금액')),
    paidAt:     headers.findIndex(h => h.includes('결제일시')),
    cancelFlag: headers.findIndex(h => h.includes('취소신청 구분')),
  }

  const items = []
  for (const row of rows.slice(1)) {
    if (!row || row.length === 0) continue
    const date = excelSerialToDateStr(row[idx.paidAt])
    if (!date) continue
    const name = toStr(row[idx.name])
    items.push({
      date,
      styleCode: extractStyleCode(name),
      name,
      canceled: toStr(row[idx.cancelFlag]).length > 0,
      qty: toNum(row[idx.qty]),
      amt: toNum(row[idx.amt]),
    })
  }
  return items
}

export function isGonghomCanceled(item) {
  return item.canceled === true
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
npx vitest run src/utils/gonghomParser.test.js
```
Expected: PASS (3 tests). **날짜가 `2026-03-25`가 아닌 다른 값으로 나오면** Task 4에서 남긴 것과 같은 이유(SSF 변환 오차 가능성) — 두 테스트 모두 같은 날짜를 기대하도록 맞춰서 고친다.

- [ ] **Step 5: 커밋**

```bash
git add spao-kids-dashboard/src/utils/gonghomParser.js spao-kids-dashboard/src/utils/gonghomParser.test.js
git commit -m "feat: 공홈(자사몰) 당일 시트 파서 추가"
```

---

### Task 8: 네이버 "당일" 시트 파서

**Files:**
- Create: `spao-kids-dashboard/src/utils/naverParser.js`
- Test: `spao-kids-dashboard/src/utils/naverParser.test.js`

**실제 컬럼(2026-07-10, `네이버 당일` 시트에서 확보, 발췌)**: `..., 주문상태, 주문세부상태, ..., 결제일, 상품번호, 상품명, ..., 수량, 옵션가격, 상품가격, 최종 상품별 할인액, 최초 상품별 할인액, 판매자 부담 할인액, 최종 상품별 총 주문금액, ...`. **`결제일`은 Excel 날짜 직렬번호**, **상품명은 언더바 없이 스타일코드가 마지막 토큰**(예: `... 반팔 티셔츠 SPHWG24KU1`)이라 다른 채널과 추출 규칙이 다르다.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// spao-kids-dashboard/src/utils/naverParser.test.js
import { describe, it, expect } from 'vitest'
import { parseNaverOrders, isNaverCanceled } from './naverParser'

const HEADER = [
  '상품주문번호', '주문번호', '배송속성', '풀필먼트사(주문 기준)', '택배사(주문 기준)',
  '배송방법(구매자 요청)', '배송방법', '택배사', '송장번호', '발송일', '판매채널',
  '구매자명', '구매자ID', '수취인명', '주문상태', '주문세부상태', '수량클레임 여부',
  '결제위치', '결제일', '상품번호', '상품명', '상품종류', '반품안심케어', '멤버십N배송',
  '옵션정보', '옵션관리코드', '수량', '옵션가격', '상품가격',
  '최종 상품별 할인액', '최초 상품별 할인액', '판매자 부담 할인액', '최종 상품별 총 주문금액',
]

describe('parseNaverOrders', () => {
  it('주문 행에서 날짜(Excel 직렬번호)·스타일코드(언더바 없음)·금액을 추출한다', () => {
    const rows = [
      HEADER,
      [
        '2026042088990041', '2026042035646151', 'N배송', 'CJ대한통운(더풀필)', 'CJ대한통운',
        '택배,등기,소포', '택배,등기,소포', 'CJ대한통운', '', 46132.559583333335, '스마트스토어',
        '이하늘', 'nurs*****', '이하늘', '발송대기', '신규주문', 'N',
        'MOBILE', 46132.55876157407, '13242105441',
        '[당일출고] 스파오키즈 쿠디 폴로 칼라 반팔 티셔츠 SPHWG24KU1', '조합형옵션상품', '비대상', '대상',
        '색상: (31)LIGHT YELLOW / 사이즈: 120', 'SPHWG24KU131120', 1, 0, 19900,
        3780, 3780, 3780, 16120,
      ],
    ]
    const items = parseNaverOrders(rows)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      date: '2026-04-20', styleCode: 'SPHWG24KU1', qty: 1, amt: 16120, status: '발송대기',
    })
    expect(isNaverCanceled(items[0])).toBe(false)
  })

  it('주문상태에 "취소"가 포함되면 취소로 판정한다', () => {
    const rows = [
      HEADER,
      [
        '2026042088990099', '2026042035646199', 'N배송', 'CJ대한통운(더풀필)', 'CJ대한통운',
        '택배,등기,소포', '택배,등기,소포', 'CJ대한통운', '', 46132.6, '스마트스토어',
        '김구매', 'buy*****', '김구매', '취소완료', '구매취소', 'N',
        'MOBILE', 46132.6, '13242105499',
        '[키즈] 코튼 레귤러핏 반팔 티셔츠 SPRWGA9KU1', '조합형옵션상품', '비대상', '대상',
        '색상: (10)WHITE / 사이즈: 120', 'SPRWGA9KU110120', 1, 0, 15900,
        3020, 3020, 3020, 12880,
      ],
    ]
    const items = parseNaverOrders(rows)
    expect(isNaverCanceled(items[0])).toBe(true)
  })

  it('행/헤더가 없으면 빈 배열을 반환한다', () => {
    expect(parseNaverOrders([])).toEqual([])
    expect(parseNaverOrders(null)).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx vitest run src/utils/naverParser.test.js
```
Expected: FAIL — `Cannot find module './naverParser'`.

- [ ] **Step 3: `naverParser.js` 작성**

```js
import { excelSerialToDateStr } from './excelDate'

// (2026-07-10 실행 중 코드 리뷰로 수정됨: trim 누락 시 상태값 공백으로 취소판정 실패,
//  콤마 미제거 시 "39,900" 같은 값이 0으로 조용히 깨지는 문제 발견 — 아래가 수정판)
function toStr(v) { return v == null ? '' : String(v).trim() }
function toNum(v) {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

// 네이버 상품명은 언더바 없이 스타일코드가 마지막 공백 구분 토큰으로 붙는다(공홈/이랜드몰과 다름).
function extractStyleCode(name) {
  const m = toStr(name).match(/(SP[A-Za-z0-9]+)\s*$/)
  return m ? m[1] : ''
}

// 네이버 스마트스토어 주문상세 rows → 정규화된 주문 아이템 배열.
export function parseNaverOrders(rows) {
  if (!rows || rows.length < 2) return []
  const headers = rows[0].map(toStr)
  const idx = {
    name:   headers.findIndex(h => h === '상품명'),
    status: headers.findIndex(h => h === '주문상태'),
    qty:    headers.findIndex(h => h === '수량'),
    amt:    headers.findIndex(h => h.includes('최종 상품별 총 주문금액')),
    paidAt: headers.findIndex(h => h.includes('결제일')),
  }

  const items = []
  for (const row of rows.slice(1)) {
    if (!row || row.length === 0) continue
    const date = excelSerialToDateStr(row[idx.paidAt])
    if (!date) continue
    const name = toStr(row[idx.name])
    items.push({
      date,
      styleCode: extractStyleCode(name),
      name,
      status: toStr(row[idx.status]),
      qty:    toNum(row[idx.qty]),
      amt:    toNum(row[idx.amt]),
    })
  }
  return items
}

export function isNaverCanceled(item) {
  return item.status.includes('취소')
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
npx vitest run src/utils/naverParser.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add spao-kids-dashboard/src/utils/naverParser.js spao-kids-dashboard/src/utils/naverParser.test.js
git commit -m "feat: 네이버 당일 시트 파서 추가"
```

---

### Task 9: `kids_channel_daily` 업로드 유틸

**Files:**
- Create: `spao-kids-dashboard/src/utils/uploadKidsChannelDaily.js`
- Test: `spao-kids-dashboard/src/utils/uploadKidsChannelDaily.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// spao-kids-dashboard/src/utils/uploadKidsChannelDaily.test.js
import { describe, it, expect, vi } from 'vitest'
import { uploadKidsChannelDaily } from './uploadKidsChannelDaily'

function makeMockClient({ error = null, count = 2 } = {}) {
  const upsert = vi.fn().mockResolvedValue({ error, count })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from }, upsert, from }
}

describe('uploadKidsChannelDaily', () => {
  it('집계 행을 kids_channel_daily 스키마로 변환해 upsert한다', async () => {
    const { client, from, upsert } = makeMockClient()
    const rows = [
      { date: '2026-07-01', channel: '이랜드몰', discountAmt: null, orderCnt: 2, orderAmt: 69800, realOrderCnt: 1, realAmt: 39900, cancelAmt: 29900 },
    ]
    const result = await uploadKidsChannelDaily(client, rows)

    expect(from).toHaveBeenCalledWith('kids_channel_daily')
    expect(upsert).toHaveBeenCalledWith(
      [{
        stat_date: '2026-07-01', channel: '이랜드몰',
        order_cnt: 2, order_amt: 69800, real_order_cnt: 1, real_amt: 39900,
        cancel_amt: 29900, discount_amt: null, _source: 'eland_upload',
      }],
      { onConflict: 'stat_date,channel', count: 'exact' },
    )
    expect(result).toEqual({ ok: true, upserted: 2 })
  })

  it('행이 없으면 업서트 없이 성공을 반환한다', async () => {
    const { client, upsert } = makeMockClient()
    const result = await uploadKidsChannelDaily(client, [])
    expect(upsert).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true, upserted: 0 })
  })

  it('Supabase 에러를 그대로 전달한다', async () => {
    const { client } = makeMockClient({ error: { message: 'boom' } })
    const result = await uploadKidsChannelDaily(client, [
      { date: '2026-07-01', channel: '자사몰', discountAmt: null, orderCnt: 1, orderAmt: 1, realOrderCnt: 1, realAmt: 1, cancelAmt: 0 },
    ])
    expect(result).toEqual({ ok: false, error: 'boom' })
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx vitest run src/utils/uploadKidsChannelDaily.test.js
```
Expected: FAIL — `Cannot find module './uploadKidsChannelDaily'`.

- [ ] **Step 3: `uploadKidsChannelDaily.js` 작성**

```js
// rows: aggregateChannelDaily() 결과 배열
// supabaseClient: @supabase/supabase-js 클라이언트(테스트에서는 모의 객체 주입)
const SOURCE_BY_CHANNEL = { '자사몰': 'gonghom_upload', '이랜드몰': 'eland_upload', '네이버': 'naver_upload' }

export async function uploadKidsChannelDaily(supabaseClient, rows) {
  if (!rows || rows.length === 0) return { ok: true, upserted: 0 }

  const payload = rows.map(r => ({
    stat_date: r.date,
    channel: r.channel,
    order_cnt: r.orderCnt,
    order_amt: r.orderAmt,
    real_order_cnt: r.realOrderCnt,
    real_amt: r.realAmt,
    cancel_amt: r.cancelAmt,
    discount_amt: r.discountAmt,
    _source: SOURCE_BY_CHANNEL[r.channel] ?? null,
  }))

  const { error, count } = await supabaseClient
    .from('kids_channel_daily')
    .upsert(payload, { onConflict: 'stat_date,channel', count: 'exact' })

  if (error) return { ok: false, error: error.message }
  return { ok: true, upserted: count ?? payload.length }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
npx vitest run src/utils/uploadKidsChannelDaily.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add spao-kids-dashboard/src/utils/uploadKidsChannelDaily.js spao-kids-dashboard/src/utils/uploadKidsChannelDaily.test.js
git commit -m "feat: kids_channel_daily 업로드 유틸 추가(모의 클라이언트로 테스트)"
```

---

### Task 10: 업로드 + 조회 화면 (`App.jsx`)

**Files:**
- Create: `spao-kids-dashboard/src/App.jsx`

**설계**: 파일 하나(xlsb/xlsx)를 선택하면 `공홈 당일`/`이랜드몰 당일`/`네이버 당일` 중 워크북에 실제로 있는 시트만 찾아 각 파서로 파싱 → `aggregateChannelDaily`로 집계 → 화면에 미리보기 → "Supabase에 저장" 버튼으로 `uploadKidsChannelDaily` 호출. 아래에는 `kids_channel_daily`의 최근 14일 실적을 표로 보여준다. 이 컴포넌트는 자동 테스트 대상이 아니다(기존 spao-dashboard-v3도 `App.jsx`는 유닛 테스트하지 않고 `npm run dev`로 직접 확인하는 관행 — `vitest.config.js`의 `include: ['src/utils/**/*.test.js']` 참고) — Step 3에서 직접 켜서 확인한다.

- [ ] **Step 1: `App.jsx` 작성**

```jsx
import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase, cloudEnabled } from './lib/supabase'
import { parseGonghomOrders, isGonghomCanceled } from './utils/gonghomParser'
import { parseElandOrders, isElandCanceled } from './utils/elandParser'
import { parseNaverOrders, isNaverCanceled } from './utils/naverParser'
import { aggregateChannelDaily } from './utils/aggregateChannelDaily'
import { uploadKidsChannelDaily } from './utils/uploadKidsChannelDaily'

const SHEET_ADAPTERS = [
  { sheetName: '공홈 당일',   channel: '자사몰',  parse: parseGonghomOrders, isCanceled: isGonghomCanceled },
  { sheetName: '이랜드몰 당일', channel: '이랜드몰', parse: parseElandOrders,   isCanceled: isElandCanceled },
  { sheetName: '네이버 당일',  channel: '네이버',   parse: parseNaverOrders,   isCanceled: isNaverCanceled },
]

export default function App() {
  const [preview, setPreview] = useState([])   // aggregateChannelDaily 결과(3채널 합침)
  const [log, setLog] = useState([])           // 시트별 인식 로그
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState(null)
  const [recent, setRecent] = useState([])      // 최근 14일 조회 결과

  const loadRecent = async () => {
    if (!supabase) return
    const since = new Date(Date.now() - 14 * 86400 * 1000).toISOString().slice(0, 10)
    const { data } = await supabase
      .from('kids_channel_daily')
      .select('*')
      .gte('stat_date', since)
      .order('stat_date', { ascending: false })
    setRecent(data || [])
  }

  useEffect(() => { loadRecent() }, [])

  const handleFile = async (file) => {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })

    const nextLog = []
    let combined = []
    for (const { sheetName, channel, parse, isCanceled } of SHEET_ADAPTERS) {
      const ws = wb.Sheets[sheetName]
      if (!ws) { nextLog.push({ sheetName, channel, status: 'skip', msg: '워크북에 없음' }); continue }
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const items = parse(rows)
      const daily = aggregateChannelDaily(items, { channel, isCanceled })
      combined = combined.concat(daily)
      nextLog.push({ sheetName, channel, status: 'ok', msg: `${items.length}건 → ${daily.length}일 집계` })
    }
    setLog(nextLog)
    setPreview(combined.sort((a, b) => a.date.localeCompare(b.date) || a.channel.localeCompare(b.channel)))
    setSaveResult(null)
  }

  const handleSave = async () => {
    if (!supabase) return
    setSaving(true)
    const result = await uploadKidsChannelDaily(supabase, preview)
    setSaveResult(result)
    setSaving(false)
    if (result.ok) await loadRecent()
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <h1>SPAO 키즈 실적 업로드</h1>
      {!cloudEnabled && <p style={{ color: 'red' }}>⚠ .env.local에 키즈 Supabase 프로젝트 URL/키를 설정하세요.</p>}

      <p>실적판 엑셀(.xlsb/.xlsx) 파일을 선택하세요 — "공홈 당일"/"이랜드몰 당일"/"네이버 당일" 시트를 자동으로 찾아 파싱합니다.</p>
      <input type="file" accept=".xlsb,.xlsx,.xls" onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]) }} />

      {log.length > 0 && (
        <ul>
          {log.map(l => <li key={l.sheetName}>{l.sheetName} → {l.status === 'ok' ? '✓' : '✕'} {l.msg}</li>)}
        </ul>
      )}

      {preview.length > 0 && (
        <>
          <h2>미리보기 ({preview.length}행)</h2>
          <table border="1" cellPadding="4">
            <thead>
              <tr><th>날짜</th><th>채널</th><th>주문건수</th><th>주문금액</th><th>실주문건수</th><th>실매출</th><th>취소금액</th></tr>
            </thead>
            <tbody>
              {preview.map(r => (
                <tr key={`${r.date}-${r.channel}`}>
                  <td>{r.date}</td><td>{r.channel}</td><td>{r.orderCnt}</td>
                  <td>{r.orderAmt.toLocaleString()}</td><td>{r.realOrderCnt}</td>
                  <td>{r.realAmt.toLocaleString()}</td><td>{r.cancelAmt.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={handleSave} disabled={saving || !cloudEnabled}>
            {saving ? '저장 중...' : 'Supabase에 저장'}
          </button>
          {saveResult && (
            <p style={{ color: saveResult.ok ? 'green' : 'red' }}>
              {saveResult.ok ? `저장 완료 (${saveResult.upserted}행)` : `저장 실패: ${saveResult.error}`}
            </p>
          )}
        </>
      )}

      <h2>최근 14일 실적</h2>
      <table border="1" cellPadding="4">
        <thead>
          <tr><th>날짜</th><th>채널</th><th>실매출</th><th>실주문건수</th><th>출처</th></tr>
        </thead>
        <tbody>
          {recent.map(r => (
            <tr key={`${r.stat_date}-${r.channel}`}>
              <td>{r.stat_date}</td><td>{r.channel}</td>
              <td>{Number(r.real_amt).toLocaleString()}</td><td>{r.real_order_cnt}</td><td>{r._source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: 로컬에서 실행**

```bash
cd spao-kids-dashboard
npm run dev
```
브라우저로 표시된 주소(예: `http://localhost:5173`) 접속.

- [ ] **Step 3: 실제 파일로 업로드 검증**

`★스파오키즈_주문실적판_2607(1).xlsb` 파일을 선택 → 로그에 3개 시트 모두 "✓ N건 → M일 집계"로 뜨는지 확인 → 미리보기 표에 날짜·채널별 숫자가 보이는지 확인 → "Supabase에 저장" 클릭 → "저장 완료" 메시지 확인.

- [ ] **Step 4: Supabase에서 저장 결과 확인**

키즈 프로젝트 SQL Editor에서:
```sql
select channel, count(*), sum(real_amt) from public.kids_channel_daily group by channel;
```
Expected: `자사몰`/`이랜드몰`/`네이버` 3행(워크북에 있던 시트 기준), 각 `real_amt` 합계가 0보다 큼.

- [ ] **Step 5: 커밋**

```bash
git add spao-kids-dashboard/src/App.jsx
git commit -m "feat: 3채널 xlsb 업로드 + 최근 실적 조회 화면 추가"
```

---

### Task 11: 전체 파이프라인 통합 테스트 (실제 관측 표본 기반)

**Files:**
- Test: `spao-kids-dashboard/src/utils/pipeline.integration.test.js`

**목적**: 3개 파서 각각 → `aggregateChannelDaily` → `uploadKidsChannelDaily` payload 변환까지, 실제 관측된 표본으로 하나의 흐름을 검증해 Task 5~9가 서로 맞물려 동작함을 보증한다.

- [ ] **Step 1: 통합 테스트 작성**

```js
// spao-kids-dashboard/src/utils/pipeline.integration.test.js
import { describe, it, expect, vi } from 'vitest'
import { parseElandOrders, isElandCanceled } from './elandParser'
import { parseGonghomOrders, isGonghomCanceled } from './gonghomParser'
import { aggregateChannelDaily } from './aggregateChannelDaily'
import { uploadKidsChannelDaily } from './uploadKidsChannelDaily'

const ELAND_HEADER = [
  'NO', '전시몰', '주문번호', '배송유형', '상품번호', '상품명', '단품명', '주문상태',
  '지연종류', '상품권주문취소접수여부', '상품순번', '주문자', '주문유형', '배송정보',
  '외부몰명', '외부몰주문번호', '품명 및 모델명', 'ERP단품코드', '변경ERP단품코드',
  '판매금액', '주문수량', '취소수량', '반품수량', '판매단가', '주문일시',
]
const GONGHOM_HEADER = [
  '품목별 주문번호', '주문상태정보', '결제자', '결제일시(입금확인일)', '주문상품명', '수량',
  '품목별 결제금액', '판매가', '상품구매금액', '상품구매금액(KRW)', '총 상품구매금액', '총 상품구매금액(KRW)',
  '마켓 자체 품목 코드', '자체상품코드', '자체분류', '자체품목코드', '자체품목코드(세트구성상품)',
  '상품옵션', '상품옵션(기본)', '옵션+판매가', '옵션추가 가격', '옵션형태',
  '주문상품명(옵션포함)', '추가입력옵션', '추가입력옵션(상세)', '취소신청 구분',
]

describe('키즈 트랙2 파이프라인 통합(이랜드몰+공홈)', () => {
  it('두 채널을 각각 파싱·집계해 하나의 upsert 배치로 합칠 수 있다', async () => {
    const elandItems = parseElandOrders([
      ELAND_HEADER,
      [1, '이랜드몰', '202512154294487', '일반', '2509109426', '[키즈] (망그러진곰) 수면 파자마_SPPPF4VKU2', '(26)Light Pink/150', '결제완료', '', 'N', 1, '민*은', '일반', '', '', '', 'SPPPF4VKU2', 'SPPPF4VKU226150', '', 39900, 1, 0, 0, 39900, '2025-12-15 17:22:23'],
    ])
    const gonghomItems = parseGonghomOrders([
      GONGHOM_HEADER,
      ['20260325-0000068-01', '', '박혜미', 46106.0005787037, '[키즈] (산리오캐릭터즈) 반팔 파자마(LIGHT BLUE)_SPPPG25KU1', 1, 30524, 39900, 39900, 39900, 111700, 111700, '', 'SPPPG25KU1', '기본 자체분류', 'SPPPG25KU151110', '', '', '', 39900, 0, '조합형', '', '', '', ''],
    ])

    const elandDaily   = aggregateChannelDaily(elandItems, { channel: '이랜드몰', isCanceled: isElandCanceled })
    const gonghomDaily = aggregateChannelDaily(gonghomItems, { channel: '자사몰', isCanceled: isGonghomCanceled })
    const combined = [...elandDaily, ...gonghomDaily]

    expect(combined).toEqual([
      { date: '2025-12-15', channel: '이랜드몰', discountAmt: null, orderCnt: 1, orderAmt: 39900, realOrderCnt: 1, realAmt: 39900, cancelAmt: 0 },
      { date: '2026-03-25', channel: '자사몰',   discountAmt: null, orderCnt: 1, orderAmt: 30524, realOrderCnt: 1, realAmt: 30524, cancelAmt: 0 },
    ])

    const upsert = vi.fn().mockResolvedValue({ error: null, count: combined.length })
    const client = { from: vi.fn().mockReturnValue({ upsert }) }
    const result = await uploadKidsChannelDaily(client, combined)

    expect(result).toEqual({ ok: true, upserted: 2 })
    expect(upsert.mock.calls[0][0]).toEqual([
      { stat_date: '2025-12-15', channel: '이랜드몰', order_cnt: 1, order_amt: 39900, real_order_cnt: 1, real_amt: 39900, cancel_amt: 0, discount_amt: null, _source: 'eland_upload' },
      { stat_date: '2026-03-25', channel: '자사몰',   order_cnt: 1, order_amt: 30524, real_order_cnt: 1, real_amt: 30524, cancel_amt: 0, discount_amt: null, _source: 'gonghom_upload' },
    ])
  })
})
```

- [ ] **Step 2: 전체 테스트 스위트 실행**

```bash
cd spao-kids-dashboard
npm test
```
Expected: 모든 테스트 파일 PASS (styleCodeParser, excelDate, aggregateChannelDaily, elandParser, gonghomParser, naverParser, uploadKidsChannelDaily, pipeline.integration — 총 8개 파일).

- [ ] **Step 3: 커밋**

```bash
git add spao-kids-dashboard/src/utils/pipeline.integration.test.js
git commit -m "test: 이랜드몰+공홈 파싱->집계->업로드 통합 테스트 추가"
```

---

## 완료 후 상태 점검

- 키즈 전용 Supabase 프로젝트에 `kids_channel_daily` 테이블이 있고, 실제 xlsb 업로드로 자사몰·이랜드몰·네이버 3채널 데이터가 채워진 상태.
- `npm run dev`로 파일을 올릴 때마다 그날 값을 다시 계산해 upsert(멱등) — 매일 반복 업로드해도 안전.
- 자동화(채널별)가 준비되면 그 채널의 `items[]`를 만드는 부분만 API 응답 매핑으로 교체하고, `aggregateChannelDaily`/`uploadKidsChannelDaily`/화면은 그대로 재사용한다.

## 다음 계획(별도로 작성, 채널별로 하나씩)

1. **자사몰 자동화** — 성인 프로젝트의 N.E.E.D 파이프라인(`daily_sales`)에서 키즈 몫만 걸러 이 키즈 프로젝트로 넘기는 방법 확정(같은 계정 소유면 크로스 프로젝트 Edge Function 동기화, 또는 그냥 계속 xlsb 수기 업로드 유지도 선택지).
2. **네이버 커머스 API 연동** — 키즈 전용 셀러 계정 자격증명 확보 후, OAuth2 토큰 발급 → 주문 조회 → 이번 계획의 `aggregateChannelDaily`/`uploadKidsChannelDaily` 재사용.
3. **이랜드몰 자동 추출 확인** — 자동화 가능 여부 확인되면 업로드 UI 대신 스케줄 작업으로 교체.
4. **화면 확장** — 당월 누적, 목표달성율, 채널별 추이 그래프.
