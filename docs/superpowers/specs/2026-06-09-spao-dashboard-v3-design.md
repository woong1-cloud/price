# SPAO 대시보드 V3 설계 스펙

**작성일:** 2026-06-09  
**기반:** spao-dashboard-v2 (유지, 롤백 가능)  
**결과물:** spao-dashboard-v3/ (신규 디렉토리)

---

## 변경 범위 요약

| # | 항목 | 크기 | 파일 |
|---|------|------|------|
| 1 | KPI "주문건수" → "결제 완료 상품 수" 레이블 수정 | 소 | metrics.js |
| 2 | PV 전환미흡 테이블에 결품 코멘트 추가 | 소 | L2_ProductAnalysis.jsx |
| 3 | IP/콜라보 자동 감지 (대괄호 기반) | 소 | categorize.js |
| 4 | 아이템×성별 복종 실적 테이블 신규 | 중 | L2_ProductAnalysis.jsx, metrics.js |
| 5 | 헬스체크 상단 요약 UI 전면 개편 | 대 | L1_HealthCheck.jsx |
| 6/7 | 2주 데이터 아키텍처 (localStorage + JSON 백업) | 대 | App.jsx, storage.js (신규) |

---

## #1 — 주문건수 레이블 수정

**위치:** `src/utils/metrics.js` → `computeAllDerived` KPI 배열

**변경:**
```js
// 변경 전
{ id: 'orderCnt', label: '주문건수', ... }

// 변경 후
{ id: 'orderCnt', label: '결제 완료 상품 수', ... }
```

**이유:** 현재 값은 상품실적_663의 `결제 완료 수량` (SKU별 합산)으로, 고유 거래건(주문건수)이 아니라 결제 완료된 상품 수량의 합계임. "주문건수(거래건)"와 혼동 방지.  
참고: 기간별매출분석의 `실주문건수`(19,704)는 실제 거래건 — 두 값이 다름.

---

## #2 — PV 전환미흡 결품 코멘트

**위치:** `src/components/L2_ProductAnalysis.jsx` → `PVGapTable` 컴포넌트 하단 힌트

**변경 전:**
> 💡 갭이 큰 상품 = 사람들은 보는데 사지 않는다 → 가격·재고·리뷰·상세이미지를 점검하세요.

**변경 후:**
> 💡 갭이 큰 상품은 **상세페이지 품질(이미지·가격·리뷰)** 또는 **재고 결품 여부**도 함께 확인하세요. 결품 상품은 PV가 높아도 전환이 불가능합니다.

---

## #3 — IP/콜라보 자동 감지

**위치:** `src/utils/categorize.js` → `getIP()` 함수 전면 교체

### 알고리즘

1. 상품명에서 `[xxx]` 패턴 모두 추출 (정규식 `/\[([^\]]+)\]/g`)
2. 각 항목을 아래 제외 규칙으로 필터링:
   - **숫자 포함** → 제외 (2pack, UPF50, 3SET 등)
   - **짧은 영문 단어** (단어 경계 포함, ≤10자) → 제외 목록: COOL, WARM, ACTIVE, COMFORT, BASIC, FIT, SLIM, UV, UPF, DRY, ECO, DAILY
   - **세그먼트어** → 제외 목록: 키즈, 주니어, 여아, 남아, 어덜트, 여성, 남성, 공용
   - **소재/유형어** → 제외 목록: 수피마코튼, 데일리지, 기능성, 워밍, 유기농, 에코, 홈웨어, 스포츠
3. 남은 항목이 있으면 → 기존 IP 매핑 테이블에서 표시명 조회
   - 매핑 있으면 → 해당 표시명 반환 (예: `피카츄` → `피카츄/포켓몬`)
   - 매핑 없으면 → 추출된 텍스트 그대로 반환 (예: `마이페이브아카이브`)
4. 남은 항목 없으면 → `null` 반환

### 기존 IP_RULES 처리
기존 `IP_RULES` 배열은 **표시명 매핑 테이블**로 역할 변경.  
`getIP(name)` 반환값: 표시명 문자열 또는 null (기존 인터페이스 유지).

---

## #4 — 아이템×성별 복종 실적 테이블

**위치:**
- `src/utils/metrics.js` → `computeAllDerived` 반환값에 `itemGenderMatrix` 추가
- `src/components/L2_ProductAnalysis.jsx` → `ItemGenderTable` 신규 컴포넌트, L2 최하단에 추가

### 데이터 계산 (`itemGenderMatrix`)

```
salesSplit.thisWeek 아이템들을 순회:
  parseStyleCode(item.styleCode) → { itemName, gender }
  map[itemName][gender] += item.realAmt
  map[itemName]['sku'] += 1 (unique styleCode 기준)

결과:
  rows = [{ itemName, 여성, 남성, 키즈, 공용, 콜라보, total, skuCount }, ...]
  정렬: total 내림차순
  기타 행은 최하단 고정
```

### 테이블 레이아웃

| 품목명 | 여성 | 남성 | 키즈 | 공용 | 콜라보 | **합계** | SKU수 |
|--------|------|------|------|------|--------|--------|-------|
| 반팔 티셔츠 | 1.23억 | 0.87억 | 0.45억 | — | — | **2.55억** | 124개 |

- 셀 배경: 히트맵 (`heatColor` 재사용), 기준은 전체 매트릭스 최대값
- 값 없는 셀: `—` (회색)
- 합계 열: bold, 연청 배경

---

## #5 — 헬스체크 상단 UI 전면 개편

### 변경 범위
기존 `L1_HealthCheck.jsx`의 **상단 요약 영역(사용자/MD/운영 관점 타일 3개)만** 교체.  
아래 모든 상세 섹션(채널별 차트, 장바구니 퍼널, 고객 세그먼트, 방문실적, 매장실적, 검색실적)은 **그대로 유지**.

