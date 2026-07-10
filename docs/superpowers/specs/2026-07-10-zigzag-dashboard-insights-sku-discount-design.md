# 지그재그 대시보드 v2 — 인사이트 패널 · SKU 드릴다운 · 할인율 요약

작성일: 2026-07-10
기반: [2026-07-10-zigzag-dashboard-design.md](./2026-07-10-zigzag-dashboard-design.md) (v1 대시보드, 이미 구현·실데이터 연결 완료)

## 배경

v1 대시보드가 실제 BigQuery 데이터로 검증까지 끝난 상태에서, UI/기능을 한 단계 고도화한다.
자사몰 대시보드(spao-dashboard-v3)의 `L3_ActionPanel`(자동 인사이트) 패턴을 참고해
MD가 이슈만 보고 바로 다음 액션을 취할 수 있게 하고, 재고/할인 관련 두 섹션의
실무 활용도를 높인다.

## A. MD 인사이트 패널 (요약 + 액션)

### 위치
기간 선택기 바로 아래, 섹션 1(매출 스코어보드) **위**에 독립된 블록으로 배치한다.
기존 1~8번 섹션 넘버링은 건드리지 않는다. 사이드바(`SectionNav`) 최상단에도
"🔔 인사이트" 항목을 새로 추가해 다른 8개 섹션과 구분되게 표시한다(앵커 id:
`section-insights`).

이 위치를 고른 이유:
- 로그인 후 스크롤 없이 바로 보여 "이슈만 보고 즉시 조치" 요구를 만족시킨다.
- 이미 로드된 sales/products/claims API 응답만으로 계산하므로 **추가 API 호출이
  없다** — 클라이언트에서 순수 집계만 수행.
- 추후 AI 에이전트 연동 시 이 블록에 버튼 하나만 추가하면 되는 구조로 설계한다
  (아래 "AI 훅포인트" 참고).

### v1 규칙 (하드코딩, 향후 설정화 가능)

순수함수 `computeInsights({ scoreboard, claims, velocity })`
(`src/utils/insights.js`)가 `{ id, severity, title, desc, action }[]` 를 반환한다.

| 심각도 | id | 조건 |
|---|---|---|
| danger | `revenue_drop` | 실주문금액 전기간대비 -10% 이하 |
| danger | `cancel_rate_high` | 취소반품율 절대치 12% 이상, 또는 전기간대비 +30%p 이상 급등 |
| warning | `reorder_many` | 리오더 후보(재고 7일 이내 소진 예상) SKU 5개 이상 |
| warning | `claim_reason_concentrated` | 특정 클레임 사유가 전체 클레임의 40% 이상 |
| warning | `coupon_seller_spike` | 쿠폰 브랜드(셀러) 부담액 전기간대비 +20% 이상 |
| success | `revenue_spike` | 실주문금액 전기간대비 +20% 이상 |
| success | `cancel_rate_down` | 취소반품율 전기간대비 하락 |
| info | `category_skew` | 특정 카테고리 매출 비중 40% 이상 |

콜라보(IP) 관련 규칙은 넣지 않는다 — 지그재그 채널에서는 콜라보 관리가 주요
지표가 아니라는 피드백 반영.

### UI

- 상단에 심각도별 배지 요약(예: "즉시조치 1건 · 주의 2건").
- 각 인사이트는 카드로: 아이콘+심각도 배지, 제목, 설명(수치 포함), "→ 액션" 줄.
- 인사이트가 하나도 없으면 "🎉 특이 신호 없음" 안내.
- 카드 클릭 시 관련 섹션(예: `revenue_drop`→섹션1, `reorder_many`→섹션3)으로
  부드러운 스크롤 — `SectionNav`가 이미 가진 `scrollIntoView` 패턴 재사용.

### AI 훅포인트 (이번 범위 아님, 자리만 마련)

카드 리스트 위에 "AI 코멘트 생성" 버튼을 비활성(또는 "준비 중" 툴팁) 상태로
배치해둔다. 나중에 이 버튼이 활성화되면 동일한 `{severity,title,desc,action}[]`
형태를 AI가 생성해 규칙기반 결과와 나란히 보여주거나 대체하는 구조로 확장한다.
이번 스펙에서는 버튼 배치까지만 하고 실제 AI 연동은 별도 스펙으로 분리한다.

