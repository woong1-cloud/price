# PRD — 주간 실적 대시보드 데이터 자동연동

**문서 종류**: 제품 요구사항 정의서(PRD) / 데이터 스키마 명세
**대상 독자**: 데이터팀(개발) · BO/플랫폼 개발 · 대시보드 담당
**버전**: v1.1 · **작성일**: 2026-06-25
**관련 문서**: `API_REQUIREMENTS.md`(상세 보강), `MULTI_BRAND.md`(멀티브랜드), `HANDOVER.md`(운영)

**변경 이력**
- v1.1 (2026-06-25): **적재 주기에 "일별 증분" 추가**(§9-A). 저장·화면 단위는 주차 유지, 주중 데이터 신선도 확보. FR-8·NFR-1·AC 보강.
- v1.0 (2026-06-25): 최초 작성(주차 단위 적재).

---

## 0. 한 줄 요약

> 매주 사람이 **엑셀 10종을 수기 업로드**하던 것을, 데이터팀이 **표준 스키마(JSON)로 주차 단위 자동 적재**하도록 전환한다. 대시보드는 이미 동일 구조를 내부적으로 쓰므로, **스키마만 일치시키면 코어 변경 없이** 자동연동된다.

---

## 1. 개요 & 배경

- **제품**: SPAO 자사몰 주간 실적 대시보드(React/Vite, Supabase 저장). 매출·유입·전환·상품·재입고 수요를 주차별로 분석, 전주 대비(WoW) 자동 비교.
- **현행 데이터 유입**: BO에서 엑셀 10종 추출 → 담당자가 매주 수기 업로드.
- **문제점**: 반복 수작업, 누락·지연·휴먼에러, 실시간성 부족, 담당자 의존.
- **본 PRD 목적**: 데이터팀이 구현할 **자동연동 인터페이스와 데이터 스키마(계약)** 를 확정한다.

---

## 2. 목표 / 비목표

### 2.1 목표 (Goals)
- G1. BO/데이터 소스에서 **주차 단위로 표준 데이터 자동 적재**(무인 운영).
- G2. 적재 데이터로 대시보드가 **수기 업로드와 동일한 수치**를 산출.
- G3. **멱등·재시도 안전** 적재(같은 주 재전송 = 덮어쓰기).
- G4. 데이터 품질 **검증·실패 알림** 체계.

### 2.2 비목표 (Non-Goals)
- N1. 대시보드 UI/지표 로직 변경(별도 과제).
- N2. BI 도구(Redash 등) 신규 도입 — 본 PRD는 대시보드 연동에 한정(멀티브랜드/웨어하우스는 `MULTI_BRAND.md` 참조).
- N3. 실시간(초단위) 스트리밍 — 주/일 단위 배치로 충분.

---

## 3. 용어 정의

| 용어 | 정의 |
|---|---|
| 데이터셋 | 한 종류의 실적(예: sales, cart). 총 10종 |
| `week_key` | 주차 식별 키. `YYYY-Www`(ISO 주차), 예 `2026-W23` |
| payload | 한 주치 데이터셋들의 묶음(JSON) |
| `items` | 데이터셋의 상세 행 배열 |
| `sigma` | 데이터셋의 합계 객체(일부 데이터셋) |
| upsert | 없으면 삽입, 있으면 교체(멱등) |
| WoW | 전주 대비(Week-over-Week) |

---

## 4. 이해관계자 & 역할 (RACI)

| 활동 | 데이터팀 | BO/플랫폼 | 대시보드 담당 |
|---|---|---|---|
| 스키마 매핑 확정 | R | C | A |
| 추출/변환(ETL) 구현 | R | C | C |
| 적재 인터페이스 구현 | R | I | C |
| 수치 검증(수용) | C | I | A/R |
| 운영·모니터링 | R | I | C |

(R=실행, A=승인, C=협의, I=공유)

---

## 5. 현행(As-Is) → 목표(To-Be)

```
[As-Is]  BO 엑셀 10종 → (사람) 수기 업로드 → 대시보드 파싱 → 저장/표시
[To-Be]  BO/데이터소스 → (자동) 표준 JSON 변환·적재 → 대시보드 표시
                                  └ 주차 단위 upsert(weekly_snapshots)
```

---

## 6. 범위 (Scope)

