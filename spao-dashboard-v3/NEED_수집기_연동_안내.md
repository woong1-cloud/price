# N.E.E.D 수집기 → 대시보드 연동 안내

**대상**: 수집 스케줄러 스크립트 담당자
**작성일**: 2026-07-08

---

## 결론 — 스키마 이미 맞습니다, 바꾸실 것 없습니다

지금 수집기가 만드는 JSON(`spao-bi-collection-{endpointId}-*.json`)이 **저희가 받기로 한 형식 그대로**입니다. 별도 변환·가공 필요 없이 **지금 만드는 파일 내용을 그대로** 아래 주소로 보내주시면 됩니다.

---

## 1. 보낼 곳

```
POST https://wtflegxxhmzcofojepuf.supabase.co/functions/v1/super-action
```

## 2. 헤더

| 헤더 | 값 |
|---|---|
| `Content-Type` | `application/json` |
| `x-ingest-key` | (별도로 전달드린 값) |

## 3. 바디 — 지금 만드는 JSON 그대로

```json
{
  "endpointId": "salesDaily",
  "label": "기간별 매출분석",
  "exportedAt": "2026-07-07T01:20:24.960Z",
  "entries": [ ... ],
  "mergedRows": [ ... ]
}
```

- **파일 1개당 요청 1번** (지금처럼 `endpointId`별로 나눠서 보내는 방식 그대로 유지)
- 저희가 실제로 읽는 필드는 **`endpointId`와 `mergedRows`(또는 `entries`)** 입니다. `mergedRows`가 없으면 `entries[].rows`를 자동으로 평탄화해서 사용하므로, 실시간 전송 시 `mergedRows`를 생략하고 `entries`만 보내셔도 정상 처리됩니다. `label`/`exportedAt`은 있어도 되고 없어도 무방합니다 — 지금 형식 그대로 두셔도 됩니다.

## 4. curl 예시 (그대로 테스트 가능)

```bash
curl -X POST "https://wtflegxxhmzcofojepuf.supabase.co/functions/v1/super-action" \
  -H "Content-Type: application/json" \
  -H "x-ingest-key: <전달받은 값>" \
  -d @spao-bi-collection-salesDaily-1783387224961.json
```

## 5. 정상 응답 / 실패 응답

```json
// 성공
{ "ok": true, "endpointId": "salesDaily", "table": "daily_sales_by_date", "upserted": 3 }

// 인증 실패 (키 불일치)
{ "ok": false, "error": "인증 실패(x-ingest-key 불일치)" }

// 저장 실패 (스키마/DB 오류)
{ "ok": false, "endpointId": "salesDaily", "table": "daily_sales_by_date", "error": "..." }
```

## 6. 현재 저장 처리하는 endpointId (10개)

아래 10개는 **저장까지 완료**됩니다:

```
salesDaily, itemAggrList, cartItemList, wishItemList, mbrSales,
visitSnapshot, shopContributeHourly, searchKeywordDaily, couponPerf, itemCategoryRank
```

## 7. 그 외 endpointId — 에러 아님, 안전하게 skip

아래처럼 아직 매핑 안 된 endpointId를 보내셔도 **에러가 나지 않습니다.** 그냥 저장 없이 넘어갑니다(`skipped: true` 응답). 수집기 쪽에서 이걸 걸러내는 로직을 따로 만드실 필요 없습니다:

```
shopSummary, couponDashboard, salesHourly, mbrDashboard
```

```json
{ "ok": true, "endpointId": "shopSummary", "skipped": true, "reason": "미지원 endpointId" }
```

## 8. 재전송(재시도) 안전합니다

같은 날짜의 같은 데이터를 다시 보내도 **중복 저장되지 않고 덮어씁니다**(멱등). 네트워크 오류 등으로 재시도하셔도 안전합니다.

## 9. 테스트 방법 (권장)

1. 위 10개 중 하나(예: `salesDaily`) 파일 하나만 먼저 보내보세요.
2. 응답이 `{ "ok": true, ... }` 로 오면 정상입니다.
3. 문제가 있으면 응답의 `error` 메시지를 캡처해서 전달 주시면 바로 확인해 드리겠습니다.

---

궁금한 점 있으시면 언제든 문의 주세요.
