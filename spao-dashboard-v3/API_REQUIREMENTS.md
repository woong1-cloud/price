# 데이터 자동연동 요구사항 정의서 (개발팀 전달용)

> **목적**: 현재 "매주 사람이 엑셀을 수기 업로드"하는 방식을, **자동 데이터 연동(API / 데이터파이프라인)**으로 바꾸기 위한 요구사항과 **데이터 스키마(계약)**를 정의한다.
> **핵심 원칙**: 대시보드는 이미 각 엑셀을 **정규화된 JSON 구조**로 변환해 쓰고 있다. 그 구조를 그대로 API 계약으로 삼으면 **대시보드를 거의 고치지 않고** 자동연동이 가능하다.

---

## 1. 배경 & 목표

- **현행**: BO(백오피스)에서 매주 여러 종류의 엑셀을 내려받아 → 대시보드에 수기 업로드 → 자동 분석.
- **문제**: 사람이 매주 반복, 누락·실수 위험, 실시간성 부족.
- **목표**: BO/데이터 소스에서 **정해진 주기로 자동으로** 동일 데이터를 대시보드(또는 공용 DB)에 적재.
- **성공 기준**: 사람이 손대지 않아도 매주 대시보드가 최신 주차로 갱신되고, 수기 업로드와 **수치가 일치**한다.

---

## 2. 연동 방식 3가지 옵션 (개발팀과 택1)

| 옵션 | 설명 | 장점 | 단점 | 추천 |
|---|---|---|---|---|
| **A. Push (BO→우리)** | BO/ETL이 주차별 데이터를 **정해진 JSON으로 우리 적재 엔드포인트(또는 DB)에 직접 upsert** | 기존 대시보드 구조(weekly_snapshots) 거의 그대로 재사용. 가장 빠름 | BO 측 개발 필요 | ⭐ **1순위(단기)** |
| **B. Pull (우리→BO)** | 우리가 BO가 제공하는 **읽기 API**를 스케줄러로 가져와 적재 | 우리가 주도, BO는 API만 제공 | BO API 스펙·인증 필요, 스케줄러 인프라 필요 | 2순위 |
| **C. 공용 DB/웨어하우스 + 뷰(Redash식)** | BO 데이터를 **정규화 테이블**로 적재하고 대시보드가 DB/뷰를 직접 조회 | 확장성·재사용성 최고, Redash 등 BI 병행 가능 | 설계·구축 비용 큼, 대시보드 데이터 접근부 재작성 | 3순위(중장기) |

> **권장 로드맵**: **단기 = A**(기존 구조 재활용으로 빠르게 자동화) → **중기 = C**(정규화 테이블로 이행, Redash 병행). B는 BO가 이미 API를 제공할 때.

---

## 3. 권장 아키텍처 (옵션 A 기준)

```
[BO / ETL]
  └─ 주차 단위로 데이터셋 10종을 우리 "표준 JSON"으로 변환
        ↓ (HTTPS, 인증키)
[적재 엔드포인트 또는 직접 DB upsert]
  └─ weekly_snapshots(week_key 기준 upsert)  ← 같은 주는 덮어씀(멱등)
        ↓
[대시보드]  ← 변경 거의 없음. 파싱 단계만 건너뛰고 바로 사용
```

- **저장 위치**: 현재 Supabase `weekly_snapshots` 테이블 (1 주 = 1 행, `week_key` 유니크).
- **payload 형태**: 아래 4~6장에서 정의하는 **표준 JSON**(현재 대시보드 내부 구조와 동일).
- **대시보드 변경 최소화**: 지금은 `엑셀 → 파서 → payload`인데, 자동연동은 `BO → payload`로 **파서만 건너뛴다.** 따라서 BO가 만들 JSON은 **파서의 출력과 1:1로 동일**해야 한다.

---

## 4. 공통 규칙 (모든 데이터셋 공통 — 반드시 지킬 것)