## B. 재고 대비 판매 속도 — SKU 드릴다운 + 엑셀 내보내기

### 실데이터로 확인한 조인 키

BigQuery에서 직접 검증 완료:
- `orders.product_item_id` = `products.items_detail[].id` (완전 일치, SKU 단위 조인키)
- `products.items_detail[].inventory.quantity` = 그 SKU의 남은 재고
- `products.items_detail[].name` = `"(19)BLACK/S(085)"` 형식의 옵션명(색상/사이즈)
- `orders.product_option_detail_list` = `[{name:"색상",value:"(19)BLACK"},{name:"사이즈",value:"S(085)"}]`
  형태의 구조화된 옵션 정보 (표시용으로 `items_detail[].name`보다 깔끔하게 쓸 수 있음)

### 신규 집계 함수

`skuVelocity(orders, products, periodDays)` (`src/utils/metrics.js`에 추가):
- `orders`를 `product_item_id` 기준으로 그룹핑해 SKU별 판매수량 계산
- `products[].items_detail[]`와 `id` 기준 조인해 SKU별 재고 확보
- 상품 단위 기존 `stockVelocity()`와 동일한 형태(`perDay`, `daysOfStock`,
  `reorderFlag`)를 SKU 단위로 반환, 단 `optionName`, `product_item_id` 필드 추가
- 기존 `stockVelocity()`(상품 단위 요약)는 그대로 유지 — 표의 기본 행은 지금처럼
  상품 단위로 보여주고, 펼쳤을 때만 SKU 단위 데이터를 쓴다

### UI

- "재고 대비 판매 속도 · 리오더 후보" 표의 각 행 앞에 ▸ 토글 추가.
- 클릭하면 그 상품의 SKU 목록이 서브테이블로 펼쳐짐: 옵션명 / 일판매속도 /
  재고 / 소진예상일. 리오더 필요 SKU(7일 이내)는 배지로 강조.
- 행 오른쪽에 "엑셀로 내보내기" 아이콘 버튼 — 펼친 상품의 SKU 표를 즉시
  `.xlsx`로 다운로드(브라우저에서 `xlsx` 패키지의 `XLSX.writeFile` 사용, 서버
  왕복 없음).
- 표 헤더에 "리오더 후보 전체 내보내기" 버튼 — 펼치지 않아도 소진임박 SKU
  전체(모든 상품 통합)를 한 번에 엑셀로 받을 수 있음.
- 엑셀 컬럼: 상품명 / 옵션 / 일판매속도 / 재고 / 소진예상일 / 리오더여부.

## C. 정가 대비 실판매가 — 전체 할인율 요약

기존 상품별 테이블은 그대로 두고, 그 위에 요약 스탯 카드 2개를 추가한다.

- **매출가중 평균 할인율**: `Σ(할인율 × 매출) / Σ매출` — 단순 평균보다 실제
  금액 임팩트를 반영하는 지표라 우선 노출.
- **단순 평균 할인율**: 상품 개수 기준 평균.
- 보조 지표로 "30% 이상 할인 상품 N개" 한 줄 추가.

`priceVsOriginal()` 결과를 받아 클라이언트에서 계산(추가 API 불필요) —
`utils/metrics.js`에 `priceDiscountSummary(priceRows)` 순수함수로 분리해 테스트
가능하게 한다.

## 범위 밖 (이번 스펙에 포함 안 함)

- AI 에이전트 실제 연동 (버튼 자리만 마련)
- 인사이트 규칙 임계값의 설정 UI/DB화 (지금은 코드 상수)
- SKU 드릴다운의 서버사이드 엑셀 생성 (전량 클라이언트 생성으로 충분한 규모)

## 테스트

- `computeInsights()`: 각 규칙 조건 충족/미충족 케이스, 콜라보 규칙 없음 확인
- `skuVelocity()`: product_item_id 조인, reorderFlag 계산, 재고 없는 SKU 처리
- `priceDiscountSummary()`: 매출가중 평균 vs 단순평균 차이 나는 케이스
