# 전사 멀티브랜드 요구사항 관리 웹앱 — UI/UX 폴리싱 설계 문서

- 작성일: 2026-07-21
- 상태: 승인됨
- 대상 브랜치: `feature/multibrand-requirements-app`

## 배경 / 목적

1단계 구현(스키마, API, 진입화면/목록/등록폼)은 기능적으로 완료되어 브라우저로 검증까지
마쳤다. 다만 시각적으로는 순수 Tailwind 기본값 + 최소한의 shadcn/ui 컴포넌트만 사용한
"기능 검증용" 수준이라, 2단계(Triage 인박스 등) 착수 전에 한 번 디자인 폴리싱을 거친다.

브랜드 컬러 제약은 없음 — 여러 브랜드가 함께 쓰는 내부 도구이므로 특정 브랜드 색이 아닌
중립적이고 전문적인 톤을 새로 제안했다.

## 디자인 방향: Clean Neutral (A안, 시각 목업으로 사용자 승인 완료)

슬레이트 그레이 계열 중립 배경 + 인디고 포인트 컬러. Linear/Notion류의 미니멀하고 절제된
톤. 두 개의 대안(B: Warm Professional — 스톤+틸, C: Bold Retail — 네이비+로즈)을 함께
제시했으나 A안으로 확정.

### 컬러 토큰

| 용도 | 값 |
|---|---|
| 페이지 배경 | `slate-50` |
| 카드/패널 배경 | `white`, 테두리 `slate-200` |
| 본문 텍스트 | `slate-900` |
| 보조 텍스트 | `slate-500` |
| 포인트(버튼/포커스) | `indigo-600`, hover `indigo-700` |

### 상태 배지 의미별 색상 매핑

기존에는 shadcn `Badge`의 3종 variant(`default`/`secondary`/`outline`)를 6개 상태에
억지로 매핑해 색 구분이 약했다. 의미 기반으로 재구성한다.

| status 값 | 의미 | 배지 색 |
|---|---|---|
| 대기, 요청 | 아직 착수 전 (중립) | 슬레이트 (`bg-slate-100 text-slate-600`) |
| 검토, 정책정의 | 주의/검토 필요 | 앰버 (`bg-amber-50 text-amber-700`) |
| 진행중 | 진행 중 (포인트 컬러와 통일) | 인디고 (`bg-indigo-50 text-indigo-700`) |
| 완료 | 성공 | 에메랄드 (`bg-emerald-50 text-emerald-700`) |
| `is_confidential=true` 태그 | 경고성 표시 | 로즈 (`bg-rose-50 text-rose-600`) |

모서리: 카드/인풋 `rounded-lg`, 배지 `rounded-full`.

## 적용 범위 (4개 파일)

1. **`app/page.js` (진입화면)** — `slate-50` 배경 위 흰 카드(그림자/테두리), 이름·브랜드
   드롭다운을 네이티브 `<select>`에서 shadcn `Select`로 교체, 제출 버튼을 인디고 스타일로.
   기존 로직(팀원/브랜드 fetch, race-guard, HTTP 에러 표면화, `handleMemberChange`)은
   변경하지 않고 마크업/스타일만 교체한다.
2. **`components/TopBar.jsx`** — 흰 배경 + 하단 테두리(`border-slate-200`), "전체 관리자"
   표시를 작은 인디고 배지로, "다른 사용자로 전환"은 텍스트 버튼 스타일 유지하되 색만 조정.
3. **`components/RequirementList.jsx`** — 데스크톱 테이블: 헤더 행에 `slate-50` 배경,
   본문 행에 hover 효과(`hover:bg-slate-50`), `STATUS_VARIANT` 매핑을 위 표의 커스텀 클래스
   기반으로 교체(shadcn `Badge`의 `className` prop으로 색 오버라이드). 모바일 카드: 흰
   배경 + 테두리 + `shadow-sm`. `is_confidential` 표시를 배지 형태로 통일.
4. **`components/RequirementFormDialog.jsx`** — 카테고리 필드를 네이티브 `<select>`에서
   shadcn `Select`로 교체. 라벨/필드 간격 정리. 제출 버튼은 shadcn `Button`의 기본 스타일이
   이미 인디고 계열이 아니므로, 전역 버튼 색을 인디고로 맞추기 위해 `components/ui/button.jsx`
   또는 개별 사용처에서 스타일을 조정한다(아래 "shadcn 기본 컴포넌트 처리" 참고).

## shadcn Select 컴포넌트 신규 설치

Task 2에서 YAGNI로 건너뛰었던 `select` 컴포넌트를 이번에 추가한다: `npx shadcn@latest add select`.
설치되는 `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`을 controlled
value 패턴으로 사용한다 (`value`/`onValueChange`, 네이티브 `<select>`의 `value`/`onChange`와
다른 API이므로 각 사용처의 상태 관리 코드를 그에 맞게 조정한다 — 상태 자체의 의미나 흐름은
바꾸지 않는다).

## shadcn 기본 컴포넌트 색상 처리

`components/ui/button.jsx`는 Task 2에서 `shadcn init`이 생성한 기본 테마(`base-nova`
스타일, 뉴트럴 베이스)를 쓰고 있어 primary 버튼이 검정/뉴트럴 계열이다. 이번 폴리싱에서
전역 버튼 컴포넌트 자체를 인디고로 바꾸지는 않는다(다른 화면에 영향 범위가 커짐) — 대신
각 화면에서 주요 액션 버튼에 `className="bg-indigo-600 hover:bg-indigo-700"` 형태로
오버라이드해 지금 범위(4개 파일)에만 인디고 포인트를 적용한다.

## 범위 제외 (사용자 확인됨)

아이콘(lucide-react) 추가, 로딩 스켈레톤 UI, 진입화면 브랜딩(로고/히어로) 강화는 이번
패스에 포함하지 않는다. 후속 폴리싱 라운드에서 별도로 다룰 수 있다.

## 리스크 / 주의사항

- shadcn `Select`는 controlled component 패턴이 네이티브 `<select>`와 달라, 값 초기화
  로직(예: `RequirementFormDialog`의 `emptyForm()`)과 `onChange` 핸들러를 `onValueChange`
  기반으로 다시 써야 한다. 기존 폼 제출 로직(필드명, API 바디 매핑)은 변경하지 않는다.
- `RequirementList.jsx`의 `STATUS_VARIANT` 재작성 시, 기존 로직에서 알 수 없는 status
  값에 대한 폴백(`?? 'secondary'`)이 있었는데, 새 커스텀 클래스 매핑에도 동일하게 알 수
  없는 값에 대한 중립(슬레이트) 폴백을 유지해야 한다.
- 이번 폴리싱은 순수 프레젠테이션 계층 변경이며, API 계약·데이터 흐름·권한 로직은 전혀
  건드리지 않는다.

## 테스트 전략

- 자동 테스트 대상 아님 (순수 스타일/마크업 변경). `npm run build`/`npm run lint`로 회귀
  없는지 확인.
- 브라우저로 3개 화면(진입/목록/등록폼)을 데스크톱·모바일 뷰포트에서 직접 확인하고, 기존
  Task 15에서 검증한 기능(권한 경계, 비공개 필터링, 폼 제출)이 스타일 변경 후에도 동일하게
  동작하는지 재확인한다.
