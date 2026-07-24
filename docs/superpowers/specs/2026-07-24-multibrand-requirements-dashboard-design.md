# 전사(멀티 브랜드) 요구사항 관리 웹앱 — 통합 대시보드 설계 문서

- 작성일: 2026-07-24
- 상태: 설계 승인 완료
- 선행: 1단계~3단계(브랜드 관리·브랜드 설정) 완료 (`feature/multibrand-requirements-app`)
- 위치: `agent/pj/`
- 상위 설계: `docs/superpowers/specs/2026-07-21-multibrand-requirements-mgmt-design.md`
  (로드맵의 "3단계: 브랜드 관리·브랜드 설정 화면·통합 대시보드" 중 마지막 조각)

## 배경 / 목적

3단계까지 완료되면서 브랜드·팀원·카테고리 관리가 전부 화면으로 옮겨졌고, 실제 브랜드별
요구사항 데이터가 화면을 통해 쌓이기 시작했다. 원래 로드맵에서 "1차(전체 관리자)의 전체
브랜드 통합 대시보드"로만 짧게 적혀 있던 부분을 이번에 구체화한다.

핵심 질문 두 가지에 답하는 것이 목적이다:
1. **전체 개요** — 지금 전체적으로 어떤 상황인지 한눈에
2. **브랜드별 처리속도·처리량 비교** — 어떤 브랜드가 잘 처리되고 있고, 어떤 브랜드가
   밀리고 있는지

## 범위

- **대상**: 1차(전체 관리자) 전용. 2차/3차는 접근 불가(리다이렉트).
- **신규 화면**: `/admin/dashboard` 1개.
- **범위 제외**: 상태별 체류 시간 분석(단계별 change_logs 순회), 자유 날짜 범위 선택,
  브랜드별 대시보드(2차용 축소판), 데이터 내보내기. 필요해지면 별도 스펙으로 확장한다.

## 데이터 모델 변경

**없음.** 기존 `requirements` 테이블의 `status`, `request_date`, `completed_at`,
`brand_id` 컬럼만으로 계산한다. 마이그레이션 불필요.

## API

### `GET /api/dashboard?memberId=&days=7|30|all`

- `requireGlobalAdmin(memberId)`로 서버 재검증(1차만 접근 가능).
- 활성 브랜드(`brands.is_active=true`) 목록을 이름순으로 조회.
- 그 브랜드들의 요구사항을 `id, brand_id, status, request_date, completed_at` 컬럼만
  선택해 한 번에 조회한다(활성 브랜드가 없으면 조회 자체를 건너뛴다). 날짜 범위 필터는
  SQL이 아니라 순수 함수(`computeDashboardStats`) 쪽에서 처리한다 — 이 앱 규모(브랜드
  소수, 요구사항 수십~수백 건)에서는 SQL GROUP BY 최적화가 체감되지 않고, DB 함수/뷰
  추가 없이 기존 컨벤션(JS 레이어에서 계산, 순수 함수로 분리해 테스트)을 그대로 따를 수
  있다.
- `days` 쿼리 파라미터: `'7'` 또는 `'30'`이면 해당 일수, 그 외(`'all'`, 없음, 잘못된 값)는
  전체 기간으로 처리한다. 별도의 400 검증은 하지 않는다(내부 관리 화면의 읽기 전용
  파라미터라 오입력 시 그냥 전체 기간으로 보여주는 정도가 충분하다).
- 응답 형태:
  ```json
  {
    "overall": { "brandCount": 2, "openCount": 24, "completedInPeriod": 9 },
    "byBrand": [
      {
        "brandId": "...",
        "brandName": "스파오",
        "openCount": 14,
        "newInPeriod": 5,
        "completedInPeriod": 6,
        "avgCompletionDays": 3.2
      }
    ]
  }
  ```
  `avgCompletionDays`는 기간 내 완료 건이 0건이면 `null`(UI에서 "-"로 표시).

### 집계 순수 함수: `lib/dashboardStats.js`

```js
export function computeDashboardStats({ requirements, brands, periodDays }) {
  // periodDays: 7 | 30 | null(전체)
  // requirements: { id, brand_id, status, request_date, completed_at }[]
  // brands: { id, name }[]
}
```

**지표 정의**:
- **미해결(openCount)**: `status`가 `'완료'`/`'중복'`이 아닌 건수. **기간과 무관하게
  항상 현재 스냅샷**(선택한 기간이 7일이든 전체든 이 값은 바뀌지 않는다).
