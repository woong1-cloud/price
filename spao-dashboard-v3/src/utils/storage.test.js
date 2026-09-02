import { describe, it, expect } from 'vitest'
import {
  budgetStoreCorner, fitPayloadForCloud, isStatementTimeout,
  shiftDaysISO, aggregateDailyTargetRows, aggregateLastYearActualRows,
} from './storage'

// 코너 c개, 각 코너에 컨텐츠 perCorner개를 가진 storeCorner 를 생성.
// realAmt 는 코너 인덱스 역순으로 커지게 둬서(=코너0이 최고매출) 우선순위 검증을 쉽게 한다.
function makeStoreCorner(cornerCount, perCorner) {
  const items = []
  for (let c = 0; c < cornerCount; c++) {
    for (let n = 0; n < perCorner; n++) {
      items.push({
        media: 'MOBILE', storeGroup: '기획전매장',
        detailName: `상세 ${c}`, cornerName: `코너 ${c}`,
        contentNo: `C${c}_${n}`, contentName: `컨텐츠 ${c}_${n}`,
        impressions: 100, clicks: 10, buyerCnt: 1, orderCnt: 1,
        realAmt: (cornerCount - c) * 1000 + n, // 코너0 이 가장 높음
      })
    }
  }
  return { items }
}

const cornerKey = (i) => `${i.media}|${i.storeGroup}|${i.detailName}|${i.cornerName}`

describe('budgetStoreCorner', () => {
  it('예산 이내면 원본을 그대로 반환한다(참조 동일)', () => {
    const sc = makeStoreCorner(10, 3) // 30행
    expect(budgetStoreCorner(sc, 100)).toBe(sc)
  })

  it('예산을 넘으면 행 수를 예산 이내로 줄인다', () => {
    const sc = makeStoreCorner(100, 10) // 1000행, 코너 100개
    const out = budgetStoreCorner(sc, 300)
    expect(out.items.length).toBeLessThanOrEqual(300)
    // 모든 코너는 최소 1행으로 살아남는다(데이터 손실 없음)
    const keptCorners = new Set(out.items.map(cornerKey))
    expect(keptCorners.size).toBe(100)
  })

  it('매출 상위 코너의 컨텐츠를 우선 보존한다', () => {
    const sc = makeStoreCorner(100, 10) // 코너당 10컨텐츠
    const out = budgetStoreCorner(sc, 300)
    const countFor = (c) => out.items.filter((i) => i.cornerName === `코너 ${c}`).length
    // 코너0(최고매출)은 컨텐츠 전체(10행) 보존, 최하위 코너는 축약(1행)
    expect(countFor(0)).toBe(10)
    expect(countFor(99)).toBe(1)
  })

  it('축약된 코너는 컨텐츠 식별자가 비고 지표 합계가 보존된다', () => {
    const sc = makeStoreCorner(100, 10)
    const out = budgetStoreCorner(sc, 110) // 거의 모든 코너가 축약됨
    const collapsed = out.items.find((i) => i.cornerName === '코너 99')
    expect(collapsed.contentNo).toBe('')
    expect(collapsed.contentName).toBe('')
    expect(collapsed.orderCnt).toBe(10) // 10컨텐츠 × 1
    expect(collapsed.impressions).toBe(1000) // 10 × 100
  })

  it('코너 수가 예산보다 많으면 하드 상한을 지키고 하위 코너를 기타로 접는다', () => {
    const sc = makeStoreCorner(200, 5) // 1000행, 코너 200개
    const out = budgetStoreCorner(sc, 50) // 예산 < 코너 수
    // 출력은 항상 예산 이내: 상위 49 코너 + 기타 1행 = 50행
    expect(out.items.length).toBe(50)
    // 최상위 코너(코너0)는 보존된다
    expect(out.items.some((i) => i.cornerName === '코너 0')).toBe(true)
    // 마지막 행은 '기타' 집계 행(남은 151개 코너)
    const last = out.items[out.items.length - 1]
    expect(last.detailName).toBe('기타')
    expect(last.cornerName).toBe('기타 151개 코너')
    expect(last.contentNo).toBe('')
  })

  it('하드 상한으로 접어도 전체 지표 합계는 보존된다', () => {
    const sc = makeStoreCorner(200, 5)
    const sumImpr = (items) => items.reduce((a, i) => a + i.impressions, 0)
    const out = budgetStoreCorner(sc, 50)
    expect(sumImpr(out.items)).toBe(sumImpr(sc.items)) // 1000행 × 100
  })
})