1. **주차 식별 (week_key)**: 한 번의 연동 = 한 주(week) 데이터. 각 전송에 아래 메타 포함.
   | 필드 | 예시 | 규칙 |
   |---|---|---|
   | `week_key` | `2026-W23` | ISO 주차 키(연-주). 같은 주 재전송 시 **덮어쓰기(upsert)** |
   | `week_label` | `6월 1주` | 화면 표시용 한국어 라벨 |
   | `week_start` | `2026-06-01` | 해당 주 **월요일** (KST) |
   | `week_end` | `2026-06-07` | 해당 주 **일요일** (KST) |
   > 키 산식 불일치를 막기 위해, **BO는 `week_start`(월요일)만 정확히 보내고 `week_key`는 우리 유틸(`weekKey.js`)로 산출**하는 것을 권장.
2. **날짜 형식**: `YYYY-MM-DD` (예: `2026-06-03`). 타임존 **KST 기준**.
3. **매체(media) 표준값**: `MOBILE`, `APP`, `PC` **3종만** (대문자 고정). 그 외 값(`전체`, `코드값없음`)은 **보내지 말 것**(집계 오염).
4. **단위**: 금액 = **원(정수)**, 건/명/수량 = **정수**, 비율 = **숫자 %** (예: 이탈률 `38.2`, 38.2% 의미). 천단위 콤마·문자 금지(순수 number).
5. **합계행(sigma)**: 일부 데이터셋은 **합계 객체**를 함께 보낸다(아래 표의 `sigma`). 화면 핵심 KPI가 이 값을 직접 쓰므로 **상세 합과 일치**해야 한다.
6. **빈 값**: 숫자는 `0`, 문자열은 `""`. `null` 지양.
7. **멱등성**: 같은 `week_key` 재전송은 **전체 교체**(append 아님). 부분 갱신도 같은 주 payload 통째로 재전송.
8. **데이터셋 누락 허용**: 10종 중 일부만 와도 동작(예: restock만 갱신). 단, `sales`/`cart`는 핵심.

### payload 최상위 구조 (한 주치)
```json
{
  "week_key": "2026-W23",
  "week_label": "6월 1주",
  "week_start": "2026-06-01",
  "week_end": "2026-06-07",
  "payload": {
    "sales":       { "sigma": {…}, "items": [ … ], "period": "06-01 ~ 06-07" },
    "cart":        { "sigma": {…}, "items": [ … ], "period": "…" },
    "wishlist":    { "sigma": {…}, "items": [ … ], "period": "…" },
    "customer":    { "sigma": {…}, "items": [ … ], "period": "…" },
    "salesByDate": { "sigma": {…}, "items": [ … ], "period": "…" },
    "visit":       { "items": [ … ], "period": "…" },
    "store":       { "items": [ … ], "period": "…" },
    "storeCorner": { "items": [ … ], "period": "…" },
    "search":      { "sigma": {…}, "items": [ … ], "period": "…" },
    "restock":     { "items": [ … ], "totalCnt": 0, "productCount": 0, "skuCount": 0 }
  },
  "files_present": ["sales","cart","restock"]
}
```

---

## 5. 데이터셋별 스키마 (★ 가장 중요)

각 데이터셋은 `items` 배열(상세 행) + 일부는 `sigma`(합계)로 구성. **필드명·타입은 아래와 정확히 동일**해야 함. (괄호 = BO 원본 엑셀의 대응 컬럼/파일)

### 5-1. `sales` — 주간 판매 (상품×일자) *(BO: 상품실적_127 등)*
| 필드 | 타입 | 단위/예 | 설명 |
|---|---|---|---|
| `date` | string | `2026-06-03` | 판매 일자 (일별 제공 권장) |
| `media` | string | `MOBILE` | 매체 |
| `styleCode` | string | `SPRWG25G01` | 스타일코드(8자 이상) — 품목/성별/연도 분류의 핵심 |
| `name` | string | 상품명 | (콜라보는 `[IP]` 브래킷 포함 권장) |
| `qty` | int | 실주문수량 | 없으면 주문수량/판매수량 |
| `realAmt` | int(원) | 실주문금액 | **0 이하 행은 제외** |
| `pv` | int | 상품상세 조회수(PV) | |
- `sigma`: `{ qty, realAmt, pv }`

