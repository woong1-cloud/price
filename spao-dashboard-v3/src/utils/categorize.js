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

// 완전 일치 제외 목록 (소재, 기능어, 상품라인)
const EXCLUDE_MATERIALS = new Set([
  // 소재
  '수피마코튼', '데일리지', '기능성', '워밍', '유기농', '에코', '홈웨어', '스포츠',
  '2way', '3way', '에어', '실크', '린넨', '데님', '니트', '플리스', '면', '폴리',
  '쿨링', '워터', '메시', '스트레치', '컴포트', '핏', '모달', '소로나', '시어서커',
  '프렌치테리', '소프트안', '링클프리', '비스코스',
  // 상품 라인 / 기능어
  '프리미엄', '에센셜', '시티웨어', '내추럴', '베이직',
  // 기타 비IP 브래킷
  '납곰이', '담곰이', '뭉티즈', '한교동', '미나틴', '팡구', '버터베어',
  '에어비스코스', '둥과체리', '소프트안', '링클프리',
])

// 토큰에 포함되면 제외되는 소재/기능 키워드 (부분 일치)
const MATERIAL_CONTAINS = [
  '코튼', '스판', '블랜드', '블렌드', '메리노', '캐시미어', '캐시블', '리바이브',
  '코봄', '코튼봄', '파인코', '내추럴코', '고밀도', 'UV차단', 'UV자단', 'UV방지',
  '비스코스',
]

// 표시명 매핑 (브래킷 텍스트 → 표준 표시명)
const IP_MAP = new Map([
  // 포켓몬
  ['피카츄', '피카츄/포켓몬'], ['포켓몬', '피카츄/포켓몬'], ['pokemon', '피카츄/포켓몬'],
  // 헬로키티 / 산리오
  ['헬로키티', '헬로키티'], ['옐로키티', '헬로키티'], ['hello kitty', '헬로키티'],
  ['산리오', '산리오캐릭터즈'], ['산리오캐릭터즈', '산리오캐릭터즈'],
  ['마이멜로디', '산리오캐릭터즈'], ['쿠로미', '산리오캐릭터즈'],
  ['시나모롤', '산리오캐릭터즈'], ['폼폼푸린', '산리오캐릭터즈'], ['sanrio', '산리오캐릭터즈'],
  // 스누피
  ['스누피', '스누피'], ['snoopy', '스누피'], ['피너츠', '스누피'], ['peanuts', '스누피'],
  // 미피
  ['미피', '미피'], ['miffy', '미피'],
  // 디즈니
  ['디즈니', '디즈니'], ['disney', '디즈니'], ['미키', '디즈니'],
  ['미니마우스', '디즈니'], ['스티치', '디즈니'],
  // 카카오프렌즈
  ['라이언', '카카오프렌즈'], ['어피치', '카카오프렌즈'], ['카카오', '카카오프렌즈'],
  // 짱구
  ['짱구', '짱구'], ['크레용신찬', '짱구'],
  // 무민
  ['무민', '무민'], ['moomin', '무민'],
  // 마블/DC
  ['마블', '마블/DC'], ['어벤져스', '마블/DC'], ['스파이더맨', '마블/DC'],
  ['marvel', '마블/DC'], ['슈퍼맨', '마블/DC'], ['배트맨', '마블/DC'],
  // 유니버설
  ['미니언', '유니버설'], ['minion', '유니버설'], ['유니버설', '유니버설'],
  // 해리포터
  ['해리포터', '해리포터'], ['harrypotter', '해리포터'], ['harry potter', '해리포터'],
  // 산엑스 캐릭터
  ['리락쿠마', '리락쿠마'], ['릴락쿠마', '리락쿠마'], ['rilakkuma', '리락쿠마'],
  ['먼작귀', '먼작귀'],
  ['망그러진곰', '망그러진곰'],
  // 반다이남코
  ['다마고치', '다마고치'], ['tamagotchi', '다마고치'],
  // 애니메이션
  ['진격의거인', '진격의거인'],
  ['케로로', '케로로'], ['개구리동사케로로', '케로로'],
  // 루니툰즈
  ['트위티', '트위티'], ['tweety', '트위티'],
  // 루시 (신규 콜라보)
  ['lucy', 'LUCY'], ['루시', 'LUCY'],
])

function isExcluded(token) {
  const t = token.trim()
  const tLower = t.toLowerCase()
  // 숫자 포함 → 수량/세트/기능성 표기 (2pack, UPF50, 3SET 등)
  if (/\d/.test(tLower)) return true
  // 짧은 순수 영문 (≤12자) → 기능성 영문 태그 (COOL, WARM, UV 등)
  if (/^[a-z\s+\-&/]+$/.test(tLower) && tLower.replace(/\s/g, '').length <= 12) return true
  // 완전 일치 제외
  if (EXCLUDE_SEGMENTS.has(t)) return true
  if (EXCLUDE_MATERIALS.has(t)) return true
  // 소재 키워드 포함 여부 (부분 일치)
  for (const kw of MATERIAL_CONTAINS) {
    if (tLower.includes(kw.toLowerCase())) return true
  }
  return false
}

export function getIP(name) {
  const re = /\[([^\]]+)\]/g
  const src = String(name || '')
  let m
  const tokens = []
  while ((m = re.exec(src)) !== null) tokens.push(m[1].trim())

  for (const token of tokens) {
    const tLower = token.toLowerCase()
    // 알려진 IP 는 제외 규칙보다 우선 매칭 (LUCY 같은 영문 IP 가 기능성 태그로 오인되어
    // 걸러지는 것을 방지).
    for (const [key, displayName] of IP_MAP) {
      if (tLower.includes(key)) return displayName
    }
    if (isExcluded(token)) continue
    // 엄격 모드: 매핑되지 않은 브래킷은 콜라보로 보지 않는다 (일반 상품 오인 방지)
  }
  return null
}

// 콜라보 상품의 IP 표시명 추출 (재입고/콜라보 집계 전용).
// getIP 표준 매핑을 우선 쓰되, 매핑 안 된 콜라보 브래킷(호빵맨·마이페이브아카이브 등)은
// 첫 유효 브래킷 토큰을 그대로 IP 이름으로 쓴다. 콜라보(styleCode U) 상품에만 적용할 것.
export function extractCollabIP(name) {
  const mapped = getIP(name)
  if (mapped) return mapped
  const tokens = [...String(name || '').matchAll(/\[([^\]]+)\]/g)].map(m => m[1].trim())
  for (const t of tokens) {
    if (isExcluded(t)) continue
    return t
  }
  return '기타 콜라보'
}