- **In**: 데이터셋 10종의 표준 스키마 정의, 주차 적재 인터페이스, 검증·멱등·인증·모니터링, 백필.
- **Out**: 대시보드 화면/지표 변경, 멀티브랜드 확장, 사용자 권한 체계 고도화.
- **대상 데이터셋(10종)**: `sales`, `cart`, `wishlist`, `customer`, `salesByDate`, `visit`, `store`, `storeCorner`, `search`, `restock`.

---

## 7. 기능 요구사항 (FR)

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-1 | 데이터팀은 한 주치 데이터를 **8장 스키마**에 맞춘 JSON으로 생성한다. | 必 |
| FR-2 | 주차 단위로 적재 인터페이스에 전송한다(§10). | 必 |
| FR-3 | 동일 `week_key` 재전송 시 **전체 교체(upsert)** 된다. | 必 |
| FR-4 | 데이터셋 10종 중 **일부만** 전송 가능(부분 적재 허용). | 必 |
| FR-5 | 적재 전 **스키마·품질 검증**(§12) 통과해야 하며, 실패 시 거부 + 사유 반환. | 必 |
| FR-6 | 과거 주차 **백필(보정 전송)** 을 지원한다. | 中 |
| FR-7 | 적재 성공/실패를 **알림**(슬랙·메일)으로 통지한다. | 中 |
| FR-8 | **일별 증분 전송**을 지원한다. 같은 `week_key`로 주중 매일 누적 갱신(§9-A). 일별 6종은 일자 누적, 집계 4종은 누계 갱신. 멱등은 **누적-전체교체** 표준. | 必 |

---

## 8. 데이터 스키마 명세 ★ (핵심 계약)

**규칙**: 필드명·타입은 아래와 **정확히 일치**해야 한다. (M=필수, O=선택)
타입: `int`=정수, `int(원)`=원단위 정수, `number`=실수, `number(%)`=백분율 실수, `string`, `boolean`.
※ 이 표는 대시보드 파서(`src/utils/parseExcel.js`)의 출력과 1:1이며, 이것이 단일 진실 출처(SSOT)다.

### 8-1. `sales` — 주간 판매 (상품×일자)
| 필드 | 타입 | M/O | 단위/예 | 설명 |
|---|---|---|---|---|
| date | string | M | 2026-06-03 | 판매 일자(일별 권장) |
| media | string | M | MOBILE | 매체(MOBILE/APP/PC) |
| styleCode | string | M | SPRWG25G01 | 스타일코드(8자+) |
| name | string | M | 상품명 | 콜라보는 `[IP]` 포함 |
| qty | int | M | | 실주문수량(없으면 주문/판매수량) |
| realAmt | int(원) | M | | 실주문금액(0 이하 행 제외) |
| pv | int | O | | 상품상세 조회수 |
- `sigma`(M): `{ qty, realAmt, pv }`

### 8-2. `cart` — 장바구니 실적
| 필드 | 타입 | M/O | 설명 |
|---|---|---|---|
| media | string | M | 매체 |
| styleCode | string | M | 스타일코드 |
| name | string | M | 상품명 |
| memberType | string | O | 회원구분 |
| cartCnt | int | M | 장바구니 담긴 건수 |
| orderCnt | int | M | 결제완료(주문) 건수 |
| realAmt | int(원) | M | 실주문금액 |
| memberCartCnt | int | O | 회원 장바구니 건수 |
| nonMemberCartCnt | int | O | 비회원 장바구니 건수 |
- `sigma`(M): `{ cartCnt, orderCnt, realAmt, memberCartCnt, nonMemberCartCnt }`

### 8-3. `wishlist` — 관심상품(찜)
| 필드 | 타입 | M/O | 설명 |
|---|---|---|---|
| media | string | O | 매체 |
| styleCode | string | M | 스타일코드(없으면 상품번호) |
| name | string | M | 상품명 |
| wishCnt | int | M | 찜수(관심상품 등록수) |
| orderCnt | int | O | 주문건수 |
| realAmt | int(원) | O | 실주문금액 |
- `sigma`(M): `{ wishCnt, orderCnt, realAmt }`

