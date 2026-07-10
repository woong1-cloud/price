import { describe, it, expect } from 'vitest'
import { parseElandOrders, isElandCanceled } from './elandParser'

const HEADER = [
  'NO', '전시몰', '주문번호', '배송유형', '상품번호', '상품명', '단품명', '주문상태',
  '지연종류', '상품권주문취소접수여부', '상품순번', '주문자', '주문유형', '배송정보',
  '외부몰명', '외부몰주문번호', '품명 및 모델명', 'ERP단품코드', '변경ERP단품코드',
  '판매금액', '주문수량', '취소수량', '반품수량', '판매단가', '주문일시',
]

describe('parseElandOrders', () => {
  it('주문 행에서 날짜·스타일코드·금액·상태를 추출한다', () => {
    const rows = [
      HEADER,
      [
        1, '이랜드몰', '202512154294487', '일반', '2509109426',
        '[키즈] (망그러진곰) 수면 파자마_SPPPF4VKU2', '(26)Light Pink/150', '결제완료',
        '', 'N', 1, '민*은', '일반', '부산 연제구 ***',
        '', '', 'SPPPF4VKU2', 'SPPPF4VKU226150', '',
        39900, 1, 0, 0, 39900, '2025-12-15 17:22:23',
      ],
    ]
    const items = parseElandOrders(rows)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      date: '2025-12-15', styleCode: 'SPPPF4VKU2', status: '결제완료', qty: 1, amt: 39900,
    })
  })

  it('취소완료 행도 파싱은 그대로 하고(집계 단계에서 필터링), isElandCanceled가 true를 반환한다', () => {
    const rows = [
      HEADER,
      [
        1, 'KIDIKIDI', '202412166811283', '일반', '2407359384',
        '[키즈] (산리오캐릭터즈) 긴팔 파자마(LIGHT BLUE)_SPPPE49KU1', '(51)Light Blue/120', '취소완료',
        '', 'N', 4, '김*아', '일반', '',
        '', '', 'SPPPE49KU1', '', '',
        29900, 1, 1, 0, 29900, '2024-12-16 23:10:00',
      ],
    ]
    const items = parseElandOrders(rows)
    expect(isElandCanceled(items[0])).toBe(true)
  })

  it('행/헤더가 없으면 빈 배열을 반환한다', () => {
    expect(parseElandOrders([])).toEqual([])
    expect(parseElandOrders(null)).toEqual([])
  })
})