### 5-2. `cart` — 장바구니 실적 *(BO: 상품실적_663 등)*
| 필드 | 타입 | 설명 |
|---|---|---|
| `media` | string | 매체 |
| `styleCode` | string | 스타일코드 |
| `name` | string | 상품명 |
| `memberType` | string | 회원구분(있으면) |
| `cartCnt` | int | 장바구니 담긴 건수 |
| `orderCnt` | int | 결제완료(주문) 건수 |
| `realAmt` | int(원) | 실주문금액 |
| `memberCartCnt` | int | 회원 장바구니 건수 |
| `nonMemberCartCnt` | int | 비회원 장바구니 건수 |
- `sigma`: `{ cartCnt, orderCnt, realAmt, memberCartCnt, nonMemberCartCnt }`

### 5-3. `wishlist` — 관심상품(찜)
| 필드 | 타입 | 설명 |
|---|---|---|
| `media` | string | 매체(있으면) |
| `styleCode` | string | 스타일코드(없으면 상품번호) |
| `name` | string | 상품명 |
| `wishCnt` | int | 관심상품 등록수(찜수) |
| `orderCnt` | int | 주문건수 |
| `realAmt` | int(원) | 실주문금액 |
- `sigma`: `{ wishCnt, orderCnt, realAmt }`

### 5-4. `customer` — 고객 분석 (성별×연령)
| 필드 | 타입 | 설명 |
|---|---|---|
| `gender` | string | 성별(여성/남성/공용/키즈 등) |
| `ageGroup` | string | 연령대 |
| `memberType` | string | 회원구분(있으면) |
| `custCnt` | int | 구매 고객수(=주문자수) |
| `orderCnt` | int | 주문건수 |
| `realAmt` | int(원) | 실주문금액 |
| `firstBuyCnt` | int | 첫구매(신규) 고객수 |
- `sigma`: `{ orderCnt, realAmt, custCnt, firstBuyCnt }`

### 5-5. `salesByDate` — 기간별 매출분석 (일자×매체) *(혜택/취소 포함)*
| 필드 | 타입 | 설명 |
|---|---|---|
| `date` | string | 일자 |
| `media` | string | 매체 |
| `buyerCnt` | int | 주문자수 |
| `orderCnt` | int | 주문건수 |
| `orderAmt` | int(원) | 주문금액 |
| `realOrderCnt` | int | 실주문건수 |
| `realAmt` | int(원) | 실주문금액 |
| `cancelAmt` | int(원) | 취소/반품 금액 |
| `discountAmt` | int(원) | 혜택할인 금액 |
| `totalBenefit` | int(원) | 전체혜택 금액 |
- `sigma`: `{ buyerCnt, orderCnt, orderAmt, realOrderCnt, realAmt, cancelAmt, totalBenefit, discountAmt, pointAmt, shippingFee }`
- ⚠️ L1 핵심 KPI(취소율·AOV·혜택율)가 `sigma`를 직접 사용 → **합계 정확도 중요**.

### 5-6. `visit` — 방문실적 (일자×매체)
| 필드 | 타입 | 설명 |
|---|---|---|
| `date` | string | 일자 |
| `media` | string | 매체 |
| `uv` | int | 순방문자수(UV) |
| `session` | int | 세션수 |
| `pv` | int | 페이지뷰 |
| `bounceRate` | number(%) | 이탈률(예: 38.2) |
- (sigma 없음. `media='전체'` 행은 제외)