### 8-4. `customer` — 고객 분석 (성별×연령)
| 필드 | 타입 | M/O | 설명 |
|---|---|---|---|
| gender | string | M | 성별(여성/남성/공용/키즈) |
| ageGroup | string | M | 연령대 |
| memberType | string | O | 회원구분 |
| custCnt | int | M | 구매 고객수(=주문자수) |
| orderCnt | int | O | 주문건수 |
| realAmt | int(원) | M | 실주문금액 |
| firstBuyCnt | int | O | 첫구매(신규) 고객수 |
- `sigma`(M): `{ orderCnt, realAmt, custCnt, firstBuyCnt }`

### 8-5. `salesByDate` — 기간별 매출분석 (일자×매체, 혜택/취소 포함)
| 필드 | 타입 | M/O | 설명 |
|---|---|---|---|
| date | string | M | 일자 |
| media | string | M | 매체 |
| buyerCnt | int | M | 주문자수 |
| orderCnt | int | M | 주문건수 |
| orderAmt | int(원) | M | 주문금액 |
| realOrderCnt | int | M | 실주문건수 |
| realAmt | int(원) | M | 실주문금액 |
| cancelAmt | int(원) | M | 취소/반품 금액 |
| discountAmt | int(원) | M | 혜택할인 금액 |
| totalBenefit | int(원) | M | 전체혜택 금액 |
- `sigma`(M): `{ buyerCnt, orderCnt, orderAmt, realOrderCnt, realAmt, cancelAmt, totalBenefit, discountAmt, pointAmt, shippingFee }`
- ⚠️ L1 핵심 KPI(취소율·AOV·혜택율)가 `sigma` 직접 사용 → **합계 정확도 필수**.

### 8-6. `visit` — 방문실적 (일자×매체)
| 필드 | 타입 | M/O | 설명 |
|---|---|---|---|
| date | string | M | 일자 |
| media | string | M | 매체 |
| uv | int | M | 순방문자수(UV) |
| session | int | M | 세션수 |
| pv | int | M | 페이지뷰 |
| bounceRate | number(%) | M | 이탈률(예: 38.2) |
- (sigma 없음 · `media='전체'` 행 제외)

### 8-7. `store` — 매장 종합 실적 (일자×매체×매장)
| 필드 | 타입 | M/O | 설명 |
|---|---|---|---|
| date | string | M | 일자 |
| media | string | M | 매체 |
| storeGroup | string | M | 매장그룹(홈/검색/카테고리/기획전매장…) |
| storeName | string | M | 매장명(`스파오공홈_P_` 접두사 제거) |
| uv | int | M | UV |
| realCnt | int | M | 실주문건수 |
| realAmt | int(원) | M | 실주문금액 |
| bounceRate | number(%) | O | 이탈률 |

### 8-8. `storeCorner` — 매장코너 실적 (코너×컨텐츠)
| 필드 | 타입 | M/O | 설명 |
|---|---|---|---|
| date | string | M | 일자 |
| media | string | M | 매체 |
| storeGroup | string | M | 매장그룹 |
| store | string | O | 매장 |
| detailNo / detailName | string | M | 매장상세 번호/명 |
| cornerNo / cornerName | string | M | 코너 번호/명 |
| contentType / contentTypeName | string | O | 컨텐츠 유형/명 |
| contentNo / contentName | string | M | 컨텐츠 번호/명 |
| displayOrder | int | O | 전시순서 |
| clicks | int | M | 순클릭수 |
| impressions | int | M | 매장노출수 |
| ctr | number | O | CTR |
| buyerCnt / orderCnt / realOrderCnt | int | M | 주문자/주문건/실주문건 |
| realAmt / discountAmt / totalBenefit | int(원) | M/O | 금액들 |
- ⚠️ 행 수 매우 많음 → **주 단위 사전 집계 권장**(불가 시 일자 원천 전송, 대시보드가 집계·압축).

### 8-9. `search` — 검색 실적 (검색어×일자)
| 필드 | 타입 | M/O | 설명 |
|---|---|---|---|
| date | string | M | 일자(YYYY-MM-DD) |
| media | string | M | 매체 |
| keyword | string | M | 검색어 |
| success | boolean | O | 검색성공여부(Y→true) |
| searchVol | int | M | 검색량 |
| uv | int | M | UV |
| orderAmt | int(원) | O | 주문금액 |
| orderCnt | int | O | 주문건수 |
| value | int | O | 검색어가치 |
- `sigma`(M): `{ searchVol, uv, orderAmt, orderCnt, value }`

