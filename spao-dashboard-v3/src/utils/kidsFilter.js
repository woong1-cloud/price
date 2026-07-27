import { parseStyleCode } from './styleCodeParser'

// 상품 단위(styleCode) 필드를 가진 데이터셋만 필터링 대상 — sigma 재계산에 쓸 합산 필드 목록
const SUM_FIELDS = {
  sales:    ['qty', 'realAmt', 'pv'],
  cart:     ['cartCnt', 'orderCnt', 'realAmt', 'memberCartCnt', 'nonMemberCartCnt'],
  wishlist: ['wishCnt', 'orderCnt', 'realAmt'],
}

// styleCode가 없는(=상품 단위로 쪼갤 수 없는) 데이터셋. 필터링하지 않고 null 처리해
// "성인+키즈 합산값을 키즈 라벨로" 보여주는 오표시를 막는다.
const UNFILTERABLE_KEYS = ['salesByDate', 'visit', 'store', 'storeCorner', 'search', 'coupon', 'customer']

function sumField(items, field) {
  return items.reduce((s, it) => s + (Number(it[field]) || 0), 0)
}

export function filterItemsByGender(items, genderCode) {
  return (items || []).filter(it => parseStyleCode(it.styleCode).genderCode === genderCode)
}

function filterDatasetByGender(dataset, genderCode, sumFields) {
  if (!dataset?.items?.length) return dataset
  const items = filterItemsByGender(dataset.items, genderCode)
  const sigma = {}
  for (const f of sumFields) sigma[f] = sumField(items, f)
  return { ...dataset, items, sigma }
}

function filterRestockByGender(restock, genderCode) {
  if (!restock?.items?.length) return restock
  const items = filterItemsByGender(restock.items, genderCode)
  return {
    ...restock,
    items,
    totalCnt: sumField(items, 'cnt'),
    productCount: new Set(items.map(i => i.productNo)).size,
    skuCount: new Set(items.map(i => i.optionNo)).size,
  }
}

// 주차 payload(thisWeek/lastWeek 형태) 전체를 특정 성별코드(styleCode 8번째 문자) 기준으로 필터링.
// sales/cart/wishlist/restock 은 styleCode가 있어 필터 후 sigma를 재계산하고,
// styleCode가 없는 데이터셋(salesByDate/visit/store/storeCorner/search/coupon/customer)은
// 상품 단위로 쪼갤 근거가 없으므로 null 로 비운다.
export function filterPayloadByGender(payload, genderCode = 'K') {
  if (!payload) return payload
  const filtered = { ...payload }
  filtered.sales    = filterDatasetByGender(payload.sales, genderCode, SUM_FIELDS.sales)
  filtered.cart     = filterDatasetByGender(payload.cart, genderCode, SUM_FIELDS.cart)
  filtered.wishlist = filterDatasetByGender(payload.wishlist, genderCode, SUM_FIELDS.wishlist)
  filtered.restock  = filterRestockByGender(payload.restock, genderCode)
  for (const key of UNFILTERABLE_KEYS) filtered[key] = null
  return filtered
}
