import { describe, it, expect } from 'vitest'
import { parseGonghomOrders, isGonghomCanceled } from './gonghomParser'

const HEADER = [
  '품목별 주문번호', '주문상태정보', '결제자', '결제일시(입금확인일)', '주문상품명', '수량',
  '품목별 결제금액', '판매가', '상품구매금액', '상품구매금액(KRW)', '총 상품구매금액', '총 상품구매금액(KRW)',
  '마켓 자체 품목 코드', '자체상품코드', '자체분류', '자체품목코드', '자체품목코드(세트구성상품)',
  '상품옵션', '상품옵션(기본)', '옵션+판매가', '옵션추가 가격', '옵션형태',
  '주문상품명(옵션포함)', '추가입력옵션', '추가입력옵션(상세)', '취소신청 구분',
]

describe('parseGonghomOrders', () => {
  it('주문 행에서 날짜(Excel 직렬번호)·스타일코드·금액을 추출한다', () => {
    const rows = [
      HEADER,
      [
        '20260325-0000068-01', '', '박혜미', 46106.0005787037,
        '[키즈] (산리오캐릭터즈) 반팔 파자마(LIGHT BLUE)_SPPPG25KU1', 1,
        30524, 39900, 39900, 39900, 111700, 111700,
        '', 'SPPPG25KU1', '기본 자체분류', 'SPPPG25KU151110', '',
        'Color=(51)LIGHT BLUE, Size=110', 'Color=(51)LIGHT BLUE, Size=110', 39900, 0, '조합형',
        '[키즈] (산리오캐릭터즈) 반팔 파자마(LIGHT BLUE)_SPPPG25KU1(Color=(51)LIGHT BLUE, Size=110)', '', '', '',
      ],
    ]
    const items = parseGonghomOrders(rows)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      date: '2026-03-25', styleCode: 'SPPPG25KU1', qty: 1, amt: 30524,
    })
    expect(isGonghomCanceled(items[0])).toBe(false)
  })

  it('취소신청 구분에 값이 있으면 취소로 판정한다', () => {
    const rows = [
      HEADER,
      [
        '20260325-0000999-01', '', '김철수', 46106.5,
        '[키즈] 후드 집업_SPMZG25KU1', 1,
        29900, 29900, 29900, 29900, 29900, 29900,
        '', 'SPMZG25KU1', '기본 자체분류', 'SPMZG25KU151110', '',
        '', '', 29900, 0, '조합형', '', '', '', 'Y',
      ],
    ]
    const items = parseGonghomOrders(rows)
    expect(isGonghomCanceled(items[0])).toBe(true)
  })

  it('행/헤더가 없으면 빈 배열을 반환한다', () => {
    expect(parseGonghomOrders([])).toEqual([])
    expect(parseGonghomOrders(null)).toEqual([])
  })
})