describe('fitPayloadForCloud', () => {
  it('예산 이내 payload 는 축약하지 않는다', () => {
    const payload = { storeCorner: makeStoreCorner(10, 3), sales: {} }
    const { payload: out, shrunk } = fitPayloadForCloud(payload)
    expect(shrunk).toBe(false)
    expect(out).toBe(payload)
  })

  it('storeCorner 가 없으면 그대로 통과한다', () => {
    const payload = { sales: {}, customer: {} }
    const { payload: out, shrunk } = fitPayloadForCloud(payload)
    expect(shrunk).toBe(false)
    expect(out).toBe(payload)
  })

  it('행 예산(11000) 초과 시 축약하고 shrunk=true', () => {
    const sc = makeStoreCorner(8000, 3) // 24000행 (코너 8000개)
    const { payload: out, shrunk } = fitPayloadForCloud({ storeCorner: sc })
    expect(shrunk).toBe(true)
    expect(out.storeCorner.items.length).toBeLessThanOrEqual(11000)
    // 코너는 전부 보존
    expect(new Set(out.storeCorner.items.map(cornerKey)).size).toBe(8000)
  })
})

describe('isStatementTimeout', () => {
  it('코드 57014 를 타임아웃으로 인식', () => {
    expect(isStatementTimeout({ code: '57014', message: 'x' })).toBe(true)
  })
  it('메시지에 statement timeout 이 있으면 인식', () => {
    expect(isStatementTimeout({ message: 'canceling statement due to statement timeout' })).toBe(true)
  })
  it('다른 오류/널은 false', () => {
    expect(isStatementTimeout({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isStatementTimeout(null)).toBe(false)
    expect(isStatementTimeout(undefined)).toBe(false)
  })
})

describe('shiftDaysISO', () => {
  it('364일 전 날짜를 계산한다(동요일 매칭)', () => {
    expect(shiftDaysISO('2026-08-26', -364)).toBe('2025-08-27')
    expect(shiftDaysISO('2026-09-01', -364)).toBe('2025-09-02')
  })

  it('364 = 52×7 이라 요일이 항상 그대로 맞는다', () => {
    const toWeekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay()
    expect(toWeekday(shiftDaysISO('2026-08-26', -364))).toBe(toWeekday('2026-08-26'))
  })

  it('양수 일수도 지원한다(미래 방향)', () => {
    expect(shiftDaysISO('2026-01-01', 1)).toBe('2026-01-02')
  })
})

describe('aggregateDailyTargetRows', () => {
  it('매출 목표는 합산, 전환율/객단가 목표는 평균낸다', () => {
    const rows = [
      { revenue_target: 100, conv_rate_target: 4, aov_target: 50000 },
      { revenue_target: 200, conv_rate_target: 6, aov_target: 60000 },
    ]
    const out = aggregateDailyTargetRows(rows)
    expect(out.revenueTarget).toBe(300)
    expect(out.convRateTarget).toBe(5)
    expect(out.aovTarget).toBe(55000)
    expect(out.hasTarget).toBe(true)
  })

  it('빈 배열이면 hasTarget=false, 비율값은 null', () => {
    const out = aggregateDailyTargetRows([])
    expect(out.hasTarget).toBe(false)
    expect(out.revenueTarget).toBe(0)
    expect(out.convRateTarget).toBeNull()
    expect(out.aovTarget).toBeNull()
  })

  it('null/undefined 입력도 빈 배열처럼 처리한다', () => {
    expect(aggregateDailyTargetRows(null).hasTarget).toBe(false)
    expect(aggregateDailyTargetRows(undefined).hasTarget).toBe(false)
  })
})

describe('aggregateLastYearActualRows', () => {
  it('전환율/객단가는 SUM/SUM 가중 계산(단순 평균이 아님)', () => {
    // 하루는 세션 많고 전환율 낮음, 하루는 세션 적고 전환율 높음 —
    // 단순 평균과 가중 평균이 달라야 가중 계산임을 검증할 수 있다.
    const rows = [
      { revenue: 1000000, orders: 10, sessions: 1000 }, // 전환율 1%
      { revenue: 500000, orders: 10, sessions: 100 },   // 전환율 10%
    ]
    const out = aggregateLastYearActualRows(rows)
    expect(out.revenue).toBe(1500000)
    expect(out.orders).toBe(20)
    expect(out.sessions).toBe(1100)
    // SUM(orders)/SUM(sessions) = 20/1100*100 ≈ 1.818% (단순평균 5.5%와 다름)
    expect(out.convRate).toBeCloseTo(20 / 1100 * 100, 5)
    expect(out.aov).toBe(1500000 / 20)
    expect(out.hasLastYear).toBe(true)
  })

  it('빈 배열이면 hasLastYear=false, 비율값은 null', () => {
    const out = aggregateLastYearActualRows([])
    expect(out.hasLastYear).toBe(false)
    expect(out.convRate).toBeNull()
    expect(out.aov).toBeNull()
  })

  it('세션/주문이 0이면 나눗셈 대신 null을 반환한다', () => {
    const out = aggregateLastYearActualRows([{ revenue: 0, orders: 0, sessions: 0 }])
    expect(out.hasLastYear).toBe(true)
    expect(out.convRate).toBeNull()
    expect(out.aov).toBeNull()
  })
})
