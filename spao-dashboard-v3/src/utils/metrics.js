import { parseStyleCode, validateCodeCoverage } from './styleCodeParser'
import { getCategory, getIP, extractCollabIP } from './categorize'

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
export function computeSalesByDateMetrics(salesByDate, prevSalesByDate = null) {
  if (!salesByDate?.items?.length) return null

  const { sigma, items } = salesByDate
  const cancelRate    = sigma.orderCnt > 0 ? (1 - sigma.realOrderCnt / sigma.orderCnt) * 100 : 0
  const aov           = sigma.realOrderCnt > 0 ? sigma.realAmt / sigma.realOrderCnt : 0
  const discountRate  = sigma.orderAmt > 0 ? sigma.discountAmt / sigma.orderAmt * 100 : 0
  const benefitRate   = sigma.orderAmt > 0 ? sigma.totalBenefit / sigma.orderAmt * 100 : 0
  const cancelAmt     = sigma.cancelAmt || 0

  // ── 전주(WoW) 비교: 지난주 기간별 매출분석 시그마 대비 ──
  // 금액·건수형 지표는 증감률(%), 비율형 지표(취소율/혜택율)는 포인트(%p) 차이로 계산
  let wow = null
  if (prevSalesByDate?.items?.length) {
    const ps = prevSalesByDate.sigma
    const pCancelRate  = ps.orderCnt > 0 ? (1 - ps.realOrderCnt / ps.orderCnt) * 100 : 0
    const pAov         = ps.realOrderCnt > 0 ? ps.realAmt / ps.realOrderCnt : 0
    const pDiscountRate= ps.orderAmt > 0 ? ps.discountAmt / ps.orderAmt * 100 : 0
    const pBenefitRate = ps.orderAmt > 0 ? ps.totalBenefit / ps.orderAmt * 100 : 0
    wow = {
      realAmt:      wowPct(sigma.realAmt, ps.realAmt),
      buyerCnt:     wowPct(sigma.buyerCnt, ps.buyerCnt),
      orderCnt:     wowPct(sigma.orderCnt, ps.orderCnt),
      realOrderCnt: wowPct(sigma.realOrderCnt, ps.realOrderCnt),
      cancelRate:   cancelRate - pCancelRate,       // %p 차이
      aov:          wowPct(aov, pAov),
      discountAmt:  wowPct(sigma.discountAmt, ps.discountAmt),
      discountRate: discountRate - pDiscountRate,    // %p 차이
      benefitRate:  benefitRate - pBenefitRate,      // %p 차이
      period:       prevSalesByDate.period || null,
    }
  }

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
    prevSigma: prevSalesByDate?.items?.length ? prevSalesByDate.sigma : null,
    cancelRate,
    aov,
    discountRate,
    benefitRate,
    cancelAmt,
    channelStats,
    dailyOrders,
    medias,
    wow,
    period: `${dates[0]} ~ ${dates[dates.length - 1]}`,
  }
}