### 새 상단 구조

```
┌──────────────────────────────────────────────────────────────┐
│  실주문금액  │  결제완료건  │  장바구니  │  관심찜  │  구매고객  │  (이상감지 뱃지)
│  6.65억     │  19,981건   │  65,434건 │  12,439건│  11,103명 │
└──────────────────────────────────────────────────────────────┘
┌─────────────────┬──────────────────┬──────────────────────────┐
│  💰 매출 성과    │  📡 채널 현황     │  👥 고객 행동             │
│                 │                  │                          │
│  취소율 X.X%    │  채널별 실주문금액 │  신규 X% / 재구매 X%     │
│  AOV X만원      │  막대 + 비중      │  성별 분포 (여/남/키즈)   │
│  할인율 X.X%    │  전환율 top채널   │  장바구니 전환율 X%       │
│  혜택금액 X.X억 │  방문UV 요약      │  회원/비회원 비중         │
└─────────────────┴──────────────────┴──────────────────────────┘

── 기존 상세 섹션 유지 ──────────────────────────────────────────
채널별 실주문금액 차트 (donut + bar)
장바구니 퍼널
고객 세그먼트 상세 (신규/재구매, 성별×연령)
방문실적 (선택 업로드 시)
매장실적 (선택 업로드 시)
검색 실적 분석 (선택 업로드 시)
```

### 섹션 타이틀 변경
| 기존 | 변경 |
|------|------|
| 사용자 관점 | 💰 매출 성과 |
| MD 관점 | 📡 채널 현황 |
| 운영 관점 | 👥 고객 행동 |

### KPI 이상감지 인라인 뱃지
상단 KPI 행 오른쪽 끝에 인라인으로 표시:
- `🔴 매출 급락 -12%` (wow < -10%)
- `🟡 전환율 저조 3.2%` (cartConvRate < 5%)
- `🟢 매출 급등 +24%` (wow > 20%)

---

## #6/#7 — 2주 데이터 아키텍처

### 상태 구조 변경

```js
// 기존 (V2)
const [parsed, setParsed] = useState({ cart, wishlist, sales, ... })

// V3
const [thisWeek, setThisWeek] = useState({ cart, wishlist, sales, ... })
const [lastWeek, setLastWeek] = useState({ cart, wishlist, sales, ... })
```

### 업로드 플로우

```
새 파일 업로드 (벌크 또는 개별):
  1. thisWeek에 데이터가 이미 있는 경우:
     → 사용자에게 확인: "기존 이번 주 데이터를 지난 주로 이동하고 새 데이터를 이번 주로 설정할까요?"
     → 확인 시: setLastWeek(thisWeek), setThisWeek(newData)
     → 취소 시: setThisWeek(prev => merge(prev, newData))  // 같은 주 추가 업로드
  2. thisWeek이 비어 있는 경우:
     → setThisWeek(newData) (단순 세팅)
```

### WoW 계산

`computeAllDerived`가 `thisWeek` + `lastWeek` 두 슬롯을 직접 받도록 변경:

```js
// V2: splitWeeks(items)가 period 필드로 분리
// V3: thisWeek/lastWeek 슬롯을 직접 전달 → 더 명확하고 신뢰성 높음

computeAllDerived({
  thisWeek: { cart, wishlist, sales, customer, ... },
  lastWeek: { cart, wishlist, sales, customer, ... },
  visit, store  // 선택값 (thisWeek에서)
})
```

내부에서 `sumField(thisWeek.sales.items, 'realAmt')` vs `sumField(lastWeek.sales.items, 'realAmt')` 직접 비교.

### localStorage 자동 저장

```
저장 키:
  spao_v3_thisWeek  → JSON.stringify(thisWeek)
  spao_v3_lastWeek  → JSON.stringify(lastWeek)

저장 시점: setThisWeek / setLastWeek 호출 직후 useEffect

로드 시점: 앱 초기화 시 (useState 초기값으로 복원)
  → 날짜 정보 포함 시 "저장된 데이터: 06-01~06-07" 표시
```

### 신규 파일: `src/utils/storage.js`

```js
export function saveState(thisWeek, lastWeek) { ... }
export function loadState() → { thisWeek, lastWeek } | null
export function exportJSON(thisWeek, lastWeek) // 파일 다운로드
export function importJSON(file) → Promise<{ thisWeek, lastWeek }>
```

### UI 변경 (App.jsx 헤더)

```
[📁 일괄업로드]  [💾 저장]  [📂 불러오기]
이번주: 06-01~06-07  |  지난주: 05-25~05-31
```

- `💾 저장` 클릭 → `spao_dashboard_20260609.json` 다운로드
- `📂 불러오기` 클릭 → JSON 파일 선택 → 상태 복원
- 기간 표시는 `thisWeek.salesByDate?.period` 또는 `thisWeek.sales?.period`에서 추출

---

## V3 생성 방법

1. `spao-dashboard-v2/` 전체 복사 → `spao-dashboard-v3/`
2. `package.json`의 name을 `spao-dashboard-v3`로 변경
3. V3 디렉토리에서 위 변경사항 전부 적용
4. V2는 수정하지 않음

---

## 구현 순서 (권장)

1. V3 디렉토리 생성 (V2 복사)
2. #1 레이블 + #2 코멘트 + #3 IP 자동감지 (소형 3개 먼저)
3. #4 복종 실적 테이블
4. #5 헬스체크 상단 UI 개편
5. #6/#7 데이터 아키텍처 (storage.js + App.jsx 리팩터)
6. 빌드 검증
