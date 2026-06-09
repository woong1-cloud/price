// ─── 교체 가능한 품목코드 테이블 ───────────────────────────────────────────────
export const ITEM_CODE_TABLE = {
  // 상의류
  RL: '반팔 티셔츠', RW: '반팔티', RS: '스트라이프티',
  RN: '나시/민소매', RP: '프린트티', LW: '긴팔티',
  LS: '긴팔 스트라이프티', HW: '헨리넥티', BW: '블라우스',
  BN: '블라우스/나시', MR: '라운드넥 반팔티',
  // 하의류
  TJ: '데님 팬츠', TC: '코튼 팬츠', TH: '쇼츠',
  TN: '데님 쇼츠', TA: '슬랙스', TM: '스웨트팬츠', TR: '언더웨어/드로즈',
  // 아우터
  JJ: '윈드브레이커', JK: '재킷', JE: '데님 재킷', MZ: '후드 집업',
  // 스커트/원피스
  WH: '스커트', OW: '원피스', OJ: '원피스',
  // 홈웨어/이너
  PP: '파자마', LO: '홈웨어', WR: '브라/이너', WP: '언더웨어',
  // 니트/카디건
  CK: '카디건', KW: '니트',
  // 셔츠
  YW: '셔츠', YS: '스트라이프 셔츠', YC: '체크 셔츠',
  YJ: '데님 셔츠', DR: '드레스 셔츠',
  // 세트/수영
  SM: '상하세트', AR: '래쉬가드',
  // 기타 액세서리·스포츠
  AK: '가방', AY: '삭스', AB: '벨트', AW: '스카프',
  AC: '모자', GM: '스포츠 하의', GG: '스포츠 상의',
}

// ─── 성별코드 테이블 ────────────────────────────────────────────────────────────
export const GENDER_CODE_TABLE = {
  G: '여성', W: '여성', M: '남성', C: '공용', K: '키즈', U: '콜라보',
}

// ─── 스타일코드 파싱 ─────────────────────────────────────────────────────────────
// 예시: SPRWG25G01
//  [0-1] 브랜드   SP
//  [2-3] 품목코드  RW
//  [4]   년도코드  G(2026신상) F(2025이월) 기타(기타)
//  [7]   성별코드  G
export function parseStyleCode(code) {
  const c = String(code || '')
  if (c.length < 8) {
    return { brand: 'SPAO', itemCode: '', itemName: '기타', yearCode: '', isNew: false, genderCode: '', gender: '기타' }
  }
  const brand    = c.slice(0, 2) === 'SP' ? 'SPAO' : c.slice(0, 2)
  const itemCode = c.slice(2, 4).toUpperCase()
  const yearCode = c[4].toUpperCase()
  const isNew    = yearCode === 'G'
  const genderCode = c[7].toUpperCase()
  return {
    brand,
    itemCode,
    itemName: ITEM_CODE_TABLE[itemCode] || '기타',
    yearCode,
    isNew,
    genderCode,
    gender: GENDER_CODE_TABLE[genderCode] || '기타',
  }
}

// ─── 코드 커버리지 검증 ──────────────────────────────────────────────────────────
export function validateCodeCoverage(salesItems) {
  if (!salesItems || salesItems.length === 0) return { matchedRate: 100, unmatchedCodes: [] }
  const unmatched = salesItems.filter(item => {
    const { itemName } = parseStyleCode(item.styleCode)
    return itemName === '기타'
  })
  const unmatchedCodes = [...new Set(unmatched.map(i => i.styleCode))].filter(Boolean).slice(0, 10)
  const matchedRate = Math.round((salesItems.length - unmatched.length) / salesItems.length * 100)
  return { matchedRate, unmatchedCodes }
}

// ─── 개발용 콘솔 파싱 검증 ───────────────────────────────────────────────────────
if (import.meta.env?.DEV) {
  const TEST_CODES = ['SPRWG25G01', 'SPTJF24M03', 'SPPPG25K02', 'SPJJG25U05', 'SPCKF25W01']
  console.groupCollapsed('[styleCodeParser] 샘플 파싱 검증')
  TEST_CODES.forEach(c => console.log(c, '→', parseStyleCode(c)))
  console.groupEnd()
}