### 5-7. `store` — 매장 종합 실적 (일자×매체×매장)
| 필드 | 타입 | 설명 |
|---|---|---|
| `date` | string | 일자 |
| `media` | string | 매체 |
| `storeGroup` | string | 매장그룹(홈매장/검색매장/카테고리매장/기획전매장…) |
| `storeName` | string | 매장명(`스파오공홈_P_` 접두사 제거) |
| `uv` | int | UV |
| `realCnt` | int | 실주문건수 |
| `realAmt` | int(원) | 실주문금액 |
| `bounceRate` | number(%) | 이탈률 |

### 5-8. `storeCorner` — 매장코너 실적 (코너×컨텐츠) *(데이터 큼)*
| 필드 | 타입 | 설명 |
|---|---|---|
| `date` | string | 일자 |
| `media` | string | 매체 |
| `storeGroup` | string | 매장그룹 |
| `store` | string | 매장 |
| `detailNo` / `detailName` | string | 매장상세 번호/명 |
| `cornerNo` / `cornerName` | string | 코너 번호/명 |
| `contentType` / `contentTypeName` | string | 컨텐츠 유형/명 |
| `contentNo` / `contentName` | string | 컨텐츠 번호/명 |
| `displayOrder` | int | 전시순서 |
| `clicks` | int | 순클릭수 |
| `impressions` | int | 매장노출수 |
| `ctr` | number | CTR(소수 또는 %) |
| `buyerCnt` `orderCnt` `realOrderCnt` | int | 주문자/주문건/실주문건 |
| `realAmt` `discountAmt` `totalBenefit` | int(원) | 금액들 |
> ⚠️ 이 데이터셋은 (날짜×컨텐츠)라 행이 매우 많다. **일자 단위 원천을 보내면 우리가 코너 단위로 집계·압축**한다. 가능하면 BO에서 **주 단위로 미리 합산**해 보내면 더 가볍다.

### 5-9. `search` — 검색 실적 (검색어×일자)
| 필드 | 타입 | 설명 |
|---|---|---|
| `date` | string | 일자(`YYYY-MM-DD`) |
| `media` | string | 매체 |
| `keyword` | string | 검색어 |
| `success` | boolean | 검색성공여부(Y→true) |
| `searchVol` | int | 검색량 |
| `uv` | int | UV |
| `orderAmt` | int(원) | 주문금액 |
| `orderCnt` | int | 주문건수 |
| `value` | int | 검색어가치 |
- `sigma`: `{ searchVol, uv, orderAmt, orderCnt, value }`

### 5-10. `restock` — 재입고 알림내역 (품절 수요)
| 필드 | 타입 | 설명 |
|---|---|---|
| `productNo` | string | 상품번호 |
| `name` | string | 상품명 (콜라보는 `[IP]` 포함, 끝에 `_스타일코드`) |
| `styleCode` | string | 스타일코드(상품명 끝 `_` 뒤) |
| `optionNo` | string | 단품번호 |
| `optionName` | string | 단품명(예: `(19)Black/S`) |
| `color` / `size` | string | 단품명에서 `/` 앞/뒤 분리 |
| `cnt` | int | 재입고 알림 신청 건수(=대기 고객수) |
| `vendor` | string | 하위업체 |
| `status` | string | 신청상태 |
- 추가 메타: `totalCnt`(Σcnt), `productCount`, `skuCount`

---

## 6. 인터페이스 명세 (옵션 A 기준 예시)

```
POST  https://<우리도메인>/api/ingest/weekly-snapshot
Header: Authorization: Bearer <발급키>     (또는 서버간 비밀)
Body:  4장의 "payload 최상위 구조" JSON
응답:  200 { ok: true, week_key: "2026-W23", upserted: true }
       4xx { ok: false, error: "스키마 검증 실패: sales.items[3].realAmt 누락" }
```
- **인증**: 서버-서버 비밀키 또는 Supabase service_role(우리 서버 내부에서만). **anon/공개키로 외부 쓰기 금지.**
- **검증**: 적재 전 스키마 검증 → 실패 시 적재 거부 + 사유 리턴(부분 오염 방지).

---

## 7. 비기능 요구사항 (개발팀 합의 필요)

