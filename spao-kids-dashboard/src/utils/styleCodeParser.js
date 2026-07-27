// ─── 성별코드 테이블 ────────────────────────────────────────────────────────────
export const GENDER_CODE_TABLE = {
  G: '여성', W: '여성', M: '남성', C: '공용', K: '키즈', U: '콜라보',
}

// ─── 스타일코드 파싱 ─────────────────────────────────────────────────────────────
// 예시: SPRWG25G01 — [7](8번째 문자) = 성별코드
export function parseStyleCode(code) {
  const c = String(code || '')
  if (c.length < 8) {
    return { brand: 'SPAO', genderCode: '', gender: '기타' }
  }
  const brand = c.slice(0, 2) === 'SP' ? 'SPAO' : c.slice(0, 2)
  const genderCode = c[7].toUpperCase()
  return { brand, genderCode, gender: GENDER_CODE_TABLE[genderCode] || '기타' }
}
