// 데이터 품질 교차검증 — raw 데이터 이상을 자동 감지해 안내문구 목록을 반환한다.
// 모든 규칙은 "이미 계산된 값"끼리의 비교라 추가 파싱/성능 부담이 없다.
// 반환: [{ id, severity, message }]  (severity: 'warning')
//
// 입력:
//   derived      : computeAllDerived 결과 (kpis, genderData, cartDerived 사용)
//   salesByDate  : computeSalesByDateMetrics 결과 (sigma, dailyOrders, cancelRate, discountRate)
//   search       : computeSearchMetrics 결과 (dailySearch)

const fmt억 = (v) => `${(v / 1e8).toFixed(1)}억`

export function checkDataQuality({ derived, salesByDate, search } = {}) {
  const warnings = []
  if (!derived) return warnings

  const revenue = derived.kpis?.find((k) => k.id === 'revenue')?.rawValue || 0
  const genderTotal = (derived.genderData || []).reduce((s, d) => s + (d.value || 0), 0)

  // ── 규칙1: 고객 세그먼트 매출 합계 > 주문 매출 (×1.1 초과) ──
  // 고객 분석 파일의 집계 범위가 매출과 크게 다르면 raw 데이터 오류 신호.
  if (revenue > 0 && genderTotal > revenue * 1.1) {
    warnings.push({
      id: 'customer-amt-exceeds-revenue',
      severity: 'warning',
      message: `고객 세그먼트 매출 합계(${fmt억(genderTotal)})가 주문 매출(${fmt억(revenue)})보다 큽니다 — 고객 분석 원본 데이터를 확인하세요.`,
    })
  }

  // ── 일자 커버리지 ──
  const salesDays = salesByDate?.dailyOrders?.length || 0
  const searchDays = search?.dailySearch?.length || 0

  // 규칙2: 검색 일자 < 주문 일자 (검색 데이터 일부 일자 누락 의심)
  if (searchDays > 0 && salesDays > 0 && searchDays < salesDays) {
    warnings.push({
      id: 'search-days-short',
      severity: 'warning',
      message: `검색 데이터가 ${searchDays}일치만 포함됨(주문은 ${salesDays}일치) — 일부 일자가 누락된 것 같습니다.`,
    })
  }

  // 규칙3: 주문 일자 < 7 (주간 데이터가 7일을 다 못 채움)
  if (salesDays > 0 && salesDays < 7) {
    warnings.push({
      id: 'sales-days-short',
      severity: 'warning',
      message: `주문 데이터가 ${salesDays}일치만 포함됨(주간 7일 미만) — 누락 여부를 확인하세요.`,
    })
  }

  // ── 규칙4: 파일 간 매출 합계 불일치 (상품 매출 vs 기간별 매출) ──
  // 두 파일이 같은 기간이면 합계가 비슷해야 한다. 20% 초과 차이는 기간/파일 불일치 신호.
  const sbdRevenue = salesByDate?.sigma?.realAmt || 0
  if (revenue > 0 && sbdRevenue > 0) {
    const diff = Math.abs(revenue - sbdRevenue) / Math.max(revenue, sbdRevenue)
    if (diff > 0.2) {
      warnings.push({
        id: 'revenue-file-mismatch',
        severity: 'warning',
        message: `상품 매출(${fmt억(revenue)})과 기간별 매출(${fmt억(sbdRevenue)})의 합계가 ${(diff * 100).toFixed(0)}% 차이납니다 — 업로드 파일이 같은 기간인지 확인하세요.`,
      })
    }
  }

  // ── 규칙5: 퍼널 역전 (논리상 불가능한 값 → raw 오류) ──
  const cart = derived.cartDerived
  if (cart && cart.cartCnt > 0 && cart.orderCnt > cart.cartCnt) {
    warnings.push({
      id: 'funnel-order-exceeds-cart',
      severity: 'warning',
      message: `주문 건수(${cart.orderCnt.toLocaleString()})가 장바구니 담기(${cart.cartCnt.toLocaleString()})보다 많습니다 — 데이터 정합성을 확인하세요.`,
    })
  }
  if (salesByDate?.sigma) {
    const { orderCnt, realOrderCnt } = salesByDate.sigma
    if (orderCnt > 0 && realOrderCnt > orderCnt) {
      warnings.push({
        id: 'funnel-realorder-exceeds-order',
        severity: 'warning',
        message: `결제 완료(${realOrderCnt.toLocaleString()})가 주문 건수(${orderCnt.toLocaleString()})보다 많습니다 — 취소 데이터가 비정상입니다.`,
      })
    }
  }

  // ── 규칙6: 비율 지표 범위 이탈 (취소율/할인율이 0~100% 밖) ──
  const checkRate = (val, label, id) => {
    if (val == null) return
    if (val < -0.01 || val > 100.01) {
      warnings.push({
        id,
        severity: 'warning',
        message: `${label}이 ${val.toFixed(1)}%로 정상 범위(0~100%)를 벗어났습니다 — 원본 값을 확인하세요.`,
      })
    }
  }
  checkRate(salesByDate?.cancelRate, '취소율', 'rate-cancel')
  checkRate(salesByDate?.discountRate, '할인율', 'rate-discount')

  // ── 규칙7: 구매 고객수 파일 간 불일치 (고객분석 vs 기간별매출) ──
  // KPI 구매 고객수는 고객분석 파일(custCnt), 기간별매출 파일은 buyerCnt 기준.
  // 같은 주라면 비슷해야 하며, 30% 초과 차이는 파일 정합성 문제 신호.
  const custCnt = derived.kpis?.find((k) => k.id === 'custCnt')?.rawValue || 0
  const buyerCnt = salesByDate?.sigma?.buyerCnt || 0
  if (custCnt > 0 && buyerCnt > 0) {
    const diff = Math.abs(custCnt - buyerCnt) / Math.max(custCnt, buyerCnt)
    if (diff > 0.3) {
      warnings.push({
        id: 'buyer-count-mismatch',
        severity: 'warning',
        message: `구매 고객수가 파일마다 다릅니다 — 고객분석 ${custCnt.toLocaleString()}명 vs 기간별매출 ${buyerCnt.toLocaleString()}명(${(diff * 100).toFixed(0)}% 차이). 어느 파일 기준인지 확인하세요.`,
      })
    }
  }

  return warnings
}
