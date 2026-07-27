import { excelSerialToDateStr } from './excelDate'

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
