import { parseStyleCode, validateCodeCoverage } from './styleCodeParser'
import { getCategory, getIP } from './categorize'

// ─── 포맷 헬퍼 ───────────────────────────────────────────────────────────────
export const fmt억 = v => (Number(v) / 1e8).toFixed(2) + '억'
export const fmtComma = v => Math.round(Number(v) || 0).toLocaleString('ko-KR')
export const fmtPct = v => (Number(v) || 0).toFixed(1) + '%'
export const fmtWoW = v => {
  if (v === null || v === undefined || !isFinite(v)) return null
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}

// ─── 기간별 매출분석 집계 ────────────────────────────────────────────────────
export function computeSalesByDateMetrics(salesByDate) {
  if (!salesByDate?.items?.length) return null

  const { sigma, items } = salesByDate
  const cancelRate    = sigma.orderCnt > 0 ? (1 - sigma.realOrderCnt / sigma.orderCnt) * 100 : 0
  const aov           = sigma.realOrderCnt > 0 ? sigma.realAmt / sigma.realOrderCnt : 0
  const discountRate  = sigma.orderAmt > 0 ? sigma.discountAmt / sigma.orderAmt * 100 : 0
  const benefitRate   = sigma.orderAmt > 0 ? sigma.totalBenefit / sigma.orderAmt * 100 : 0
  const cancelAmt     = sigma.cancelAmt || 0

  const medias = [...new Set(items.map(i => i.media))].filter(Boolean)

  // 채널별 집계
  const channelStats = medias.map(media => {
    const rows = items.filter(i => i.media === media)
    const buyerCnt     = rows.reduce((s, r) => s + r.buyerCnt, 0)
    const orderCnt     = rows.reduce((s, r) => s + r.orderCnt, 0)
    const realOrderCnt = rows.reduce((s, r) => s + r.realOrderCnt, 0)
    const realAmt      = rows.reduce((s, r) => s + r.realAmt, 0)
    const cancelAmt_   = rows.reduce((s, r) => s + r.cancelAmt, 0)
    const discountAmt  = rows.reduce((s, r) => s + r.discountAmt, 0)
    return {
      media,
      buyerCnt,
      orderCnt,
      realOrderCnt,
      realAmt,
      cancelRate: orderCnt > 0 ? (1 - realOrderCnt / orderCnt) * 100 : 0,
      aov:        realOrderCnt > 0 ? realAmt / realOrderCnt : 0,
      discountAmt,
      discountRate: realAmt > 0 ? discountAmt / realAmt * 100 : 0,
    }
  }).sort((a, b) => b.realAmt - a.realAmt)

  // 일별 추이 (채널별 실주문금액)
  const dates = [...new Set(items.map(i => i.date))].sort()
  const dailyOrders = dates.map(date => {
    const row = { date }
    for (const media of medias) {
      const match = items.filter(i => i.date === date && i.media === media)
      row[media + '_amt']   = match.reduce((s, r) => s + r.realAmt, 0)
      row[media + '_cnt']   = match.reduce((s, r) => s + r.realOrderCnt, 0)
      row[media + '_buyer'] = match.reduce((s, r) => s + r.buyerCnt, 0)
    }
    row.totalAmt  = medias.reduce((s, m) => s + (row[m + '_amt'] || 0), 0)
    row.totalCnt  = medias.reduce((s, m) => s + (row[m + '_cnt'] || 0), 0)
    return row
  })

  return {
    sigma,
    cancelRate,
    aov,
    discountRate,
    benefitRate,
    cancelAmt,
    channelStats,
    dailyOrders,
    medias,
    period: `${dates[0]} ~ ${dates[dates.length - 1]}`,
  }
}

// ─── 검색 실적 집계 ──────────────────────────────────────────────────────────
export function computeSearchMetrics(searchData) {
  if (!searchData?.items?.length) return null

  const { sigma, items } = searchData

  // 검색 성공률
  const totalRows = items.length
  const successRows = items.filter(i => i.success).length
  const successRate = totalRows > 0 ? successRows / totalRows * 100 : 0

  // 검색→구매 전환율
  const searchConvRate = sigma.uv > 0 ? sigma.orderCnt / sigma.uv * 100 : 0

  // 키워드별 집계
  const kwMap = {}
  for (const i of items) {
    const k = i.keyword
    if (!k) continue
    if (!kwMap[k]) kwMap[k] = { keyword: k, searchVol: 0, uv: 0, orderAmt: 0, orderCnt: 0, value: 0, successCnt: 0, total: 0 }
    kwMap[k].searchVol += i.searchVol
    kwMap[k].uv        += i.uv
    kwMap[k].orderAmt  += i.orderAmt
    kwMap[k].orderCnt  += i.orderCnt
    kwMap[k].value     += i.value
    if (i.success) kwMap[k].successCnt++
    kwMap[k].total++
  }

  const keywords = Object.values(kwMap).map(k => ({
    ...k,
    convRate:    k.uv > 0 ? k.orderCnt / k.uv * 100 : 0,
    aov:         k.orderCnt > 0 ? k.orderAmt / k.orderCnt : 0,
    successRate: k.total > 0 ? k.successCnt / k.total * 100 : 0,
  }))

  const topByOrderAmt  = [...keywords].sort((a, b) => b.orderAmt - a.orderAmt).slice(0, 15)
  const topBySearchVol = [...keywords].sort((a, b) => b.searchVol - a.searchVol).slice(0, 15)
  // 전환율 상위 (검색량 ≥ 5건 이상만 의미 있음)
  const topByConvRate  = keywords.filter(k => k.searchVol >= 5 && k.orderCnt > 0)
    .sort((a, b) => b.convRate - a.convRate).slice(0, 10)
  // 기회 키워드: 검색량 多, 주문 0
  const highSearchZeroOrder = keywords
    .filter(k => k.searchVol >= 20 && k.orderAmt === 0)
    .sort((a, b) => b.searchVol - a.searchVol).slice(0, 10)

  // 채널별 집계
  const mediaMap = {}
  for (const i of items) {
    if (!mediaMap[i.media]) mediaMap[i.media] = { media: i.media, searchVol: 0, uv: 0, orderAmt: 0, orderCnt: 0 }
    mediaMap[i.media].searchVol += i.searchVol
    mediaMap[i.media].uv        += i.uv
    mediaMap[i.media].orderAmt  += i.orderAmt
    mediaMap[i.media].orderCnt  += i.orderCnt
  }
  const mediaStats = Object.values(mediaMap).map(m => ({
    ...m,
    convRate: m.uv > 0 ? m.orderCnt / m.uv * 100 : 0,
    aov:      m.orderCnt > 0 ? m.orderAmt / m.orderCnt : 0,
  })).sort((a, b) => b.searchVol - a.searchVol)

  // 일별 추이
  const dateMap = {}
  for (const i of items) {
    const d = i.dateShort || i.date?.slice(5, 10) || i.date
    if (!dateMap[d]) dateMap[d] = { date: d, searchVol: 0, uv: 0, orderAmt: 0, orderCnt: 0 }
    dateMap[d].searchVol += i.searchVol
    dateMap[d].uv        += i.uv
    dateMap[d].orderAmt  += i.orderAmt
    dateMap[d].orderCnt  += i.orderCnt
  }
  const dailySearch = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date))

  return {
    sigma,
    successRate,
    searchConvRate,
    topByOrderAmt,
    topBySearchVol,
    topByConvRate,
    highSearchZeroOrder,
    mediaStats,
    dailySearch,
    totalKeywords: keywords.length,
    period: searchData.period,
  }
}

