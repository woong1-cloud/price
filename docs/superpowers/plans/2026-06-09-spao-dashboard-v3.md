# SPAO 대시보드 V3 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** spao-dashboard-v2를 복사해 v3를 만들고, 7개 피처(레이블 수정·PV 코멘트·IP 자동감지·복종 실적 테이블·헬스체크 UI 개편·2주 데이터 아키텍처)를 적용한다.

**Architecture:** V2를 건드리지 않고 spao-dashboard-v3/ 디렉토리를 신규 생성. metrics.js의 `computeAllDerived`는 파라미터를 `{ thisWeek, lastWeek }` 구조로 변경해 WoW를 명시적으로 처리. storage.js를 신규 추가해 localStorage 자동 저장 + JSON 내보내기/불러오기를 담당.

**Tech Stack:** React 19, Vite 8, SheetJS, Recharts, localStorage API

---

## 파일 변경 맵

| 파일 | 작업 | 태스크 |
|------|------|--------|
| `spao-dashboard-v3/` (디렉토리) | V2 복사 후 신규 생성 | Task 1 |
| `src/utils/metrics.js` | KPI 레이블 수정, `computeAllDerived` 시그니처 변경, `itemGenderMatrix` 추가 | Task 2, 4, 8 |
| `src/components/L2_ProductAnalysis.jsx` | PV 코멘트 수정, `ItemGenderTable` 신규 컴포넌트 추가 | Task 2, 5 |
| `src/utils/categorize.js` | `getIP()` 대괄호 기반 자동감지로 교체 | Task 3 |
| `src/components/L1_HealthCheck.jsx` | `PerspectiveSummary` → `QuickSummary` 교체 | Task 6 |
| `src/utils/storage.js` | 신규 파일 — localStorage/JSON 저장 로직 | Task 7 |
| `src/App.jsx` | 상태 구조 `thisWeek/lastWeek`, UI 버튼 추가 | Task 9 |

---

## Task 1: V3 디렉토리 생성

**Files:**
- Create: `spao-dashboard-v3/` (V2 전체 복사)

- [ ] **Step 1: V2 복사**

```powershell
Copy-Item "C:\Users\han_jiwoong\Desktop\agent\spao-dashboard-v2" `
          "C:\Users\han_jiwoong\Desktop\agent\spao-dashboard-v3" -Recurse
