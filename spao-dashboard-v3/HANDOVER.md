# SPAO 자사몰 주간 실적 대시보드 V3 — 인수인계 문서

> 이 문서 하나로 **무엇인지 → 어떻게 켜는지 → 어디를 고치면 무엇이 바뀌는지 → 어떻게 배포하는지**까지 따라올 수 있게 썼습니다.
> 코딩 경험이 적어도 "자주 하는 수정"의 레시피만 보고도 대부분 대응할 수 있습니다.

### 👤 누구를 위한 어느 부분?
- **코드는 안 만지고 대시보드를 "쓰기만" 하는 분** → **[0. 완전 비개발자용 사용 설명서](#0-완전-비개발자용-사용-설명서)** 만 보시면 됩니다.
- **앞으로 코드를 고치거나 기능을 추가할 분** → 1번부터 끝까지 보세요.

---

## 0. 완전 비개발자용 사용 설명서

> 코딩을 전혀 몰라도 됩니다. 이 장은 **마우스로 대시보드를 사용하는 방법**만 설명합니다.

### 0-1. 이 대시보드는 무엇인가요?
매주 나오는 **엑셀 실적 파일들을 올리면**, 매출·방문자·전환율·인기 상품·품절(재입고) 수요를 **자동으로 표와 그래프로** 보여주는 사이트입니다. 직접 계산할 필요가 없습니다.

### 0-2. 접속 방법
1. 브라우저(크롬 권장)에서 주소로 들어갑니다: **https://spao-mall.noavibe.app/**
2. 비밀번호 입력 화면이 나오면 **공유 비밀번호**를 입력합니다. (담당자에게 문의 — 현재 기본값 `spao2026`)
3. 들어가면 위쪽에 **L1 / L2 / L3 / L4 탭**과 **주차 선택 메뉴**가 보입니다.

### 0-3. 가장 중요한 것 한 가지 — "주차 메뉴"
화면 위쪽의 **주차 드롭다운** 하나로 모든 걸 합니다:
- **주 선택** → 그 주의 실적이 화면에 표시됩니다.
- **＋ 새 주차 / 선택한 주에 파일 올리기** → 엑셀 업로드.
- **비교 기준 선택** → 어느 주와 비교(전주 대비)할지.

> 한 사람이 올리면 **모두에게 자동 공유**됩니다(클라우드 저장). 따로 보내줄 필요 없습니다.

### 0-4. 주간 실적 올리는 법 (매주 하는 일)
1. 위쪽 주차 메뉴에서 **올릴 주**를 고르거나 **＋ 새 주차**를 누릅니다.
2. **파일 선택(또는 끌어다 놓기)** 으로 그 주의 엑셀들을 **한꺼번에 여러 개** 올립니다.
   - 파일 종류(판매·장바구니·방문·검색·재입고 등)는 **자동으로 알아서 인식**합니다. 순서·이름 신경 안 써도 됩니다.
3. 업로드 결과 목록에서 각 파일이 "OO로 인식"으로 떴는지 확인합니다.
   - "인식 못 함"이 뜨면 그 파일은 형식이 달라서 그렇습니다 → 담당 개발자에게 문의.
4. **2주 이상** 올라가 있으면 **전주 대비(WoW)** 화살표(▲▼)가 자동으로 켜집니다.

### 0-5. 화면(탭) 읽는 법
| 탭 | 무엇을 보나 |
|---|---|
| **L1 종합 진단** | 이번 주 전체 요약. 맨 위 **유입(방문자) → 사이트 전환율** 흐름이 핵심. 매출·취소율·객단가, 채널 비중, 고객(성별·신규/재구매). |
| **L2 상품 분석** | 어떤 상품이 잘 나갔나(Top), 신상 vs 이월, **재입고 대기 수요(품절로 못 판 기회)**. |
| **L3 구역별 효율** | 기획전·카테고리·검색 등 **화면 구역별** 노출·클릭·매출 효율. |
| **L4 액션 패널** | "지금 뭘 해야 하나"를 자동으로 짚어주는 **액션 카드**(예: 재입고 1순위). |

### 0-6. 자주 보는 표시 의미
- **▲ +12% / ▼ -8% (vs 전주)** : 지난주보다 늘었나/줄었나. 초록=좋음, 빨강=주의(취소율 등은 반대).
- **%p** : 비율의 변화량(전환율 2.0% → 2.3% 이면 **+0.3%p**).
- **⭐ 표시** : "잘 팔리는데 품절" — 재고만 채우면 바로 더 팔 수 있는 상품(재입고 1순위).
- **✨ 콜라보 / 👕 어패럴** : 재입고 수요를 캐릭터 콜라보 / 일반 상품으로 나눈 것. 카드를 **클릭하면 그 그룹만** 정렬됩니다.

### 0-7. 비개발자도 안전하게 할 수 있는 일 / 하면 안 되는 일
- ✅ 해도 되는 것: 파일 업로드, 주차 선택·비교, 화면 보기, 캡처해서 공유.
- 🚫 하지 말 것: 코드·환경설정 파일 수정, 비밀번호/키 외부 공유, 구버전 폴더 건드리기. (필요하면 개발 담당자에게)

### 0-8. 잘 안 될 때 (비개발자 체크리스트)
| 증상 | 먼저 해볼 것 |
|---|---|
| 화면이 안 열림 | 주소 오타 확인 → 새로고침(F5) → 그래도 안 되면 담당자 문의. |
| 비밀번호가 안 먹힘 | 공유 비밀번호 재확인(대소문자 주의). |
| 올렸는데 화면이 안 바뀜 | 새로고침(F5). 올린 "주"가 맞는지 주차 메뉴 확인. |
| 전주 대비(▲▼)가 안 보임 | 비교할 **지난 주 데이터가 아직 없음** — 2주치가 있어야 켜집니다. |
| 특정 파일이 "인식 못 함" | 엑셀 형식이 평소와 다른 것 — 원본 추출을 다시 받거나 담당자 문의. |

> 위 방법으로 안 되면, **어떤 화면에서 / 어떤 파일을 올렸을 때 / 어떤 메시지가 떴는지**를 캡처해서 개발 담당자에게 전달하면 가장 빠릅니다.

---

## 1. 한눈에 보기

- **무엇**: 엑셀(주간 실적 파일)을 업로드하면 매출·유입·전환·상품·재입고 수요를 자동 분석해 보여주는 웹 대시보드.
- **누가 쓰나**: MD / 운영 / 기획 담당자. 공유 비밀번호로 접속.
- **배포 주소**: https://spao-mall.noavibe.app/
- **데이터 저장**: Supabase(클라우드 DB). 한 명이 업로드하면 모두에게 공유됨. 주차별로 누적 저장 → 전주 대비(WoW) 자동 비교.
- **핵심 특징**: 화면은 **주차 드롭다운**으로 주를 고르면 = 업로드 = 확인 = 비교가 한 번에 됨.

---

## 2. 기술 스택 (용어만 알아두면 됨)

| 항목 | 사용 기술 | 한 줄 설명 |
|---|---|---|
| 프레임워크 | **React 19** | 화면을 "컴포넌트(블록)"로 조립하는 라이브러리 |
| 빌드 도구 | **Vite 8** | 개발 서버 실행 + 배포용 파일 생성 |
| 차트 | **Recharts** | 막대·선·파이 그래프 |
| 엑셀 파싱 | **xlsx (SheetJS)** | 업로드한 .xlsx를 읽어 표 데이터로 변환 |
| 클라우드 DB | **Supabase** (PostgreSQL) | 업로드 데이터 저장·공유 |
| 테스트 | **Vitest** | 로직이 맞는지 자동 검사 |

> JSX = HTML처럼 생겼지만 자바스크립트 안에서 쓰는 화면 문법. `.jsx` 파일이 화면 블록입니다.

---

## 3. 빠른 시작 — 내 컴퓨터에서 켜기

### 준비물
- **Node.js** (LTS 버전) 설치. 터미널에서 `node -v` 가 나오면 OK.

### 실행 순서 (PowerShell 기준)
```powershell
cd "C:\Users\han_jiwoong\Desktop\agent\spao-dashboard-v3"

# 1) 최초 1회: 라이브러리 설치
npm install

# 2) 환경변수 파일 만들기 (.env.local) — 아래 4번 참고
#    .env.example 을 복사해 값을 채웁니다.

# 3) 개발 서버 실행
npm run dev
```
실행되면 터미널에 `http://localhost:3457/` (또는 3458) 주소가 뜹니다. 브라우저로 접속.
코드를 저장하면 **자동 새로고침(HMR)** 됩니다.

### 자주 쓰는 명령어
| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 켜기 (수정하며 확인) |
| `npm run build` | 배포용 파일 생성 (`dist/` 폴더). 문법 오류도 여기서 잡힘 |
| `npm test` | 로직 자동 검사 |
| `npm run lint` | 코드 스타일 검사 |

---

## 4. 환경변수 (.env.local) — ⚠️ 보안 중요

프로젝트 폴더에 **`.env.local`** 파일을 만들고 아래 3개를 채웁니다. (`.env.example` 복사)

```
VITE_SUPABASE_URL=https://wtflegxxhmzcofojepuf.supabase.co
VITE_SUPABASE_ANON_KEY=여기에_anon_public_키
VITE_ACCESS_PASSWORD=spao2026
```

- `VITE_SUPABASE_ANON_KEY` 는 **반드시 `anon`(public) 키**만 사용. (Supabase 대시보드 > Project Settings > API > `anon public`)
- **🚫 절대 금지**: `service_role` / `sb_secret_...` 같은 **비밀키를 프론트엔드(.env.local 포함)에 넣지 마세요.** 노출되면 DB 전체가 위험합니다. anon 키는 RLS 정책으로 보호되어 노출돼도 안전합니다.
- **🚫 `.env.local` 은 git에 올리거나 배포 ZIP에 넣지 마세요.** (이미 자동 제외 처리됨)

---

## 5. 데이터 흐름 (이게 머릿속에 있으면 절반은 끝)

```
[엑셀 업로드]
   ↓  parseSheet()          엑셀 → 행 배열         (src/utils/parseExcel.js)
   ↓  detectFileKey()       파일 종류 자동 인식
   ↓  parseXxx()            종류별로 깔끔한 데이터로 정리
   ↓
[주차 스냅샷에 저장]         payload 로 묶어 Supabase 에 gzip 압축 저장 (src/utils/storage.js)
   ↓
[집계 계산]                 computeAllDerived() 등이 KPI·차트·인사이트 계산 (src/utils/metrics.js)
   ↓
[화면 표시]                 L1~L4 컴포넌트가 그림 (src/components/*.jsx)
```

**핵심 규칙**: 화면(`.jsx`)은 "숫자를 어떻게 보여줄지"만 담당하고, **숫자를 만드는 계산은 거의 다 `src/utils/metrics.js`** 에 있습니다. 값이 이상하면 metrics.js, 모양이 이상하면 components를 보세요.

---

## 6. 폴더 / 파일 지도 (어디를 고치면 무엇이 바뀌나)

```
spao-dashboard-v3/
├─ src/
│  ├─ App.jsx                  ← 전체 뼈대: 탭, 업로드 처리, 주차 선택
│  ├─ components/              ← 화면 블록 (.jsx)
│  │  ├─ L1_HealthCheck.jsx    ← L1 종합 진단 탭 (유입→전환, KPI, 채널, 고객)
│  │  ├─ SalesScoreboard.jsx   ← L1 안의 매출 스코어보드 + 유입→전환 퍼널
│  │  ├─ L2_ProductAnalysis.jsx← L2 상품 분석 (상품 Top, 재입고 대기 수요 등)
│  │  ├─ L4_ExhibitionAnalysis.jsx ← L3 탭(구역별 효율)
│  │  ├─ L3_ActionPanel.jsx    ← L4 탭(자동 감지 액션 카드)
│  │  ├─ SearchSection.jsx     ← 검색 실적 섹션
│  │  ├─ WeekControl.jsx       ← 헤더의 주차 드롭다운(선택/업로드/비교)
│  │  ├─ SnapshotSaveModal.jsx / SnapshotManageModal.jsx ← 주차 저장/관리 팝업
│  │  ├─ PasswordGate.jsx      ← 접속 비밀번호 화면
│  │  └─ common/               ← 재사용 작은 블록(KPICard, WoWBadge 등)
│  ├─ utils/                   ← 계산·파싱 로직 (화면 아님)
│  │  ├─ parseExcel.js         ← 엑셀 파싱 + 파일 종류 자동 인식
│  │  ├─ metrics.js            ← ★ 거의 모든 집계 계산 (KPI, 차트, 인사이트, 재입고)
│  │  ├─ styleCodeParser.js    ← 스타일코드 해석(품목/성별/연도/신상)
│  │  ├─ categorize.js         ← 카테고리 + IP(콜라보) 인식
│  │  ├─ storage.js            ← Supabase 저장/불러오기 + gzip 압축
│  │  ├─ weekKey.js / weekNav.js ← 주차 키 계산(예: 2026-W23)
│  │  └─ dataQuality.js        ← 데이터 이상 자동 점검
│  └─ lib/supabase.js          ← Supabase 접속 설정
├─ supabase/schema.sql         ← DB 테이블 정의(최초 1회 실행)
├─ .env.example                ← 환경변수 견본
├─ package.json                ← 라이브러리 목록·명령어
└─ HANDOVER.md                 ← (이 문서)
```

---

## 7. 화면 구성 (탭)

| 탭 | 파일 | 내용 |
|---|---|---|
| **L1 종합 진단** | `L1_HealthCheck.jsx` | 유입(UV)→사이트 전환율, 핵심 KPI, 채널 도넛, 장바구니 퍼널, 고객 세그먼트, 방문/검색 실적 |
| **L2 상품 분석** | `L2_ProductAnalysis.jsx` | 상품 Top, 신상 vs 이월, 파레토, 카테고리, PV갭, **재입고 대기 수요(품절 기회손실)** |
| **L3 구역별 효율** | `L4_ExhibitionAnalysis.jsx` | 기획전·카테고리·검색 구역별 노출/클릭/CTR/매출 |
| **L4 액션 패널** | `L3_ActionPanel.jsx` | 자동 감지 인사이트 & 액션 카드 (재입고 1순위 등) |

> ⚠️ 헷갈림 주의: 파일명과 탭 번호가 어긋나 있습니다. **L3 탭 = `L4_Exhibition...`**, **L4 탭 = `L3_ActionPanel`**. 탭 매핑은 `App.jsx` 의 `TABS` 와 렌더 부분(`activeTab === 'l3'` 등)에서 확인하세요.

---

## 8. 자주 하는 수정 — 레시피 모음

### A) 새 콜라보 IP 추가 (예: `[LUCY]` 가 안 보일 때)
**파일**: `src/utils/categorize.js` → `IP_MAP`
```js
// 예: 루시 추가
['lucy', 'LUCY'], ['루시', 'LUCY'],
```
- 키는 **소문자**로, 값은 화면에 보일 표시명.
- 영문 IP가 `COOL` 같은 기능성 태그로 오인돼 안 잡히면, `getIP` 가 IP_MAP을 제외 규칙보다 먼저 확인하므로 IP_MAP에 등록만 하면 됩니다.
- 콜라보로 분류되려면 **스타일코드 8번째 글자가 `U`** 여야 합니다(아래 D 참고).

### B) "콜라보/어패럴" 판정 기준
**파일**: `src/utils/styleCodeParser.js` → `GENDER_CODE_TABLE`
- `U: '콜라보'`. 즉 스타일코드 8번째 글자(`SPxxYxxU..`)가 `U`면 콜라보로 봅니다.

### C) 품목/카테고리 분류 바꾸기
- 품목명: `src/utils/styleCodeParser.js` → `ITEM_CODE_TABLE` (예: `TC: '코튼 팬츠'`)
- 카테고리 키워드: `src/utils/categorize.js` → `getCategory` 위쪽 테이블

### D) 스타일코드 규칙 이해 (예: `SPRWG25G01`)
```
SP   RW   G    ...  G
브랜드 품목 연도코드      성별코드(8번째)
            G=2026신상 / F=2025이월
            성별: G·W=여성, M=남성, C=공용, K=키즈, U=콜라보
```

### E) 임계값·경고 기준 바꾸기 (예: 이탈률 경고선)
- 이탈률 기준: `src/components/L1_HealthCheck.jsx` 상단 `BOUNCE_THRESHOLD = 38`
- 취소율 경고 등 대부분의 "이 숫자 넘으면 빨강": 해당 컴포넌트 상단 상수 또는 `metrics.js` 인사이트 부분.

### F) 안내 문구·라벨 수정
- 탭 이름/설명: `src/App.jsx` 의 `TABS` 배열.
- 각 섹션 제목·문구: 해당 `components/*.jsx` 안의 텍스트를 직접 수정.

### G) 새로운 엑셀 파일 종류 추가하기 (조금 난이도 있음)
1. `src/utils/parseExcel.js`
   - `parseXxx(rows)` 함수 작성 (기존 `parseRestock` 참고 — 가장 최근에 추가된 예시).
   - `detectFileKey()` 에 인식 규칙 한 줄 추가 (그 파일에만 있는 **고유 헤더**로 판별).
2. `src/App.jsx`
   - `PARSER_MAP`, `EXTRA_FILES`, `EMPTY_WEEK` 에 새 key 추가.
3. `src/utils/metrics.js`
   - 집계 함수 작성, `computeAllDerived` 에서 호출해 결과를 반환에 추가.
4. 화면(`components/*.jsx`)에서 그 결과를 받아 표시.
5. 가능하면 `*.test.js` 로 검증 추가.

> **실제 사례**: "재입고 알림내역" 파일이 이 5단계로 추가됐습니다. `parseRestock`(parseExcel.js) → `computeRestockMetrics`(metrics.js) → `RestockSection`(L2_ProductAnalysis.jsx) 흐름을 그대로 따라 읽으면 패턴이 보입니다.

### H) 재입고 예상매출 "전환 가정율" 기본값 바꾸기
- `src/components/L2_ProductAnalysis.jsx` → `CONV_OPTIONS = [0.1, 0.2, 0.3]` (선택지) / `useState(0.3)` (기본값).

---

## 9. 파일 자동 인식 규칙 (detectFileKey)

업로드 시 헤더(첫 행)를 보고 종류를 자동 판별합니다. 규칙은 `src/utils/parseExcel.js` 의 `detectFileKey()` 한 곳에 모여 있습니다.

| 종류(key) | 인식 핵심 헤더 |
|---|---|
| restock(재입고 알림) | `신청상태` + `단품명`/`건수` |
| search(검색 실적) | `검색어` + `검색량`/`UV` |
| storeCorner(매장코너) | `코너번호` 또는 `매장상세명` |
| store(매장 종합) | `매장그룹` |
| cart(장바구니) | `포기율`/`담기수`/`담긴` |
| sales(주간 판매) | `스타일코드`+`실주문금액`+`매체` |
| salesByDate(기간별 매출) | `주문자`+`전체혜택` |
| visit(방문실적) | `날짜`+`UV`+`세션` |
| customer(고객 분석) | `성별`+`연령/나이` |
| wishlist(관심상품) | `관심상품등록`/`찜` |

> 새 파일이 "인식 못 함"으로 뜨면, 그 파일에만 있는 고유 헤더를 찾아 위 규칙에 추가하세요.

---

## 10. 클라우드 저장(Supabase) 개요

- 접속 설정: `src/lib/supabase.js` (URL·anon 키는 환경변수에서 읽음).
- 저장/불러오기 로직: `src/utils/storage.js`.
- 테이블 2개 (`supabase/schema.sql`):
  - `dashboard_state` — 단일 공유 데이터(레거시).
  - `weekly_snapshots` — **주차별 누적 스냅샷**(week_key 기준, 현재 화면의 주 원천).
- **용량 대응**: 데이터가 커서 저장 타임아웃이 나던 문제를 **브라우저 gzip 압축**으로 해결(`{_gz: base64}` 형태로 한 덩어리 저장). 그래서 `storage.js` 가 조금 복잡합니다. 건드릴 때 `storage.test.js` 를 꼭 돌리세요.
- **DB 최초 세팅**: Supabase 대시보드 > SQL Editor 에 `supabase/schema.sql` 전체를 붙여넣고 RUN.

---

## 11. 배포 (ZIP 만들기)

이 프로젝트는 **소스 기반 ZIP**을 호스팅(noavibe)에 올리는 방식입니다.

1. 코드 수정 후 반드시 검증:
   ```powershell
   npm run build   # 통과 확인
   npm test        # 통과 확인
   ```
2. 배포 ZIP 생성 (PowerShell). `node_modules`/`dist`/`.git`/`.env.local` 은 **제외**해야 합니다:
   ```powershell
   $src   = "C:\Users\han_jiwoong\Desktop\agent\spao-dashboard-v3"
   $stageParent = Join-Path $env:TEMP ("spaodeploy_" + [guid]::NewGuid().ToString("N").Substring(0,8))
   $stage = Join-Path $stageParent "spao-dashboard-v3"
   New-Item -ItemType Directory -Force -Path $stage | Out-Null
   robocopy $src $stage /E /XD node_modules dist .git /XF .env.local *.local | Out-Null
   $zip = "C:\Users\han_jiwoong\Desktop\agent\spao-dashboard-v3-deploy.zip"
   Add-Type -AssemblyName System.IO.Compression.FileSystem
   if (Test-Path $zip) { [System.IO.File]::Delete($zip) }
   [System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $true)
   ```
   - 생성물: `spao-dashboard-v3-deploy.zip` (ZIP 안 최상위가 `spao-dashboard-v3/` 폴더여야 정상).
   - `robocopy` 가 종료코드 1을 내도 정상입니다("복사 성공" 신호).
3. 만든 ZIP을 호스팅에 업로드.

> Vercel로 배포할 경우: `vercel.json` 이 이미 설정돼 있고, 환경변수 3개(4번 항목)를 Vercel 프로젝트 설정에 등록하면 됩니다.

---

## 12. ⚠️ 꼭 지킬 보안·운영 수칙

1. **비밀키 금지**: 프론트엔드에는 Supabase **anon 키만**. `service_role`/`sb_secret_` 절대 금지.
2. **`.env.local` 비공개**: git 커밋·배포 ZIP에 포함 금지(자동 제외돼 있음).
3. **다른 폴더 건드리지 않기**: 같은 상위 폴더에 `spao-dashboard-v2/`, `spao_dashboard_app/` 같은 **구버전이 있다면 수정하지 마세요.** 작업은 `spao-dashboard-v3/` 안에서만.
4. **배포 전 검증**: `npm run build` + `npm test` 통과 확인 후 ZIP.
5. **수정 후 테스트**: 계산 로직(`utils/`)을 고치면 관련 `*.test.js` 를 돌려 깨지지 않았는지 확인.

---

## 13. 자주 막히는 곳 (트러블슈팅)

| 증상 | 원인/해결 |
|---|---|
| `localhost 연결 거부` | 개발 서버가 꺼짐 → `npm run dev` 다시 실행. 포트가 3457/3458 로 바뀔 수 있으니 터미널 주소 확인. |
| 업로드했는데 "인식 못 함" | 헤더가 기존 규칙과 안 맞음 → `detectFileKey`(9번) 확인. |
| 콜라보 IP가 "기타 콜라보"로 묶임 | `categorize.js` `IP_MAP` 에 미등록 → 8-A 레시피로 추가. |
| 저장 시 타임아웃 | 데이터가 매우 큼 → `storage.js` 의 gzip/예산 로직 영역. 함부로 바꾸지 말고 `storage.test.js` 와 함께 검토. |
| 빌드 시 에러 | 보통 오타/괄호 짝 문제 → 에러 메시지의 파일·줄 번호를 보고 수정. |
| 값이 이상 | 화면이 아니라 **`metrics.js` 계산**을 의심. 모양이 이상하면 컴포넌트. |

---

## 14. 더 도움이 필요하면

- 코드 안 주석이 한글로 충실히 달려 있습니다. 고치려는 기능의 키워드(예: "재입고", "전환율")로 검색하면 관련 위치를 빠르게 찾을 수 있습니다.
- 가장 좋은 학습법: **`parseRestock` → `computeRestockMetrics` → `RestockSection`** 한 기능의 전체 흐름을 따라 읽어보기. 이 패턴이 모든 기능에 동일하게 반복됩니다.
