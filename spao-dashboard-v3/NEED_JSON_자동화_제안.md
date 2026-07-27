# N.E.E.D JSON 샘플 검토 & 자동화 제안

**작성일**: 2026-07-07 · **기준**: 카카오톡으로 전달받은 실제 수집 JSON 14종 검토
**관련**: `supabase/daily_staging_tables.sql`(본 문서 결과로 생성한 검증 테이블), `데이터자동화_멀티브랜드_요청서.md`

---

## 0. ★ 가장 중요한 발견

전달받은 JSON은 **"NEED 화면을 사람이 다운로드한 결과"가 아니라, 이미 자동으로 NEED 내부 API를 호출해 수집하는 도구의 출력물**입니다. 근거:

- 파일명 규칙: `spao-bi-collection-{endpointId}-{timestamp}.json` — 엔드포인트 단위로 기계적으로 저장됨
- 모든 파일에 **`entries[].collectedAt`, `_query_start`, `_query_end`, `_source_endpoint`** 같은 **수집 메타데이터**가 자동으로 붙어 있음(사람이 엑셀 다운로드하면 안 생기는 정보)
- `mergedRows`라는 **이미 평탄화된 배열**까지 별도로 제공 — 적재 편의를 고려해 설계된 흔적

→ 즉 **"어떻게 자동으로 가져올까"는 이미 상당 부분 해결돼 있고**, 우리가 할 일은 **"이 JSON을 표준 스키마로 어떻게 받을까"**로 좁혀집니다. (이 수집기가 누가/어떻게 운영 중인지는 확인 필요 — 15장 참고)

---

## 1. 확인된 엔드포인트 14종 & 내부 스키마 매핑

| endpointId | NEED 라벨 | 그레인 | 우리 데이터셋 매핑 | 신규 검증 테이블 |
|---|---|---|---|---|
| `salesDaily` | 기간별 매출분석 | 일×매체 | **salesByDate** (거의 완벽 매치) | `daily_sales_by_date` |
| `itemAggrList` | 상품실적 | 일×매체×상품 | **sales** | `daily_sales` |
| `cartItemList` | 장바구니 분석 | 일×단품 | **cart** | `daily_cart` |
| `wishItemList` | 관심상품 분석 | 일×상품 | **wishlist** | `daily_wishlist` |
| `mbrSales` | 회원 매출분석 | 일×성별×연령 | **customer** | `daily_customer` |
| `visitSnapshot` | 방문지표 | 시간대(당일+전일 비교 포함) | **visit** | `daily_visit_hourly` |
| `shopContributeHourly` | 매장 종합실적 | 시간대×매체×매장 | **store** | `daily_store_hourly` |
| `searchKeywordDaily` | 검색실적 | 일×검색어 | **search** | `daily_search` |
| `couponPerf` | 쿠폰실적 | 일×프로모션 | **coupon** | `daily_coupon` |
| `itemCategoryRank` | 상품지표 | 일×상품×카테고리 | (신규, 보강용) | `daily_item_category_rank` |
| `shopSummary` | 매장지표 | 일 요약(매체 구분 없음) | store 검증 보조 | *(테이블 미생성 — 아래 3장)* |
| `couponDashboard` | 쿠폰지표 | 프로모션 현재 스냅샷 | coupon 검증 보조 | *(미생성)* |
| `salesHourly` | 시간대별 매출분석 | 시간대 | 신규(확장 후보) | *(미생성)* |
| `mbrDashboard` | 회원지표 | 월별 그룹 카운트 | 신규(확장 후보) | *(미생성)* |

> 10종은 실제 검증 테이블(`daily_*`)을 `supabase/daily_staging_tables.sql`에 만들었습니다. 나머지 4종은 그레인이 달라(요약/스냅샷/월별) 우선순위를 낮춰 이번엔 테이블을 만들지 않았습니다 — 필요해지면 같은 패턴으로 추가하면 됩니다.

## 2. 필드 매핑 핵심 (원본 컬럼명을 그대로 사용한 이유)

`daily_staging_tables.sql`의 컬럼명은 **NEED 원본 필드명을 거의 그대로** 썼습니다(`ord_amount`, `realord_count` 등). 이유:
- 매핑 실수를 줄임(내부 표준명으로 억지로 바꾸다 생기는 오류 방지)
- 이 테이블은 **"검증·조회용 스테이징"** 이지 화면이 읽는 곳이 아님 — 화면(`weekly_snapshots`)으로 갈 땐 별도 변환 단계에서 우리 표준 필드명(`PRD_데이터연동.md §8`)으로 바꾸면 됨