```

- [ ] **Step 2: node_modules 제거 (용량 절약)**

```powershell
Remove-Item "C:\Users\han_jiwoong\Desktop\agent\spao-dashboard-v3\node_modules" -Recurse -Force
```

- [ ] **Step 3: package.json name 변경**

파일: `spao-dashboard-v3/package.json`

변경:
```json
"name": "spao-dashboard-v3",
```

- [ ] **Step 4: 의존성 설치 및 빌드 확인**

```powershell
cd "C:\Users\han_jiwoong\Desktop\agent\spao-dashboard-v3"
npm install
npm run build
```

기대 출력: `✓ built in X.XXs` (에러 없음)

- [ ] **Step 5: 커밋**

```bash
cd "C:\Users\han_jiwoong\Desktop\agent"
git add spao-dashboard-v3/
git commit -m "feat: spao-dashboard-v3 디렉토리 생성 (V2 복사)"
```

---

## Task 2: 소형 수정 — 레이블 + PV 코멘트

**Files:**
- Modify: `spao-dashboard-v3/src/utils/metrics.js`
- Modify: `spao-dashboard-v3/src/components/L2_ProductAnalysis.jsx`

- [ ] **Step 1: KPI 레이블 수정 (metrics.js)**

`src/utils/metrics.js`의 `computeAllDerived` 함수 안 KPI 배열에서:

```js
// 변경 전 (약 338번째 줄)
{
  id: 'orderCnt', label: '주문건수',
  value: fmtComma(thisOrderCnt) + '건',
```

```js
// 변경 후
{
  id: 'orderCnt', label: '결제 완료 상품 수',
  value: fmtComma(thisOrderCnt) + '건',
```

- [ ] **Step 2: PV 코멘트 수정 (L2_ProductAnalysis.jsx)**

`src/components/L2_ProductAnalysis.jsx`의 `PVGapTable` 컴포넌트 마지막 `<div>`:

```jsx
// 변경 전
<div style={{ marginTop: 8, fontSize: '0.75rem', color: '#A0A09E' }}>
  💡 갭이 큰 상품 = 사람들은 보는데 사지 않는다 → 가격·재고·리뷰·상세이미지를 점검하세요.
</div>
```

```jsx
// 변경 후
<div style={{ marginTop: 8, fontSize: '0.75rem', color: '#A0A09E' }}>
  💡 갭이 큰 상품은 <strong>상세페이지 품질(이미지·가격·리뷰)</strong> 또는 <strong>재고 결품 여부</strong>도 함께 확인하세요. 결품 상품은 PV가 높아도 전환이 불가능합니다.
</div>
```

- [ ] **Step 3: 빌드 확인**

```powershell
cd "C:\Users\han_jiwoong\Desktop\agent\spao-dashboard-v3"
npm run build
```

기대: `✓ built`

- [ ] **Step 4: 커밋**

```bash
git add spao-dashboard-v3/src/utils/metrics.js spao-dashboard-v3/src/components/L2_ProductAnalysis.jsx
git commit -m "fix(v3): 결제완료상품수 레이블 수정, PV갭 결품 코멘트 추가"
```

---

## Task 3: IP/콜라보 자동 감지

**Files:**
- Modify: `spao-dashboard-v3/src/utils/categorize.js`

- [ ] **Step 1: categorize.js 전체 교체**

`src/utils/categorize.js` 파일 전체를 아래 내용으로 교체:

```js
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
// 전략: 상품명의 [] 내용을 추출 후 비콜라보 토큰 제외, 나머지를 콜라보로 인식
// 기존 IP_MAP은 표시명 매핑으로만 사용 (신규 콜라보는 자동 인식)

// 비콜라보 제외 규칙
const EXCLUDE_SEGMENTS = new Set(['키즈', '주니어', '여아', '남아', '어덜트', '여성', '남성', '공용', '아동'])
const EXCLUDE_MATERIALS = new Set([
  '수피마코튼', '데일리지', '기능성', '워밍', '유기농', '에코', '홈웨어', '스포츠',
  '2way', '3way', '에어', '실크', '린넨', '데님', '니트', '플리스',
])

// 알려진 IP → 표시명 매핑 (새 IP는 이 맵에 없어도 자동으로 [] 텍스트가 반환됨)
const IP_MAP = new Map([
  ['피카츄', '피카츄/포켓몬'], ['포켓몬', '피카츄/포켓몬'], ['pokemon', '피카츄/포켓몬'],
  ['해리포터', '해리포터'], ['harry potter', '해리포터'], ['harrypotter', '해리포터'],
  ['스누피', '스누피'], ['snoopy', '스누피'], ['피너츠', '스누피'], ['peanuts', '스누피'],
  ['미피', '미피'], ['miffy', '미피'],
  ['마이멜로디', '산리오'], ['쿠로미', '산리오'], ['시나모롤', '산리오'],
  ['폼폼푸린', '산리오'], ['산리오', '산리오'], ['sanrio', '산리오'],
  ['디즈니', '디즈니'], ['disney', '디즈니'], ['미키', '디즈니'], ['스티치', '디즈니'], ['미니마우스', '디즈니'],
  ['라이언', '카카오프렌즈'], ['어피치', '카카오프렌즈'], ['카카오', '카카오프렌즈'],
  ['짱구', '짱구'], ['크레용신찬', '짱구'],
  ['무민', '무민'], ['moomin', '무민'],
  ['마블', '마블/DC'], ['어벤져스', '마블/DC'], ['스파이더맨', '마블/DC'], ['marvel', '마블/DC'],
  ['미니언', '유니버설'], ['minion', '유니버설'], ['쥬라기', '유니버설'], ['유니버설', '유니버설'],
])

function isExcluded(token) {
  const t = token.trim()
  const tLower = t.toLowerCase()

  // 숫자 포함 (2pack, UPF50, 3SET 등)
  if (/\d/.test(tLower)) return true

  // 영문만으로 이루어진 짧은 단어 (소재/속성: COOL, WARM, UV, DRY 등)
  if (/^[a-z\s\+\-&]+$/.test(tLower) && tLower.replace(/\s/g, '').length <= 12) return true

  // 세그먼트어
  if (EXCLUDE_SEGMENTS.has(t)) return true

  // 소재/유형어
  if (EXCLUDE_MATERIALS.has(t)) return true

  return false
}

export function getIP(name) {
  const n = String(name || '')

  // [] 안의 모든 토큰 추출
  const re = /\[([^\]]+)\]/g
  let m
  const tokens = []
  while ((m = re.exec(n)) !== null) {
    tokens.push(m[1].trim())
  }

  for (const token of tokens) {
    if (isExcluded(token)) continue

    // IP_MAP에서 표시명 조회 (부분 매칭)
    const tLower = token.toLowerCase()
    for (const [key, displayName] of IP_MAP) {
      if (tLower.includes(key)) return displayName
    }

    // IP_MAP에 없어도 제외 안 됐으면 → 콜라보로 인식 (텍스트 그대로 반환)
    return token
  }

  return null
}
```

- [ ] **Step 2: 빌드 확인**

```powershell
cd "C:\Users\han_jiwoong\Desktop\agent\spao-dashboard-v3"
npm run build
```

기대: `✓ built` (에러 없음)

- [ ] **Step 3: 동작 빠른 검증 (브라우저 콘솔)**

개발 서버 실행 후 브라우저 콘솔에서:

```js
import { getIP } from './src/utils/categorize.js'
// 또는 앱 로드 후 전역에서 테스트 불가, 빌드 검증으로 대체
```

대신 Node.js에서 직접 테스트:

```powershell
node -e "
const { getIP } = await import('./src/utils/categorize.js')
console.log(getIP('[피카츄] 오버핏 티셔츠'))          // → '피카츄/포켓몬'
console.log(getIP('[마이페이브아카이브] 크루넥'))       // → '마이페이브아카이브'
console.log(getIP('[COOL][키즈] 반팔티'))             // → null
console.log(getIP('[2pack] 언더웨어'))                // → null
console.log(getIP('[수피마코튼] 블라우스'))            // → null
" --input-type=module
```

기대 출력:
```
피카츄/포켓몬
마이페이브아카이브
null
null
null
```

- [ ] **Step 4: 커밋**

```bash
git add spao-dashboard-v3/src/utils/categorize.js
git commit -m "feat(v3): IP/콜라보 대괄호 기반 자동 감지 — 신규 콜라보 코드 수정 불필요"
```

---

## Task 4: 복종 실적 — metrics.js `itemGenderMatrix` 추가

**Files:**
- Modify: `spao-dashboard-v3/src/utils/metrics.js`

- [ ] **Step 1: `computeAllDerived` 반환값 직전에 `itemGenderMatrix` 계산 추가**

`src/utils/metrics.js`의 `computeAllDerived` 함수 안, `return {` 바로 위에 아래 코드를 삽입:

```js
  // ── 아이템×성별 복종 실적 매트릭스 ──
  const ITEM_GENDER_COLS = ['여성', '남성', '키즈', '공용', '콜라보']
  const igRaw = {}
  const igSkuSets = {}

  for (const i of salesSplit.thisWeek) {
    const { itemName, gender } = parseStyleCode(i.styleCode)
    if (!igRaw[itemName]) { igRaw[itemName] = {}; igSkuSets[itemName] = new Set() }
    const g = ITEM_GENDER_COLS.includes(gender) ? gender : '기타'
    igRaw[itemName][g] = (igRaw[itemName][g] || 0) + i.realAmt
    if (i.styleCode) igSkuSets[itemName].add(i.styleCode)
  }

  const itemGenderMatrix = Object.entries(igRaw).map(([itemName, gMap]) => {
    const row = { itemName, skuCount: igSkuSets[itemName].size }
    let total = 0
    for (const g of [...ITEM_GENDER_COLS, '기타']) { row[g] = gMap[g] || 0; total += row[g] }
    row.total = total
    return row
  }).sort((a, b) => {
    if (a.itemName === '기타') return 1
    if (b.itemName === '기타') return -1
    return b.total - a.total
  })
```

- [ ] **Step 2: 반환값 객체에 `itemGenderMatrix` 추가**

같은 파일의 `return {` 블록에서 마지막 필드 다음에 추가:

```js
    // 기존 마지막 줄: insights,
    insights,
    itemGenderMatrix,   // ← 추가
  }
```

- [ ] **Step 3: 빌드 확인**

```powershell
npm run build
```

기대: `✓ built`

- [ ] **Step 4: 커밋**

```bash
git add spao-dashboard-v3/src/utils/metrics.js
git commit -m "feat(v3): itemGenderMatrix 복종×성별 실적 매트릭스 계산 추가"
```

---

## Task 5: 복종 실적 — L2 `ItemGenderTable` 컴포넌트

**Files:**
- Modify: `spao-dashboard-v3/src/components/L2_ProductAnalysis.jsx`

- [ ] **Step 1: `ItemGenderTable` 컴포넌트 추가**

`src/components/L2_ProductAnalysis.jsx`에서 `// ─── L2 메인 ───` 주석 바로 위에 새 컴포넌트 삽입:

```jsx
// ─── 9. 아이템×성별 복종 실적 테이블 ────────────────────────────────────────
const ITEM_GENDER_COLS = ['여성', '남성', '키즈', '공용', '콜라보']

function ItemGenderTable({ itemGenderMatrix }) {
  if (!itemGenderMatrix || itemGenderMatrix.length === 0) return null

  // 히트맵 기준: 성별 셀 전체 중 최대값
  const allVals = itemGenderMatrix.flatMap(r => ITEM_GENDER_COLS.map(g => r[g] || 0))
  const maxAmt  = Math.max(...allVals, 1)

  return (
    <div className="card p-5">
      <SectionHeader icon="📊" title="아이템별 복종 실적" perspective="MD" color="#378ADD"
        badge="스타일코드 품목코드 × 성별코드 기준" />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr style={{ background: '#F8F8F7', borderBottom: '1px solid #E8E8E6' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6B6B68', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                품목명
              </th>
              {ITEM_GENDER_COLS.map(g => (
                <th key={g} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#6B6B68', fontSize: '0.75rem', minWidth: 80, whiteSpace: 'nowrap' }}>
                  {g}
                </th>
              ))}
              <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#378ADD', fontSize: '0.75rem', minWidth: 80, whiteSpace: 'nowrap' }}>
                합계
              </th>
              <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#6B6B68', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                SKU
              </th>
            </tr>
          </thead>
          <tbody>
            {itemGenderMatrix.map(row => (
              <tr key={row.itemName} style={{ borderBottom: '1px solid #F0F0EE' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1A1A1A', whiteSpace: 'nowrap' }}>
                  {row.itemName}
                </td>
                {ITEM_GENDER_COLS.map(g => {
                  const v     = row[g] || 0
                  const ratio = v / maxAmt
                  const bg    = v > 0 ? heatColor(ratio * 0.85) : 'transparent'
                  const textColor = ratio > 0.55 ? '#fff' : v > 0 ? '#1A1A1A' : '#D1D5DB'
                  return (
                    <td key={g} style={{ padding: '4px 6px', textAlign: 'right' }}>
                      {v > 0 ? (
                        <div style={{ background: bg, borderRadius: 5, padding: '4px 8px', display: 'inline-block', minWidth: 60, textAlign: 'right' }}>
                          <span style={{ fontWeight: 600, color: textColor, fontSize: '0.8125rem' }}>{fmt억(v)}</span>
                        </div>
                      ) : (
                        <span style={{ color: '#D1D5DB' }}>—</span>
                      )}
                    </td>
                  )
                })}
                <td style={{ padding: '8px 10px', textAlign: 'right', background: '#EFF6FF', fontWeight: 700, color: '#1D4ED8' }}>
                  {fmt억(row.total)}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#A0A09E', fontSize: '0.75rem' }}>
                  {row.skuCount}개
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: '0.75rem', color: '#A0A09E' }}>
        💡 셀이 진할수록 해당 품목×성별 조합의 매출이 높습니다. 공백(—)은 해당 조합 판매 없음.
      </div>
    </div>
  )
}
```

- [ ] **Step 2: L2 메인에 `itemGenderMatrix` 구조분해 및 렌더링 추가**

`L2_ProductAnalysis` 함수(export default) 내부에서:

```jsx
// 변경 전 구조분해
const {
  matchedRate, unmatchedCodes,
  salesTop15, wishTop15, cartTop15,
  pvGapList, catData, catFunnel, ipData,
  newVsCarry, pareto, genderCatData, topCatsForCross,
} = derived

// 변경 후
const {
  matchedRate, unmatchedCodes,
  salesTop15, wishTop15, cartTop15,
  pvGapList, catData, catFunnel, ipData,
  newVsCarry, pareto, genderCatData, topCatsForCross,
  itemGenderMatrix,
} = derived
```

그리고 `return` 안 맨 마지막 (`</div>` 닫기 바로 위)에 추가:

```jsx
      {/* 9. 아이템×성별 복종 실적 */}
      <ItemGenderTable itemGenderMatrix={itemGenderMatrix} />
```

- [ ] **Step 3: 빌드 확인**

```powershell
npm run build
```

기대: `✓ built`

- [ ] **Step 4: 커밋**

```bash
git add spao-dashboard-v3/src/components/L2_ProductAnalysis.jsx
git commit -m "feat(v3): 아이템×성별 복종 실적 히트맵 테이블 추가"
```

---

## Task 6: 헬스체크 상단 UI 개편 — `QuickSummary`

**Files:**
- Modify: `spao-dashboard-v3/src/components/L1_HealthCheck.jsx`

- [ ] **Step 1: import에 `fmtWoW` 추가**

```jsx
// 변경 전
import { fmt억, fmtComma, fmtPct } from '../utils/metrics'

// 변경 후
import { fmt억, fmtComma, fmtPct, fmtWoW } from '../utils/metrics'
```

- [ ] **Step 2: 기존 `PerspectiveSummary` 컴포넌트를 `QuickSummary`로 교체**

`L1_HealthCheck.jsx`에서 `// ─── 빠른 관점 요약 카드 ───` 주석부터 `PerspectiveSummary` 함수 닫기 `}` 까지 전체를 아래로 교체:

```jsx
// ─── 빠른 요약 (매출성과 / 채널현황 / 고객행동) ─────────────────────────────
function QuickSummary({ derived, salesByDateMetrics }) {
  const { kpis, channelData, cartDerived, genderData, newVsReturn, visitMetrics, insights } = derived
  const sbm = salesByDateMetrics

  // 이상감지 알림: danger/warning 중 상위 2개
  const alerts = (insights || []).filter(a => a.severity === 'danger' || a.severity === 'warning').slice(0, 2)

  const totalChannelAmt = channelData.reduce((s, c) => s + c.value, 0) || 1
  const avgBounce = visitMetrics?.channelKPIs?.length > 0
    ? visitMetrics.channelKPIs.reduce((s, k) => s + k.avgBounceRate, 0) / visitMetrics.channelKPIs.length
    : null

  return (
    <div>
      {/* 이상감지 인라인 알림 */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {alerts.map(a => (
            <div key={a.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: '0.75rem', padding: '5px 14px', borderRadius: 20,
              background: a.severity === 'danger' ? '#FEF2F2' : '#FFF9F0',
              border: `1px solid ${a.severity === 'danger' ? '#FECACA' : '#FDE68A'}`,
              color: a.severity === 'danger' ? '#DC2626' : '#B45309',
              fontWeight: 600,
            }}>
              {a.severity === 'danger' ? '🔴' : '🟡'} {a.title}
              {(a.id === 'revenue_drop' || a.id === 'revenue_spike') && kpis[0]?.wow !== null && (
                <span style={{ marginLeft: 4 }}>{fmtWoW(kpis[0].wow)}</span>
              )}
              {a.id === 'low_cart_conv' && cartDerived?.cartConvRate > 0 && (
                <span style={{ marginLeft: 4 }}>{cartDerived.cartConvRate.toFixed(1)}%</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 3열 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>

        {/* 💰 매출 성과 */}
        <div style={{ background: '#FFF9F0', border: '1px solid #FDE68A', borderRadius: 12, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: '1rem' }}>💰</span>
            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#B45309' }}>매출 성과</span>
            {!sbm && <span style={{ fontSize: '0.625rem', color: '#A0A09E', marginLeft: 'auto' }}>기간별매출분석 업로드 시 표시</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: '취소율',         val: sbm ? `${sbm.cancelRate.toFixed(1)}%`                                : '—', warn: sbm?.cancelRate > 15 },
              { label: '평균 주문금액',   val: sbm ? `${Math.round((sbm.aov || 0) / 10000).toLocaleString()}만원`  : '—' },
              { label: '할인율',         val: sbm ? `${sbm.discountRate.toFixed(1)}%`                             : '—' },
              { label: '총 혜택금액',    val: sbm ? fmt억(sbm.sigma?.totalBenefit || 0)                           : '—' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.6875rem', color: '#A0A09E' }}>{item.label}</span>
                <span style={{
                  fontSize: '0.75rem', fontWeight: 600,
                  color: item.warn ? '#DC2626' : '#B45309',
                  background: item.warn ? '#FEF2F2' : 'transparent',
                  borderRadius: 4, padding: item.warn ? '1px 5px' : 0,
                }}>
                  {item.warn ? '⚠ ' : ''}{item.val}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 📡 채널 현황 */}
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: '1rem' }}>📡</span>
            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1D4ED8' }}>채널 현황</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {channelData.slice(0, 3).map((ch, i) => {
              const pct = (ch.value / totalChannelAmt * 100)
              const colors = ['#378ADD', '#5DCAA5', '#7F77DD']
              return (
                <div key={ch.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: '0.6875rem', color: '#A0A09E' }}>{ch.name}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: colors[i] }}>
                      {fmt억(ch.value)} <span style={{ color: '#A0A09E', fontWeight: 400 }}>({pct.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div style={{ height: 4, background: '#DBEAFE', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: colors[i], borderRadius: 2 }} />
                  </div>
                </div>
              )
            })}
            {avgBounce !== null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid #DBEAFE' }}>
                <span style={{ fontSize: '0.6875rem', color: '#A0A09E' }}>평균 이탈률</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: avgBounce > 38 ? '#DC2626' : '#1D4ED8' }}>
                  {avgBounce > 38 ? '⚠ ' : ''}{avgBounce.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 👥 고객 행동 */}
        <div style={{ background: '#F0FDF8', border: '1px solid #BBF7D0', borderRadius: 12, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: '1rem' }}>👥</span>
            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1A8060' }}>고객 행동</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {newVsReturn?.available && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.6875rem', color: '#A0A09E' }}>신규 / 재구매</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1A8060' }}>
                  {newVsReturn.newPct.toFixed(0)}% / {newVsReturn.returnPct.toFixed(0)}%
                </span>
              </div>
            )}
            {genderData.length > 0 && (() => {
              const top = genderData[0]
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.6875rem', color: '#A0A09E' }}>주요 성별</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1A8060' }}>
                    {top.name} {top.pct.toFixed(0)}%
                  </span>
                </div>
              )
            })()}
            {[
              {
                label: '장바구니 전환율',
                val: `${(cartDerived?.cartConvRate || 0).toFixed(1)}%`,
                warn: (cartDerived?.cartConvRate || 0) < 5 && (cartDerived?.cartConvRate || 0) > 0,
              },
              {
                label: '비회원 구매 비중',
                val: `${(cartDerived?.nonMemberPct || 0).toFixed(0)}%`,
                warn: (cartDerived?.nonMemberPct || 0) > 40,
              },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.6875rem', color: '#A0A09E' }}>{item.label}</span>
                <span style={{
                  fontSize: '0.75rem', fontWeight: 600,
                  color: item.warn ? '#DC2626' : '#1A8060',
                  background: item.warn ? '#FEF2F2' : 'transparent',
                  borderRadius: 4, padding: item.warn ? '1px 5px' : 0,
                }}>
                  {item.warn ? '⚠ ' : ''}{item.val}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
```

- [ ] **Step 3: 메인 렌더에서 `PerspectiveSummary` → `QuickSummary` 교체**

`L1_HealthCheck` export default 함수 안에서:

```jsx
// 변경 전
{/* ── 관점별 빠른 요약 ── */}
<PerspectiveSummary derived={derived} />

// 변경 후
{/* ── 빠른 요약 (매출/채널/고객) ── */}
<QuickSummary derived={derived} salesByDateMetrics={salesByDateMetrics} />
```

- [ ] **Step 4: 빌드 확인**

```powershell
npm run build
```

기대: `✓ built` (unused `PerspectiveSummary`는 트리쉐이킹으로 제거됨)

- [ ] **Step 5: 커밋**

```bash
git add spao-dashboard-v3/src/components/L1_HealthCheck.jsx
git commit -m "feat(v3): 헬스체크 상단 3관점 → 매출성과/채널현황/고객행동 QuickSummary로 개편"
```

---

## Task 7: `storage.js` 신규 — localStorage + JSON 백업

**Files:**
- Create: `spao-dashboard-v3/src/utils/storage.js`

- [ ] **Step 1: `storage.js` 생성**

```js
// ─── SPAO 대시보드 V3 — 데이터 영속성 ─────────────────────────────────────
const KEY_THIS = 'spao_v3_thisWeek'
const KEY_LAST = 'spao_v3_lastWeek'

export function saveState(thisWeek, lastWeek) {
  try {
    localStorage.setItem(KEY_THIS, JSON.stringify(thisWeek))
    localStorage.setItem(KEY_LAST, JSON.stringify(lastWeek))
  } catch (e) {
    console.warn('[storage] 저장 실패:', e)
  }
}

export function loadState() {
  try {
    const tw = localStorage.getItem(KEY_THIS)
    if (!tw) return null
    return {
      thisWeek: JSON.parse(tw),
      lastWeek: JSON.parse(localStorage.getItem(KEY_LAST) || 'null'),
    }
  } catch (e) {
    console.warn('[storage] 로드 실패:', e)
    return null
  }
}

export function clearState() {
  localStorage.removeItem(KEY_THIS)
  localStorage.removeItem(KEY_LAST)
}

// JSON 파일로 내보내기
export function exportJSON(thisWeek, lastWeek) {
  const payload = { version: 3, exportedAt: new Date().toISOString(), thisWeek, lastWeek }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `spao_dashboard_${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// JSON 파일 불러오기 → { thisWeek, lastWeek }
export function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)
        if (!data.thisWeek) throw new Error('thisWeek 필드 없음')
        resolve({ thisWeek: data.thisWeek, lastWeek: data.lastWeek || null })
      } catch (err) {
        reject(new Error(`유효하지 않은 파일: ${err.message}`))
      }
    }
    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsText(file)
  })
}
```

- [ ] **Step 2: 빌드 확인**

```powershell
npm run build
```

기대: `✓ built`

- [ ] **Step 3: 커밋**

```bash
git add spao-dashboard-v3/src/utils/storage.js
git commit -m "feat(v3): storage.js — localStorage 자동 저장 + JSON 백업/복원"
```

---

## Task 8: `metrics.js` — `computeAllDerived` 시그니처 변경

**Files:**
- Modify: `spao-dashboard-v3/src/utils/metrics.js`

- [ ] **Step 1: `computeAllDerived` 첫 부분(WoW 분리 ~ 기간 표시) 교체**

현재 코드 (약 296~320번째 줄):

```js
export function computeAllDerived({ cart, wishlist, sales, customer, visit = null, store = null }) {
  // ── 1. WoW 분리 ──
  const cartSplit = splitWeeks(cart?.items || [])
  const salesSplit = splitWeeks(sales?.items || [])
  const wishSplit = splitWeeks(wishlist?.items || [])
  const custSplit = splitWeeks(customer?.items || [])
  const hasWoW = cartSplit.lastWeek.length > 0 || salesSplit.lastWeek.length > 0

  // ── 2. 기간 표시 ──
  const period = sales?.period || cart?.period || ''
  const thisP = salesSplit.thisP || cartSplit.thisP || period
  const lastP = salesSplit.lastP || cartSplit.lastP || null
```

위 블록을 아래로 교체:

```js
export function computeAllDerived({ thisWeek, lastWeek = null, visit = null, store = null }) {
  // ── 1. thisWeek/lastWeek 슬롯에서 items 직접 추출 (WoW 명시적 처리) ──
  const cartSplit  = { thisWeek: thisWeek?.cart?.items     || [], lastWeek: lastWeek?.cart?.items     || [] }
  const salesSplit = { thisWeek: thisWeek?.sales?.items    || [], lastWeek: lastWeek?.sales?.items    || [] }
  const wishSplit  = { thisWeek: thisWeek?.wishlist?.items || [], lastWeek: lastWeek?.wishlist?.items || [] }
  const custSplit  = { thisWeek: thisWeek?.customer?.items || [], lastWeek: lastWeek?.customer?.items || [] }
  const hasWoW = cartSplit.lastWeek.length > 0 || salesSplit.lastWeek.length > 0

  // ── 2. 기간 표시 ──
  const period = thisWeek?.sales?.period || thisWeek?.cart?.period || ''
  const thisP  = thisWeek?.sales?.period || thisWeek?.cart?.period || period
  const lastP  = lastWeek?.sales?.period || lastWeek?.cart?.period || null
```

- [ ] **Step 2: `cartThisSigma` 참조 수정**

같은 함수 내 `// ── 5. 장바구니 퍼널 ──` 섹션:

```js
// 변경 전
const cartThisSigma = cart?.sigma || {}

// 변경 후
const cartThisSigma = thisWeek?.cart?.sigma || {}
```

- [ ] **Step 3: `splitWeeks` import 유지 확인**

`splitWeeks`는 내부 private 함수이므로 그대로 유지. 변경 없음.

- [ ] **Step 4: 빌드 확인**

```powershell
npm run build
```

기대: `✓ built` (App.jsx에서 아직 구형 호출 방식이라 타입 오류 없음; App.jsx는 다음 Task에서 수정)

- [ ] **Step 5: 커밋**

```bash
git add spao-dashboard-v3/src/utils/metrics.js
git commit -m "refactor(v3): computeAllDerived thisWeek/lastWeek 슬롯 직접 수신으로 변경"
```

---

## Task 9: `App.jsx` — 2주 상태 구조 + 저장/불러오기 UI

**Files:**
- Modify: `spao-dashboard-v3/src/App.jsx`

- [ ] **Step 1: import 추가**

파일 최상단에:

```js
import { saveState, loadState, exportJSON, importJSON } from './utils/storage'
```

- [ ] **Step 2: 빈 주 초기값 상수 추가**

`PARSER_MAP` 상수 아래에:

```js
const EMPTY_WEEK = {
  cart: null, wishlist: null, sales: null, customer: null,
  salesByDate: null, search: null, visit: null, store: null,
}
```

- [ ] **Step 3: 상태 선언 변경**

```js
// 변경 전
const [parsed, setParsed] = useState({
  cart: null, wishlist: null, sales: null, customer: null,
  salesByDate: null, search: null, visit: null, store: null,
})

// 변경 후
const [thisWeek, setThisWeek] = useState(() => loadState()?.thisWeek || { ...EMPTY_WEEK })
const [lastWeek, setLastWeek] = useState(() => loadState()?.lastWeek || { ...EMPTY_WEEK })
const [uploadTarget, setUploadTarget] = useState('this')  // 'this' | 'last'
```

- [ ] **Step 4: localStorage 자동 저장 useEffect 추가**

`useState` 선언 아래에:

```js
useEffect(() => {
  saveState(thisWeek, lastWeek)
}, [thisWeek, lastWeek])
```

- [ ] **Step 5: `handleFile` 수정**

```js
// 변경 전
const handleFile = async (key, parser, file) => {
  ...
  setParsed(prev => ({ ...prev, [key]: data }))
  ...
}

// 변경 후
const handleFile = async (key, parser, file) => {
  setLoading(true)
  setError(null)
  try {
    const rows = await parseSheet(file)
    const data = parser(rows)
    if (uploadTarget === 'last') {
      setLastWeek(prev => ({ ...prev, [key]: data }))
    } else {
      setThisWeek(prev => ({ ...prev, [key]: data }))
    }
  } catch (e) {
    console.error(key, e)
    setError(`${key} 파일 파싱 오류: ${e.message}`)
  }
  setLoading(false)
}
```

- [ ] **Step 6: `handleBulkFiles` 수정**

```js
// 변경 전 마지막 부분
if (Object.keys(updates).length > 0) {
  setParsed(prev => ({ ...prev, ...updates }))
}

// 변경 후
if (Object.keys(updates).length > 0) {
  if (uploadTarget === 'last') {
    setLastWeek(prev => ({ ...prev, ...updates }))
  } else {
    setThisWeek(prev => ({ ...prev, ...updates }))
  }
}
```

- [ ] **Step 7: 파생 계산 useMemo 수정**

```js
// 변경 전
const coreLoaded = CORE_FILES.every(f => parsed[f.key] !== null)

const derived = useMemo(() => {
  if (!coreLoaded) return null
  return computeAllDerived(parsed)
}, [coreLoaded, parsed])

const salesByDateMetrics = useMemo(() => {
  if (!parsed.salesByDate) return null
  return computeSalesByDateMetrics(parsed.salesByDate)
}, [parsed.salesByDate])

const searchMetrics = useMemo(() => {
  if (!parsed.search) return null
  return computeSearchMetrics(parsed.search)
}, [parsed.search])

const period = parsed.salesByDate?.period || parsed.sales?.period || parsed.cart?.period || ''

// 변경 후
const coreLoaded  = CORE_FILES.every(f => thisWeek[f.key] !== null)
const hasLastWeek = CORE_FILES.every(f => lastWeek?.[f.key] !== null)

const derived = useMemo(() => {
  if (!coreLoaded) return null
  return computeAllDerived({
    thisWeek,
    lastWeek: hasLastWeek ? lastWeek : null,
    visit: thisWeek.visit,
    store: thisWeek.store,
  })
}, [coreLoaded, thisWeek, lastWeek, hasLastWeek])

const salesByDateMetrics = useMemo(() => {
  if (!thisWeek.salesByDate) return null
  return computeSalesByDateMetrics(thisWeek.salesByDate)
}, [thisWeek.salesByDate])

const searchMetrics = useMemo(() => {
  if (!thisWeek.search) return null
  return computeSearchMetrics(thisWeek.search)
}, [thisWeek.search])

const period = thisWeek.salesByDate?.period || thisWeek.sales?.period || thisWeek.cart?.period || ''
```

- [ ] **Step 8: 헤더 UI 변경 — 저장/불러오기/주교체 버튼 + 기간 표시 + 업로드 대상 토글**

기존 헤더 내 `<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>` 블록을 아래로 교체:

```jsx
<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
  {/* 주 교체 버튼 */}
  <button onClick={() => {
    if (coreLoaded) {
      setLastWeek(thisWeek)
      setThisWeek({ ...EMPTY_WEEK })
    }
  }} disabled={!coreLoaded} style={{
    padding: '6px 14px', borderRadius: 20, cursor: coreLoaded ? 'pointer' : 'not-allowed',
    background: '#F5F3FF', border: '1px solid #DDD6FE',
    color: coreLoaded ? '#7F77DD' : '#C4B5FD', fontSize: '0.8125rem', fontWeight: 600,
  }} title="이번 주 데이터를 지난 주로 이동하고 이번 주를 초기화합니다">
    📅 주 교체
  </button>

  {/* 저장 */}
  <button onClick={() => exportJSON(thisWeek, lastWeek)} style={{
    padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
    background: '#F0FDF8', border: '1px solid #BBF7D0',
    color: '#1A8060', fontSize: '0.8125rem', fontWeight: 600,
  }}>
    💾 저장
  </button>

  {/* 불러오기 */}
  <label style={{
    padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
    background: '#F8F8F7', border: '1px solid #E8E8E6',
    color: '#6B6B68', fontSize: '0.8125rem', fontWeight: 600,
  }}>
    <input type="file" accept=".json" style={{ display: 'none' }} onChange={async e => {
      const file = e.target.files[0]
      if (!file) return
      try {
        const { thisWeek: tw, lastWeek: lw } = await importJSON(file)
        setThisWeek(tw || { ...EMPTY_WEEK })
        setLastWeek(lw || { ...EMPTY_WEEK })
        e.target.value = ''
      } catch (err) {
        setError(`불러오기 실패: ${err.message}`)
      }
    }} />
    📂 불러오기
  </label>

  <div style={{ width: 1, height: 24, background: '#E8E8E6', margin: '0 2px' }} />

  {/* 업로드 대상 토글 */}
  <div style={{ display: 'flex', background: '#F0F0EE', borderRadius: 20, padding: 2 }}>
    {[['this', '이번 주'], ['last', '지난 주']].map(([val, label]) => (
      <button key={val} onClick={() => setUploadTarget(val)} style={{
        padding: '4px 12px', borderRadius: 18, border: 'none', cursor: 'pointer',
        fontSize: '0.75rem', fontWeight: 600,
        background: uploadTarget === val ? '#378ADD' : 'transparent',
        color: uploadTarget === val ? '#fff' : '#6B6B68',
        transition: 'all 0.15s',
      }}>
        {label}
      </button>
    ))}
  </div>

  <div style={{ width: 1, height: 24, background: '#E8E8E6', margin: '0 2px' }} />

  {/* 일괄 업로드 */}
  <BulkUploadButton onFiles={handleBulkFiles} />
  <div style={{ width: 1, height: 24, background: '#E8E8E6', margin: '0 2px' }} />
  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
    {CORE_FILES.map(({ key, label, parser }) => (
      <UploadButton key={key} label={label} done={uploadTarget === 'last' ? !!lastWeek[key] : !!thisWeek[key]}
        onFile={(file) => handleFile(key, parser, file)} />
    ))}
  </div>
  <div style={{ width: 1, height: 24, background: '#E8E8E6', margin: '0 2px' }} />
  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
    {EXTRA_FILES.map(({ key, label, parser }) => (
      <UploadButton key={key} label={label} done={uploadTarget === 'last' ? !!lastWeek[key] : !!thisWeek[key]}
        onFile={(file) => handleFile(key, parser, file)} />
    ))}
  </div>
</div>
```

- [ ] **Step 9: 기간 표시 배너 수정**

헤더 내 기간 표시 `<div>`:

```jsx
// 변경 전
{period && (
  <div style={{ fontSize: '0.75rem', color: '#6B6B68', marginTop: 3 }}>
    분석 기간: {period}
    {derived?.hasWoW && (
      <span style={{ marginLeft: 10, color: '#378ADD', fontWeight: 600 }}>● WoW 활성</span>
    )}
  </div>
)}

// 변경 후
<div style={{ fontSize: '0.75rem', color: '#6B6B68', marginTop: 3 }}>
  {period
    ? <>이번 주: <strong>{period}</strong></>
    : <span style={{ color: '#A0A09E' }}>이번 주 데이터 없음</span>
  }
  {(lastWeek.sales?.period || lastWeek.cart?.period) && (
    <span style={{ marginLeft: 10 }}>
      | 지난 주: <strong>{lastWeek.sales?.period || lastWeek.cart?.period}</strong>
    </span>
  )}
  {derived?.hasWoW && (
    <span style={{ marginLeft: 10, color: '#378ADD', fontWeight: 600 }}>● WoW 활성</span>
  )}
</div>
```

- [ ] **Step 10: 업로드 안내 페이지 `coreLoaded` 조건 수정**

```js
// 변경 전
const coreLoaded = CORE_FILES.every(f => parsed[f.key] !== null)

// 이미 Step 7에서 수정했으므로 확인만: coreLoaded 올바르게 thisWeek 기반인지 체크
```

`CORE_FILES.map` 안 `parsed[key]` → `thisWeek[key]` 로 변경 (업로드 안내 화면의 뱃지):

```jsx
// 변경 전
{ALL_FILES.map(({ key, label }) => (
  <div key={key} style={{
    ...
    background: parsed[key] ? '#F0FDF8' : '#F8F8F7',
    ...
    color: parsed[key] ? '#1A8060' : '#A0A09E',
  }}>
    {parsed[key] ? '✓ ' : ''}{label}

// 변경 후
{ALL_FILES.map(({ key, label }) => (
  <div key={key} style={{
    ...
    background: thisWeek[key] ? '#F0FDF8' : '#F8F8F7',
    ...
    color: thisWeek[key] ? '#1A8060' : '#A0A09E',
  }}>
    {thisWeek[key] ? '✓ ' : ''}{label}
```

- [ ] **Step 11: 빌드 확인**

```powershell
cd "C:\Users\han_jiwoong\Desktop\agent\spao-dashboard-v3"
npm run build
```

기대: `✓ built` (에러 없음)

- [ ] **Step 12: 커밋**

```bash
git add spao-dashboard-v3/src/App.jsx
git commit -m "feat(v3): 2주 데이터 아키텍처 — thisWeek/lastWeek 상태, localStorage 자동저장, JSON 백업/복원 UI"
```

---

## Task 10: 최종 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: V3 개발 서버 실행**

```powershell
cd "C:\Users\han_jiwoong\Desktop\agent\spao-dashboard-v3"
npm run dev
```

브라우저에서 `http://localhost:5173` 열기

- [ ] **Step 2: 체크리스트**

| 항목 | 확인 방법 |
|------|-----------|
| V2 정상 동작 유지 | `spao-dashboard-v2`에서 `npm run dev` 실행, 기존과 동일 |
| 결제 완료 상품 수 레이블 | KPI 카드 2번째 타이틀 확인 |
| PV 갭 결품 코멘트 | L2 탭 → PV 대비 전환 미흡 상품 섹션 하단 |
| IP 자동감지 | 상품실적 파일 업로드 후 L2 IP 콜라보 차트 확인 |
| 복종 실적 테이블 | L2 탭 최하단 아이템×성별 히트맵 테이블 |
| QuickSummary 3열 | L1 탭 KPI 카드 아래 매출성과/채널현황/고객행동 3열 |
| 이상감지 뱃지 | WoW 데이터 없을 땐 비표시, 있을 땐 조건별 표시 |
| 저장 버튼 | 클릭 시 JSON 파일 다운로드 |
| 불러오기 버튼 | JSON 파일 선택 시 데이터 복원 |
| 주 교체 버튼 | 이번 주 데이터 있을 때 활성, 클릭 시 lastWeek로 이동 |
| 업로드 대상 토글 | "지난 주" 선택 후 업로드 시 lastWeek에 저장 |
| WoW 활성 | 이번주 + 지난주 모두 있으면 "WoW 활성" 뱃지 및 차이값 표시 |
| localStorage 유지 | 브라우저 새로고침 후 데이터 유지 |

- [ ] **Step 3: 최종 커밋**

```bash
cd "C:\Users\han_jiwoong\Desktop\agent"
git add spao-dashboard-v3/
git commit -m "feat: SPAO 대시보드 V3 완성 — IP자동감지·복종실적·헬스체크개편·2주데이터아키텍처"
```

---

## 주의사항

- **V2는 절대 수정하지 않는다.** 모든 작업은 `spao-dashboard-v3/` 안에서만.
- Task 8(`computeAllDerived` 시그니처 변경)을 Task 9(App.jsx) 전에 완료해야 한다 — 순서 의존성.
- `storage.js`의 `loadState()`는 `useState` lazy initializer 안에서만 호출 (렌더 중 호출 금지).
- `exportJSON`은 `document.createElement('a')` 방식 — SSR 환경에서는 동작하지 않지만 이 앱은 클라이언트 전용이므로 문제 없음.
