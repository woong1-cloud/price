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