// ─── 검색 실적 집계 (전주 대비 WoW 포함) ─────────────────────────────────────
export function computeSearchMetrics(searchData, prevSearchData = null) {
  if (!searchData?.items?.length) return null

  const { sigma, items } = searchData

  // 검색 성공률
  const totalRows = items.length
  const successRows = items.filter(i => i.success).length
  const successRate = totalRows > 0 ? successRows / totalRows * 100 : 0

  // 검색→구매 전환율
  const searchConvRate = sigma.uv > 0 ? sigma.orderCnt / sigma.uv * 100 : 0

  // ── 전주(WoW) 비교 ──
  let wow = null
  if (prevSearchData?.items?.length) {
    const ps = prevSearchData.sigma
    const pConvRate = ps.uv > 0 ? ps.orderCnt / ps.uv * 100 : 0
    wow = {
      searchVol: wowPct(sigma.searchVol, ps.searchVol),
      uv:        wowPct(sigma.uv, ps.uv),
      orderCnt:  wowPct(sigma.orderCnt, ps.orderCnt),
      orderAmt:  wowPct(sigma.orderAmt, ps.orderAmt),
      convRate:  searchConvRate - pConvRate,   // %p 차이
      period:    prevSearchData.period || null,
    }
  }

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
    wow,
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

// ─── 방문실적 집계 (전주 대비 WoW 포함) ──────────────────────────────────────
export function calcVisitMetrics(visit, prevVisit = null) {
  if (!visit?.items?.length) {
    return { channelKPIs: [], dailyUV: [], totalUV: 0, prevTotalUV: 0, hasPrev: false }
  }
  const items = visit.items
  const prevItems = prevVisit?.items || []
  const hasPrev = prevItems.length > 0
  const medias = [...new Set(items.map(i => i.media))].filter(Boolean)

  const channelKPIs = medias.map(media => {
    const rows = items.filter(i => i.media === media)
    const uv      = sumField(rows, 'uv')
    const session  = sumField(rows, 'session')
    const pv       = sumField(rows, 'pv')
    const avgBounce = rows.length > 0
      ? rows.reduce((s, r) => s + r.bounceRate, 0) / rows.length
      : 0
    const prevRows = prevItems.filter(i => i.media === media)
    const prevUv   = sumField(prevRows, 'uv')
    const prevBounce = prevRows.length > 0
      ? prevRows.reduce((s, r) => s + r.bounceRate, 0) / prevRows.length
      : 0
    return {
      media,
      uv,
      session,
      pv,
      sessionPV: session > 0 ? pv / session : 0,
      avgBounceRate: avgBounce,
      uvWoW:     hasPrev ? wowPct(uv, prevUv) : null,
      bounceWoW: hasPrev ? (avgBounce - prevBounce) : null,  // %p 차이
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

  const totalUV     = sumField(items, 'uv')
  const prevTotalUV = sumField(prevItems, 'uv')

  return { channelKPIs, dailyUV, totalUV, prevTotalUV, hasPrev }
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

// ─── 재입고 알림내역 (품절 수요) 집계 ────────────────────────────────────────
// restock: parseRestock 결과({items, totalCnt, ...}). prevRestock: 전주 동일.
// salesItems: 이번주 판매(sales) 아이템 배열 — styleCode 교차로 "잘 팔리는데 품절" 감지.
export function computeRestockMetrics(restock, prevRestock = null, salesItems = []) {
  if (!restock?.items?.length) return null

  // ── 상품 단위 롤업 (단품 → 상품) ──
  const roll = (items) => {
    const map = new Map()
    for (const it of items) {
      const key = it.productNo || it.name
      let r = map.get(key)
      if (!r) {
        r = { productNo: it.productNo, name: it.name, styleCode: it.styleCode, cnt: 0, skuCount: 0, sizes: {}, skus: [] }
        map.set(key, r)
      }
      r.cnt += it.cnt
      r.skuCount += 1
      if (it.size) r.sizes[it.size] = (r.sizes[it.size] || 0) + it.cnt
      // 단품(SKU) 원본 보존 — 펼침 상세 + 내보내기(취합)용
      r.skus.push({
        optionNo: it.optionNo, optionName: it.optionName,
        color: it.color, size: it.size, cnt: it.cnt,
      })
    }
    return map
  }

  const curMap  = roll(restock.items)
  const prevMap = prevRestock?.items?.length ? roll(prevRestock.items) : null
  const hasPrev = !!prevMap

  // 단품(SKU) 단위 전주 대기건수 — 단품번호(optionNo)로 매칭.
  // 같은 단품번호가 다른 상품에서 재사용되는 걸 막기 위해 "상품키|단품번호" 로 키를 만든다.
  const prevSkuMap = new Map()
  if (prevRestock?.items?.length) {
    for (const it of prevRestock.items) {
      const productKey = it.productNo || it.name
      if (it.optionNo) prevSkuMap.set(`${productKey}|${it.optionNo}`, it.cnt)
    }
  }

  // 판매 styleCode별 실주문금액·수량 → 단가(realAmt/qty) 산출.
  //  - salesAmt: 잘 팔리는데 품절 교차 하이라이트용
  //  - unitPrice: 재입고 예상매출 추정의 단가 근거 (실현 순단가)
  const salesByCode = new Map()
  let totAmt = 0, totQty = 0
  for (const s of (salesItems || [])) {
    if (!s.styleCode) continue
    const e = salesByCode.get(s.styleCode) || { amt: 0, qty: 0 }
    e.amt += (s.realAmt || 0)
    e.qty += (s.qty || 0)
    salesByCode.set(s.styleCode, e)
    totAmt += (s.realAmt || 0)
    totQty += (s.qty || 0)
  }
  const overallUnit = totQty > 0 ? totAmt / totQty : 0   // 가격 미보유 상품 폴백 단가

  const products = [...curMap.values()].map(r => {
    const parsed = parseStyleCode(r.styleCode)
    const productKey = r.productNo || r.name
    const prevCnt = prevMap?.get(productKey)?.cnt ?? null
    const sc = r.styleCode ? salesByCode.get(r.styleCode) : null
    const salesAmt = sc?.amt || 0
    const unitPrice = (sc && sc.qty > 0) ? sc.amt / sc.qty : null   // 실판매 단가
    const estUnit = unitPrice != null ? unitPrice : overallUnit     // 추정에 쓸 단가
    // 단품(SKU) 단위 전주 대기건수 — 단품번호로 매칭(신규 단품은 null=신규)
    const skusWithPrev = r.skus.map(s => {
      const prevSkuCnt = s.optionNo ? (prevSkuMap.get(`${productKey}|${s.optionNo}`) ?? null) : null
      return { ...s, prevCnt: hasPrev ? prevSkuCnt : null }
    })
    return {
      ...r,
      skus: skusWithPrev,
      itemName: parsed.itemName || '',
      gender:   parsed.gender || '',
      isCollab: parsed.gender === '콜라보',   // 성별코드 U = 캐릭터/브랜드 콜라보
      ip:       parsed.gender === '콜라보' ? extractCollabIP(r.name) : null,
      year:     parsed.yearCode || '',
      isNew:    parsed.isNew || false,
      prevCnt,
      wow:      hasPrev ? wowPct(r.cnt, prevCnt) : null,
      isNewDemand: hasPrev && (prevCnt === null || prevCnt === 0),
      salesAmt,                 // 이 상품의 이번주 실주문금액(0이면 판매 데이터에 없음)
      hot:      salesAmt > 0,   // 잘 팔리는데 품절수요까지 = 최우선 리오더
      unitPrice,                // 실판매 단가(null=판매 이력 없음)
      hasPrice: unitPrice != null,
      estUnit,                  // 추정 단가(실단가 or 전체평균 폴백)
      estBase:  r.cnt * estUnit, // 전환율 적용 전 기준액 (UI에서 ×가정전환율)
    }
  }).sort((a, b) => b.cnt - a.cnt)

  // ── 사이즈 분포 (전체) ──
  const sizeMap = {}
  for (const it of restock.items) {
    if (it.size) sizeMap[it.size] = (sizeMap[it.size] || 0) + it.cnt
  }
  const topSizes = Object.entries(sizeMap)
    .map(([size, cnt]) => ({ size, cnt }))
    .sort((a, b) => b.cnt - a.cnt)

  const crossHot = products.filter(p => p.hot).slice(0, 10)

  const prevTotalCnt = prevRestock?.totalCnt ?? null

  // ── 콜라보 vs 어패럴(비콜라보) 분류 합계 (두 그룹 합 = 전체) ──
  const bucket = () => ({ cnt: 0, prevCnt: 0, productCount: 0, estBase: 0 })
  const buckets = { collab: bucket(), apparel: bucket() }
  for (const p of products) {
    const b = buckets[p.isCollab ? 'collab' : 'apparel']
    b.cnt += p.cnt
    b.prevCnt += (p.prevCnt || 0)
    b.productCount += 1
    b.estBase += p.estBase
  }
  const classSummary = {
    collab:  { cnt: buckets.collab.cnt,  productCount: buckets.collab.productCount,  wow: hasPrev ? wowPct(buckets.collab.cnt,  buckets.collab.prevCnt)  : null, estBase: buckets.collab.estBase },
    apparel: { cnt: buckets.apparel.cnt, productCount: buckets.apparel.productCount, wow: hasPrev ? wowPct(buckets.apparel.cnt, buckets.apparel.prevCnt) : null, estBase: buckets.apparel.estBase },
  }

  // ── 콜라보 IP별 집계 (인기도 가늠 + IP 드릴다운) ──
  const ipMap = new Map()
  for (const p of products) {
    if (!p.isCollab) continue
    const e = ipMap.get(p.ip) || { ip: p.ip, cnt: 0, prevCnt: 0, productCount: 0 }
    e.cnt += p.cnt
    e.prevCnt += (p.prevCnt || 0)
    e.productCount += 1
    ipMap.set(p.ip, e)
  }
  const ipSummary = [...ipMap.values()]
    .map(e => ({ ip: e.ip, cnt: e.cnt, productCount: e.productCount, wow: hasPrev ? wowPct(e.cnt, e.prevCnt) : null }))
    .sort((a, b) => b.cnt - a.cnt)

  // ── 가격 커버리지 (예상매출 신뢰도) ──
  const pricedCnt = products.reduce((s, p) => s + (p.hasPrice ? p.cnt : 0), 0)
  const estBaseAll = products.reduce((s, p) => s + p.estBase, 0)
  const priceCoverage = {
    pricedProducts: products.filter(p => p.hasPrice).length,
    totalProducts:  products.length,
    pricedCntPct:   restock.totalCnt > 0 ? pricedCnt / restock.totalCnt * 100 : 0, // 대기건수 기준 가격보유 비율
    overallUnit,
  }

  return {
    products,
    crossHot,
    topSizes,
    classSummary,
    ipSummary,
    estBaseAll,            // 전환율 적용 전 전체 기준액 (UI: ×가정전환율 = 예상매출)
    priceCoverage,
    summary: {
      totalCnt:     restock.totalCnt,
      productCount: restock.productCount,
      skuCount:     restock.skuCount,
      prevTotalCnt,
      totalWoW:     hasPrev ? wowPct(restock.totalCnt, prevTotalCnt) : null,
    },
    hasPrev,
  }
}

// ─── 쿠폰 실적 (프로모션 효율) 집계 ──────────────────────────────────────────
// coupon: parseCoupon 결과({items, sigma}). prevCoupon: 전주 동일.
export function computeCouponMetrics(coupon, prevCoupon = null) {
  if (!coupon?.items?.length) return null
  const items = coupon.items

  const sum = (arr, f) => arr.reduce((s, r) => s + (r[f] || 0), 0)
  const agg = (arr) => ({
    cnt:        arr.length,
    issued:     sum(arr, 'issued'),
    used:       sum(arr, 'used'),
    realAmt:    sum(arr, 'realAmt'),
    discount:   sum(arr, 'discountAmt'),
  })

  const total = agg(items)
  const usageRate = total.issued > 0 ? total.used / total.issued * 100 : 0
  const efficiency = total.discount > 0 ? total.realAmt / total.discount : 0  // 명목 효율(증분 아님)

  // 부담 주체 분할
  const burden = {
    MD:      sum(items, 'burdenMD'),
    마케팅:  sum(items, 'burdenMktg'),
    지점:    sum(items, 'burdenStore'),
    업체:    sum(items, 'burdenVendor'),
    CS:      sum(items, 'burdenCS'),
    멤버스:  sum(items, 'burdenMembers'),
    기타:    sum(items, 'burdenEtc'),
  }
  const burdenList = Object.entries(burden)
    .map(([name, amt]) => ({ name, amt }))
    .filter(b => b.amt > 0)
    .sort((a, b) => b.amt - a.amt)

  // 프로모션종류그룹별 (장바구니=온라인 / 오프라인주문 등)
  const groupMap = {}
  for (const i of items) {
    const k = i.promoGroup || '(미분류)'
    if (!groupMap[k]) groupMap[k] = []
    groupMap[k].push(i)
  }
  const byGroup = Object.entries(groupMap)
    .map(([group, arr]) => ({ group, ...agg(arr) }))
    .sort((a, b) => b.realAmt - a.realAmt)

  // 프로모션별 롤업 (같은 프로모션명 합산)
  const promoMap = new Map()
  for (const i of items) {
    const key = i.promoName
    let r = promoMap.get(key)
    if (!r) { r = { promoName: i.promoName, promoGroup: i.promoGroup, issued: 0, used: 0, realAmt: 0, discount: 0 }; promoMap.set(key, r) }
    r.issued += i.issued; r.used += i.used; r.realAmt += i.realAmt; r.discount += i.discountAmt
  }
  const promos = [...promoMap.values()]
    .map(p => ({
      ...p,
      efficiency: p.discount > 0 ? p.realAmt / p.discount : 0,
      usageRate:  p.issued > 0 ? p.used / p.issued * 100 : 0,
    }))
    .sort((a, b) => b.realAmt - a.realAmt)

  // 전주 대비(WoW)
  const hasPrev = !!prevCoupon?.items?.length
  const prev = hasPrev ? agg(prevCoupon.items) : null
  const wow = hasPrev ? {
    realAmt:  wowPct(total.realAmt, prev.realAmt),
    discount: wowPct(total.discount, prev.discount),
    used:     wowPct(total.used, prev.used),
  } : null

  return {
    summary: { ...total, usageRate, efficiency },
    burden, burdenList,
    byGroup, promos,
    wow, hasPrev,
    period: coupon.period || '',
  }
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
  const restock     = thisWeek?.restock || null
  const prevRestock = lastWeek?.restock || null
  const coupon      = thisWeek?.coupon || null
  const prevCoupon  = lastWeek?.coupon || null

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

  // ── 4. 채널별 실주문금액 (전주 대비 WoW 포함) ──
  const channelMap = {}
  for (const i of salesSplit.thisWeek) {
    if (!channelMap[i.media]) channelMap[i.media] = 0
    channelMap[i.media] += i.realAmt
  }
  const channelMapPrev = {}
  for (const i of salesSplit.lastWeek) {
    if (!channelMapPrev[i.media]) channelMapPrev[i.media] = 0
    channelMapPrev[i.media] += i.realAmt
  }
  const channelData = Object.entries(channelMap)
    .map(([name, value]) => ({
      name, value,
      realAmt: value,
      prevValue: (channelMapPrev[name] !== undefined) ? channelMapPrev[name] : null,
      wow: hasWoW ? wowPct(value, channelMapPrev[name]) : null,
    }))
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
    prevCartCnt: hasWoW ? lastCartCnt : null,
    prevOrderCnt: hasWoW ? lastOrderCnt : null,
    cartConvRate,
    memberPct,
    nonMemberPct,
  }

  // ── 6. 고객 세그먼트 (전주 대비 WoW 포함) ──
  const genderMap = {}
  for (const i of custSplit.thisWeek) {
    const g = i.gender || '기타'
    if (!genderMap[g]) genderMap[g] = { orderCnt: 0, realAmt: 0 }
    genderMap[g].orderCnt += i.orderCnt
    genderMap[g].realAmt  += i.realAmt
  }
  const genderMapPrev = {}
  for (const i of custSplit.lastWeek) {
    const g = i.gender || '기타'
    if (!genderMapPrev[g]) genderMapPrev[g] = 0
    genderMapPrev[g] += i.realAmt
  }
  const totalGenderAmt = Object.values(genderMap).reduce((s, v) => s + v.realAmt, 0) || 1
  const genderData = Object.entries(genderMap).map(([name, d]) => ({
    name,
    value: d.realAmt,
    pct: d.realAmt / totalGenderAmt * 100,
    wow: hasWoW ? wowPct(d.realAmt, genderMapPrev[name]) : null,
  }))

  // 성별×연령 (여성/남성)
  function cleanAge(v) {
    const s = String(v ?? '').trim()
    if (!s || s === '0' || /^unknown$/i.test(s) || /^null$/i.test(s) || /^\d$/.test(s)) return '연령미상'
    return s
  }
  function buildAgeData(genderLabel) {
    const ageMap = {}, agePrevMap = {}
    for (const i of custSplit.thisWeek) {
      if (!i.gender?.includes(genderLabel)) continue
      const age = cleanAge(i.ageGroup)
      if (!ageMap[age]) ageMap[age] = 0
      ageMap[age] += i.realAmt
    }
    for (const i of custSplit.lastWeek) {
      if (!i.gender?.includes(genderLabel)) continue
      const age = cleanAge(i.ageGroup)
      if (!agePrevMap[age]) agePrevMap[age] = 0
      agePrevMap[age] += i.realAmt
    }
    return Object.entries(ageMap)
      .map(([age, realAmt]) => ({ age, realAmt, wow: hasWoW ? wowPct(realAmt, agePrevMap[age]) : null }))
      .sort((a, b) => {
        if (a.age === '연령미상') return 1
        if (b.age === '연령미상') return -1
        return a.age.localeCompare(b.age, 'ko-KR', { numeric: true })
      })
  }
  const femaleAge = buildAgeData('여')
  const maleAge   = buildAgeData('남')

  // ── 7. 상품 실적 Top 50 (전주 대비 WoW 포함) ──
  // limit 50까지 계산해서 derived 에 담고, UI(ProductTable)에서 20개만 노출 후 펼치기
  function topBy(items, field, prevItems = [], limit = 50) {
    const map = {}
    for (const i of items) {
      const key = i.styleCode || i.name
      if (!key) continue
      if (!map[key]) map[key] = { styleCode: i.styleCode, name: i.name, [field]: 0 }
      map[key][field] += Number(i[field]) || 0
    }
    // 전주 동일 키(스타일코드/상품명) 합계
    const prevMap = {}
    for (const i of prevItems) {
      const key = i.styleCode || i.name
      if (!key) continue
      prevMap[key] = (prevMap[key] || 0) + (Number(i[field]) || 0)
    }
    return Object.values(map)
      .sort((a, b) => b[field] - a[field])
      .slice(0, limit)
      .map((d, idx) => {
        const key = d.styleCode || d.name
        const prevValue = prevMap[key]
        return {
          ...d,
          rank: idx + 1,
          prevValue: (prevValue !== undefined) ? prevValue : null,
          wow: (prevValue && prevValue !== 0) ? (d[field] - prevValue) / prevValue * 100 : null,
        }
      })
  }

  const salesTop15 = topBy(salesSplit.thisWeek, 'realAmt', salesSplit.lastWeek)
  const wishTop15  = topBy(wishSplit.thisWeek, 'wishCnt', wishSplit.lastWeek)
  const cartTop15  = topBy(cartSplit.thisWeek, 'cartCnt', cartSplit.lastWeek)

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

  // ── 8. 파레토 분석 (전주 대비 WoW 포함) ──
  const sortedByRev = Object.values(pvMap).filter(p => p.realAmt > 0).sort((a, b) => b.realAmt - a.realAmt)
  const totalRevForPareto = sortedByRev.reduce((s, p) => s + p.realAmt, 0)
  let cumRev80 = 0, pareto80idx = sortedByRev.length
  for (let i = 0; i < sortedByRev.length; i++) {
    cumRev80 += sortedByRev[i].realAmt
    if (cumRev80 >= totalRevForPareto * 0.8) { pareto80idx = i + 1; break }
  }
  // 전주 파레토(80% 커버 SKU 수) 및 상품별 전주 매출 맵
  const prevRevMap = {}
  for (const i of salesSplit.lastWeek) {
    const key = i.styleCode || i.name
    if (!key) continue
    prevRevMap[key] = (prevRevMap[key] || 0) + (Number(i.realAmt) || 0)
  }
  const prevSortedByRev = Object.entries(prevRevMap).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const prevTotalRev = prevSortedByRev.reduce((s, [, v]) => s + v, 0)
  let prevCum = 0, prevCount80 = prevSortedByRev.length
  for (let i = 0; i < prevSortedByRev.length; i++) {
    prevCum += prevSortedByRev[i][1]
    if (prevCum >= prevTotalRev * 0.8) { prevCount80 = i + 1; break }
  }
  const pareto = {
    count80: pareto80idx,
    total: sortedByRev.length,
    pct80: sortedByRev.length > 0 ? Math.round(pareto80idx / sortedByRev.length * 100) : 0,
    count80Wow: (hasWoW && prevSortedByRev.length > 0) ? wowPct(pareto80idx, prevCount80) : null,
    top10: sortedByRev.slice(0, 10).map((p, i) => {
      const key = p.styleCode || p.name
      const prevValue = prevRevMap[key]
      return {
        ...p, rank: i + 1,
        cumPct: Math.round(sortedByRev.slice(0, i + 1).reduce((s, x) => s + x.realAmt, 0) / (totalRevForPareto || 1) * 100),
        pct: Math.round(p.realAmt / (totalRevForPareto || 1) * 100),
        wow: (hasWoW && prevValue) ? wowPct(p.realAmt, prevValue) : null,
      }
    }),
  }

  // ── 9. 카테고리 (전주 대비 WoW 포함) ──
  const catMap = {}
  for (const i of salesSplit.thisWeek) {
    const cat = getCategory(i.name)
    if (!catMap[cat]) catMap[cat] = 0
    catMap[cat] += i.realAmt
  }
  const catMapPrev = {}
  for (const i of salesSplit.lastWeek) {
    const cat = getCategory(i.name)
    if (!catMapPrev[cat]) catMapPrev[cat] = 0
    catMapPrev[cat] += i.realAmt
  }
  const catData = Object.entries(catMap)
    .map(([name, realAmt]) => ({ name, realAmt, wow: hasWoW ? wowPct(realAmt, catMapPrev[name]) : null }))
    .sort((a, b) => b.realAmt - a.realAmt)

  // ── 신상 vs 이월 비교 ──
  const newVsCarry = (() => {
    const newCodes = new Set(), carryCodes = new Set()
    let newAmt = 0, carryAmt = 0
    for (const i of salesSplit.thisWeek) {
      const p = parseStyleCode(i.styleCode)
      if (p.yearCode === 'G') { newAmt += i.realAmt; newCodes.add(i.styleCode) }
      else if (i.styleCode?.length >= 8) { carryAmt += i.realAmt; carryCodes.add(i.styleCode) }
    }
    // 전주 신상/이월 매출 (WoW)
    let prevNewAmt = 0, prevCarryAmt = 0
    for (const i of salesSplit.lastWeek) {
      const p = parseStyleCode(i.styleCode)
      if (p.yearCode === 'G') prevNewAmt += i.realAmt
      else if (i.styleCode?.length >= 8) prevCarryAmt += i.realAmt
    }
    const total = newAmt + carryAmt || 1
    return [
      { name: '신상(이번시즌)', realAmt: newAmt, skuCount: newCodes.size, pct: newAmt / total * 100, wow: hasWoW ? wowPct(newAmt, prevNewAmt) : null },
      { name: '이월(전시즌)',   realAmt: carryAmt, skuCount: carryCodes.size, pct: carryAmt / total * 100, wow: hasWoW ? wowPct(carryAmt, prevCarryAmt) : null },
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
  // 전주 카테고리별 실주문금액 (WoW)
  const catFunnelPrev = {}
  for (const i of salesSplit.lastWeek) {
    const cat = getCatSmart(i.name, i.styleCode)
    if (!catFunnelPrev[cat]) catFunnelPrev[cat] = 0
    catFunnelPrev[cat] += i.realAmt
  }
  const catFunnel = Object.entries(catFunnelMap)
    .map(([name, d]) => ({ name, ...d, wow: hasWoW ? wowPct(d.realAmt, catFunnelPrev[name]) : null }))
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

  // ── 10. IP 현황 (전주 대비 WoW 포함) ──
  const ipMap = {}
  for (const i of salesSplit.thisWeek) {
    const ip = getIP(i.name)
    if (!ip) continue
    if (!ipMap[ip]) ipMap[ip] = 0
    ipMap[ip] += i.realAmt
  }
  const ipMapPrev = {}
  for (const i of salesSplit.lastWeek) {
    const ip = getIP(i.name)
    if (!ip) continue
    if (!ipMapPrev[ip]) ipMapPrev[ip] = 0
    ipMapPrev[ip] += i.realAmt
  }
  const ipData = Object.entries(ipMap)
    .map(([name, realAmt]) => ({ name, realAmt, wow: hasWoW ? wowPct(realAmt, ipMapPrev[name]) : null }))
    .sort((a, b) => b.realAmt - a.realAmt)

  // ── 10. 스타일코드 커버리지 ──
  const { matchedRate, unmatchedCodes } = validateCodeCoverage(salesSplit.thisWeek)

  // ── 11. 방문실적 / 매장실적 ──
  const visitMetrics = visit ? calcVisitMetrics(visit, lastWeek?.visit || null) : null
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
  // 전주 아이템별 합계 매출 (WoW)
  const igPrevTotal = {}
  for (const i of salesSplit.lastWeek) {
    const p = parseStyleCode(i.styleCode)
    const itemName = p.itemName || '기타'
    igPrevTotal[itemName] = (igPrevTotal[itemName] || 0) + (Number(i.realAmt) || 0)
  }
  const itemGenderMatrix = Object.entries(igRaw).map(([itemName, gMap]) => {
    const row = { itemName, skuCount: igSkuSets[itemName].size }
    let total = 0
    for (const g of [...ITEM_GENDER_COLS, '기타']) { row[g] = gMap[g] || 0; total += row[g] }
    row.total = total
    row.totalWow = hasWoW ? wowPct(total, igPrevTotal[itemName]) : null
    return row
  }).sort((a, b) => {
    if (a.itemName === '기타') return 1
    if (b.itemName === '기타') return -1
    return b.total - a.total
  })

  // 복종(성별) 열별 전주 대비 — 전체 합계 행에 표시
  const IG_ALL_COLS = [...ITEM_GENDER_COLS, '기타']
  const igColThis = {}, igColPrev = {}
  for (const g of IG_ALL_COLS) { igColThis[g] = 0; igColPrev[g] = 0 }
  for (const itemName in igRaw) {
    for (const g of IG_ALL_COLS) igColThis[g] += igRaw[itemName][g] || 0
  }
  for (const i of salesSplit.lastWeek) {
    const p = parseStyleCode(i.styleCode)
    const g = ITEM_GENDER_COLS.includes(p.gender) ? p.gender : '기타'
    igColPrev[g] += Number(i.realAmt) || 0
  }
  const itemGenderColWow = {}
  for (const g of IG_ALL_COLS) itemGenderColWow[g] = hasWoW ? wowPct(igColThis[g], igColPrev[g]) : null

  // ── 재입고 알림내역 (품절 수요) ──
  const restockMetrics = computeRestockMetrics(restock, prevRestock, salesSplit.thisWeek)
  if (restockMetrics?.products?.length) {
    const top = restockMetrics.products[0]
    // 1순위 재입고 상품 (대기 수요 최다)
    insights.push({
      severity: top.cnt >= 100 ? 'danger' : 'warning',
      title: `재입고 1순위: ${top.name.replace(/_[A-Za-z0-9]+\s*$/, '')}`,
      desc: `재입고 알림 ${fmtComma(top.cnt)}명 대기 (단품 ${top.skuCount}개)${top.hot ? ' · 판매 중인 상품인데 품절 — 매출 직접 손실 중' : ''}. 전체 ${fmtComma(restockMetrics.summary.totalCnt)}건 중 ${(top.cnt / restockMetrics.summary.totalCnt * 100).toFixed(0)}% 집중.`,
      action: `'${top.name.replace(/_[A-Za-z0-9]+\s*$/, '')}' 재입고/리오더를 최우선 검토하세요. 사이즈는 ${Object.entries(top.sizes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s, c]) => `${s}(${c})`).join(' · ')} 순으로 수요가 높습니다.`,
    })
    // "잘 팔리는데 품절" 교차 신호
    if (restockMetrics.crossHot.length > 0) {
      const names = restockMetrics.crossHot.slice(0, 3).map(p => p.name.replace(/_[A-Za-z0-9]+\s*$/, '')).join(', ')
      insights.push({
        severity: 'danger',
        title: `잘 팔리는데 품절 ${restockMetrics.crossHot.length}건 — 즉시 리오더`,
        desc: `이번 주 판매가 발생 중인데 재입고 대기까지 걸린 상품 ${restockMetrics.crossHot.length}개. 재고만 있으면 바로 더 팔 수 있는 명백한 기회손실입니다. (예: ${names})`,
        action: `해당 상품들을 우선 리오더 리스트에 올리세요. L2 상품분석 '재입고 대기 수요' 섹션에서 전체 목록과 사이즈별 수요를 확인할 수 있습니다.`,
      })
    }
  }

  // ── 쿠폰 실적 (프로모션 효율) ──
  const couponMetrics = computeCouponMetrics(coupon, prevCoupon)
  if (couponMetrics) {
    const lowUse = couponMetrics.promos.filter(p => p.discount > 1_000_000 && p.realAmt < p.discount * 2)
    if (lowUse.length > 0) {
      insights.push({
        severity: 'warning',
        title: `저효율 쿠폰 ${lowUse.length}건 — 할인 대비 매출 저조`,
        desc: `할인 100만원 이상 투입했는데 기여 실주문이 할인의 2배 미만인 프로모션이 ${lowUse.length}건입니다. (예: ${lowUse.slice(0, 2).map(p => p.promoName).join(', ')})`,
        action: `해당 쿠폰의 할인율·대상·노출을 재검토하세요. L1 '쿠폰 효율' 섹션에서 프로모션별 효율을 확인할 수 있습니다.`,
      })
    }
  }

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
    restockMetrics,
    couponMetrics,
    insights,
    itemGenderMatrix, itemGenderColWow,
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
