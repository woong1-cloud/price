// ─── 카테고리 분류 ────────────────────────────────────────────────────────────
const CAT_RULES = [
  { name: '티셔츠/나시', kw: ['반팔', '긴팔', '나시', '민소매', '헨리넥', '라운드넥', '프린트티', '스트라이프티'] },
  { name: '블라우스/셔츠', kw: ['블라우스', '셔츠', '드레스셔츠', '체크셔츠', '데님셔츠'] },
  { name: '팬츠/쇼츠', kw: ['팬츠', '쇼츠', '슬랙스', '스웨트팬츠', '드로즈', '언더웨어'] },
  { name: '아우터', kw: ['재킷', '윈드브레이커', '후드', '집업', '코트', '점퍼'] },
  { name: '스커트/원피스', kw: ['스커트', '원피스'] },
  { name: '니트/카디건', kw: ['니트', '카디건'] },
  { name: '홈웨어/이너', kw: ['파자마', '홈웨어', '브라', '이너', '언더웨어'] },
  { name: '세트/수영', kw: ['세트', '래쉬가드', '수영'] },
  { name: '스포츠', kw: ['스포츠'] },
  { name: '액세서리', kw: ['가방', '삭스', '벨트', '스카프', '모자', '양말'] },
]

export function getCategory(name) {
  const n = String(name || '').toLowerCase()
  for (const { name: cat, kw } of CAT_RULES) {
    if (kw.some(k => n.includes(k.toLowerCase()))) return cat
  }
  return '기타'
}

// ─── IP / 콜라보 감지 ─────────────────────────────────────────────────────────
// 대괄호 [xxx] 기반 자동 감지. 소재·세그먼트·기능어는 제외.

const EXCLUDE_SEGMENTS = new Set([
  '키즈', '주니어', '여아', '남아', '어덜트', '여성', '남성', '공용', '아동',
])

const EXCLUDE_MATERIALS = new Set([
  '수피마코튼', '데일리지', '기능성', '워밍', '유기농', '에코', '홈웨어', '스포츠',
  '2way', '3way', '에어', '실크', '린넨', '데님', '니트', '플리스', '면', '폴리',
  '쿨링', '워터', '메시', '스트레치', '컴포트', '핏',
])

// 표시명 매핑 (브래킷 텍스트 → 표준 표시명)
const IP_MAP = new Map([
  ['피카츄', '피카츄/포켓몬'], ['포켓몬', '피카츄/포켓몬'], ['pokemon', '피카츄/포켓몬'],
  ['해리포터', '해리포터'], ['harrypotter', '해리포터'], ['harry potter', '해리포터'],
  ['스누피', '스누피'], ['snoopy', '스누피'], ['피너츠', '스누피'], ['peanuts', '스누피'],
  ['미피', '미피'], ['miffy', '미피'],
  ['산리오', '산리오'], ['마이멜로디', '산리오'], ['쿠로미', '산리오'],
  ['시나모롤', '산리오'], ['폼폼푸린', '산리오'], ['sanrio', '산리오'],
  ['디즈니', '디즈니'], ['disney', '디즈니'], ['미키', '디즈니'],
  ['미니마우스', '디즈니'], ['스티치', '디즈니'],
  ['라이언', '카카오프렌즈'], ['어피치', '카카오프렌즈'], ['카카오', '카카오프렌즈'],
  ['짱구', '짱구'], ['크레용신찬', '짱구'],
  ['무민', '무민'], ['moomin', '무민'],
  ['마블', '마블/DC'], ['어벤져스', '마블/DC'], ['스파이더맨', '마블/DC'],
  ['marvel', '마블/DC'], ['슈퍼맨', '마블/DC'], ['배트맨', '마블/DC'],
  ['미니언', '유니버설'], ['minion', '유니버설'], ['유니버설', '유니버설'],
])

function isExcluded(token) {
  const t = token.trim()
  const tLower = t.toLowerCase()
  // 숫자 포함 → 수량/세트/기능성 표기 (2pack, UPF50, 3SET 등)
  if (/\d/.test(tLower)) return true
  // 짧은 영문 단어 (≤12자, 영문+공백+기호만) → 기능성 영문 태그
  if (/^[a-z\s+\-&/]+$/.test(tLower) && tLower.replace(/\s/g, '').length <= 12) return true
  if (EXCLUDE_SEGMENTS.has(t)) return true
  if (EXCLUDE_MATERIALS.has(t)) return true
  return false
}

export function getIP(name) {
  const re = /\[([^\]]+)\]/g
  const src = String(name || '')
  let m
  const tokens = []
  while ((m = re.exec(src)) !== null) tokens.push(m[1].trim())

  for (const token of tokens) {
    if (isExcluded(token)) continue
    const tLower = token.toLowerCase()
    for (const [key, displayName] of IP_MAP) {
      if (tLower.includes(key)) return displayName
    }
    // 매핑 없는 경우 → 브래킷 텍스트 그대로 반환 (신규 콜라보 자동 인식)
    return token
  }
  return null
}