### ⚠️ 확인이 필요한 부분 (100% 확신 못한 곳)
- `itemAggrList`(상품실적): 샘플이 커서 일부만 봤습니다 — `real_sale_amount`, `ord_count`, `ord_qty` 같은 판매수량/금액 필드가 실제로 어디 있는지 **전체 행 1개를 더 확인**하면 좋습니다.
- `daily_visit_hourly`: 원본 파일 하나에 **당일 24행 + 전일 비교용 24행(`_p` 접미사)** 이 섞여 있습니다. 적재 시 **당일 행만** 골라 넣어야 합니다(전일은 같은 테이블을 날짜로 셀프 조인하면 되므로 중복 저장 불필요).
- `shopSummary`는 **매체(media) 구분이 없는 전체 합산**이라 `store` 스키마(media 필수)와 그레인이 다릅니다 — 검증 보조로만 쓰고 주 매핑은 `shopContributeHourly`(매체 있음)로 하는 걸 권장.
- `itemCategoryRank`: 상품 하나가 여러 카테고리(대/중/소분류)에 동시 소속돼 **행이 자연스럽게 중복**됩니다(오류 아님) — PK를 `(item_no, small_class_disp_category_no)`로 잡아 처리했습니다.

## 3. 자동화 방향 제안 (반영됨)

```
[기존 수집기] 매일 endpointId 별 JSON 생성(이미 동작 중으로 추정)
   ↓ (드롭 또는 직접 전송)
[Supabase Storage: incoming/{endpointId}/{date}.json]  또는  [우리 적재 API로 POST]
   ↓
[Edge Function: need-ingest]
   1. endpointId 로 라우팅 → 대상 daily_* 테이블 결정
   2. mergedRows 배열을 그대로 사용(이미 평탄화돼 있어 별도 파싱 불필요)
   3. stat_date 산출: 행에 날짜가 있으면 그 값, 없으면 entry.endDate 사용
   4. 타입 캐스팅 + 기본 검증(null/음수 등)
   5. (자연키 + stat_date) 기준 upsert(ON CONFLICT DO UPDATE) — 같은 날 재수집 시 멱등
   6. 실패 시 error 로그 + 알림
[daily_* 스테이징 테이블] ← SQL로 바로 검증·조회 가능 (2장의 예시 쿼리)
   ↓ (선택, Phase 2)
[weekly_snapshots 로 롤업 변환] → 대시보드 화면(기존, 무변경)
```

**좋은 점**: `mergedRows`가 이미 **`{endpointId, date별 원본 필드} + 수집 메타`** 형태로 나오기 때문에, Edge Function은 사실상 **"라우팅 + upsert"만** 하면 됩니다. 엑셀 파싱(`parseExcel.js` 이식) 같은 무거운 작업이 필요 없습니다 — **JSON을 이미 표준화해서 주는 최상의 케이스**입니다.

## 4. Supabase에 JSON을 자동으로 적치받는 방법 (구체안)

### 방법 A — 파일 드롭 (권장, 앞서 설계와 동일선상)
- 수집기가 매일 `incoming/{endpointId}/{date}.json`으로 Supabase Storage에 업로드(쓰기 전용 자격)
- Storage 업로드 이벤트 또는 pg_cron 폴링 → Edge Function 실행 → 3장 파이프라인

### 방법 B — 직접 POST (수집기 쪽에서 바로 보낼 수 있으면 더 간단)
```
POST https://<project>.functions.supabase.co/need-ingest
Headers: Authorization: Bearer <서버 발급 토큰>
Body: 이 대화에서 본 JSON 그대로(엔벨로프 통째로)
```
- 수집기가 이미 파일을 "만들고 있다"면, **파일 저장 대신 이 엔드포인트로 그대로 POST하게만 바꾸면** 끝 — 중간 파일 단계 자체가 생략됩니다. **가장 간단한 경로**.

### 공통
- 인증: Edge Function 내부에서 `service_role`로 Postgres에 씀(요청 쪽엔 별도 발급 토큰만 확인)
- 멱등: `(자연키, stat_date)` upsert이므로 같은 날 여러 번 보내도 안전
- 이 적재는 **읽기 검증 테이블(`daily_*`)만** 채웁니다. 화면에 반영하려면 **롤업 변환 단계**(Phase 2)가 별도로 필요합니다 — 지금은 "검증·교차확인"이 목적이므로 여기까지가 1단계 범위입니다.

## 5. 수용 기준 (이번 범위)
- [ ] `supabase/daily_staging_tables.sql` 실행 완료 (10개 테이블 생성)
- [ ] 실제 JSON 1건씩을 수동으로 넣어(SQL INSERT 또는 Edge Function 테스트) 정상 적재 확인
- [ ] 2장의 "확인 필요" 항목(itemAggrList 전체 필드, visitSnapshot 당일/전일 분리) 실제 검증
- [ ] Edge Function `need-ingest` 라우팅 로직 구현(다음 단계)

## 6. 확인 부탁드릴 것
1. **이 수집기, 누가/어떻게 만들었나요?** (사내 개발자의 자체 스크립트? 브라우저 확장? 이미 스케줄러로 매일 도는 중인가요, 아니면 수동 실행인가요?) — 이걸 알면 3~4장의 "적재 방법"을 그 수집기에 딱 맞게 다시 좁힐 수 있습니다.
2. `itemAggrList` 원본 파일에서 **행 1개 전체(모든 필드)** 를 다시 확인할 수 있을까요? (판매수량/금액 필드 위치 확정용)
