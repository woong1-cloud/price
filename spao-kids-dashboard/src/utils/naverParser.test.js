import { describe, it, expect } from 'vitest'
import { parseNaverOrders, isNaverCanceled } from './naverParser'

const HEADER = [
  '상품주문번호', '주문번호', '배송속성', '풀필먼트사(주문 기준)', '택배사(주문 기준)',
  '배송방법(구매자 요청)', '배송방법', '택배사', '송장번호', '발송일', '판매채널',
  '구매자명', '구매자ID', '수취인명', '주문상태', '주문세부상태', '수량클레임 여부',
  '결제위치', '결제일', '상품번호', '상품명', '상품종류', '반품안심케어', '멤버십N배송',
  '옵션정보', '옵션관리코드', '수량', '옵션가격', '상품가격',
  '최종 상품별 할인액', '최초 상품별 할인액', '판매자 부담 할인액', '최종 상품별 총 주문금액',
]

describe('parseNaverOrders', () => {
  it('주문 행에서 날짜(Excel 직렬번호)·스타일코드(언더바 없음)·금액을 추출한다', () => {
    const rows = [
      HEADER,
      [
        '2026042088990041', '2026042035646151', 'N배송', 'CJ대한통운(더풀필)', 'CJ대한통운',
        '택배,등기,소포', '택배,등기,소포', 'CJ대한통운', '', 46132.559583333335, '스마트스토어',
        '이하늘', 'nurs*****', '이하늘', '발송대기', '신규주문', 'N',
        'MOBILE', 46132.55876157407, '13242105441',
        '[당일출고] 스파오키즈 쿠디 폴로 칼라 반팔 티셔츠 SPHWG24KU1', '조합형옵션상품', '비대상', '대상',
        '색상: (31)LIGHT YELLOW / 사이즈: 120', 'SPHWG24KU131120', 1, 0, 19900,
        3780, 3780, 3780, 16120,
      ],
    ]
    const items = parseNaverOrders(rows)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      date: '2026-04-20', styleCode: 'SPHWG24KU1', qty: 1, amt: 16120, status: '발송대기',
    })
    expect(isNaverCanceled(items[0])).toBe(false)
  })

  it('주문상태에 "취소"가 포함되면 취소로 판정한다', () => {
    const rows = [
      HEADER,
      [
        '2026042088990099', '2026042035646199', 'N배송', 'CJ대한통운(더풀필)', 'CJ대한통운',
        '택배,등기,소포', '택배,등기,소포', 'CJ대한통운', '', 46132.6, '스마트스토어',
        '김구매', 'buy*****', '김구매', '취소완료', '구매취소', 'N',
        'MOBILE', 46132.6, '13242105499',
        '[키즈] 코튼 레귤러핏 반팔 티셔츠 SPRWGA9KU1', '조합형옵션상품', '비대상', '대상',
        '색상: (10)WHITE / 사이즈: 120', 'SPRWGA9KU110120', 1, 0, 15900,
        3020, 3020, 3020, 12880,
      ],
    ]
    const items = parseNaverOrders(rows)
    expect(isNaverCanceled(items[0])).toBe(true)
  })

  it('행/헤더가 없으면 빈 배열을 반환한다', () => {
    expect(parseNaverOrders([])).toEqual([])
    expect(parseNaverOrders(null)).toEqual([])
  })
})
