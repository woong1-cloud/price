import { describe, it, expect } from 'vitest'
import { parseRestock } from './parseExcel'
import { computeRestockMetrics } from './metrics'

const HEADER = ['상품번호', '상품명', '단품번호', '단품명', '건수', '하위업체', '신청상태']

// 상품 p개, 각 상품당 sku개 단품. 건수는 상품 인덱스 역순으로 크게(상품0=최다) 둔다.
function makeRows(prods, skuPer) {
  const rows = [HEADER]
  for (let p = 0; p < prods; p++) {
    for (let s = 0; s < skuPer; s++) {
      rows.push([
        `260600${p}`,
        `테스트 상품 ${p}_SPTCG25G0${p % 10}`,
        `1000${s}`,
        `(19)Black/${['S', 'M', 'L'][s % 3]}`,
        (prods - p), // 상품0 이 가장 큼
        '스파오 공홈_물류',
        '신청',
      ])
    }
  }
  return rows
}

describe('parseRestock', () => {
  it('헤더/행을 파싱하고 스타일코드·사이즈를 추출한다', () => {
    const out = parseRestock([
      HEADER,
      ['2606008337', '와이드 파라슈트 팬츠 (RE)_SPTCG37C04', '10006', '(19)Black/S', 3, '스파오 공홈_물류', '신청'],
    ])
    expect(out.items).toHaveLength(1)
    const it0 = out.items[0]
    expect(it0.styleCode).toBe('SPTCG37C04')
    expect(it0.size).toBe('S')
    expect(it0.color).toBe('(19)Black')
    expect(it0.cnt).toBe(3)
    expect(out.totalCnt).toBe(3)
    expect(out.productCount).toBe(1)
    expect(out.skuCount).toBe(1)
  })

  it('건수 0 또는 빈 상품명 행은 제외한다', () => {
    const out = parseRestock([
      HEADER,
      ['1', '상품 A_SPAB12U01', '10', '(00)Red/M', 0, 'v', '신청'], // 건수 0 → 제외
      ['2', '', '11', '(00)Red/L', 5, 'v', '신청'],                  // 상품명 없음 → 제외
      ['3', '상품 C_SPAB12U02', '12', '(00)Red/XL', 2, 'v', '신청'],
    ])
    expect(out.items).toHaveLength(1)
    expect(out.totalCnt).toBe(2)
  })
})

