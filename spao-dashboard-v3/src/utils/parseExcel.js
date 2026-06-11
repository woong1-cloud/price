import * as XLSX from 'xlsx'

// ─── 공통: 파일 → 행 배열 ────────────────────────────────────────────────────
export async function parseSheet(file) {
  const buf = await file.arrayBuffer()
  const wb  = XLSX.read(new Uint8Array(buf), { type: 'array' })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
}

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────
const toNum = v => {
  const n = parseFloat(String(v).replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}
const toStr = v => String(v ?? '').trim()

// ─── 1. 장바구니 실적 ───────────────────────────────────────────────────────
// 구형식: 기간 | 회원구분 | 매체구분 | 스타일코드 | 상품명 | 장바구니 담기수 | 주문건수 | 실주문금액
// 신형식(상품실적_663): No. | 기간 | 상품번호 | 스타일코드 | 상품명 | 단품번호 | 단품명 | 원판매가 |
//   장바구니 담긴 건수 | 장바구니 담긴 수량 | 결제 완료 수량 | 회원 장바구니 건수 | ... | 비회원 장바구니 건수 | ... | 포기수량 | 포기율
// Row[0]=header, Row[1]=sigma(Σ), Row[2+]=detail
export function parseCart(rows) {
  if (!rows || rows.length < 2) return { sigma: {}, items: [], period: '' }

  const headers = rows[0].map(toStr)
  const idx = {
    period:          headers.findIndex(h => h.includes('기간')),
    memberType:      headers.findIndex(h => h.includes('회원구분')),
    media:           headers.findIndex(h => h.includes('매체')),
    styleCode:       headers.findIndex(h => h.includes('스타일코드')),
    name:            headers.findIndex(h => h.includes('상품명')),
    // 신형식: '장바구니 담긴 건수' / 구형식: '장바구니 담기수', '장바구니수', '장바구니건'
    cartCnt:         headers.findIndex(h =>
      h.includes('담긴 건수') || h.includes('담긴건') ||
      h.includes('담기수') || h.includes('장바구니수') || h.includes('장바구니건') ||
      (h.includes('담기') && !h.includes('수량'))
    ),
    // 신형식: '결제 완료 수량' / 구형식: '주문건수', '실주문건수' 등
    orderCnt:        headers.findIndex(h =>
      h.includes('결제 완료') || h.includes('결제완료') ||
      h.includes('주문건') || h.includes('실주문건') || h.includes('구매건') ||
      (h.includes('주문수') && !h.includes('금액'))
    ),
    realAmt:         headers.findIndex(h => h.includes('실주문금액') || h.includes('실주문액') || h.includes('결제금액')),
    // 신형식 전용: 회원/비회원 장바구니 건수 (memberPct 계산용)
    memberCartCnt:   headers.findIndex(h =>
      !h.includes('비회원') && h.includes('회원') && h.includes('장바구니') && h.includes('건')
    ),
    nonMemberCartCnt:headers.findIndex(h =>
      h.includes('비회원') && h.includes('장바구니') && h.includes('건')
    ),
  }

  const sigmaRow = rows.find(r => toStr(r[0]) === 'Σ') || rows[1]
  const sigmaObj = {
    cartCnt:          toNum(sigmaRow[idx.cartCnt]),
    orderCnt:         toNum(sigmaRow[idx.orderCnt]),
    realAmt:          toNum(sigmaRow[idx.realAmt]),
    memberCartCnt:    idx.memberCartCnt >= 0 ? toNum(sigmaRow[idx.memberCartCnt]) : 0,
    nonMemberCartCnt: idx.nonMemberCartCnt >= 0 ? toNum(sigmaRow[idx.nonMemberCartCnt]) : 0,
  }

  const items = rows.slice(2)
    .filter(r => toStr(r[0]) !== 'Σ' && r.some(c => toStr(c) !== ''))
    .map(r => ({
      period:          toStr(r[idx.period]),
      memberType:      idx.memberType >= 0 ? toStr(r[idx.memberType]) : '',
      media:           idx.media >= 0 ? toStr(r[idx.media]) : '',
      styleCode:       idx.styleCode >= 0 ? toStr(r[idx.styleCode]) : '',
      name:            idx.name >= 0 ? toStr(r[idx.name]) : '',
      cartCnt:         idx.cartCnt >= 0 ? toNum(r[idx.cartCnt]) : 0,
      orderCnt:        idx.orderCnt >= 0 ? toNum(r[idx.orderCnt]) : 0,
      realAmt:         idx.realAmt >= 0 ? toNum(r[idx.realAmt]) : 0,
      memberCartCnt:   idx.memberCartCnt >= 0 ? toNum(r[idx.memberCartCnt]) : 0,
      nonMemberCartCnt:idx.nonMemberCartCnt >= 0 ? toNum(r[idx.nonMemberCartCnt]) : 0,
    }))

  // 기간 대표값 (첫 번째 비어있지 않은 period)
  const period = items.find(i => i.period)?.period || ''

  return { sigma: sigmaObj, items, period }
}

// ─── 2. 관심상품 ────────────────────────────────────────────────────────────
// 신형식: No. | 기간 | 상품번호 | 스타일코드 | 상품명 | 원판매가 | 관심상품등록수량량
// 구형식: 기간 | 회원구분 | 매체구분 | 상품명 | 스타일코드 | 찜수 | 주문건수 | 실주문금액
// → 헤더 기반 감지로 변경 (하드코딩 제거)
export function parseWishlist(rows) {
  if (!rows || rows.length < 2) return { sigma: {}, items: [], period: '' }

  // Σ sigma 행 스킵 여부 결정 (No. 컬럼이 있으면 신형식)
  const hasNoCol = toStr(rows[0][0]) === 'No.'
  const dataStart = hasNoCol ? 2 : 2   // 공통적으로 rows[2]부터 (sigma=rows[1])

  const headers = rows[0].map(toStr)
  const idx = {
    period:    headers.findIndex(h => h.includes('기간')),
    memberType:headers.findIndex(h => h.includes('회원구분')),   // 구형식만
    media:     headers.findIndex(h => h.includes('매체')),
    wishCnt:   headers.findIndex(h => h.includes('찜') || h.includes('관심상품등록') || h.includes('관심수')),
    orderCnt:  headers.findIndex(h => h.includes('주문건') || h.includes('주문수')),
    realAmt:   headers.findIndex(h => h.includes('실주문금액') || h.includes('실주문액')),
  }

  // 상품명/스타일코드: 헤더로 직접 탐지 (하드코딩 제거)
  const nameIdx      = headers.findIndex(h => h.includes('상품명'))
  const styleCodeIdx = headers.findIndex(h => h.includes('스타일코드') || h.includes('상품코드'))
  // fallback: 상품번호도 styleCode로 활용
  const styleCodeOrNoIdx = styleCodeIdx >= 0 ? styleCodeIdx : headers.findIndex(h => h.includes('상품번호'))

  const sigma = rows[1] || []
  const sigmaObj = {
    wishCnt:  toNum(sigma[idx.wishCnt]),
    orderCnt: toNum(sigma[idx.orderCnt]),
    realAmt:  toNum(sigma[idx.realAmt]),
  }

  const items = rows.slice(dataStart)
    .filter(r => toStr(r[0]) !== 'Σ' && r.some(c => toStr(c) !== ''))
    .map(r => ({
      period:     toStr(r[idx.period]),
      memberType: idx.memberType >= 0 ? toStr(r[idx.memberType]) : '',
      media:      idx.media >= 0 ? toStr(r[idx.media]) : '',
      name:       nameIdx >= 0 ? toStr(r[nameIdx]) : '',
      styleCode:  styleCodeOrNoIdx >= 0 ? toStr(r[styleCodeOrNoIdx]) : '',
      wishCnt:    idx.wishCnt >= 0 ? toNum(r[idx.wishCnt]) : 0,
      orderCnt:   idx.orderCnt >= 0 ? toNum(r[idx.orderCnt]) : 0,
      realAmt:    idx.realAmt >= 0 ? toNum(r[idx.realAmt]) : 0,
    }))

  const period = items.find(i => i.period)?.period || ''
  return { sigma: sigmaObj, items, period }
}

// ─── 3. 주간 판매 ────────────────────────────────────────────────────────────
// 구형식: 기간 | 매체구분 | 스타일코드 | 상품명 | 판매수량 | 실주문금액 | PV
// 신형식(상품실적_127): No. | 날짜 | 매체 | 상품번호 | 스타일코드 | 상품명 | 단품번호 | 단품명 |
//   상품상세 조회수 | 리뷰평균 평점 | 리뷰 수 | 장바구니수 | 주문자수 | 주문수량 | 주문금액 |
//   실주문건수 | 실주문수량 | 실주문금액 | ...
// 필터: realAmt > 0, media !== '코드값없음', styleCode not in ['Z!','코드미정의']
export function parseSales(rows) {
  if (!rows || rows.length < 2) return { sigma: {}, items: [], period: '' }

  const headers = rows[0].map(toStr)
  const idx = {
    // 구형식: '기간' / 신형식: 없음(날짜는 별도 date 필드로)
    period:    headers.findIndex(h => h === '기간' || (h.includes('기간') && !h.includes('날짜'))),
    // 신형식: '날짜' (일별 날짜)
    date:      headers.findIndex(h => h.includes('날짜') || h.includes('일자')),
    media:     headers.findIndex(h => h.includes('매체')),
    styleCode: headers.findIndex(h => h.includes('스타일코드') || h.includes('단품코드')),
    name:      headers.findIndex(h => h.includes('상품명') || h.includes('단품명')),
    // 실주문수량 우선, 없으면 주문수량, 판매수량 순
    qty:       headers.findIndex(h => h === '실주문수량' || h.includes('실주문수량')) >= 0
                 ? headers.findIndex(h => h === '실주문수량' || h.includes('실주문수량'))
                 : headers.findIndex(h => h.includes('판매수') || h.includes('수량')),
    // 실주문금액(원판매가)가 있으면 그 앞의 실주문금액을 찾아야 함 → 정확한 매칭
    realAmt:   headers.findIndex(h => h === '실주문금액' || (h.includes('실주문금액') && !h.includes('원판매'))),
    // 신형식: '상품상세 조회수' / 구형식: 'PV', '페이지뷰'
    pv:        headers.findIndex(h => h === 'PV' || h.toLowerCase() === 'pv' || h.includes('페이지뷰') || h.includes('조회수')),
  }

  // sigma 행 (No. === 'Σ' 이거나 rows[1])
  const sigmaRow = rows.find(r => toStr(r[0]) === 'Σ') || rows[1]
  const sigmaObj = {
    qty:     toNum(sigmaRow[idx.qty]),
    realAmt: toNum(sigmaRow[idx.realAmt]),
    pv:      toNum(sigmaRow[idx.pv]),
  }

  const EXCLUDE_MEDIA  = new Set(['코드값없음'])
  const EXCLUDE_UNIT   = new Set(['Z!', '코드미정의'])

  const items = rows.slice(2)
    .filter(r => toStr(r[0]) !== 'Σ' && r.some(c => toStr(c) !== ''))
    .map(r => ({
      // period: 구형식은 '기간' 값, 신형식은 빈 문자열(날짜가 많아 splitWeeks 오작동 방지)
      period:    idx.period >= 0 ? toStr(r[idx.period]) : '',
      date:      idx.date >= 0 ? toStr(r[idx.date]) : '',
      media:     toStr(r[idx.media]),
      styleCode: idx.styleCode >= 0 ? toStr(r[idx.styleCode]) : '',
      name:      idx.name >= 0 ? toStr(r[idx.name]) : '',
      qty:       idx.qty >= 0 ? toNum(r[idx.qty]) : 0,
      realAmt:   idx.realAmt >= 0 ? toNum(r[idx.realAmt]) : 0,
      pv:        idx.pv >= 0 ? toNum(r[idx.pv]) : 0,
    }))
    .filter(i =>
      i.realAmt > 0 &&
      !EXCLUDE_MEDIA.has(i.media) &&
      !EXCLUDE_UNIT.has(i.styleCode)
    )

  // period 표시용: 구형식은 기간값, 신형식은 날짜 범위로 계산
  let period = items.find(i => i.period)?.period || ''
  if (!period && idx.date >= 0) {
    const dates = items.map(i => i.date).filter(Boolean).sort()
    if (dates.length) {
      const fmt = d => d.slice(5)  // YYYY-MM-DD → MM-DD
      period = `${fmt(dates[0])} ~ ${fmt(dates[dates.length - 1])}`
    }
  }

  return { sigma: sigmaObj, items, period }
}

// ─── 4. 고객 분석 ────────────────────────────────────────────────────────────
// 신형식: No. | 성별 | 회원연령대 | 회원수 | 신규회원수 | 방문수 | ... | 주문자수 | 첫구매회원 | 주문건수 | ... | 실주문금액
// 구형식: 기간 | 성별 | 나이대 | 회원구분 | 구매건수 | 실주문금액 | 구매고객수
export function parseCustomer(rows) {
  if (!rows || rows.length < 2) return { sigma: {}, items: [], period: '' }

  const headers = rows[0].map(toStr)
  const idx = {
    period:      headers.findIndex(h => h.includes('기간')),
    gender:      headers.findIndex(h => h === '성별' || (h.includes('성별') && !h.includes('연령') && !h.includes('나이'))),
    ageGroup:    headers.findIndex(h => h.includes('나이') || h.includes('연령')),
    memberType:  headers.findIndex(h => h === '회원구분' || h.includes('회원구분')), // 구형식만
    orderCnt:    headers.findIndex(h => h.includes('주문건수') || h.includes('구매건') || h.includes('주문수')),
    realAmt:     headers.findIndex(h => h.includes('실주문금액') || h.includes('실주문액') || h.includes('결제금액')),
    // 신형식: 주문자수 = 구매고객수
    custCnt:     headers.findIndex(h =>
      h.includes('고객수') || h.includes('구매고객') || h.includes('구매자') ||
      h === '주문자수' || (h.includes('주문자') && !h.includes('금액'))
    ),
    // 신형식 전용: 첫구매회원(신규) / 신규회원수(방문 기준)
    firstBuyCnt: headers.findIndex(h => h.includes('첫구매') || h.includes('신규구매')),
    newMemberCnt:headers.findIndex(h => h === '신규회원수'),
    totalMemberCnt:headers.findIndex(h => h === '회원수'),
  }

  // gender가 '회원연령대' 같은 복합 컬럼에 걸리면 보정
  if (idx.gender >= 0 && idx.gender === idx.ageGroup) {
    idx.gender = headers.findIndex(h => h === '성별')
  }

  const sigma = rows[1] || []
  const sigmaObj = {
    orderCnt: toNum(sigma[idx.orderCnt]),
    realAmt:  toNum(sigma[idx.realAmt]),
    custCnt:  toNum(sigma[idx.custCnt]),
    firstBuyCnt: idx.firstBuyCnt >= 0 ? toNum(sigma[idx.firstBuyCnt]) : 0,
  }

  const items = rows.slice(2)
    .filter(r => toStr(r[0]) !== 'Σ' && r.some(c => toStr(c) !== ''))
    .map(r => ({
      period:      idx.period >= 0 ? toStr(r[idx.period]) : '',
      gender:      idx.gender >= 0 ? toStr(r[idx.gender]) : '',
      ageGroup:    idx.ageGroup >= 0 ? toStr(r[idx.ageGroup]) : '',
      memberType:  idx.memberType >= 0 ? toStr(r[idx.memberType]) : '',
      orderCnt:    idx.orderCnt >= 0 ? toNum(r[idx.orderCnt]) : 0,
      realAmt:     idx.realAmt >= 0 ? toNum(r[idx.realAmt]) : 0,
      custCnt:     idx.custCnt >= 0 ? toNum(r[idx.custCnt]) : 0,
      firstBuyCnt: idx.firstBuyCnt >= 0 ? toNum(r[idx.firstBuyCnt]) : 0,
    }))

  const period = items.find(i => i.period)?.period || ''
  return { sigma: sigmaObj, items, period }
}

// ─── 5. 방문실적 ─────────────────────────────────────────────────────────────
// 신형식: No. | 날짜 | 매체 | UV | LV | 세션수 | PV | 신규방문 | 이탈률(%)
// 구형식: 날짜 | 매체 | UV | 세션수 | PV | 이탈률(%)
// Row[0]=header, Row[1]=Σ sigma (신형식), Row[2+]=detail
export function parseVisit(rows) {
  if (!rows || rows.length < 2) return { items: [], period: '' }

  const headers = rows[0].map(toStr)
  const idx = {
    date:    headers.findIndex(h => h.includes('날짜') || h.includes('일자') || h.includes('기간')),
    media:   headers.findIndex(h => h.includes('매체') || h.includes('채널')),
    uv:      headers.findIndex(h => h === 'UV' || h.toLowerCase() === 'uv' || h.includes('순방문')),
    session: headers.findIndex(h => h.includes('세션')),
    pv:      headers.findIndex(h => h === 'PV' || h.toLowerCase() === 'pv' || h.includes('페이지뷰')),
    bounce:  headers.findIndex(h => h.includes('이탈')),
  }

  const EXCLUDE_MEDIA = new Set(['전체'])

  const items = rows.slice(1)
    .filter(r => toStr(r[0]) !== 'Σ' && r.some(c => toStr(c) !== ''))  // Σ sigma행 제외
    .map(r => ({
      date:       toStr(r[idx.date]),
      media:      toStr(r[idx.media]),
      uv:         toNum(r[idx.uv]),
      session:    toNum(r[idx.session]),
      pv:         toNum(r[idx.pv]),
      bounceRate: idx.bounce >= 0 ? toNum(r[idx.bounce]) : 0,
    }))
    .filter(i => !EXCLUDE_MEDIA.has(i.media) && i.media !== '')

  const period = items.find(i => i.date)?.date || ''
  return { items, period }
}

// ─── 6. 매장 종합 실적 ───────────────────────────────────────────────────────
// 신형식: No. | 날짜 | 매체 | 매장그룹 | 매장 | UV | LV | PV | ... | 실주문건수 | 실주문수량 | 실주문금액
// 구형식: 날짜 | 매체 | 매장그룹 | 매장명 | UV | 실주문건수 | 실주문금액 | 이탈률(%)
// 전처리: 매장명에서 '스파오공홈_P_' 접두사 제거
export function parseStore(rows) {
  if (!rows || rows.length < 2) return { items: [], period: '' }

  const headers = rows[0].map(toStr)
  const idx = {
    date:       headers.findIndex(h => h.includes('날짜') || h.includes('일자') || h.includes('기간')),
    media:      headers.findIndex(h => h.includes('매체') || h.includes('채널')),
    storeGroup: headers.findIndex(h => h.includes('매장그룹') || (h.includes('그룹') && !h.includes('매출'))),
    // 매장명 탐지: '매장명', '매장'(단독), '페이지' — '매장그룹' 제외
    storeName:  headers.findIndex(h =>
      h.includes('매장명') || h.includes('페이지') ||
      (h === '매장') ||
      (h.includes('매장') && !h.includes('그룹') && !h.includes('종합') && !h.includes('실적'))
    ),
    uv:         headers.findIndex(h => h === 'UV' || h.toLowerCase() === 'uv' || h.includes('순방문')),
    realCnt:    headers.findIndex(h => h.includes('실주문건') || h.includes('실주문수')),
    realAmt:    headers.findIndex(h => h.includes('실주문금액') || h.includes('실주문액')),
    bounce:     headers.findIndex(h => h.includes('이탈')),
  }

  const PREFIX = '스파오공홈_P_'

  const items = rows.slice(1)
    .filter(r => toStr(r[0]) !== 'Σ' && r.some(c => toStr(c) !== ''))  // Σ sigma행 제외
    .map(r => {
      const raw = idx.storeName >= 0 ? toStr(r[idx.storeName]) : ''
      return {
        date:       toStr(r[idx.date]),
        media:      toStr(r[idx.media]),
        storeGroup: toStr(r[idx.storeGroup]),
        storeName:  raw.startsWith(PREFIX) ? raw.slice(PREFIX.length) : raw,
        uv:         toNum(r[idx.uv]),
        realCnt:    idx.realCnt >= 0 ? toNum(r[idx.realCnt]) : 0,
        realAmt:    idx.realAmt >= 0 ? toNum(r[idx.realAmt]) : 0,
        bounceRate: idx.bounce >= 0 ? toNum(r[idx.bounce]) : 0,
      }
    })
    .filter(i => i.media !== '')

  const period = items.find(i => i.date)?.date || ''
  return { items, period }
}

// ─── 7. 기간별 매출분석 ─────────────────────────────────────────────────────────
// 헤더: No. | 날짜 | 매체 | 주문자수 | 주문건수 | 주문수량 | 주문금액 |
//       실주문건수 | 실주문수량 | 실주문금액 | 취소/반품 수량 | 취소/반품 금액 |
//       배송비용 | 전체혜택금액 | 혜택할인금액 | 혜택적립금액
export function parseSalesByDate(rows) {
  if (!rows || rows.length < 2) return { sigma: {}, items: [], period: '' }

  const headers = rows[0].map(toStr)
  const idx = {
    date:          headers.findIndex(h => h.includes('날짜') || h.includes('일자')),
    media:         headers.findIndex(h => h.includes('매체') || h.includes('채널')),
    buyerCnt:      headers.findIndex(h => h.includes('주문자') || h.includes('구매자수')),
    orderCnt:      headers.findIndex(h => h.includes('주문건수') || (h.includes('주문') && h.includes('건') && !h.includes('실'))),
    orderQty:      headers.findIndex(h => h.includes('주문수량') && !h.includes('실')),
    orderAmt:      headers.findIndex(h => h.includes('주문금액') && !h.includes('실')),
    realOrderCnt:  headers.findIndex(h => h.includes('실주문건') || h.includes('실주문수')),
    realOrderQty:  headers.findIndex(h => h.includes('실주문수량')),
    realAmt:       headers.findIndex(h => h.includes('실주문금액') || h.includes('실주문액')),
    cancelQty:     headers.findIndex(h => h.includes('취소') && h.includes('수량')),
    cancelAmt:     headers.findIndex(h => (h.includes('취소') || h.includes('반품')) && h.includes('금액')),
    shippingFee:   headers.findIndex(h => h.includes('배송')),
    totalBenefit:  headers.findIndex(h => h.includes('전체혜택') || (h.includes('혜택') && h.includes('전체'))),
    discountAmt:   headers.findIndex(h => h.includes('혜택할인') || h.includes('할인금액')),
    pointAmt:      headers.findIndex(h => h.includes('혜택적립') || h.includes('적립')),
  }

  const sigma = rows[1] || []
  const sigmaObj = {
    buyerCnt:     toNum(sigma[idx.buyerCnt]),
    orderCnt:     toNum(sigma[idx.orderCnt]),
    orderAmt:     toNum(sigma[idx.orderAmt]),
    realOrderCnt: toNum(sigma[idx.realOrderCnt]),
    realAmt:      toNum(sigma[idx.realAmt]),
    cancelAmt:    toNum(sigma[idx.cancelAmt]),
    totalBenefit: toNum(sigma[idx.totalBenefit]),
    discountAmt:  toNum(sigma[idx.discountAmt]),
    pointAmt:     toNum(sigma[idx.pointAmt]),
    shippingFee:  toNum(sigma[idx.shippingFee]),
  }

  const items = rows.slice(2)
    .filter(r => r.some(c => toStr(c) !== ''))
    .map(r => ({
      date:         toStr(r[idx.date]),
      media:        toStr(r[idx.media]),
      buyerCnt:     toNum(r[idx.buyerCnt]),
      orderCnt:     toNum(r[idx.orderCnt]),
      orderAmt:     toNum(r[idx.orderAmt]),
      realOrderCnt: toNum(r[idx.realOrderCnt]),
      realAmt:      toNum(r[idx.realAmt]),
      cancelAmt:    toNum(r[idx.cancelAmt]),
      discountAmt:  toNum(r[idx.discountAmt]),
      totalBenefit: toNum(r[idx.totalBenefit]),
    }))
    .filter(i => i.media !== '')

  const period = items.find(i => i.date)?.date || ''
  return { sigma: sigmaObj, items, period }
}

// ─── 8. 검색 실적 ─────────────────────────────────────────────────────────────
// 헤더: No. | 날짜 | 매체 | 검색어 | 검색성공여부 | 검색량 | UV | 순검색량 | 순클릭수 |
//       주문금액 | 주문건수 | 검색어가치 | 검색어가치(GA)
// Row[0]=header, Row[1]=sigma(Σ), Row[2+]=detail
export function parseSearch(rows) {
  if (!rows || rows.length < 2) return { sigma: {}, items: [], period: '' }

  const headers = rows[0].map(toStr)
  const idx = {
    date:       headers.findIndex(h => h.includes('날짜') || h.includes('일자')),
    media:      headers.findIndex(h => h.includes('매체') || h.includes('채널')),
    keyword:    headers.findIndex(h => h.includes('검색어') && !h.includes('가치') && !h.includes('성공')),
    success:    headers.findIndex(h => h.includes('성공')),
    searchVol:  headers.findIndex(h => h === '검색량' || (h.includes('검색량') && !h.includes('순'))),
    uv:         headers.findIndex(h => h === 'UV' || h.toLowerCase() === 'uv'),
    pureSearch: headers.findIndex(h => h.includes('순검색량')),
    clickCnt:   headers.findIndex(h => h.includes('순클릭') || h.includes('클릭수')),
    orderAmt:   headers.findIndex(h => h.includes('주문금액')),
    orderCnt:   headers.findIndex(h => h.includes('주문건수')),
    value:      headers.findIndex(h => h.includes('검색어가치') && !h.includes('GA')),
    valueGA:    headers.findIndex(h => h.includes('GA')),
  }

  // sigma 행 (No. === 'Σ')
  const sigmaRow = rows.find(r => toStr(r[0]) === 'Σ') || rows[1]
  const sigma = {
    searchVol: toNum(sigmaRow[idx.searchVol]),
    uv:        toNum(sigmaRow[idx.uv]),
    orderAmt:  toNum(sigmaRow[idx.orderAmt]),
    orderCnt:  toNum(sigmaRow[idx.orderCnt]),
    value:     toNum(sigmaRow[idx.value]),
  }

  const items = rows.slice(2)
    .filter(r => r[0] && toStr(r[0]) !== 'Σ' && toStr(r[idx.date]) !== '')
    .map(r => ({
      date:      toStr(r[idx.date]).slice(0, 10),   // YYYY-MM-DD
      dateShort: toStr(r[idx.date]).slice(5, 10),   // MM-DD
      media:     toStr(r[idx.media]),
      keyword:   toStr(r[idx.keyword]),
      success:   toStr(r[idx.success]) === 'Y',
      searchVol: toNum(r[idx.searchVol]),
      uv:        toNum(r[idx.uv]),
      orderAmt:  toNum(r[idx.orderAmt]),
      orderCnt:  toNum(r[idx.orderCnt]),
      value:     toNum(r[idx.value]),
    }))
    .filter(i => i.keyword !== '')

  const dates = items.map(i => i.date).filter(Boolean).sort()
  const period = dates.length ? `${dates[0].slice(5)} ~ ${dates[dates.length - 1].slice(5)}` : ''

  return { sigma, items, period }
}

// ─── 자동 파일 타입 감지 ──────────────────────────────────────────────────────
// 헤더 배열을 받아 적절한 파서 key를 반환
//
// 주의사항:
//  • 상품실적(일별×SKU) 파일이 주문자수+전체혜택 컬럼을 가져 salesByDate로 오인식 가능
//    → '스타일코드'가 있으면 먼저 sales/cart로 처리
//  • 매장 종합 실적도 주문자수+전체혜택 컬럼 보유 → '매장그룹'으로 먼저 처리
export function detectFileKey(headers) {
  const hs = headers.map(h => String(h).trim().toLowerCase())
  const has = (...terms) => terms.every(t => hs.some(h => h.includes(t)))
  const exact = term => hs.some(h => h === term)

  // 1. 검색 실적 — '검색어' + '검색량'
  if (has('검색어') && (has('검색량') || exact('uv'))) return 'search'

  // 2-a. 매장 코너 실적 — '코너번호' 또는 '매장상세명' 이 고유 식별자 (매장 종합보다 먼저 체크)
  if (has('코너번호') || has('매장상세명')) return 'storeCorner'

  // 2-b. 매장 종합 실적 — '매장그룹' 이 고유 식별자
  if (has('매장그룹')) return 'store'

  // 3. 장바구니 퍼널 파일 — '포기율' 또는 '담긴 건수' 또는 '결제 완료'
  //    (스타일코드 기반이지만 매체 컬럼 없음 / 포기율이 핵심 식별자)
  if (has('포기') || has('담기수') || (has('장바구니') && has('담긴'))) return 'cart'

  // 4. 주간 판매 (일별×SKU) — '스타일코드' + '실주문금액' + '매체'
  //    salesByDate보다 먼저 체크해야 오인식 방지
  if (has('스타일코드') && has('실주문금액') && has('매체')) return 'sales'

  // 5. 기간별 매출분석 — '주문자' + '전체혜택' (스타일코드 없음)
  if (has('주문자') && has('전체혜택') && !has('스타일코드')) return 'salesByDate'

  // 6. 방문실적 — '날짜' + 'uv' + '세션'
  if (has('날짜') && (has('uv') || exact('uv')) && has('세션')) return 'visit'

  // 7. 고객 분석 — '성별' + '연령' 또는 '나이'
  if (has('성별') && (has('나이') || has('연령'))) return 'customer'

  // 8. 관심상품 — '관심상품등록' 또는 '찜'
  if (has('관심상품') || has('찜')) return 'wishlist'

  // 9. 구형식 주간 판매 — '스타일코드' + 'pv' (새 형식 못 걸린 경우 폴백)
  if (has('스타일코드') && (has('pv') || exact('pv') || has('조회수'))) return 'sales'

  return null
}

// ─── 9. 매장 코너 실적 ───────────────────────────────────────────────────────
// 헤더: No. | 날짜 | 매체 | 매장그룹 | 매장 | 매장상세번호 | 매장상세명 | 코너번호 | 코너명 |
//       컨텐츠유형 | 컨텐츠유형명 | 컨텐츠번호 | 컨텐츠명 | 전시순서 |
//       순클릭수 | 매장노출수 | CTR | 주문자수 | 주문건수 | 주문수량 | 주문금액 |
//       실주문건수 | 실주문수량 | 실주문금액 | ...
export function parseStoreCorner(rows) {
  if (!rows || rows.length < 2) return { sigma: {}, items: [], period: '' }

  const headers = rows[0].map(toStr)
  const idx = {
    date:        headers.findIndex(h => h.includes('날짜') || h.includes('일자')),
    media:       headers.findIndex(h => h.includes('매체') || h.includes('채널')),
    storeGroup:  headers.findIndex(h => h.includes('매장그룹')),
    store:       headers.findIndex(h => h === '매장' || (h.includes('매장') && !h.includes('그룹') && !h.includes('상세') && !h.includes('노출'))),
    detailNo:    headers.findIndex(h => h.includes('매장상세번호') || h.includes('상세번호')),
    detailName:  headers.findIndex(h => h.includes('매장상세명') || h.includes('상세명')),
    cornerNo:    headers.findIndex(h => h.includes('코너번호')),
    cornerName:  headers.findIndex(h => h.includes('코너명') && !h.includes('번호')),
    contentType: headers.findIndex(h => h.includes('컨텐츠유형') && !h.includes('명')),
    contentTypeName: headers.findIndex(h => h.includes('컨텐츠유형명')),
    contentNo:   headers.findIndex(h => h.includes('컨텐츠번호')),
    contentName: headers.findIndex(h => h.includes('컨텐츠명') && !h.includes('번호') && !h.includes('유형')),
    displayOrder:headers.findIndex(h => h.includes('전시순서')),
    clicks:      headers.findIndex(h => h.includes('순클릭') || h.includes('클릭수')),
    impressions: headers.findIndex(h => h.includes('매장노출') || h.includes('노출수')),
    ctr:         headers.findIndex(h => h.toUpperCase() === 'CTR'),
    buyerCnt:    headers.findIndex(h => h.includes('주문자수') || h.includes('구매자')),
    orderCnt:    headers.findIndex(h => h === '주문건수' || (h.includes('주문건') && !h.includes('실'))),
    realOrderCnt:headers.findIndex(h => h.includes('실주문건수') || h.includes('실주문건')),
    realAmt:     headers.findIndex(h => h === '실주문금액' || (h.includes('실주문금액') && !h.includes('원판'))),
    discountAmt: headers.findIndex(h => h.includes('혜택할인') || h.includes('할인금액')),
    totalBenefit:headers.findIndex(h => h.includes('전체혜택')),
  }

  const sigmaRow = rows.find(r => toStr(r[0]) === 'Σ') || rows[1]
  const sigmaObj = {
    clicks:       idx.clicks >= 0 ? toNum(sigmaRow[idx.clicks]) : 0,
    impressions:  idx.impressions >= 0 ? toNum(sigmaRow[idx.impressions]) : 0,
    realAmt:      idx.realAmt >= 0 ? toNum(sigmaRow[idx.realAmt]) : 0,
  }

  const PREFIX = '스파오공홈_P_'

  const items = rows.slice(1)
    .filter(r => toStr(r[0]) !== 'Σ' && r.some(c => toStr(c) !== ''))
    .map(r => {
      const storeName = idx.store >= 0 ? toStr(r[idx.store]) : ''
      const ctr = idx.ctr >= 0 ? toNum(r[idx.ctr]) : 0
      return {
        date:         idx.date >= 0 ? toStr(r[idx.date]) : '',
        media:        idx.media >= 0 ? toStr(r[idx.media]) : '',
        storeGroup:   idx.storeGroup >= 0 ? toStr(r[idx.storeGroup]) : '',
        store:        storeName.startsWith(PREFIX) ? storeName.slice(PREFIX.length) : storeName,
        detailNo:     idx.detailNo >= 0 ? toStr(r[idx.detailNo]) : '',
        detailName:   idx.detailName >= 0 ? toStr(r[idx.detailName]) : '',
        cornerNo:     idx.cornerNo >= 0 ? toStr(r[idx.cornerNo]) : '',
        cornerName:   idx.cornerName >= 0 ? toStr(r[idx.cornerName]) : '',
        contentType:  idx.contentType >= 0 ? toStr(r[idx.contentType]) : '',
        contentTypeName: idx.contentTypeName >= 0 ? toStr(r[idx.contentTypeName]) : '',
        contentNo:    idx.contentNo >= 0 ? toStr(r[idx.contentNo]) : '',
        contentName:  idx.contentName >= 0 ? toStr(r[idx.contentName]) : '',
        displayOrder: idx.displayOrder >= 0 ? toNum(r[idx.displayOrder]) : 0,
        clicks:       idx.clicks >= 0 ? toNum(r[idx.clicks]) : 0,
        impressions:  idx.impressions >= 0 ? toNum(r[idx.impressions]) : 0,
        ctr:          ctr > 1 ? ctr / 100 : ctr,   // % 값이 이미 소수인 경우 그대로
        buyerCnt:     idx.buyerCnt >= 0 ? toNum(r[idx.buyerCnt]) : 0,
        orderCnt:     idx.orderCnt >= 0 ? toNum(r[idx.orderCnt]) : 0,
        realOrderCnt: idx.realOrderCnt >= 0 ? toNum(r[idx.realOrderCnt]) : 0,
        realAmt:      idx.realAmt >= 0 ? toNum(r[idx.realAmt]) : 0,
        discountAmt:  idx.discountAmt >= 0 ? toNum(r[idx.discountAmt]) : 0,
        totalBenefit: idx.totalBenefit >= 0 ? toNum(r[idx.totalBenefit]) : 0,
      }
    })
    .filter(i => i.media !== '' && i.storeGroup !== '')

  const dates = items.map(i => i.date).filter(Boolean).sort()
  const period = dates.length ? `${dates[0].slice(5, 10)} ~ ${dates[dates.length-1].slice(5, 10)}` : ''

  // ── 코너 단위 사전 집계 ──────────────────────────────────────────────────────
  // 원본은 (날짜 × 컨텐츠) 단위라 행이 수십만 개 → 직렬화 시 localStorage/클라우드
  // 용량 초과(QuotaExceeded / Failed to fetch). 대시보드는 항상 합산해서만 쓰므로
  // (매체 × 매장그룹 × 매장상세명 × 코너명) 단위로 미리 합산해 행 수를 줄인다.
  // 합의 합 = 원본 합 이므로 화면 수치는 동일하다.
  const aggMap = new Map()
  for (const i of items) {
    const key = `${i.media}${i.storeGroup}${i.detailName}${i.cornerName}`
    let r = aggMap.get(key)
    if (!r) {
      r = {
        media:       i.media,
        storeGroup:  i.storeGroup,
        detailName:  i.detailName,
        cornerName:  i.cornerName,
        impressions: 0,
        clicks:      0,
        buyerCnt:    0,
        orderCnt:    0,
        realAmt:     0,
      }
      aggMap.set(key, r)
    }
    r.impressions += i.impressions
    r.clicks      += i.clicks
    r.buyerCnt    += i.buyerCnt
    r.orderCnt    += i.orderCnt
    r.realAmt     += i.realAmt
  }
  const aggItems = Array.from(aggMap.values())

  return { sigma: sigmaObj, items: aggItems, period }
}

// ─── 개발용: 파싱 결과 구조 확인 ──────────────────────────────────────────────
if (import.meta.env?.DEV) {
  console.log('[parseExcel] 파서 로드 완료 — parseCart/Wishlist/Sales/Customer/Visit/Store/SalesByDate/Search/StoreCorner')
}
