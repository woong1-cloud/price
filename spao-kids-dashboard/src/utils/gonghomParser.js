import { excelSerialToDateStr } from './excelDate'

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