// ─── WoW: 데이터를 thisWeek/lastWeek 으로 분리 ───────────────────────────────
// items 배열의 period 필드로 분리. 기간이 1개면 lastWeek = null
function splitWeeks(items) {
  if (!items || items.length === 0) return { thisWeek: [], lastWeek: [] }

  const periods = [...new Set(items.map(i => i.period).filter(Boolean))].sort()
  if (periods.length === 0) return { thisWeek: items, lastWeek: [] }

  const thisP = periods[periods.length - 1]
  const lastP = periods.length >= 2 ? periods[periods.length - 2] : null

  return {
    thisWeek: items.filter(i => i.period === thisP),
    lastWeek: lastP ? items.filter(i => i.period === lastP) : [],
    thisP,
    lastP,
  }
}

function sumField(items, field) {
  return items.reduce((s, i) => s + (Number(i[field]) || 0), 0)
}

function wowPct(curr, prev) {
  if (!prev || prev === 0) return null
  return (curr - prev) / prev * 100
}

// ─── 방문실적 집계 ───────────────────────────────────────────────────────────
export function calcVisitMetrics(visit) {
  if (!visit?.items?.length) {
    return { channelKPIs: [], dailyUV: [] }
  }
  const items = visit.items
  const medias = [...new Set(items.map(i => i.media))].filter(Boolean)

  const channelKPIs = medias.map(media => {
    const rows = items.filter(i => i.media === media)
    const uv      = sumField(rows, 'uv')
    const session  = sumField(rows, 'session')
    const pv       = sumField(rows, 'pv')
    const avgBounce = rows.length > 0
      ? rows.reduce((s, r) => s + r.bounceRate, 0) / rows.length
      : 0
    return {
      media,
      uv,
      session,
      pv,
      sessionPV: session > 0 ? pv / session : 0,
      avgBounceRate: avgBounce,
    }
  })

  // 일별 UV 추이
  const allDates = [...new Set(items.map(i => i.date))].sort()
  const dailyUV = allDates.map(date => {
    const row = { date }
    for (const media of medias) {
      const match = items.filter(i => i.date === date && i.media === media)
      row[media] = sumField(match, 'uv')
    }
    return row
  })

  return { channelKPIs, dailyUV }
}

// ─── 매장 실적 집계 ──────────────────────────────────────────────────────────
export function calcStoreMetrics(store) {
  const empty = { storeGroupRevenue: [], pageCVR: [], exploreArea: { uv: 0, realAmt: 0 }, purchaseArea: { uv: 0, realAmt: 0 }, crossData: [] }
  if (!store?.items?.length) return empty

  const items = store.items

  // B-1: 매장그룹별 실주문금액
  const groupMap = {}
  for (const i of items) {
    if (!groupMap[i.storeGroup]) groupMap[i.storeGroup] = 0
    groupMap[i.storeGroup] += i.realAmt
  }
  const storeGroupRevenue = Object.entries(groupMap)
    .map(([name, realAmt]) => ({ name, realAmt }))
    .sort((a, b) => b.realAmt - a.realAmt)

  // B-2: 페이지별 UV당 전환율 (UV ≥ 500)
  const pageMap = {}
  for (const i of items) {
    if (!pageMap[i.storeName]) pageMap[i.storeName] = { uv: 0, realCnt: 0, realAmt: 0 }
    pageMap[i.storeName].uv      += i.uv
    pageMap[i.storeName].realCnt += i.realCnt
    pageMap[i.storeName].realAmt += i.realAmt
  }
  const pageCVR = Object.entries(pageMap)
    .map(([name, d]) => ({
      name,
      uv:      d.uv,
      realCnt: d.realCnt,
      realAmt: d.realAmt,
      cvr:     d.uv > 0 ? d.realCnt / d.uv * 100 : 0,
    }))
    .filter(p => p.uv >= 500)
    .sort((a, b) => b.cvr - a.cvr)
    .slice(0, 15)

  // B-3: 탐색 vs 구매 전환
  const EXPLORE_GROUPS  = new Set(['홈매장', '공통매장'])
  const PURCHASE_GROUPS = new Set(['검색매장', '카테고리매장', '기획전매장', '유닛매장', '상품상세매장'])
  const exploreArea  = { uv: 0, realAmt: 0 }
  const purchaseArea = { uv: 0, realAmt: 0 }
  for (const i of items) {
    if (EXPLORE_GROUPS.has(i.storeGroup))  { exploreArea.uv += i.uv; exploreArea.realAmt += i.realAmt }
    if (PURCHASE_GROUPS.has(i.storeGroup)) { purchaseArea.uv += i.uv; purchaseArea.realAmt += i.realAmt }
  }

  // B-4: 매체 × 매장그룹 크로스
  const TOP_GROUPS = ['검색매장', '카테고리매장', '기획전매장']
  const mediaSet = [...new Set(items.map(i => i.media))].filter(Boolean)
  const crossData = mediaSet.map(media => {
    const row = { media }
    for (const g of TOP_GROUPS) {
      row[g] = sumField(items.filter(i => i.media === media && i.storeGroup === g), 'realAmt')
    }
    return row
  })

  return { storeGroupRevenue, pageCVR, exploreArea, purchaseArea, crossData }
}

