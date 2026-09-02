# 목표 대비 · 전년 비교 스코어보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 종합진단(L1) 화면에 매출·전환율·객단가 3개 지표의 목표 대비 달성률 + 전년 동요일 대비 증감을 보여주는 스코어보드 섹션을 추가한다.

**Architecture:** 구글 시트(목표값/전년비교 탭, 공개 CSV export)를 새 Supabase Edge Function `sheet-target-pull`이 매일 읽어 `daily_target`/`daily_last_year_actual` 테이블에 upsert한다. 프론트는 그 테이블만 읽고, 이번 기간 "실적" 값은 이미 계산돼 있는 N.E.E.D 파이프라인 숫자를 그대로 재사용한다.

**Tech Stack:** React 19 + Vite (프론트), Supabase(Postgres + Edge Functions/Deno + pg_cron/pg_net), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-target-progress-scoreboard-design.md`

---

## Task 1: Supabase 테이블 생성 (daily_target / daily_last_year_actual)

**Files:**
- Create: `spao-dashboard-v3/supabase/sheet_target_pull_tables.sql`

- [ ] **Step 1: SQL 파일 작성**

```sql
-- ════════════════════════════════════════════════════════════════════════
-- daily_target / daily_last_year_actual — 목표 대비·전년 비교 스코어보드용
-- ────────────────────────────────────────────────────────────────────────
-- 구글 시트(목표값 탭 / 전년 비교 탭)를 sheet-target-pull Edge Function이
-- 매일 읽어 이 두 테이블에 upsert한다. 이번 기간 "실적"은 이 테이블에
-- 없다 — 기존 N.E.E.D 파이프라인 숫자를 화면에서 그대로 쓴다.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.daily_target (
  stat_date        date primary key,
  revenue_target   numeric not null default 0,
  sessions_target  numeric not null default 0,
  conv_rate_target numeric not null default 0,   -- 퍼센트 단위 숫자 (4 = 4%)
  aov_target       numeric not null default 0,
  _ingested_at     timestamptz not null default now()
);

create table if not exists public.daily_last_year_actual (
  stat_date    date primary key,   -- 작년 실제 달력 날짜 (예: 2025-05-01)
  revenue      numeric not null default 0,
  orders       numeric not null default 0,
  sessions     numeric not null default 0,
  conv_rate    numeric not null default 0,   -- 퍼센트 단위 숫자
  aov          numeric not null default 0,
  _ingested_at timestamptz not null default now()
);

-- ── RLS: 기존 daily_ga4_* 와 동일 패턴 — authenticated 읽기만, 쓰기는 service_role ──
alter table public.daily_target enable row level security;
drop policy if exists "auth read daily_target" on public.daily_target;
create policy "auth read daily_target" on public.daily_target for select to authenticated using (true);

alter table public.daily_last_year_actual enable row level security;
drop policy if exists "auth read daily_last_year_actual" on public.daily_last_year_actual;
create policy "auth read daily_last_year_actual" on public.daily_last_year_actual for select to authenticated using (true);

-- ── 확인 ──
-- select column_name, data_type from information_schema.columns
-- where table_name = 'daily_target' order by ordinal_position;
-- select column_name, data_type from information_schema.columns
-- where table_name = 'daily_last_year_actual' order by ordinal_position;
```

- [ ] **Step 2: 사용자에게 Supabase SQL Editor에서 실행 요청**

이 프로젝트는 Supabase Dashboard를 사람이 직접 조작하는 관례라(로컬에 Supabase CLI 연결 없음), 에이전트가 실행할 수 없다. 사용자에게 다음을 요청한다:

> "`spao-dashboard-v3/supabase/sheet_target_pull_tables.sql` 파일 내용을 Supabase Dashboard → SQL Editor에 붙여넣고 실행해주세요. 실행 후 아래 확인 쿼리로 두 테이블의 컬럼이 정상 생성됐는지 확인해주세요."

확인 쿼리:
```sql
select table_name, column_name, data_type from information_schema.columns
where table_name in ('daily_target', 'daily_last_year_actual')
order by table_name, ordinal_position;
```

기대 결과: `daily_target` 6개 컬럼(stat_date, revenue_target, sessions_target, conv_rate_target, aov_target, _ingested_at), `daily_last_year_actual` 7개 컬럼(stat_date, revenue, orders, sessions, conv_rate, aov, _ingested_at).

- [ ] **Step 3: Commit**

```bash
git add spao-dashboard-v3/supabase/sheet_target_pull_tables.sql
git commit -m "feat: daily_target/daily_last_year_actual 테이블 SQL 추가"
```

---

## Task 2: storage.js — 목표/전년 데이터 조회 + 순수 집계 함수

**Files:**
- Modify: `spao-dashboard-v3/src/utils/storage.js`
- Test: `spao-dashboard-v3/src/utils/storage.test.js`

날짜 산술(`shiftDaysISO`)과 집계 로직(`aggregateDailyTargetRows`/`aggregateLastYearActualRows`)은 supabase 클라이언트 없이 순수 함수로 분리해 유닛 테스트한다. `getTargetProgressData`는 이 순수 함수들을 supabase 조회 결과에 적용하는 얇은 래퍼라 `getGA4WeeklyData`처럼 별도 유닛 테스트를 붙이지 않는다(기존 관례 — supabase 왕복이 필요한 함수는 유닛 테스트 대상이 아니었음).

- [ ] **Step 1: 실패하는 테스트 작성**

먼저 `spao-dashboard-v3/src/utils/storage.test.js` 맨 위 import 줄을 바꾼다.

현재:
```js
import { describe, it, expect } from 'vitest'
import { budgetStoreCorner, fitPayloadForCloud, isStatementTimeout } from './storage'
```

다음으로 교체:
```js
import { describe, it, expect } from 'vitest'
import {
  budgetStoreCorner, fitPayloadForCloud, isStatementTimeout,
  shiftDaysISO, aggregateDailyTargetRows, aggregateLastYearActualRows,
} from './storage'
```

그 다음 파일 맨 끝(마지막 `describe` 블록 뒤)에 추가:

```js
describe('shiftDaysISO', () => {
  it('364일 전 날짜를 계산한다(동요일 매칭)', () => {
    expect(shiftDaysISO('2026-08-26', -364)).toBe('2025-08-27')
    expect(shiftDaysISO('2026-09-01', -364)).toBe('2025-09-02')
  })

  it('364 = 52×7 이라 요일이 항상 그대로 맞는다', () => {
    const toWeekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay()
    expect(toWeekday(shiftDaysISO('2026-08-26', -364))).toBe(toWeekday('2026-08-26'))
  })

  it('양수 일수도 지원한다(미래 방향)', () => {
    expect(shiftDaysISO('2026-01-01', 1)).toBe('2026-01-02')
  })
})