### 8-10. `restock` — 재입고 알림내역 (품절 수요)
| 필드 | 타입 | M/O | 설명 |
|---|---|---|---|
| productNo | string | M | 상품번호 |
| name | string | M | 상품명(콜라보 `[IP]` 포함, 끝 `_스타일코드`) |
| styleCode | string | M | 스타일코드 |
| optionNo | string | O | 단품번호 |
| optionName | string | M | 단품명(예: `(19)Black/S`) |
| color / size | string | O | 단품명 `/` 앞/뒤 분리 |
| cnt | int | M | 재입고 알림 신청 건수(대기 고객수) |
| vendor | string | O | 하위업체 |
| status | string | O | 신청상태 |
- 추가 메타(M): `totalCnt`(Σcnt), `productCount`, `skuCount`

---

## 9. 공통 데이터 규칙

1. **주차 메타**(각 전송 포함): `week_key`(YYYY-Www) · `week_label`(한국어) · `week_start`(월요일,KST) · `week_end`(일요일,KST). *키 산식 불일치 방지를 위해 `week_start`만 정확히 보내고 `week_key`는 대시보드 유틸로 산출 권장.*
2. **날짜**: `YYYY-MM-DD`, **KST**.
3. **매체 표준값**: `MOBILE`/`APP`/`PC` 3종(대문자). 그 외(`전체`,`코드값없음`)는 전송 금지.
4. **단위**: 금액=원(정수), 건/명/수량=정수, 비율=number(%). 콤마·문자 금지(순수 number).
5. **빈 값**: 숫자 0, 문자열 "". `null` 지양.
6. **멱등성**: 같은 `week_key`는 전체 교체.
7. **합계 일치**: `sigma` = `items` 합계.

### payload 최상위 구조
```json
{
  "week_key": "2026-W23",
  "week_label": "6월 1주",
  "week_start": "2026-06-01",
  "week_end": "2026-06-07",
  "files_present": ["sales","cart","salesByDate","visit","restock"],
  "payload": {
    "sales":       { "sigma": {"qty":0,"realAmt":0,"pv":0}, "items": [ /* §8-1 */ ] },
    "salesByDate": { "sigma": { /* §8-5 */ }, "items": [ /* … */ ] },
    "visit":       { "items": [ /* §8-6 */ ] },
    "restock":     { "items": [ /* §8-10 */ ], "totalCnt": 0, "productCount": 0, "skuCount": 0 }
  }
}
```

---

## 9-A. 적재 주기 — 주차 컨테이너 + 일별 증분 (v1.1)

**목적**: 주가 끝나기 전에도 매일 데이터를 쌓아 **주중 중간 확인(신선도)** 을 가능하게 한다.
**원칙**: **저장·조회 단위는 주차(week_key) 그대로 유지**한다. 화면/집계 로직은 변경하지 않는다. 달라지는 것은 *"한 주 payload를 언제·어떻게 채우느냐"* 뿐이다.

### 9-A-1. 전송 모드 (두 가지 모두 허용)
| 모드 | 설명 | 멱등 규칙 |
|---|---|---|
| **주간 일괄(기존)** | 주 마감 후 그 주 전체를 1회 전송 | week_key 전체 교체 |
| **일별 증분(신규)** | 주중 매일, 해당 주차로 누적 전송 | 아래 9-A-3 |

> 두 모드는 같은 엔드포인트·같은 payload 구조(§9)를 쓴다. **`week_key`만 맞으면** 일괄이든 증분이든 동일하게 그 주에 누적된다.

### 9-A-2. 데이터셋별 일별 적용 범위
일별 증분은 **`date` 필드를 가진 6종**에만 자연스럽게 적용된다. 나머지 4종은 BO가 **기간 집계**로 내려주므로 **주 단위로 갱신**한다.

| 일별 증분 가능 (date 보유) | 주 단위 집계 (날짜 없음) |
|---|---|
| `sales` · `salesByDate` · `visit` · `store` · `storeCorner` · `search` | `cart` · `wishlist` · `customer` · `restock` |

- 일별 6종: 매일 그날치가 누적되어 주말이면 7일치 완성.
- 집계 4종: 주중에는 "현재까지 누계" 스냅샷으로 갱신(덮어쓰기), 주 마감 시 최종값.

