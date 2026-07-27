import { excelSerialToDateStr } from './excelDate'

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

// '취소' 포함 여부로 판정 — 실제 취소 표본을 아직 못 봐서 문자열을 확인하면 재검증 필요(계획 문서 참고).
export function isNaverCanceled(item) {
  return item.status.includes('취소')
}