describe('aggregateDailyTargetRows', () => {
  it('매출 목표는 합산, 전환율/객단가 목표는 평균낸다', () => {
    const rows = [
      { revenue_target: 100, conv_rate_target: 4, aov_target: 50000 },
      { revenue_target: 200, conv_rate_target: 6, aov_target: 60000 },
    ]
    const out = aggregateDailyTargetRows(rows)
    expect(out.revenueTarget).toBe(300)
    expect(out.convRateTarget).toBe(5)
    expect(out.aovTarget).toBe(55000)
    expect(out.hasTarget).toBe(true)
  })

  it('빈 배열이면 hasTarget=false, 비율값은 null', () => {
    const out = aggregateDailyTargetRows([])
    expect(out.hasTarget).toBe(false)
    expect(out.revenueTarget).toBe(0)
    expect(out.convRateTarget).toBeNull()
    expect(out.aovTarget).toBeNull()
  })

  it('null/undefined 입력도 빈 배열처럼 처리한다', () => {
    expect(aggregateDailyTargetRows(null).hasTarget).toBe(false)
    expect(aggregateDailyTargetRows(undefined).hasTarget).toBe(false)
  })
})

describe('aggregateLastYearActualRows', () => {
  it('전환율/객단가는 SUM/SUM 가중 계산(단순 평균이 아님)', () => {
    // 하루는 세션 많고 전환율 낮음, 하루는 세션 적고 전환율 높음 —
    // 단순 평균과 가중 평균이 달라야 가중 계산임을 검증할 수 있다.
    const rows = [
      { revenue: 1000000, orders: 10, sessions: 1000 }, // 전환율 1%
      { revenue: 500000, orders: 10, sessions: 100 },   // 전환율 10%
    ]
    const out = aggregateLastYearActualRows(rows)
    expect(out.revenue).toBe(1500000)
    expect(out.orders).toBe(20)
    expect(out.sessions).toBe(1100)
    // SUM(orders)/SUM(sessions) = 20/1100*100 ≈ 1.818% (단순평균 5.5%와 다름)
    expect(out.convRate).toBeCloseTo(20 / 1100 * 100, 5)
    expect(out.aov).toBe(1500000 / 20)
    expect(out.hasLastYear).toBe(true)
  })

  it('빈 배열이면 hasLastYear=false, 비율값은 null', () => {
    const out = aggregateLastYearActualRows([])
    expect(out.hasLastYear).toBe(false)
    expect(out.convRate).toBeNull()
    expect(out.aov).toBeNull()
  })

  it('세션/주문이 0이면 나눗셈 대신 null을 반환한다', () => {
    const out = aggregateLastYearActualRows([{ revenue: 0, orders: 0, sessions: 0 }])
    expect(out.hasLastYear).toBe(true)
    expect(out.convRate).toBeNull()
    expect(out.aov).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
cd spao-dashboard-v3
npx vitest run src/utils/storage.test.js
```

기대 결과: `shiftDaysISO`/`aggregateDailyTargetRows`/`aggregateLastYearActualRows`가 `storage.js`에 없어서 import 에러 또는 `undefined is not a function`으로 실패.

- [ ] **Step 3: `storage.js`에 구현 추가**

`spao-dashboard-v3/src/utils/storage.js` 맨 끝(파일 끝, `importJSON` 함수 뒤)에 추가:

```js
// ─── 목표 대비 · 전년 비교 (daily_target / daily_last_year_actual) ────────────
// stat_date 에서 364일(52주) 오프셋 — 364 = 52×7 이라 요일이 항상 그대로
// 맞는 "동요일 매칭" 방식. dateISO는 'YYYY-MM-DD', days는 음수 허용.
export function shiftDaysISO(dateISO, days) {
  const d = new Date(`${dateISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// 목표값은 MD가 정한 "비율값" 자체라 기간 내 일별 평균을 낸다(합산 대상 아님).
// 매출 목표만 SUM(일별 합산이 자연스러운 흐름 지표).
export function aggregateDailyTargetRows(rows) {
  const list = rows || []
  const revenueTarget = list.reduce((s, r) => s + (Number(r.revenue_target) || 0), 0)
  const convRateTarget = list.length > 0
    ? list.reduce((s, r) => s + (Number(r.conv_rate_target) || 0), 0) / list.length
    : null
  const aovTarget = list.length > 0
    ? list.reduce((s, r) => s + (Number(r.aov_target) || 0), 0) / list.length
    : null
  return { revenueTarget, convRateTarget, aovTarget, hasTarget: list.length > 0 }
}

// 작년 실적은 실측치라 SUM/SUM 가중 계산 — GA4Tab과 동일 원칙(전환율은
// SUM(주문)/SUM(유입)로 계산, 일별 평균을 내지 않는다. GA4Tab.jsx 파일
// 상단 주석 참고).
export function aggregateLastYearActualRows(rows) {
  const list = rows || []
  const revenue = list.reduce((s, r) => s + (Number(r.revenue) || 0), 0)
  const orders = list.reduce((s, r) => s + (Number(r.orders) || 0), 0)
  const sessions = list.reduce((s, r) => s + (Number(r.sessions) || 0), 0)
  return {
    revenue,
    orders,
    sessions,
    convRate: sessions > 0 ? orders / sessions * 100 : null,
    aov: orders > 0 ? revenue / orders : null,
    hasLastYear: list.length > 0,
  }
}

// periodStart~periodEnd(이번 기간)의 목표 달성률 + 전년 동요일(364일 전) 대비를
// 계산해 반환한다. 실적값 자체는 이 함수가 계산하지 않는다 — 이미 있는 N.E.E.D
// 파이프라인 숫자(salesByDateMetrics/cartDerived)를 화면(TargetProgressSection)이
// props로 받아 그대로 쓴다. 여기서는 "목표"와 "작년"만 가져온다.
export async function getTargetProgressData(periodStart, periodEnd) {
  if (!supabase || !periodStart || !periodEnd) return null
  try {
    const lyStart = shiftDaysISO(periodStart, -364)
    const lyEnd = shiftDaysISO(periodEnd, -364)
    const [targetRes, lyRes] = await Promise.all([
      supabase.from('daily_target').select('*').gte('stat_date', periodStart).lte('stat_date', periodEnd),
      supabase.from('daily_last_year_actual').select('*').gte('stat_date', lyStart).lte('stat_date', lyEnd),
    ])
    if (targetRes.error || lyRes.error) {
      console.warn('목표 대비 데이터 조회 실패:', targetRes.error || lyRes.error)
      return null
    }
    const { hasTarget, ...target } = aggregateDailyTargetRows(targetRes.data)
    const { hasLastYear, ...lastYear } = aggregateLastYearActualRows(lyRes.data)
    return { ...target, hasTarget, lastYear, hasLastYear, lyRange: { start: lyStart, end: lyEnd } }
  } catch (e) {
    console.warn('목표 대비 데이터 조회 예외:', e)
    return null
  }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
cd spao-dashboard-v3
npx vitest run src/utils/storage.test.js
```

기대 결과: 새로 추가한 테스트 전부 PASS(기존 테스트도 그대로 PASS).

- [ ] **Step 5: 전체 테스트 스위트 실행**

```bash
cd spao-dashboard-v3
npm test
```

기대 결과: 모든 테스트 파일 PASS(기존 70개 + 이번에 추가한 테스트).

- [ ] **Step 6: Commit**

```bash
cd spao-dashboard-v3
git add src/utils/storage.js src/utils/storage.test.js
git commit -m "feat: 목표 대비·전년 비교 데이터 조회/집계 함수 추가"
```

---

## Task 3: Edge Function `sheet-target-pull`

**Files:**
- Create: `spao-dashboard-v3/supabase/functions/sheet-target-pull/index.ts`

이 프로젝트에는 로컬 Deno CLI가 없어 Deno 유닛 테스트를 못 돌린다(기존 `ga4-pull`도 동일). `esbuild`로 구문만 검증하고, 실제 동작 검증은 Supabase Dashboard 배포 후 Test 탭으로 한다 — 이 프로젝트의 기존 관례.

- [ ] **Step 1: Edge Function 코드 작성**

```typescript
// ════════════════════════════════════════════════════════════════════════
// sheet-target-pull — 구글 시트(목표값 탭 + 전년 비교 탭)를 읽어
//            daily_target / daily_last_year_actual 에 upsert
// ────────────────────────────────────────────────────────────────────────
// 호출: POST /functions/v1/sheet-target-pull
// 헤더: x-ingest-key: <Secrets 에 등록한 INGEST_KEY 와 동일한 값>
// 바디: 없음 — 시트가 작아서(최대 수백 행) 항상 시트 전체를 다시 읽어 upsert한다.
//
// 시트가 "링크가 있는 모든 사용자" 보기 권한으로 공유돼 있어(2026-09-02 확인),
// GA4 파이프라인과 달리 서비스계정 OAuth가 필요 없다 — 공개 CSV export를
// 그냥 fetch한다. 시트 공유 설정이 나중에 비공개로 바뀌면 이 함수 호출이
// 401/403으로 실패한다(운영 중 재확인 필요 — 별도 알림 체계는 없음).
// ════════════════════════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const INGEST_KEY = Deno.env.get('INGEST_KEY')

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const SHEET_ID = '1yialQ3E-BoqLcr9WSjncdVpf0KkDgLYWS8xq9tOw6Z8'

// ── 최소 CSV 파서 ───────────────────────────────────────────────────────
// 따옴표로 감싼 필드 안의 콤마는 구분자로 취급하지 않고, ""는 이스케이프된
// " 한 글자로 치환한다(표준 CSV 큰따옴표 규칙).
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else { inQuotes = false }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (c === '\r') {
      // 무시 — \n 이 행 끝을 처리한다.
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

// ── 값 파싱 유틸 ────────────────────────────────────────────────────────
function parseNum(str: string): number {
  if (!str) return 0
  const n = parseFloat(str.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}
// 퍼센트는 "퍼센트 단위 숫자"(4% → 4)로 저장한다 — 프론트 fmtPct 계열이
// 이미 이 관례를 쓰고 있다(GA4Tab의 convRate 등과 동일).
function parsePercent(str: string): number {
  if (!str) return 0
  const n = parseFloat(str.replace('%', '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
function parseDateCell(str: string): string | null {
  const d = (str || '').slice(0, 10)
  return DATE_RE.test(d) ? d : null
}

// ── 구글 시트 탭을 CSV로 fetch (공개 공유 — 인증 불필요) ───────────────────
async function fetchSheetCsv(tabName: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`[sheet_fetch:${tabName}] 응답 실패 (${resp.status})`)
  const text = await resp.text()
  return parseCsv(text)
}

// ── 목표값 탭 → daily_target 행 ─────────────────────────────────────────
// 컬럼: A=일자 B=목표합계 C=주문수(미사용) D=품목수(미사용) E=유입 F=전환율
//       G=객단가 H=월별목표합계(미사용, 프론트에서 직접 합산) I=주문수(미사용)
type TargetRow = {
  stat_date: string
  revenue_target: number
  sessions_target: number
  conv_rate_target: number
  aov_target: number
  _ingested_at: string
}

function buildTargetRows(csvRows: string[][], nowISO: string): TargetRow[] {
  const out: TargetRow[] = []
  for (const row of csvRows.slice(1)) { // 헤더 행 skip
    const statDate = parseDateCell(row[0])
    if (!statDate) continue // 일자 없는 잉여 행(꼬리에 섞여 있음) skip
    out.push({
      stat_date: statDate,
      revenue_target: parseNum(row[1]),
      sessions_target: parseNum(row[4]),
      conv_rate_target: parsePercent(row[5]),
      aov_target: parseNum(row[6]),
      _ingested_at: nowISO,
    })
  }
  return out
}

// ── 전년 비교 탭 → daily_last_year_actual 행 ────────────────────────────
// 컬럼: A=일자 B=결제합계 C=주문수 D=품목수(미사용) E=유입 F=전환율 G=객단가
type LastYearRow = {
  stat_date: string
  revenue: number
  orders: number
  sessions: number
  conv_rate: number
  aov: number
  _ingested_at: string
}

function buildLastYearRows(csvRows: string[][], nowISO: string): LastYearRow[] {
  const out: LastYearRow[] = []
  for (const row of csvRows.slice(1)) {
    const statDate = parseDateCell(row[0])
    if (!statDate) continue
    out.push({
      stat_date: statDate,
      revenue: parseNum(row[1]),
      orders: parseNum(row[2]),
      sessions: parseNum(row[4]),
      conv_rate: parsePercent(row[5]),
      aov: parseNum(row[6]),
      _ingested_at: nowISO,
    })
  }
  return out
}

// ── 메인 핸들러 ──────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'POST 만 허용됩니다.' }, 405)
  }
  if (!INGEST_KEY || req.headers.get('x-ingest-key') !== INGEST_KEY) {
    return json({ ok: false, error: '인증 실패(x-ingest-key 불일치)' }, 401)
  }

  const nowISO = new Date().toISOString()

  try {
    const targetCsv = await fetchSheetCsv('목표값')
    const targetRows = buildTargetRows(targetCsv, nowISO)
    const { error: targetErr } = await supabase
      .from('daily_target')
      .upsert(targetRows, { onConflict: 'stat_date' })
    if (targetErr) throw new Error(`[db_target] ${targetErr.message}`)

    const lastYearCsv = await fetchSheetCsv('전년 비교')
    const lastYearRows = buildLastYearRows(lastYearCsv, nowISO)
    const { error: lyErr } = await supabase
      .from('daily_last_year_actual')
      .upsert(lastYearRows, { onConflict: 'stat_date' })
    if (lyErr) throw new Error(`[db_last_year] ${lyErr.message}`)

    return json({ ok: true, targetRows: targetRows.length, lastYearRows: lastYearRows.length })
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 2: esbuild로 구문 검증**

```bash
cd spao-dashboard-v3
node_modules/.bin/esbuild supabase/functions/sheet-target-pull/index.ts --bundle --external:npm:@supabase/supabase-js@2 --outfile=out.tmp.js --platform=neutral --format=esm
rm -f out.tmp.js
```

기대 결과: `out.tmp.js`가 생성되고 `Done in Nms` 출력(에러 없음).

- [ ] **Step 3: 사용자에게 Dashboard 배포 요청**

> "`spao-dashboard-v3/supabase/functions/sheet-target-pull/index.ts` 내용을 그대로 복사해서 Supabase Dashboard → Edge Functions에서 새 함수(`sheet-target-pull` 또는 원하는 별칭)로 만들고 배포해주세요. 이 함수의 Secrets에 기존 `ga4-pull`과 동일한 `INGEST_KEY` 값을 등록해주세요(함수별로 Secrets가 분리되어 있어서 다시 등록이 필요합니다). `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`는 Supabase가 기본 제공하는 값이라 별도 등록 없이 자동으로 채워집니다."

- [ ] **Step 4: 사용자에게 Test 탭 실행 요청**

> "Test 탭에서 Body `{}`, Headers에 `Content-Type: application/json`과 `x-ingest-key: <INGEST_KEY 값>`을 넣고 실행해주세요. Query Parameters는 비워두세요."

기대 응답: `{ "ok": true, "targetRows": <160 근처>, "lastYearRows": <383 근처> }`

실패 시 흔한 원인:
- `401` — `x-ingest-key` 값 불일치 또는 헤더 누락.
- `500` + `db_target`/`db_last_year` 메시지 — Task 1의 테이블이 아직 안 만들어졌거나 컬럼명이 다름.
- `500` + `sheet_fetch` 메시지 — 구글 시트 공유 설정이 바뀌어 CSV export가 막혔을 가능성.

- [ ] **Step 5: 사용자에게 데이터 적재 확인 SQL 요청**

```sql
select count(*) from public.daily_target;
select count(*) from public.daily_last_year_actual;
select * from public.daily_target order by stat_date desc limit 5;
select * from public.daily_last_year_actual order by stat_date desc limit 5;
```

- [ ] **Step 6: Commit**

```bash
cd spao-dashboard-v3
git add supabase/functions/sheet-target-pull/index.ts
git commit -m "feat: sheet-target-pull Edge Function 추가"
```

---

## Task 4: pg_cron 스케줄 등록

**Files:**
- Create: `spao-dashboard-v3/supabase/sheet_target_pull_cron.sql`

- [ ] **Step 1: SQL 파일 작성**

기존 `ingest_key` Vault 시크릿(ga4-pull-daily 등록 시 이미 저장됨)을 그대로 재사용한다 — 별도 Vault 등록 단계 불필요.

```sql
-- ════════════════════════════════════════════════════════════════════════
-- sheet-target-pull cron — 매일 06:10 KST 자동 호출 등록
-- ────────────────────────────────────────────────────────────────────────
-- 사전 조건: pg_cron/pg_net 확장 설치 완료(ga4-pull 설정 시 이미 설치됨),
-- Vault 'ingest_key' 시크릿 등록 완료(ga4-pull과 동일 값 재사용).
--
-- ⚠ Postgres 서버 타임존은 기본 UTC. 06:10 KST(UTC+9)는 전날 21:10 UTC.
--
-- 검증 순서: 먼저 짧은 간격(예: '*/10 * * * *')으로 등록 → net._http_response에서
-- status_code=200, content에 {"ok":true,...} 확인 → 아래 최종 스케줄로 전환.
-- (진행 방법은 ga4_pull_cron_step2_schedule.sql과 동일 — 이미 검증된 패턴.)
-- ════════════════════════════════════════════════════════════════════════

select cron.schedule(
  'sheet-target-pull-daily',
  '10 21 * * *',  -- 매일 06:10 KST = 21:10 UTC(전날)
  $cron$
  select net.http_post(
    url     := 'https://wtflegxxhmzcofojepuf.supabase.co/functions/v1/sheet-target-pull',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ingest-key', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'ingest_key'
      )
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $cron$
);

-- ════════════════════════════════════════════════════════════════════════
-- 완료 조건 확인 (실행 후 몇 분 뒤)
-- ════════════════════════════════════════════════════════════════════════
-- select jobid, runid, status, return_message, start_time, end_time
-- from cron.job_run_details
-- where jobid = (select jobid from cron.job where jobname = 'sheet-target-pull-daily')
-- order by start_time desc
-- limit 5;
--
-- select id, status_code, content::text, created
-- from net._http_response
-- order by created desc
-- limit 5;
--
-- status_code = 200 이고 content에 {"ok":true, ...}가 보이면 통과.

-- ════════════════════════════════════════════════════════════════════════
-- 참고: 스케줄만 바꾸고 싶을 때
-- ════════════════════════════════════════════════════════════════════════
-- select cron.alter_job(
--   job_id   := (select jobid from cron.job where jobname = 'sheet-target-pull-daily'),
--   schedule := '*/10 * * * *'
-- );

-- 완전히 중단하려면:
-- select cron.unschedule('sheet-target-pull-daily');
```

주의: 함수를 Task 3에서 `sheet-target-pull`이 아닌 다른 별칭으로 배포했다면 위 SQL의 `url`을 그 별칭으로 바꿔야 한다.

- [ ] **Step 2: 사용자에게 SQL Editor 실행 요청 + 결과 확인**

> "이 SQL을 Supabase SQL Editor에서 실행해주세요. 몇 분 뒤 파일 하단 주석의 확인 쿼리로 `status_code=200`, `{\"ok\":true,...}`가 나오는지 확인해주세요."

- [ ] **Step 3: Commit**

```bash
cd spao-dashboard-v3
git add supabase/sheet_target_pull_cron.sql
git commit -m "feat: sheet-target-pull 일일 cron 스케줄 SQL 추가"
```

---

## Task 5: `TargetProgressSection` 컴포넌트

**Files:**
- Create: `spao-dashboard-v3/src/components/TargetProgressSection.jsx`

- [ ] **Step 1: 컴포넌트 작성**

```jsx
/**
 * TargetProgressSection — 목표 대비 · 전년 동요일 비교 스코어보드
 *
 * L1_HealthCheck(종합진단) 상단, 매출 스코어보드 바로 아래에 렌더링된다.
 * 매출/전환율/객단가 3개 지표 각각에 대해:
 *   ① 이번 기간 실적값(props로 받음 — 기존 N.E.E.D 파이프라인 숫자 그대로)
 *   ② 목표 대비 달성률(daily_target 기간 합산/평균, storage.getTargetProgressData)
 *   ③ 전년 동요일(364일 전) 대비 증감(daily_last_year_actual)
 * 을 한 타일에 모아 보여준다.
 */
import { useEffect, useState } from 'react'
import { fmt억, fmtComma, fmtPct } from '../utils/metrics'
import { getTargetProgressData } from '../utils/storage'
import WoWBadge from './common/WoWBadge'

const ORANGE = '#E8710A'
const GREEN = '#5DCAA5'
const BLUE = '#378ADD'

function ProgressBar({ pct, color }) {
  const width = Math.max(0, Math.min(100, pct))
  return (
    <div style={{ height: 7, background: '#F0F0EE', borderRadius: 4, margin: '6px 0 3px' }}>
      <div style={{ height: '100%', width: `${width}%`, background: color, borderRadius: 4 }} />
    </div>
  )
}

// pct: 목표 대비 달성률(%, null이면 목표 데이터 없음). yoyValue: 전년 대비 증감(null이면 작년 데이터 없음).
function TargetTile({ label, valueText, pct, targetText, color, yoyValue, yoyKind }) {
  return (
    <div style={{ flex: 1, minWidth: 140, background: '#FAFAF9', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: '0.625rem', color: '#6B6B68', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1A1A1A' }}>{valueText}</div>
      {pct !== null ? (
        <>
          <ProgressBar pct={pct} color={color} />
          <div style={{ fontSize: '0.65625rem', color: '#6B6B68', marginBottom: 6 }}>
            목표 {pct.toFixed(0)}% 달성 <span style={{ color: '#C8C8C6' }}>({targetText} 중)</span>
          </div>
        </>
      ) : (
        <div style={{ fontSize: '0.65625rem', color: '#C8C8C6', margin: '9px 0 6px' }}>목표 데이터 없음</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: '0.5625rem', color: '#A0A09E' }}>전년 동요일</span>
        {yoyValue !== null
          ? <WoWBadge wow={yoyValue} kind={yoyKind} size="xs" />
          : <span style={{ fontSize: '0.65625rem', color: '#C8C8C6' }}>작년 데이터 없음</span>}
      </div>
    </div>
  )
}

export default function TargetProgressSection({ periodStart, periodEnd, revenue, convRate, aov }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!periodStart || !periodEnd) { setData(null); return }
    let cancelled = false
    getTargetProgressData(periodStart, periodEnd).then(res => { if (!cancelled) setData(res) })
    return () => { cancelled = true }
  }, [periodStart, periodEnd])

  if (!data) return null

  const { revenueTarget, convRateTarget, aovTarget, hasTarget, lastYear, hasLastYear } = data

  const revenuePct = hasTarget && revenueTarget > 0 ? revenue / revenueTarget * 100 : null
  const convRatePct = hasTarget && convRateTarget > 0 ? convRate / convRateTarget * 100 : null
  const aovPct = hasTarget && aovTarget > 0 ? aov / aovTarget * 100 : null

  const revenueYoy = hasLastYear && lastYear.revenue > 0 ? (revenue - lastYear.revenue) / lastYear.revenue * 100 : null
  const convRateYoy = hasLastYear && lastYear.convRate !== null ? convRate - lastYear.convRate : null
  const aovYoy = hasLastYear && lastYear.aov ? (aov - lastYear.aov) / lastYear.aov * 100 : null

  return (
    <div style={{ border: `2px solid ${ORANGE}`, borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: ORANGE, marginBottom: 10 }}>🎯 목표 대비 · 전년 비교</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <TargetTile
          label="매출" valueText={fmt억(revenue)}
          pct={revenuePct} targetText={fmt억(revenueTarget)} color={ORANGE}
          yoyValue={revenueYoy} yoyKind="pct"
        />
        <TargetTile
          label="전환율" valueText={fmtPct(convRate)}
          pct={convRatePct} targetText={fmtPct(convRateTarget || 0)} color={GREEN}
          yoyValue={convRateYoy} yoyKind="pp"
        />
        <TargetTile
          label="객단가(AOV)" valueText={`${fmtComma(aov)}원`}
          pct={aovPct} targetText={`${fmtComma(aovTarget || 0)}원`} color={BLUE}
          yoyValue={aovYoy} yoyKind="pct"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: lint 확인**

```bash
cd spao-dashboard-v3
npx eslint src/components/TargetProgressSection.jsx
```

기대 결과: 에러 없음(이 파일은 새로 작성한 파일이라 프로젝트에 이미 있던 미해결 lint 경고와 무관하게 깨끗해야 한다).

- [ ] **Step 3: Commit**

```bash
cd spao-dashboard-v3
git add src/components/TargetProgressSection.jsx
git commit -m "feat: TargetProgressSection 컴포넌트 추가"
```

---

## Task 6: `L1_HealthCheck.jsx`에 섹션 연결

**Files:**
- Modify: `spao-dashboard-v3/src/components/L1_HealthCheck.jsx:9` (import 추가)
- Modify: `spao-dashboard-v3/src/components/L1_HealthCheck.jsx:684-701` (props 추가 + 렌더 삽입)

- [ ] **Step 1: import 추가**

`spao-dashboard-v3/src/components/L1_HealthCheck.jsx` 9번째 줄(`import CouponSection from './CouponSection'` 바로 뒤)에 추가:

```jsx
import CouponSection from './CouponSection'
import TargetProgressSection from './TargetProgressSection'
```

- [ ] **Step 2: L1 메인 컴포넌트에 props 추가 + 섹션 삽입**

현재:
```jsx
// ─── L1 메인 ─────────────────────────────────────────────────────────────────
export default function L1_HealthCheck({ derived, salesByDateMetrics, searchMetrics, storeCorner, onZoneClick }) {
  const { kpis, channelData, cartDerived, genderData, femaleAge, maleAge,
    visitMetrics, storeMetrics, hasWoW, thisP, lastP, newVsReturn } = derived

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── 기간별 매출 스코어보드 ── */}
      <SalesScoreboard
        salesByDateMetrics={salesByDateMetrics}
        visitMetrics={visitMetrics}
        cartSigma={cartDerived}
        storeMetrics={storeMetrics}
        storeCorner={storeCorner}
        searchMetrics={searchMetrics}
        onZoneClick={onZoneClick}
      />

      {/* WoW 기간 안내 */}
      {hasWoW ? (
```

다음으로 교체:
```jsx
// ─── L1 메인 ─────────────────────────────────────────────────────────────────
export default function L1_HealthCheck({ derived, salesByDateMetrics, searchMetrics, storeCorner, onZoneClick, periodStart, periodEnd }) {
  const { kpis, channelData, cartDerived, genderData, femaleAge, maleAge,
    visitMetrics, storeMetrics, hasWoW, thisP, lastP, newVsReturn } = derived

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── 기간별 매출 스코어보드 ── */}
      <SalesScoreboard
        salesByDateMetrics={salesByDateMetrics}
        visitMetrics={visitMetrics}
        cartSigma={cartDerived}
        storeMetrics={storeMetrics}
        storeCorner={storeCorner}
        searchMetrics={searchMetrics}
        onZoneClick={onZoneClick}
      />

      {/* ── 목표 대비 · 전년 비교 (periodStart/periodEnd 없으면 렌더 안 함 — 키즈 필터 화면 등) ── */}
      {periodStart && periodEnd && (
        <TargetProgressSection
          periodStart={periodStart}
          periodEnd={periodEnd}
          revenue={kpis?.[0]?.rawValue || 0}
          convRate={cartDerived?.cartConvRate || 0}
          aov={salesByDateMetrics?.aov ?? cartDerived?.aov ?? 0}
        />
      )}

      {/* WoW 기간 안내 */}
      {hasWoW ? (
```

- [ ] **Step 3: 저장 후 esbuild/구문 확인은 다음 Task(App.jsx 연결)에서 빌드로 함께 확인**

이 단계 단독으로는 `periodStart`/`periodEnd`를 넘겨주는 곳이 아직 없어 빌드는 되지만 섹션이 항상 숨겨진 상태다 — Task 7에서 `App.jsx`가 값을 넘기면 실제로 보인다.

- [ ] **Step 4: Commit**

```bash
cd spao-dashboard-v3
git add src/components/L1_HealthCheck.jsx
git commit -m "feat: L1_HealthCheck에 TargetProgressSection 연결"
```

---

## Task 7: `App.jsx` — 기간 범위 계산 공유 + L1에 전달

**Files:**
- Modify: `spao-dashboard-v3/src/App.jsx:96` (헬퍼 함수 추가)
- Modify: `spao-dashboard-v3/src/App.jsx:751-753` (L1 렌더 — periodStart/periodEnd 전달)
- Modify: `spao-dashboard-v3/src/App.jsx:772-801` (GA4 렌더 — 헬퍼 재사용으로 중복 제거)

- [ ] **Step 1: 공유 헬퍼 함수 추가**

`spao-dashboard-v3/src/App.jsx`에서 `TabButton` 함수 정의 바로 뒤, 기존 `// ─── App ──` 구분 주석 앞에 헬퍼를 끼워 넣는다.

현재:
```jsx
      )}
    </button>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
```

다음으로 교체:
```jsx
      )}
    </button>
  )
}

// ─── 선택된 기간(주/월/분기)의 날짜 범위 계산 ────────────────────────────────
// GA4 탭과 L1(종합진단)의 목표 대비 섹션이 공통으로 쓰는 로직 — 상단
// 주/월/분기 토글과 동일한 기간을 daily_* 테이블 조회에 쓸 ISO 날짜 범위로 바꾼다.
// week 모드는 선택된 그 주, month/quarter 모드는 그 기간에 속한 주들의
// 최소~최대 날짜를 쓴다.
function computeSelectedRange(periodMode, periodKey, selectedWeekKey, snapshotIndex) {
  if (periodMode === 'week') {
    const meta = snapshotIndex.find(r => r.week_key === selectedWeekKey)
    return {
      range: meta?.week_start && meta?.week_end ? { start: meta.week_start, end: meta.week_end } : null,
      label: meta?.week_label || null,
    }
  }
  const weeks = periodKey ? weekKeysInPeriod(snapshotIndex, periodMode, periodKey) : []
  return {
    range: dateRangeOfWeeks(snapshotIndex, weeks),
    label: periodKey ? periodLabel(periodKey, periodMode) : null,
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
```

(`// ─── App ──...` 줄과 `export default function App() {` 줄은 원본에 이미 있는 줄이다 — old_string/new_string 둘 다에 포함시켜 앵커로만 쓰고, 실제로 바뀌는 부분은 그 사이에 새로 삽입되는 `computeSelectedRange` 함수뿐이다.)

- [ ] **Step 2: L1 렌더 지점에 기간 전달**

현재(752번째 줄 부근):
```jsx
{activeTab === 'l1' && derived && (
  <L1_HealthCheck derived={derived} salesByDateMetrics={salesByDateMetrics} searchMetrics={searchMetrics} storeCorner={thisWeek.storeCorner} onZoneClick={goToZone} />
)}
```

다음으로 교체:
```jsx
{activeTab === 'l1' && derived && (() => {
  const { range } = computeSelectedRange(periodMode, periodKey, selectedWeekKey, snapshotIndex)
  return (
    <L1_HealthCheck
      derived={derived} salesByDateMetrics={salesByDateMetrics} searchMetrics={searchMetrics}
      storeCorner={thisWeek.storeCorner} onZoneClick={goToZone}
      periodStart={range?.start} periodEnd={range?.end}
    />
  )
})()}
```

- [ ] **Step 3: GA4 렌더 블록을 헬퍼 재사용으로 정리(중복 제거)**

현재:
```jsx
{activeTab === 'ga4' && (() => {
  // 상단 주/월/분기 토글과 동일한 기간 로직을 그대로 따른다 —
  // week 모드는 선택된 그 주, month/quarter 모드는 그 기간에 속한
  // 주들의 최소~최대 날짜로 daily_ga4_* 를 조회한다.
  // 전주 대비(WoW) 비교를 위해 직전 기간의 범위도 같은 방식으로 계산한다.
  let range = null
  let prevRange = null
  let label = null
  if (periodMode === 'week') {
    const meta = snapshotIndex.find(r => r.week_key === selectedWeekKey)
    range = meta?.week_start && meta?.week_end ? { start: meta.week_start, end: meta.week_end } : null
    label = meta?.week_label || null
    const prevKey = selectedWeekKey ? previousWeekKey(snapshotIndex, selectedWeekKey) : null
    const prevMeta = prevKey ? snapshotIndex.find(r => r.week_key === prevKey) : null
    prevRange = prevMeta?.week_start && prevMeta?.week_end ? { start: prevMeta.week_start, end: prevMeta.week_end } : null
  } else {
    const weeks = periodKey ? weekKeysInPeriod(snapshotIndex, periodMode, periodKey) : []
    range = dateRangeOfWeeks(snapshotIndex, weeks)
    label = periodKey ? periodLabel(periodKey, periodMode) : null
    const prevKey = periodKey ? previousPeriodKey(snapshotIndex, periodMode, periodKey) : null
    const prevWeeks = prevKey ? weekKeysInPeriod(snapshotIndex, periodMode, prevKey) : []
    prevRange = dateRangeOfWeeks(snapshotIndex, prevWeeks)
  }
  return (
    <GA4Tab
      weekStart={range?.start} weekEnd={range?.end} weekLabel={label}
      prevWeekStart={prevRange?.start} prevWeekEnd={prevRange?.end}
    />
  )
})()}
```

다음으로 교체:
```jsx
{activeTab === 'ga4' && (() => {
  // 상단 주/월/분기 토글과 동일한 기간 로직(computeSelectedRange, L1과 공유).
  // 전주 대비(WoW) 비교를 위한 직전 기간 범위는 GA4 탭에서만 필요해 여기서 계산한다.
  const { range, label } = computeSelectedRange(periodMode, periodKey, selectedWeekKey, snapshotIndex)
  let prevRange = null
  if (periodMode === 'week') {
    const prevKey = selectedWeekKey ? previousWeekKey(snapshotIndex, selectedWeekKey) : null
    const prevMeta = prevKey ? snapshotIndex.find(r => r.week_key === prevKey) : null
    prevRange = prevMeta?.week_start && prevMeta?.week_end ? { start: prevMeta.week_start, end: prevMeta.week_end } : null
  } else {
    const prevKey = periodKey ? previousPeriodKey(snapshotIndex, periodMode, periodKey) : null
    const prevWeeks = prevKey ? weekKeysInPeriod(snapshotIndex, periodMode, prevKey) : []
    prevRange = dateRangeOfWeeks(snapshotIndex, prevWeeks)
  }
  return (
    <GA4Tab
      weekStart={range?.start} weekEnd={range?.end} weekLabel={label}
      prevWeekStart={prevRange?.start} prevWeekEnd={prevRange?.end}
    />
  )
})()}
```

- [ ] **Step 4: 빌드로 구문/참조 오류 확인**

```bash
cd spao-dashboard-v3
npm run build
```

기대 결과: `vite build` 성공(`✓ built in Ns`), 에러 없음.

- [ ] **Step 5: Commit**

```bash
cd spao-dashboard-v3
git add src/App.jsx
git commit -m "feat: 기간 범위 계산 헬퍼 추출, L1에 목표 대비 섹션용 기간 전달"
```

---

## Task 8: 전체 검증 + 배포용 zip (요청 시)

**Files:** (읽기/실행만, 수정 없음)

- [ ] **Step 1: 전체 테스트**

```bash
cd spao-dashboard-v3
npm test
```

기대 결과: 모든 테스트 PASS(기존 70개 + Task 2에서 추가한 테스트 전부).

- [ ] **Step 2: 이번에 만들거나 수정한 프론트 파일만 lint**

```bash
cd spao-dashboard-v3
npx eslint src/components/TargetProgressSection.jsx src/components/L1_HealthCheck.jsx src/utils/storage.js src/App.jsx
```

기대 결과: 이번 변경으로 인한 새 에러 없음. (주의: `App.jsx`에는 이 작업과 무관한 기존 lint 에러 `Calling setState synchronously within an effect`가 있을 수 있다 — GA4Tab.jsx 작업 때도 동일하게 확인된 pre-existing 이슈이니 이번 작업 탓이 아니면 무시한다.)

- [ ] **Step 3: 빌드**

```bash
cd spao-dashboard-v3
npm run build
```

기대 결과: 빌드 성공.

- [ ] **Step 4: 브라우저로 화면 확인 (수동 — 로그인 필요)**

`npm run dev`(또는 프로젝트의 미리보기 방식)로 앱을 띄우고 로그인 후, 종합진단(L1) 탭 상단에 "🎯 목표 대비 · 전년 비교" 섹션이 매출 스코어보드 바로 아래 나타나는지, 3개 타일에 실적/목표 진행률/전년 대비 배지가 정상 표시되는지 확인한다. 로그인은 사람이 직접 해야 하므로 에이전트가 자동화할 수 없다 — 사용자에게 확인을 요청한다.

- [ ] **Step 5: 사용자가 요청하면 배포용 zip 재생성**

이 프로젝트의 기존 관례 — zip은 명시적으로 요청받았을 때만 만든다.

```bash
cd spao-dashboard-v3
rm -rf dist
npm run build
```

이후 PowerShell로 `dist/` 전체를 `spao-dashboard-v3-deploy.zip`으로 압축(기존 세션에서 쓰던 방식과 동일 — 미리보기 서버가 떠 있으면 먼저 종료해서 파일 잠금을 피한다).

---

## 참고: 이번 계획이 다루지 않는 것

- `sessions_target`(유입 목표) — 테이블/파싱에는 포함하지만 화면에는 노출하지 않는다(스펙에서 3타일로 스코프 확정).
- 구글 시트 공유 권한이 바뀌었을 때의 알림/재시도 로직 — 발생 시 Test 탭에서 바로 드러나는 것으로 충분하다고 판단, 별도 모니터링은 스코프 밖.
- `올해값` 탭 — 브레인스토밍에서 "A안"으로 명시적으로 제외(이번 기간 실적은 기존 N.E.E.D 파이프라인 숫자를 그대로 쓴다).