### 9-A-3. 멱등 규칙 — **누적-전체교체 방식(권장)**
매 전송은 **"해당 주 월요일 ~ 전송일까지의 누계 전체"** 를 담고, 그 주 payload를 **통째로 교체(upsert)** 한다.
- ✅ 장점: 재시도/중복 전송에 안전(항상 같은 결과), 누락 자가 치유, 구현 단순.
- 예) 수요일 전송 = 월·화·수 3일치 일별 6종 + 현재 누계 집계 4종 → 그 주 덮어씀.

> 대안(일자-병합: 그날 행만 추가)도 가능하나, 누락·중복·재처리 관리가 늘어 **누적-전체교체를 표준으로 권장**한다. 둘 중 하나로 **반드시 통일**할 것.

### 9-A-4. 주의
- **부분 주(week-in-progress)**: 주중 데이터는 "진행 중"이다. 화면에서 미완성 주임을 인지할 수 있도록 마지막 적재일(`last_ingested_date`)을 함께 보낸다(선택).
- **WoW 비교**: 진행 중 주를 완료된 전주와 직접 비교하면 과소 표시될 수 있다 → 동일 요일까지 비교 또는 "진행 중" 표기 권장(화면 개선은 별도, 본 PRD 범위 밖).
- **타임존**: 일 경계는 KST 00:00 기준.

---

## 10. 인터페이스 명세

### 옵션 A — Push(권장): 적재 엔드포인트
```
POST https://<대시보드도메인>/api/ingest/weekly-snapshot
Headers: Authorization: Bearer <발급키>, Content-Type: application/json
Body: §9 payload 구조
Resp 200: { "ok": true, "week_key": "2026-W23", "upserted": true,
            "datasets": ["sales","salesByDate","visit","restock"] }
Resp 4xx: { "ok": false, "error": "스키마 검증 실패: salesByDate.items[2].realAmt 누락" }
```
- 인증: 서버-서버 비밀키. **공개/anon 키로 외부 쓰기 금지.**
- 트랜잭션: 한 주 payload는 원자적 처리(부분 적재로 인한 불일치 방지).

### 옵션 B — Pull: 데이터팀 제공 읽기 API를 대시보드가 수집
- 데이터팀이 `GET .../weekly?week=2026-W23` 형태로 §8 스키마 제공 → 대시보드 스케줄러가 수집·적재. (인증·페이지네이션·레이트리밋 명세 필요)

> 1순위 **A**. BO가 이미 조회 API를 제공하면 **B**.

---

## 11. 비기능 요구사항 (NFR)

| ID | 항목 | 요구 |
|---|---|---|
| NFR-1 | 주기 | 주1회(주 마감) 또는 **일 1회 증분**(§9-A). 둘 다 같은 엔드포인트·멱등 |
| NFR-2 | 타임존 | 전 데이터 KST |
| NFR-3 | 멱등/재시도 | 같은 week_key 안전 재전송 |
| NFR-4 | 성능 | 1주 적재 ≤ 수 초. storeCorner 사전 집계로 용량 제어 |
| NFR-5 | 보안 | 외부 쓰기 인증 필수, 비밀키 서버 보관, 전송 HTTPS |
| NFR-6 | 가용성 | 적재 실패 시 자동 재시도 + 알림 |
| NFR-7 | 관측성 | 마지막 적재 시각·결과 로깅/대시보드 노출 |
| NFR-8 | 백필 | 과거 주차 보정 전송 지원 |

---

## 12. 데이터 품질·검증 규칙 (적재 게이트)

- DQ-1 필수 필드 존재 + 타입 일치(§8). 위반 행 위치 리턴.
- DQ-2 `media ∈ {MOBILE,APP,PC}`.
- DQ-3 날짜 `YYYY-MM-DD`, 주차 범위(`week_start`~`week_end`) 내.
- DQ-4 금액·수량 음수 금지(단, 취소금액 등 정의된 항목 예외). `sales.realAmt > 0`.
- DQ-5 `sigma` 합계 = `items` 합계(허용 오차 0; 반올림 정책 합의).
- DQ-6 중복 키(같은 date×media×styleCode 등) 정책 정의(합산 or 거부).
- DQ-7 인코딩 UTF-8, 숫자에 콤마/문자 금지.
- 검증 실패 시 **해당 주 적재 거부**(부분 오염 방지) + 사유 리포트.