| 항목 | 요구 |
|---|---|
| **주기** | 최소 주 1회(주 마감 후). 일 단위 증분도 가능(같은 주 누적 upsert) |
| **타임존** | 모든 날짜 KST 기준 |
| **멱등성** | 같은 `week_key` 재전송 = 전체 교체. 재시도 안전 |
| **백필** | 과거 주차 보정 전송 허용(같은 규칙) |
| **누락/지연** | 특정 데이터셋 지연 시 가능한 것만 먼저 적재, 나머지 후속 전송 |
| **데이터 검증** | `sigma` 합계 = `items` 합계 일치 / media 표준값 / 날짜형식 / 음수금액 제외 |
| **모니터링** | 적재 성공/실패 알림(슬랙·메일), 마지막 적재 시각 노출 |
| **보안** | 외부 쓰기는 인증 필수, 비밀키는 서버에만 |
| **용량** | storeCorner는 주 단위 사전 집계 권장(행 수 최소화) |

---

## 8. 수용 기준 (Acceptance Criteria — 이게 충족되면 완료)

- [ ] BO가 한 주치 표준 JSON을 생성·전송할 수 있다(데이터셋 10종, 5장 스키마 준수).
- [ ] 같은 주 재전송 시 중복 없이 덮어써진다(멱등).
- [ ] 자동 적재된 주차가 대시보드에 정상 표시되고, **동일 주를 수기 업로드한 결과와 핵심 KPI(매출·UV·전환·취소율)가 일치**한다.
- [ ] 스키마 위반 데이터는 적재 거부되고 사유가 기록된다.
- [ ] 2주 이상 누적 시 전주 대비(WoW)가 자동 계산된다.
- [ ] 적재 실패 시 담당자에게 알림이 간다.

---

## 9. 단계별 추진(Phase)

1. **Phase 0 — 스키마 합의**: 본 문서 5장 기준으로 BO 원본 컬럼 ↔ 우리 필드 **매핑표** 확정. (가장 중요, 여기서 80% 결정)
2. **Phase 1 — 1개 데이터셋 PoC**: `sales` 1종만 자동 적재 → 수기 결과와 대조.
3. **Phase 2 — 전체 10종 + 검증/멱등/인증** 구현.
4. **Phase 3 — 스케줄 자동화 + 모니터링/알림**.
5. **Phase 4(중기) — 정규화 DB(옵션 C)로 이행 + Redash 병행** 검토.

---

## 10. BO/개발팀에 확인할 질문 목록

1. BO에서 이 10종 데이터를 **API/DB로 직접 추출**할 수 있나? 아니면 파일(CSV/JSON) 생성만 가능한가?
2. 데이터 제공 가능 **주기**는? (주1회 / 일1회 / 실시간)
3. 매체 구분 값이 우리 표준(`MOBILE/APP/PC`)과 동일한가? 매핑 필요?
4. `styleCode`(스타일코드)와 `상품번호`가 모든 데이터셋에 일관되게 존재하나?
5. 콜라보 상품명에 `[IP]` 브래킷이 일관되게 들어오나? (IP 분석에 필요)
6. 과거 데이터 **백필** 범위는 어디까지 가능한가?
7. 인증 방식(키 발급) 및 호출 IP/네트워크 제약은?
8. `storeCorner`(코너×컨텐츠) 원천 데이터의 주당 대략 행 수는? (용량 설계용)

---

### 부록) 우리 측 참고 코드 (필드 정의의 단일 출처)
- 데이터셋별 정확한 필드: `src/utils/parseExcel.js`의 각 `parseXxx()` 반환 객체
- 파일 종류 자동 인식 규칙: 같은 파일 `detectFileKey()`
- 주차 키 산식: `src/utils/weekKey.js`, `src/utils/weekNav.js`
- 저장 구조(payload·압축): `src/utils/storage.js`, `supabase/schema.sql`
> BO가 만들 JSON은 위 `parseXxx()`의 **출력과 1:1 동일**하면 된다. 의심되면 이 파일들을 단일 기준으로 삼을 것.
