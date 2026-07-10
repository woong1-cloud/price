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