- **기준일 계산**: `cutoff = 오늘 날짜(YYYY-MM-DD, 로컬 자정 기준) - periodDays일`.
  `request_date`는 이미 날짜 컬럼이라 `cutoff` 이상이면 포함(양 끝 포함, 즉
  `request_date >= cutoff`). `completed_at`은 타임스탬프이므로 날짜 부분만 잘라
  (`completed_at.slice(0, 10)`) 같은 방식으로 비교한다. periodDays가 `null`(전체
  선택)이면 이 비교 자체를 생략하고 전부 포함시킨다.
- **신규(newInPeriod)**: `request_date >= cutoff`인 건수(periodDays가 `null`이면 전체
  건수).
- **완료(completedInPeriod)**: `status === '완료'`이고 `completed_at`의 날짜 부분이
  `cutoff` 이상인 건수.
- **평균 소요일(avgCompletionDays)**: `completedInPeriod` 집합의
  `(completed_at - request_date)`(일 단위) 평균. 집합이 비어 있으면 `null`.
- `overall.openCount`/`overall.completedInPeriod`는 `byBrand`의 해당 값 합계.
  `overall.brandCount`는 `brands.length`.

## UI

### `/admin/dashboard` (1차 전용)

- **접근 제어**: `isGlobalAdmin(identity)`로 게이팅, 아니면 안내 문구 후
  `/requirements`로 리다이렉트(`/admin/brands`와 동일 패턴). 서버 API도
  `requireGlobalAdmin`으로 재검증.
- **레이아웃**: `app/admin/layout.js`(이미 `IdentityProvider`+`TopBar` 포함) 하위에 배치.
  1. 기간 토글 버튼 3개: **7일 / 30일 / 전체** (기본값 7일). 토글 시 `days` 파라미터를
     바꿔 `/api/dashboard` 재조회.
  2. 요약 카드 3개(상단): 브랜드 수 · 전체 미해결 · 선택 기간 완료.
  3. 브랜드별 카드 그리드: 브랜드마다 이름 + 미해결/완료(기간)/평균소요일(기간)을
     표시. **카드 클릭 시** 그 브랜드로 현재 identity를 전환하고(`saveIdentity`로
     `brandId`만 교체, `tier`는 1차이므로 `'1차'` 유지) `/requirements`로 이동한다 —
     진입 화면의 `handleSubmit`이 이미 쓰는 "저장 후 즉시 이동" 패턴을 그대로 재사용한다
     (검증된 방식).
- **빈 상태**: 활성 브랜드가 하나도 없으면 "표시할 브랜드가 없습니다" 안내만 표시.

### TopBar

- "브랜드 관리" 링크 옆에 "대시보드" 링크 추가, `isGlobalAdmin`일 때만 표시.

## 에러 처리

- `/api/dashboard` 조회 실패 → 화면 전체를 `loadError`로 대체(다른 관리 화면과 동일한
  원칙 — 이 페이지는 오직 조회만 하고 쓰기 액션이 없으므로 `actionError`와의 분리는
  필요 없다).
- 2차/3차의 직접 URL 접근 → 클라이언트 리다이렉트 + 서버 403 이중 방어.

## 테스트 전략

- **순수 로직 Vitest** (`lib/dashboardStats.test.js`):
  - 브랜드/요구사항이 비어 있는 경우.
  - 기간별 필터링(7일/30일/전체) — 기간 경계에 걸친 날짜 케이스.
  - 평균 소요일 계산이 맞는지, 기간 내 완료 0건일 때 `null`을 반환하는지(0으로 나누기
    방지).
  - 미해결 집계가 완료/중복을 제외하고, 기간 파라미터와 무관하게 항상 전체 스냅샷인지.
  - `overall` 합계가 `byBrand` 합의 합과 일치하는지.
- **API/UI**: 기존 관례대로 `npm run lint` 통과 확인 후, 브라우저로 다음을 확인.
  1. 1차로 `/admin/dashboard` 진입 → 요약 카드·브랜드 카드가 실제 데이터와 일치하는지
     확인 → 기간 토글(7일/30일/전체) 전환 시 숫자가 바뀌는지 확인.
  2. 브랜드 카드 클릭 → 해당 브랜드로 전환되고 `/requirements`로 이동하는지, 그
     브랜드의 실제 목록이 보이는지 확인.
  3. 2차/3차로 `/admin/dashboard` 직접 URL 접근 시 `/requirements`로 리다이렉트되는지
     확인.
  4. TopBar에 1차에게만 "대시보드" 링크가 보이는지 확인.

## 구현 순서 개요 (상세는 구현 계획에서)

1. `lib/dashboardStats.js` 순수 집계 함수 + 단위 테스트(TDD).
2. API 라우트 `GET /api/dashboard`.
3. `/admin/dashboard` 페이지(기간 토글 + 요약 카드 + 브랜드 카드 그리드 + 클릭 전환).
4. TopBar "대시보드" 링크.
5. 브라우저 통합 검증.