// ─── 메인 파생 계산 ──────────────────────────────────────────────────────────
export function computeAllDerived({ thisWeek, lastWeek = null, visit = null, store = null }) {
  // V3: thisWeek/lastWeek 슬롯 직접 전달 (2주 데이터 아키텍처)
  const cart     = thisWeek?.cart     || null
  const wishlist = thisWeek?.wishlist || null
  const sales    = thisWeek?.sales    || null
  const customer = thisWeek?.customer || null
  if (!visit) visit = thisWeek?.visit || null
  if (!store) store = thisWeek?.store || null

  // ── 1. WoW 분리 ──
  const cartSplit = {
    thisWeek: thisWeek?.cart?.items  || [],
    lastWeek: lastWeek?.cart?.items  || [],
  }
  const salesSplit = {
    thisWeek: thisWeek?.sales?.items  || [],
    lastWeek: lastWeek?.sales?.items  || [],
  }
  const wishSplit = {
    thisWeek: thisWeek?.wishlist?.items || [],
    lastWeek: lastWeek?.wishlist?.items || [],
  }
  const custSplit = {
    thisWeek: thisWeek?.customer?.items || [],
    lastWeek: lastWeek?.customer?.items || [],
  }
  const hasWoW = cartSplit.lastWeek.length > 0 || salesSplit.lastWeek.length > 0

  // ── 2. 기간 표시 ──
  const period = thisWeek?.sales?.period || thisWeek?.cart?.period || ''
  const thisP  = thisWeek?.sales?.period || thisWeek?.cart?.period || period
  const lastP  = lastWeek?.sales?.period || lastWeek?.cart?.period || null

  // ── 3. 핵심 KPI (이번주 vs 지난주) ──
  // 실주문금액
  const thisRevenue = sumField(salesSplit.thisWeek, 'realAmt')
  const lastRevenue = sumField(salesSplit.lastWeek, 'realAmt')
  // 주문건수 (장바구니)
  const thisOrderCnt = sumField(cartSplit.thisWeek, 'orderCnt')
  const lastOrderCnt = sumField(cartSplit.lastWeek, 'orderCnt')
  // 장바구니 담기
  const thisCartCnt = sumField(cartSplit.thisWeek, 'cartCnt')
  const lastCartCnt = sumField(cartSplit.lastWeek, 'cartCnt')
  // 관심상품 찜수
  const thisWishCnt = sumField(wishSplit.thisWeek, 'wishCnt')
  const lastWishCnt = sumField(wishSplit.lastWeek, 'wishCnt')
  // 구매 고객수
  const thisCustCnt = sumField(custSplit.thisWeek, 'custCnt')
  const lastCustCnt = sumField(custSplit.lastWeek, 'custCnt')

  const kpis = [
    {
      id: 'revenue', label: '실주문금액',
      value: fmt억(thisRevenue),
      rawValue: thisRevenue,
      prevRawValue: lastRevenue,
      wow: hasWoW ? wowPct(thisRevenue, lastRevenue) : null,
      sparkData: hasWoW ? [lastRevenue, thisRevenue] : [thisRevenue],
      color: '#378ADD',
    },
    {
      id: 'orderCnt', label: '결제 완료 상품 수',
      value: fmtComma(thisOrderCnt) + '건',
      rawValue: thisOrderCnt,
      prevRawValue: lastOrderCnt,
      wow: hasWoW ? wowPct(thisOrderCnt, lastOrderCnt) : null,
      sparkData: hasWoW ? [lastOrderCnt, thisOrderCnt] : [thisOrderCnt],
      color: '#5DCAA5',
    },
    {
      id: 'cartCnt', label: '장바구니 담기',
      value: fmtComma(thisCartCnt) + '건',
      rawValue: thisCartCnt,
      prevRawValue: lastCartCnt,
      wow: hasWoW ? wowPct(thisCartCnt, lastCartCnt) : null,
      sparkData: hasWoW ? [lastCartCnt, thisCartCnt] : [thisCartCnt],
      color: '#7F77DD',
    },
    {
      id: 'wishCnt', label: '관심상품 찜',
      value: fmtComma(thisWishCnt) + '건',
      rawValue: thisWishCnt,
      prevRawValue: lastWishCnt,
      wow: hasWoW ? wowPct(thisWishCnt, lastWishCnt) : null,
      sparkData: hasWoW ? [lastWishCnt, thisWishCnt] : [thisWishCnt],
      color: '#EF9F27',
    },
    {
      id: 'custCnt', label: '구매 고객수',
      value: fmtComma(thisCustCnt) + '명',
      rawValue: thisCustCnt,
      prevRawValue: lastCustCnt,
      wow: hasWoW ? wowPct(thisCustCnt, lastCustCnt) : null,
      sparkData: hasWoW ? [lastCustCnt, thisCustCnt] : [thisCustCnt],
      color: '#E24B4A',
    },
  ]

  // ── 4. 채널별 실주문금액 ──
  const channelMap = {}
  for (const i of salesSplit.thisWeek) {
    if (!channelMap[i.media]) channelMap[i.media] = 0
    channelMap[i.media] += i.realAmt
  }
  const channelData = Object.entries(channelMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  // ── 5. 장바구니 퍼널 ──
  const cartThisSigma = cart?.sigma || {}
  const cartConvRate = cartThisSigma.cartCnt > 0
    ? (cartThisSigma.orderCnt / cartThisSigma.cartCnt * 100)
    : (thisCartCnt > 0 ? (thisOrderCnt / thisCartCnt * 100) : 0)

  // 회원/비회원 비율:
  //   방법A (신형식 상품실적_663): sigma에 memberCartCnt / nonMemberCartCnt 포함
  //   방법B (구형식): 아이템별 memberType 필드로 realAmt 집계
  let memberPct = 50, nonMemberPct = 50
  if (cartThisSigma.memberCartCnt > 0 || cartThisSigma.nonMemberCartCnt > 0) {
    // 방법A: sigma 직접 사용
    const totalCartCntForMember = cartThisSigma.memberCartCnt + cartThisSigma.nonMemberCartCnt || 1
    memberPct    = cartThisSigma.memberCartCnt / totalCartCntForMember * 100
    nonMemberPct = cartThisSigma.nonMemberCartCnt / totalCartCntForMember * 100
  } else {
    // 방법B: 구형식 — memberType 컬럼 기반 realAmt 집계
    const memberItems    = cartSplit.thisWeek.filter(i => i.memberType?.includes('회원') && !i.memberType?.includes('비'))
    const nonMemberItems = cartSplit.thisWeek.filter(i => i.memberType?.includes('비회원') || i.memberType?.includes('비'))
    const memberAmt    = sumField(memberItems, 'realAmt')
    const nonMemberAmt = sumField(nonMemberItems, 'realAmt')
    const totalAmt = memberAmt + nonMemberAmt
    if (totalAmt > 0) {
      memberPct    = memberAmt / totalAmt * 100
      nonMemberPct = nonMemberAmt / totalAmt * 100
    }
  }

  const cartDerived = {
    cartCnt: cartThisSigma.cartCnt || thisCartCnt,
    orderCnt: cartThisSigma.orderCnt || thisOrderCnt,
    realAmt: cartThisSigma.realAmt || thisRevenue,
    cartConvRate,
    memberPct,
    nonMemberPct,
  }

  // ── 6. 고객 세그먼트 ──
  const genderMap = {}
  for (const i of custSplit.thisWeek) {
    const g = i.gender || '기타'
    if (!genderMap[g]) genderMap[g] = { orderCnt: 0, realAmt: 0 }
    genderMap[g].orderCnt += i.orderCnt
    genderMap[g].realAmt  += i.realAmt
  }
  const totalGenderAmt = Object.values(genderMap).reduce((s, v) => s + v.realAmt, 0) || 1
  const genderData = Object.entries(genderMap).map(([name, d]) => ({
    name,
    value: d.realAmt,
    pct: d.realAmt / totalGenderAmt * 100,
  }))

  // 성별×연령 (여성/남성)
  function cleanAge(v) {
    const s = String(v ?? '').trim()
    if (!s || s === '0' || /^unknown$/i.test(s) || /^null$/i.test(s) || /^\d$/.test(s)) return '연령미상'
    return s
  }
  function buildAgeData(genderLabel) {
    const ageMap = {}
    for (const i of custSplit.thisWeek) {
      if (!i.gender?.includes(genderLabel)) continue
      const age = cleanAge(i.ageGroup)
      if (!ageMap[age]) ageMap[age] = 0
      ageMap[age] += i.realAmt
    }
    return Object.entries(ageMap)
      .map(([age, realAmt]) => ({ age, realAmt }))
      .sort((a, b) => {
        if (a.age === '연령미상') return 1
        if (b.age === '연령미상') return -1
        return a.age.localeCompare(b.age, 'ko-KR', { numeric: true })
      })
  }
  const femaleAge = buildAgeData('여')
  const maleAge   = buildAgeData('남')

  // ── 7. 상품 실적 Top 15 ──
  function topBy(items, field, limit = 15) {
    const map = {}
    for (const i of items) {
      const key = i.styleCode || i.name
      if (!key) continue
      if (!map[key]) map[key] = { styleCode: i.styleCode, name: i.name, [field]: 0 }
      map[key][field] += Number(i[field]) || 0
    }
    return Object.values(map).sort((a, b) => b[field] - a[field]).slice(0, limit).map((d, idx) => ({ ...d, rank: idx + 1 }))
  }

  const salesTop15 = topBy(salesSplit.thisWeek, 'realAmt')
  const wishTop15  = topBy(wishSplit.thisWeek, 'wishCnt')
  const cartTop15  = topBy(cartSplit.thisWeek, 'cartCnt')

  // PV vs 판매 갭 (PV 높은데 판매 낮은 상품)
  const pvMap = {}
  for (const i of salesSplit.thisWeek) {
    const key = i.styleCode || i.name
    if (!key) continue
    if (!pvMap[key]) pvMap[key] = { styleCode: i.styleCode, name: i.name, pv: 0, realAmt: 0 }
    pvMap[key].pv      += i.pv
    pvMap[key].realAmt += i.realAmt
  }
  const totalPV  = Object.values(pvMap).reduce((s, v) => s + v.pv, 0) || 1
  const totalAmt2 = Object.values(pvMap).reduce((s, v) => s + v.realAmt, 0) || 1
  const pvGapList = Object.values(pvMap)
    .filter(d => d.pv > 0)
    .map(d => ({
      ...d,
      pvShare:  d.pv / totalPV * 100,
      amtShare: d.realAmt / totalAmt2 * 100,
      gap:      (d.pv / totalPV - d.realAmt / totalAmt2) * 100,
    }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 15)

  // ── 8. 파레토 분석 ──
  const sortedByRev = Object.values(pvMap).filter(p => p.realAmt > 0).sort((a, b) => b.realAmt - a.realAmt)
  const totalRevForPareto = sortedByRev.reduce((s, p) => s + p.realAmt, 0)
  let cumRev80 = 0, pareto80idx = sortedByRev.length
  for (let i = 0; i < sortedByRev.length; i++) {
    cumRev80 += sortedByRev[i].realAmt
    if (cumRev80 >= totalRevForPareto * 0.8) { pareto80idx = i + 1; break }
  }
  const pareto = {
    count80: pareto80idx,
    total: sortedByRev.length,
    pct80: sortedByRev.length > 0 ? Math.round(pareto80idx / sortedByRev.length * 100) : 0,
    top10: sortedByRev.slice(0, 10).map((p, i) => ({
      ...p, rank: i + 1,
      cumPct: Math.round(sortedByRev.slice(0, i + 1).reduce((s, x) => s + x.realAmt, 0) / (totalRevForPareto || 1) * 100),
      pct: Math.round(p.realAmt / (totalRevForPareto || 1) * 100),
    })),
  }

  // ── 9. 카테고리 ──
  const catMap = {}
  for (const i of salesSplit.thisWeek) {
    const cat = getCategory(i.name)
    if (!catMap[cat]) catMap[cat] = 0
    catMap[cat] += i.realAmt
  }
  const catData = Object.entries(catMap).map(([name, realAmt]) => ({ name, realAmt })).sort((a, b) => b.realAmt - a.realAmt)

  // ── 신상 vs 이월 비교 ──
  const newVsCarry = (() => {
    const newCodes = new Set(), carryCodes = new Set()
    let newAmt = 0, carryAmt = 0
    for (const i of salesSplit.thisWeek) {
      const p = parseStyleCode(i.styleCode)
      if (p.yearCode === 'G') { newAmt += i.realAmt; newCodes.add(i.styleCode) }
      else if (i.styleCode?.length >= 8) { carryAmt += i.realAmt; carryCodes.add(i.styleCode) }
    }
    const total = newAmt + carryAmt || 1
    return [
      { name: '신상(이번시즌)', realAmt: newAmt, skuCount: newCodes.size, pct: newAmt / total * 100 },
      { name: '이월(전시즌)',   realAmt: carryAmt, skuCount: carryCodes.size, pct: carryAmt / total * 100 },
    ]
  })()

  // ── 카테고리별 찜→담기→판매 퍼널 ──
  // name으로 카테고리 못 잡으면 styleCode itemName으로 fallback
  function getCatSmart(name, styleCode) {
    const cat = getCategory(name)
    if (cat !== '기타') return cat
    const itemName = parseStyleCode(styleCode).itemName
    if (itemName && itemName !== '기타') return getCategory(itemName)
    return '기타'
  }

  const catFunnelMap = {}
  for (const i of salesSplit.thisWeek) {
    const cat = getCatSmart(i.name, i.styleCode)
    if (!catFunnelMap[cat]) catFunnelMap[cat] = { realAmt: 0, wishCnt: 0, cartCnt: 0 }
    catFunnelMap[cat].realAmt += i.realAmt
  }
  for (const i of wishSplit.thisWeek) {
    const cat = getCatSmart(i.name, i.styleCode)
    if (!catFunnelMap[cat]) catFunnelMap[cat] = { realAmt: 0, wishCnt: 0, cartCnt: 0 }
    catFunnelMap[cat].wishCnt += i.wishCnt
  }
  for (const i of cartSplit.thisWeek) {
    const cat = getCatSmart(i.name, i.styleCode)
    if (!catFunnelMap[cat]) catFunnelMap[cat] = { realAmt: 0, wishCnt: 0, cartCnt: 0 }
    catFunnelMap[cat].cartCnt += i.cartCnt
  }
  const catFunnel = Object.entries(catFunnelMap)
    .map(([name, d]) => ({ name, ...d }))
    .filter(d => d.realAmt > 0 || d.wishCnt > 0)
    .sort((a, b) => b.realAmt - a.realAmt)
    .slice(0, 8)

  // ── 상품 타겟 성별×카테고리 크로스 (스타일코드 기준) ──
  const genderCatRaw = {}
  for (const i of salesSplit.thisWeek) {
    const p = parseStyleCode(i.styleCode)
    const gender = ['여성', '남성', '공용', '키즈', '콜라보'].includes(p.gender) ? p.gender : '기타'
    const cat = getCategory(i.name)
    if (!genderCatRaw[gender]) genderCatRaw[gender] = {}
    if (!genderCatRaw[gender][cat]) genderCatRaw[gender][cat] = 0
    genderCatRaw[gender][cat] += i.realAmt
  }
  const topCatsForCross = catData.slice(0, 6).map(c => c.name)
  const genderCatData = Object.entries(genderCatRaw)
    .filter(([g]) => g !== '기타')
    .map(([gender, catMap]) => ({
      gender,
      total: Object.values(catMap).reduce((s, v) => s + v, 0),
      cats: topCatsForCross.map(cat => ({ cat, realAmt: catMap[cat] || 0 })),
    }))
    .sort((a, b) => b.total - a.total)

  // ── 10. IP 현황 ──
  const ipMap = {}
  for (const i of salesSplit.thisWeek) {
    const ip = getIP(i.name)
    if (!ip) continue
    if (!ipMap[ip]) ipMap[ip] = 0
    ipMap[ip] += i.realAmt
  }
  const ipData = Object.entries(ipMap).map(([name, realAmt]) => ({ name, realAmt })).sort((a, b) => b.realAmt - a.realAmt)

  // ── 10. 스타일코드 커버리지 ──
  const { matchedRate, unmatchedCodes } = validateCodeCoverage(salesSplit.thisWeek)

  // ── 11. 방문실적 / 매장실적 ──
  const visitMetrics = visit ? calcVisitMetrics(visit) : null
  const storeMetrics = store ? calcStoreMetrics(store) : null

  // ── 11-B. 신규 vs 재구매 고객 분석 ──
  // 방법A: 회원구분 컬럼(신규/기존)이 있는 경우
  // 방법B: 첫구매회원 컬럼이 있는 경우 (신형식 고객분석 파일)
  const memberTypeMap = {}
  let firstBuyTotal = 0, totalCustByFirstBuy = 0

  for (const i of custSplit.thisWeek) {
    const mt = String(i.memberType || '').trim()
    if (mt) {
      if (!memberTypeMap[mt]) memberTypeMap[mt] = { custCnt: 0, realAmt: 0, orderCnt: 0 }
      memberTypeMap[mt].custCnt  += i.custCnt
      memberTypeMap[mt].realAmt  += i.realAmt
      memberTypeMap[mt].orderCnt += i.orderCnt
    }
    // 방법B: firstBuyCnt 집계
    if (i.firstBuyCnt !== undefined) {
      firstBuyTotal   += (Number(i.firstBuyCnt) || 0)
      totalCustByFirstBuy += (Number(i.custCnt) || 0)
    }
  }

  const totalMemberAmt = Object.values(memberTypeMap).reduce((s, v) => s + v.realAmt, 0) || 1
  const totalMemberCust = Object.values(memberTypeMap).reduce((s, v) => s + v.custCnt, 0) || 1

  // 신규/재구매 매핑 (다양한 레이블 처리)
  const labelNew    = ['신규', '신규회원', '신규고객', 'new']
  const labelReturn = ['재구매', '기존', '기존회원', '기존고객', '재방문', 'return', 'returning']
  let newCustCnt = 0, newAmt = 0, returnCustCnt = 0, returnAmt = 0
  for (const [mt, v] of Object.entries(memberTypeMap)) {
    const lower = mt.toLowerCase()
    if (labelNew.some(l => lower.includes(l)))    { newCustCnt += v.custCnt; newAmt += v.realAmt }
    else if (labelReturn.some(l => lower.includes(l))) { returnCustCnt += v.custCnt; returnAmt += v.realAmt }
  }

  // 방법B 우선 적용 (회원구분 컬럼 없을 때)
  const useMethodB = newCustCnt === 0 && returnCustCnt === 0 && firstBuyTotal > 0
  if (useMethodB) {
    newCustCnt    = firstBuyTotal
    returnCustCnt = Math.max(0, totalCustByFirstBuy - firstBuyTotal)
  }

  const totalNR = newCustCnt + returnCustCnt || 1
  const newVsReturn = {
    available: newCustCnt > 0 || returnCustCnt > 0,
    method: useMethodB ? '첫구매회원' : (Object.keys(memberTypeMap).length > 0 ? '회원구분' : '없음'),
    newCustCnt,
    returnCustCnt,
    newAmt,
    returnAmt,
    newPct:      totalNR > 0 ? newCustCnt / totalNR * 100 : 0,
    returnPct:   totalNR > 0 ? returnCustCnt / totalNR * 100 : 0,
    newAmtPct:    totalMemberAmt > 0 ? newAmt / totalMemberAmt * 100 : 0,
    returnAmtPct: totalMemberAmt > 0 ? returnAmt / totalMemberAmt * 100 : 0,
    // 원시 데이터 (레이블 그대로, 방법A만)
    raw: Object.entries(memberTypeMap).map(([name, v]) => ({
      name,
      custCnt: v.custCnt,
      realAmt: v.realAmt,
      custPct: v.custCnt / totalMemberCust * 100,
      amtPct:  v.realAmt / totalMemberAmt * 100,
    })).sort((a, b) => b.realAmt - a.realAmt),
  }

  // ── 12. 인사이트/액션 카드 (13개 조건) ──
  const insights = []

  // 1) 매출 급락
  if (hasWoW && kpis[0].wow !== null && kpis[0].wow < -10) {
    insights.push({
      id: 'revenue_drop', severity: 'danger',
      title: '매출 급락',
      desc: `실주문금액이 전주 대비 ${fmtWoW(kpis[0].wow)} 하락했습니다.`,
      action: '주요 카테고리별 원인을 확인하고, 프로모션 투입을 검토하세요.',
    })
  }
  // 2) 매출 급등
  if (hasWoW && kpis[0].wow !== null && kpis[0].wow > 20) {
    insights.push({
      id: 'revenue_spike', severity: 'success',
      title: '매출 급등',
      desc: `실주문금액이 전주 대비 ${fmtWoW(kpis[0].wow)} 증가했습니다.`,
      action: '드라이버 카테고리/상품을 파악하고 재고를 선제 확보하세요.',
    })
  }
  // 3) 장바구니 전환율 낮음
  if (cartConvRate > 0 && cartConvRate < 5) {
    insights.push({
      id: 'low_cart_conv', severity: 'warning',
      title: '장바구니 전환율 저조',
      desc: `장바구니→주문 전환율이 ${cartConvRate.toFixed(1)}%로 낮습니다.`,
      action: '배송비·결제 UX·쿠폰 노출 방식을 점검하세요.',
    })
  }
  // 4) 비회원 구매 비중 높음
  if (nonMemberPct > 40) {
    insights.push({
      id: 'high_nonmember', severity: 'warning',
      title: '비회원 구매 비중 높음',
      desc: `비회원 실주문 비중이 ${nonMemberPct.toFixed(1)}%입니다.`,
      action: '회원가입 전환 프로모션(첫구매 쿠폰 등)을 강화하세요.',
    })
  }
  // 5) 스타일코드 매칭률 낮음
  if (matchedRate < 80) {
    insights.push({
      id: 'low_code_match', severity: 'warning',
      title: '스타일코드 미매칭 다수',
      desc: `판매 데이터의 ${100 - matchedRate}%가 품목코드 테이블에 없습니다.`,
      action: `ITEM_CODE_TABLE에 누락 코드를 추가하세요: ${unmatchedCodes.slice(0, 3).join(', ')}`,
    })
  }
  // 6) PV 대비 전환 갭 (PV 점유율 > 판매 점유율 * 2)
  if (pvGapList.length > 0 && pvGapList[0].gap > 5) {
    const top = pvGapList[0]
    insights.push({
      id: 'pv_gap', severity: 'info',
      title: 'PV 대비 전환 미흡 상품',
      desc: `「${top.name || top.styleCode}」 PV 점유 ${top.pvShare.toFixed(1)}% → 매출 점유 ${top.amtShare.toFixed(1)}%`,
      action: '상세페이지 콘텐츠·가격·재고를 점검하세요.',
    })
  }
  // 7) 관심상품 찜 급락
  if (hasWoW && kpis[3].wow !== null && kpis[3].wow < -15) {
    insights.push({
      id: 'wish_drop', severity: 'warning',
      title: '관심상품 찜 수 감소',
      desc: `찜수가 전주 대비 ${fmtWoW(kpis[3].wow)} 감소했습니다.`,
      action: '신상품 노출 및 위시리스트 알림 마케팅을 강화하세요.',
    })
  }
  // 8) 이탈률 높음 (방문실적)
  if (visitMetrics) {
    const highBounce = visitMetrics.channelKPIs.filter(k => k.avgBounceRate > 38)
    if (highBounce.length > 0) {
      insights.push({
        id: 'high_bounce', severity: 'warning',
        title: `${highBounce.map(k => k.media).join('/')} 이탈률 높음`,
        desc: `이탈률 ${highBounce.map(k => fmtPct(k.avgBounceRate)).join('/')} (기준: 38%)`,
        action: '랜딩 페이지 최적화 및 첫 화면 상품 배치를 개선하세요.',
      })
    }
  }
  // 9) APP 세션당 PV 최고
  if (visitMetrics?.channelKPIs?.length > 0) {
    const maxPV = Math.max(...visitMetrics.channelKPIs.map(k => k.sessionPV))
    const appKPI = visitMetrics.channelKPIs.find(k => k.media === 'APP')
    if (appKPI && appKPI.sessionPV === maxPV && maxPV > 0) {
      insights.push({
        id: 'app_depth', severity: 'success',
        title: 'APP 탐색 깊이 우위',
        desc: `APP 세션당 PV ${appKPI.sessionPV.toFixed(1)} — 타 채널 최고`,
        action: 'APP 전용 혜택·푸시 마케팅으로 앱 유입을 확대하세요.',
      })
    }
  }
  // 10) 검색매장 전환율 최고 (매장실적)
  if (storeMetrics?.pageCVR?.length > 0) {
    const top = storeMetrics.pageCVR[0]
    if (top.cvr > 5) {
      insights.push({
        id: 'top_page_cvr', severity: 'success',
        title: '전환율 최고 페이지',
        desc: `「${top.name}」 전환율 ${fmtPct(top.cvr)} (UV ${fmtComma(top.uv)})`,
        action: '해당 페이지 레이아웃을 타 매장에 적용하는 것을 검토하세요.',
      })
    }
  }
  // 11) IP 상품 매출 집중
  if (ipData.length > 0) {
    const ipTotal = ipData.reduce((s, d) => s + d.realAmt, 0)
    const ipPct   = thisRevenue > 0 ? ipTotal / thisRevenue * 100 : 0
    if (ipPct > 30) {
      insights.push({
        id: 'ip_concentration', severity: 'info',
        title: 'IP 상품 매출 비중 높음',
        desc: `IP 콜라보 매출이 전체의 ${ipPct.toFixed(1)}% (${ipData[0].name} 등)`,
        action: 'IP 시즌 종료 후 매출 공백에 대비해 자체 상품 라인업을 강화하세요.',
      })
    }
  }
  // 12) 여성 고객 쏠림
  const femaleEntry = genderData.find(g => g.name?.includes('여'))
  if (femaleEntry && femaleEntry.pct > 70) {
    insights.push({
      id: 'female_skew', severity: 'info',
      title: '여성 고객 쏠림 심화',
      desc: `여성 실주문 비중 ${femaleEntry.pct.toFixed(1)}%`,
      action: '남성 전용 기획전·콜라보로 남성 고객 유입을 확대하세요.',
    })
  }
  // 13) 구매 고객 감소
  if (hasWoW && kpis[4].wow !== null && kpis[4].wow < -10) {
    insights.push({
      id: 'cust_drop', severity: 'danger',
      title: '구매 고객 수 감소',
      desc: `구매 고객이 전주 대비 ${fmtWoW(kpis[4].wow)} 감소했습니다.`,
      action: 'CRM 마케팅(재구매 쿠폰, SMS 리타겟팅)을 즉시 실행하세요.',
    })
  }

  // ── 아이템×성별 복종 실적 매트릭스 ──
  const ITEM_GENDER_COLS = ['여성', '남성', '키즈', '공용', '콜라보']
  const igRaw = {}, igSkuSets = {}
  for (const i of salesSplit.thisWeek) {
    const p = parseStyleCode(i.styleCode)
    const itemName = p.itemName || '기타'
    if (!igRaw[itemName]) { igRaw[itemName] = {}; igSkuSets[itemName] = new Set() }
    const g = ITEM_GENDER_COLS.includes(p.gender) ? p.gender : '기타'
    igRaw[itemName][g] = (igRaw[itemName][g] || 0) + i.realAmt
    if (i.styleCode) igSkuSets[itemName].add(i.styleCode)
  }
  const itemGenderMatrix = Object.entries(igRaw).map(([itemName, gMap]) => {
    const row = { itemName, skuCount: igSkuSets[itemName].size }
    let total = 0
    for (const g of [...ITEM_GENDER_COLS, '기타']) { row[g] = gMap[g] || 0; total += row[g] }
    row.total = total
    return row
  }).sort((a, b) => {
    if (a.itemName === '기타') return 1
    if (b.itemName === '기타') return -1
    return b.total - a.total
  })

  return {
    period, thisP, lastP, hasWoW,
    kpis,
    channelData,
    cartDerived,
    genderData, femaleAge, maleAge,
    salesTop15, wishTop15, cartTop15, pvGapList,
    catData, catFunnel, ipData,
    newVsCarry, pareto, genderCatData, topCatsForCross,
    newVsReturn,
    matchedRate, unmatchedCodes,
    visitMetrics, storeMetrics,
    insights,
    itemGenderMatrix,
  }
}

// ─── 구역별 효율 인사이트 (storeCorner 데이터 기반) ──────────────────────────
export function computeStoreCornerInsights(storeCorner) {
  if (!storeCorner?.items?.length) return []
  const insights = []
  const items = storeCorner.items

  // ── 기획전 집계 ──
  const exhibItems = items.filter(i => i.storeGroup === '기획전매장')
  const exhibMap = {}
  for (const i of exhibItems) {
    const k = i.detailName || '(미분류)'
    if (!exhibMap[k]) exhibMap[k] = { name: k, imp: 0, clk: 0, buyer: 0, realAmt: 0 }
    exhibMap[k].imp    += i.impressions
    exhibMap[k].clk    += i.clicks
    exhibMap[k].buyer  += i.buyerCnt
    exhibMap[k].realAmt+= i.realAmt
  }
  const exhibRows = Object.values(exhibMap)
    .map(r => ({ ...r, ctr: r.imp > 0 ? r.clk / r.imp : 0, cvr: r.clk > 0 ? r.buyer / r.clk : 0 }))
    .sort((a, b) => b.realAmt - a.realAmt)

  const exhibTotalAmt = exhibRows.reduce((s, r) => s + r.realAmt, 0)
  const exhibTotalImp = exhibRows.reduce((s, r) => s + r.imp, 0)
  const exhibTotalClk = exhibRows.reduce((s, r) => s + r.clk, 0)
  const exhibAvgCTR   = exhibTotalImp > 0 ? exhibTotalClk / exhibTotalImp : 0

  // ── 카테고리 집계 ──
  const catItems = items.filter(i => i.storeGroup === '카테고리매장')
  const catImp   = catItems.reduce((s, i) => s + i.impressions, 0)
  const catClk   = catItems.reduce((s, i) => s + i.clicks, 0)
  const catCTR   = catImp > 0 ? catClk / catImp : 0

  const fmt  = v => (v * 100).toFixed(2) + '%'
  const fmtN = v => v.toLocaleString()

  // ── 인사이트 생성 ──

  // 1) 노출 많은데 CTR 낮은 기획전 (평균의 50% 미만)
  const lowCtrRows = exhibRows.filter(r => r.imp >= 50000 && exhibAvgCTR > 0 && r.ctr < exhibAvgCTR * 0.5)
  if (lowCtrRows.length > 0) {
    const top = lowCtrRows[0]
    insights.push({
      id: 'low_ctr_exhibit', severity: 'warning',
      title: '노출 대비 클릭 미흡 기획전',
      desc: `「${top.name}」 노출 ${fmtN(top.imp)}회 — CTR ${fmt(top.ctr)} (기획전 평균 ${fmt(exhibAvgCTR)}의 절반 이하)`,
      action: '배너 이미지·카피 교체 또는 기획전 노출 위치(코너 순서)를 재배치하세요.',
    })
  }

  // 2) 기획전 매출 편중 — 1위 기획전이 전체의 50% 이상
  if (exhibRows.length > 1 && exhibTotalAmt > 0 && exhibRows[0].realAmt / exhibTotalAmt > 0.5) {
    const share = exhibRows[0].realAmt / exhibTotalAmt
    insights.push({
      id: 'exhibit_concentration', severity: 'info',
      title: '기획전 매출 편중',
      desc: `「${exhibRows[0].name}」 단일 기획전이 전체 기획전 매출의 ${(share * 100).toFixed(1)}% 차지`,
      action: '하위 기획전에 추가 노출·프로모션 자원을 배분하거나 신규 기획전을 강화하세요.',
    })
  }

  // 3) 클릭은 있으나 구매 전환 0인 기획전
  const zeroConvRows = exhibRows.filter(r => r.clk >= 100 && r.buyer === 0)
  if (zeroConvRows.length > 0) {
    insights.push({
      id: 'zero_conv_exhibit', severity: 'warning',
      title: '클릭 있으나 구매 전환 없는 기획전',
      desc: `${zeroConvRows.slice(0, 3).map(r => `「${r.name}」`).join(', ')} — 클릭 유입은 있으나 주문 0`,
      action: '기획전 내 상품 가격·재고 여부를 확인하고 구매 유인 요소(쿠폰·혜택)를 추가하세요.',
    })
  }

  // 4) 고효율 기획전 감지 — CTR 3% 이상 (긍정)
  const topCtrRow = exhibRows.filter(r => r.imp >= 10000).sort((a, b) => b.ctr - a.ctr)[0]
  if (topCtrRow && topCtrRow.ctr > 0.03) {
    insights.push({
      id: 'top_ctr_exhibit', severity: 'success',
      title: '고효율 기획전 감지',
      desc: `「${topCtrRow.name}」 CTR ${fmt(topCtrRow.ctr)} — 노출 ${fmtN(topCtrRow.imp)}회 기준 전환 우수`,
      action: '해당 기획전의 배너 형태·상품 구성·코너 배치를 타 기획전 운영에 참고하세요.',
    })
  }

  // 5) 카테고리 CTR이 기획전보다 1.5배 이상 높음
  if (catCTR > 0 && exhibAvgCTR > 0 && catCTR > exhibAvgCTR * 1.5) {
    insights.push({
      id: 'cat_ctr_dominates', severity: 'info',
      title: '카테고리 구역 CTR 우위',
      desc: `카테고리 CTR ${fmt(catCTR)} vs 기획전 CTR ${fmt(exhibAvgCTR)} — 카테고리 탐색이 더 활발`,
      action: '인기 카테고리와 연계한 기획전을 설계하거나 카테고리 내 기획전 배너를 추가하세요.',
    })
  }

  return insights
}