describe('computeRestockMetrics', () => {
  it('상품 단위로 롤업하고 건수 내림차순 정렬한다', () => {
    const restock = parseRestock(makeRows(5, 3)) // 상품5 × 단품3
    const m = computeRestockMetrics(restock, null, [])
    expect(m.products).toHaveLength(5)
    expect(m.products[0].cnt).toBeGreaterThanOrEqual(m.products[1].cnt) // 정렬
    // 상품0: 단품 3개, 각 건수 5 → cnt 15, skuCount 3
    expect(m.products[0].skuCount).toBe(3)
    expect(m.products[0].cnt).toBe(15)
    expect(m.summary.productCount).toBe(5)
  })

  it('판매(styleCode) 교차로 hot/crossHot 을 표시한다', () => {
    const restock = parseRestock(makeRows(3, 1))
    // 상품1 의 스타일코드(SPTCG25G01)가 판매에 존재 → hot
    const salesItems = [{ styleCode: 'SPTCG25G01', realAmt: 5_000_000 }]
    const m = computeRestockMetrics(restock, null, salesItems)
    const hotProduct = m.products.find(p => p.styleCode === 'SPTCG25G01')
    expect(hotProduct.hot).toBe(true)
    expect(m.crossHot.some(p => p.styleCode === 'SPTCG25G01')).toBe(true)
  })

  it('전주 데이터가 있으면 WoW·신규수요를 계산한다', () => {
    const cur = parseRestock(makeRows(3, 1))   // 상품0=3, 1=2, 2=1
    const prev = parseRestock([
      HEADER,
      ['2606000', '테스트 상품 0_SPTCG25G00', '10000', '(19)Black/S', 1, 'v', '신청'], // 전주 1 → 이번주 3
    ])
    const m = computeRestockMetrics(cur, prev, [])
    const p0 = m.products.find(p => p.productNo === '2606000')
    expect(p0.prevCnt).toBe(1)
    expect(p0.wow).toBeCloseTo(200) // (3-1)/1*100
    // 전주에 없던 상품은 신규수요
    const p2 = m.products.find(p => p.productNo === '2606002')
    expect(p2.isNewDemand).toBe(true)
  })

  it('콜라보(성별코드 U) vs 어패럴 분류 합계를 계산한다', () => {
    const restock = parseRestock([
      HEADER,
      ['1', '호빵맨 파자마_SPPPG37U08', '10', '(00)Red/M', 10, 'v', '신청'], // U → 콜라보
      ['2', '와이드 코튼 팬츠_SPTCG25G01', '11', '(19)Black/L', 4, 'v', '신청'], // G → 어패럴
      ['3', '산리오 잠옷_SPPPG37U01', '12', '(85)Pink/S', 6, 'v', '신청'],   // U → 콜라보
    ])
    const m = computeRestockMetrics(restock, null, [])
    expect(m.classSummary.collab.cnt).toBe(16)      // 10 + 6
    expect(m.classSummary.collab.productCount).toBe(2)
    expect(m.classSummary.apparel.cnt).toBe(4)
    expect(m.classSummary.apparel.productCount).toBe(1)
    // 합 = 전체
    expect(m.classSummary.collab.cnt + m.classSummary.apparel.cnt).toBe(m.summary.totalCnt)
    // 상품별 isCollab 플래그
    expect(m.products.find(p => p.styleCode === 'SPPPG37U08').isCollab).toBe(true)
    expect(m.products.find(p => p.styleCode === 'SPTCG25G01').isCollab).toBe(false)
  })

  it('콜라보 IP별 집계(ipSummary)를 만든다', () => {
    const restock = parseRestock([
      HEADER,
      ['1', '[호빵맨] 파자마_SPPPG37U08', '10', '(00)Red/M', 10, 'v', '신청'],
      ['2', '[호빵맨] 가방_SPAKG37U04', '11', '(00)Red/L', 5, 'v', '신청'],
      ['3', '[산리오캐릭터즈] 잠옷_SPPPG37U01', '12', '(85)Pink/S', 7, 'v', '신청'],
      ['4', '와이드 코튼 팬츠_SPTCG25G01', '13', '(19)Black/L', 99, 'v', '신청'], // 어패럴 → 제외
    ])
    const m = computeRestockMetrics(restock, null, [])
    const hb = m.ipSummary.find(x => x.ip === '호빵맨')
    expect(hb.cnt).toBe(15)          // 10 + 5
    expect(hb.productCount).toBe(2)
    // 어패럴은 IP 집계에 안 들어감
    expect(m.ipSummary.some(x => x.ip === '와이드 코튼 팬츠')).toBe(false)
    // cnt 내림차순
    expect(m.ipSummary[0].cnt).toBeGreaterThanOrEqual(m.ipSummary[1].cnt)
  })

  it('판매 단가로 예상매출 기준액(estBase)을 계산한다', () => {
    const restock = parseRestock([
      HEADER,
      ['1', '코튼 팬츠_SPTCG25G01', '10', '(19)Black/M', 100, 'v', '신청'],
    ])
    // 판매: 같은 styleCode 가 실주문금액 200,000 / 수량 10 → 단가 20,000
    const sales = [{ styleCode: 'SPTCG25G01', realAmt: 200000, qty: 10 }]
    const m = computeRestockMetrics(restock, null, sales)
    const p = m.products[0]
    expect(p.unitPrice).toBe(20000)
    expect(p.hasPrice).toBe(true)
    expect(p.estBase).toBe(100 * 20000)      // 대기 100 × 단가 20,000
    expect(m.estBaseAll).toBe(100 * 20000)
    // 예상매출 = estBase × 가정전환율(예: 0.3)
    expect(m.estBaseAll * 0.3).toBe(600000)
  })

  it('데이터 없으면 null', () => {
    expect(computeRestockMetrics(null)).toBeNull()
    expect(computeRestockMetrics({ items: [] })).toBeNull()
  })
})