---

## 13. 수용 기준 (Acceptance Criteria)

- AC-1 데이터팀이 1주치 표준 payload를 생성·전송할 수 있다(§8 준수).
- AC-2 같은 week_key 재전송이 중복 없이 덮어써진다(멱등).
- AC-3 자동 적재 주차가 대시보드에 정상 표시되고, **동일 주 수기 업로드 결과와 핵심 KPI(실매출·UV·전환율·취소율·재입고 대기)가 일치**한다(오차 0, 반올림 제외).
- AC-4 스키마 위반 데이터는 거부되고 사유가 기록된다.
- AC-5 2주 누적 시 WoW가 자동 계산된다.
- AC-6 적재 실패가 담당자에게 알림된다.
- AC-7 과거 1개 주차 백필이 성공한다.
- AC-8 **일별 증분**: 같은 주에 월·화·수 순차 전송 시 그 주가 누적 갱신되고, 같은 날 재전송해도 결과가 동일하다(누적-전체교체 멱등).
- AC-9 주중(진행 중 주)에도 대시보드가 "현재까지 누계"로 정상 표시된다.

---

## 14. 마일스톤 (제안)

| 단계 | 내용 | 산출물 |
|---|---|---|
| M0 | 스키마 매핑 워크숍(BO 컬럼 ↔ §8 필드) | 매핑표(부록 A) 확정 |
| M1 | `sales` 1종 PoC 적재 → 수기 대조 | PoC 적재 + 검증 리포트 |
| M2 | 10종 전체 + 검증/멱등/인증 | 적재 API |
| M3 | 스케줄 자동화 + 모니터링/알림 | 운영 자동화 |
| M4 | 백필 + 안정화 | 릴리스 |

---

## 15. 리스크 & 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| BO 추출 컬럼명이 대시보드 기대와 다름 | 인식 실패 | 매핑표(M0)에서 사전 정렬, `headerAliases` |
| `sigma`와 상세 합 불일치 | KPI 오류 | DQ-5 검증으로 차단 |
| storeCorner 대용량 | 성능/용량 | 주 단위 사전 집계 |
| 매체 값 비표준 | 집계 오염 | DQ-2 + 매핑 |
| 부분 적재로 불일치 | 데이터 신뢰 저하 | 주 단위 원자 처리 |

---

## 16. 오픈 이슈 / 데이터팀·BO 확인 질문

1. 데이터셋 10종을 **API/DB 직접 추출** 가능한가, 파일 생성만 가능한가?
2. 제공 **주기**(주1/일1/실시간)?
3. 매체 구분 값이 표준(MOBILE/APP/PC)과 동일한가? 매핑 필요?
4. `styleCode`·`상품번호`가 전 데이터셋에 일관 존재하나?
5. 콜라보 상품명에 `[IP]` 브래킷이 일관 포함되나?
6. **백필** 가능 범위(기간)?
7. 인증 방식·호출 네트워크 제약?
8. `storeCorner` 주당 대략 행 수(용량 설계)?
9. `sigma` 반올림/정합 정책(원 단위 절사 등)?

---

## 부록 A. BO 컬럼 ↔ 표준 필드 매핑표 (M0에서 채움)

| 데이터셋 | 표준 필드 | BO 원본 컬럼명 | 변환 규칙 | 비고 |
|---|---|---|---|---|
| sales | date | (예: 날짜) | YYYY-MM-DD | |
| sales | media | (예: 매체) | 값 표준화 | |
| sales | styleCode | (예: 스타일코드) | | |
| … | … | | | |
> 각 데이터셋의 §8 필드를 행으로 펼쳐 BO 담당이 "원본 컬럼/변환규칙"을 채운다. 이 표가 채워지면 구현의 80%가 확정된다.

## 부록 B. 단일 진실 출처(SSOT)
- 필드 정의: `src/utils/parseExcel.js`의 각 `parseXxx()` 반환 객체
- 파일 자동 인식: 동 파일 `detectFileKey()`
- 주차 키 산식: `src/utils/weekKey.js`, `weekNav.js`
- 저장 구조: `src/utils/storage.js`, `supabase/schema.sql`
- 상세 보강 설명: `API_REQUIREMENTS.md`
