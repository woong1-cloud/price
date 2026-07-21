# UI/UX 폴리싱 (Clean Neutral) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1단계에서 기능만 구현된 진입화면/TopBar/요구사항 목록/등록폼에 "Clean Neutral"
디자인 시스템(슬레이트 배경 + 인디고 포인트, 의미 기반 상태 배지, shadcn Select)을 적용한다.

**Architecture:** 순수 프레젠테이션 계층 변경. API 계약·데이터 흐름·권한 로직·상태 관리
구조는 건드리지 않고, 마크업과 Tailwind 클래스만 교체한다. 유일한 새 의존성은 shadcn
`select` 컴포넌트(Task 2에서 YAGNI로 건너뛴 것을 이번에 추가).

**Tech Stack:** Next.js 16, Tailwind CSS v4, shadcn/ui(Base UI 기반), 기존 프로젝트와 동일.

**참고 스펙:** [docs/superpowers/specs/2026-07-21-multibrand-ui-polish-design.md](../specs/2026-07-21-multibrand-ui-polish-design.md)

**실행 위치:** 별도 언급이 없는 한 모든 명령어는
`C:\Users\han_jiwoong\Desktop\agent\.worktrees\multibrand-requirements-app\pj` 에서 실행한다.

---

### Task 1: shadcn Select 컴포넌트 설치

**Files:**
- Create: `pj/components/ui/select.jsx` (shadcn CLI가 생성)

- [ ] **Step 1: 설치**

Run:
```bash
npx --yes shadcn@latest add select -y
```
Expected: `components/ui/select.jsx` 생성, 필요한 의존성 자동 설치.

- [ ] **Step 2: 실제 생성된 컴포넌트의 export 이름 확인**

`pj/components/ui/select.jsx`를 열어 `export { ... }` 구문을 확인한다. 이 프로젝트의 다른
shadcn 컴포넌트(Dialog, Checkbox — Task 2/14에서 이미 확인됨)는 내부적으로 Base UI를
쓰지만 공개 API(named export, prop 이름)는 표준 shadcn 컨벤션(`Select`, `SelectTrigger`,
`SelectValue`, `SelectContent`, `SelectItem`, controlled `value`/`onValueChange` prop)을
그대로 유지했다. Select도 동일한 패턴일 가능성이 높다. **만약 실제 export 이름이 이 계획의
Task 2/5 코드에서 쓰는 것과 다르다면(예: `Select`가 아니라 다른 이름이라면), 이후 태스크의
import 문과 JSX 태그명만 실제 이름에 맞게 바꾸고 나머지 구조(controlled value 패턴,
placeholder, disabled)는 그대로 유지한다.**

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add pj/components/ui/select.jsx pj/package.json pj/package-lock.json pj/components.json
git commit -m "chore: shadcn Select 컴포넌트 추가"
```

---

### Task 2: 진입 화면 (`app/page.js`) 재구성

**Files:**
- Modify: `pj/app/page.js` (전체 교체)

**변경 요약:** 슬레이트 배경 위 흰 카드로 감싸고, 이름/브랜드 드롭다운을 shadcn Select로
교체, 제출 버튼을 인디고 스타일로 바꾼다. fetch/에러 처리/race-guard 로직은 그대로 둔다.

**주목할 점 (의도된 동작 변화, 스타일 범위를 벗어나지 않는 선에서 필요한 조정):**
- shadcn `Select`는 빈 문자열(`""`)을 아이템 값으로 지원하지 않는 것이 일반적이라, "선택
  안 함/선택하세요"로 명시적으로 되돌아가는 옵션은 더 이상 목록에 없다 (초기 미선택 상태는
  `SelectValue`의 `placeholder`로 표시). 이에 따라 기존 `handleMemberChange`의
  `if (!value) { ... }` 분기(네이티브 select의 빈 옵션 선택 시에만 도달 가능했던 코드)는
  이제 도달 불가능해지므로 제거한다 — 서로 다른 두 이름 사이를 전환하는 기존 동작(초기화
  분기가 원래도 적용되지 않던 경로)에는 영향이 없다.
- 이름을 바꿀 때 이전 이름에서 선택했던 `brandId`가 새 이름에는 유효하지 않을 수 있으므로,
  `handleMemberChange`에서 `setBrandId('')`를 추가한다 (기존 코드에는 없던 한 줄이지만,
  지금 건드리는 코드의 명백한 정합성 개선이라 함께 반영한다).

- [ ] **Step 1: 파일 전체 교체**

Replace contents of `pj/app/page.js`:
```jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveIdentity } from '@/lib/identity';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function EntryPage() {
  const router = useRouter();
  const [teamMembers, setTeamMembers] = useState([]);
  const [brands, setBrands] = useState([]);
  const [memberId, setMemberId] = useState('');
  const [brandId, setBrandId] = useState('');
  // Tracks which memberId `brands` currently reflects, so "loading" can be
  // derived during render instead of toggled with a synchronous setState
  // inside the effect below.
  const [brandsLoadedFor, setBrandsLoadedFor] = useState('');
  const [error, setError] = useState('');
  const loadingBrands = Boolean(memberId) && brandsLoadedFor !== memberId;

  useEffect(() => {
    fetch('/api/team-members')
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (!res.ok) throw new Error(data.error ?? '팀원 목록을 불러오지 못했습니다.');
        setTeamMembers(data.teamMembers ?? []);
      })
      .catch((err) => setError(err.message || '팀원 목록을 불러오지 못했습니다.'));
  }, []);

  useEffect(() => {
    if (!memberId) {
      return;
    }
    let cancelled = false;
    fetch(`/api/my-brands?memberId=${memberId}`)
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? '브랜드 목록을 불러오지 못했습니다.');
        setBrands(data.brands ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || '브랜드 목록을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setBrandsLoadedFor(memberId);
      });
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  function handleMemberChange(value) {
    setMemberId(value);
    setBrandId('');
  }

  function handleSubmit(event) {
    event.preventDefault();
    const member = teamMembers.find((m) => m.id === memberId);
    if (!member || !brandId) return;
    saveIdentity({
      memberId: member.id,
      name: member.name,
      isGlobalAdmin: member.is_global_admin,
      brandId,
    });
    router.push('/requirements');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center bg-slate-50 p-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">요구사항 관리</h1>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="member" className="text-sm font-medium text-slate-700">이름</label>
            <Select value={memberId || undefined} onValueChange={handleMemberChange}>
              <SelectTrigger id="member" className="w-full">
                <SelectValue placeholder="선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="brand" className="text-sm font-medium text-slate-700">브랜드</label>
            <Select
              value={brandId || undefined}
              onValueChange={setBrandId}
              disabled={!memberId || loadingBrands}
            >
              <SelectTrigger id="brand" className="w-full">
                <SelectValue placeholder="선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 p-2 text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            disabled={!memberId || !brandId}
          >
            입장
          </button>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add pj/app/page.js
git commit -m "style: 진입 화면에 Clean Neutral 디자인 적용 및 shadcn Select 적용"
```

---

### Task 3: TopBar + 레이아웃 배경 (`components/TopBar.jsx`, `app/requirements/layout.js`)

**Files:**
- Modify: `pj/components/TopBar.jsx` (전체 교체)
- Modify: `pj/app/requirements/layout.js` (배경색 클래스 한 줄 추가 — 스펙에는 명시적으로
  나열되지 않았지만, "페이지 배경 slate-50" 요구사항을 `/requirements` 경로에도 동일하게
  적용하려면 이 파일도 함께 손대야 한다)

- [ ] **Step 1: TopBar 재작성**

Replace contents of `pj/components/TopBar.jsx`:
```jsx
'use client';

import { useIdentity } from './IdentityProvider';

export function TopBar() {
  const { identity, switchUser } = useIdentity();
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-slate-900">{identity.name}</span>
        {identity.isGlobalAdmin && (
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
            전체 관리자
          </span>
        )}
      </div>
      <button onClick={switchUser} className="text-sm text-slate-500 underline hover:text-slate-700">
        다른 사용자로 전환
      </button>
    </header>
  );
}
```

- [ ] **Step 2: 레이아웃 배경색 추가**

In `pj/app/requirements/layout.js`, change:
```jsx
      <div className="min-h-screen">
```
to:
```jsx
      <div className="min-h-screen bg-slate-50">
```
(다른 줄은 그대로 둔다.)

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add pj/components/TopBar.jsx pj/app/requirements/layout.js
git commit -m "style: TopBar 및 /requirements 배경에 Clean Neutral 적용"
```

---

### Task 4: 요구사항 목록 재스타일링 (`components/RequirementList.jsx`)

**Files:**
- Modify: `pj/components/RequirementList.jsx` (전체 교체)

**변경 요약:** 상태 배지를 의미 기반 색상(슬레이트/앰버/인디고/에메랄드)으로 재구성하고,
"비공개" 표시를 로즈 배지로 통일, 테이블 헤더/행 호버/모바일 카드에 새 팔레트를 적용한다.
기존 `?? 'secondary'` 폴백과 동일한 역할(알 수 없는 status 값에 대한 중립 스타일)을
`DEFAULT_STATUS_STYLE`로 유지한다.

- [ ] **Step 1: 파일 전체 교체**

Replace contents of `pj/components/RequirementList.jsx`:
```jsx
import { Badge } from '@/components/ui/badge';

const STATUS_STYLES = {
  대기: 'bg-slate-100 text-slate-600',
  요청: 'bg-slate-100 text-slate-600',
  검토: 'bg-amber-50 text-amber-700',
  정책정의: 'bg-amber-50 text-amber-700',
  진행중: 'bg-indigo-50 text-indigo-700',
  완료: 'bg-emerald-50 text-emerald-700',
};
const DEFAULT_STATUS_STYLE = 'bg-slate-100 text-slate-600';

function StatusBadge({ status }) {
  return <Badge className={STATUS_STYLES[status] ?? DEFAULT_STATUS_STYLE}>{status}</Badge>;
}

function ConfidentialBadge() {
  return <Badge className="bg-rose-50 text-rose-600">비공개</Badge>;
}

export function RequirementList({ requirements }) {
  if (requirements.length === 0) {
    return <p className="text-sm text-slate-500">등록된 요구사항이 없습니다.</p>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="p-2">요청일</th>
              <th className="p-2">상태</th>
              <th className="p-2">카테고리</th>
              <th className="p-2">제목</th>
              <th className="p-2">요청자</th>
              <th className="p-2">우선순위</th>
            </tr>
          </thead>
          <tbody>
            {requirements.map((req) => (
              <tr key={req.id} className="border-t border-slate-200 hover:bg-slate-50">
                <td className="p-2 text-slate-600">{req.request_date}</td>
                <td className="p-2">
                  <StatusBadge status={req.status} />
                </td>
                <td className="p-2 text-slate-600">{req.category?.category_name ?? '-'}</td>
                <td className="p-2 text-slate-900">
                  <span className="inline-flex items-center gap-1.5">
                    {req.title}
                    {req.is_confidential && <ConfidentialBadge />}
                  </span>
                </td>
                <td className="p-2 text-slate-600">{req.requester?.name ?? '-'}</td>
                <td className="p-2 text-slate-600">{req.priority ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        {requirements.map((req) => (
          <div key={req.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <StatusBadge status={req.status} />
              <span className="text-xs text-slate-500">{req.request_date}</span>
            </div>
            <p className="mt-2 flex items-center gap-1.5 font-medium text-slate-900">
              {req.title}
              {req.is_confidential && <ConfidentialBadge />}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {req.category?.category_name ?? '-'} · {req.requester?.name ?? '-'}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add pj/components/RequirementList.jsx
git commit -m "style: 요구사항 목록에 의미 기반 상태 배지 색상 적용"
```

---

### Task 5: 등록 폼 재스타일링 (`components/RequirementFormDialog.jsx`)

**Files:**
- Modify: `pj/components/RequirementFormDialog.jsx` (전체 교체)

**변경 요약:** 카테고리 필드를 네이티브 select에서 shadcn Select로 교체, 제출 버튼을
인디고 스타일로. 네이티브 select는 빈 문자열(`""`)을 "선택 안 함"으로 표현했지만, shadcn
Select는 빈 문자열 아이템 값을 지원하지 않는 것이 일반적이므로 `"none"`이라는 값을 쓰고,
제출 시 `"none"`을 `null`로 변환해서 API에 보낸다 (API가 받는 최종 값은 이전과 동일하게
`null` 또는 실제 카테고리 id).

- [ ] **Step 1: 파일 전체 교체**

Replace contents of `pj/components/RequirementFormDialog.jsx`:
```jsx
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function todayLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyForm() {
  return {
    title: '',
    priority: '',
    urgency: '',
    requestDate: todayLocal(),
    category: 'none',
    asIs: '',
    toBe: '',
    note: '',
    isConfidential: false,
  };
}

export function RequirementFormDialog({ open, onOpenChange, categories, identity, onCreated }) {
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: identity.memberId,
          brandId: identity.brandId,
          requester: identity.memberId,
          title: form.title,
          priority: form.priority || null,
          urgency: form.urgency || null,
          requestDate: form.requestDate,
          category: form.category === 'none' ? null : form.category,
          asIs: form.asIs,
          toBe: form.toBe,
          note: form.note,
          isConfidential: form.isConfidential,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '등록에 실패했습니다.');
      setForm(emptyForm());
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>새 요구사항 등록</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-col gap-1">
            <Label htmlFor="title">제목</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="priority">우선순위</Label>
              <Input
                id="priority"
                value={form.priority}
                onChange={(e) => updateField('priority', e.target.value)}
                placeholder="상/중/하"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="urgency">긴급도</Label>
              <Input
                id="urgency"
                value={form.urgency}
                onChange={(e) => updateField('urgency', e.target.value)}
                placeholder="상/중/하"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="requestDate">요청일</Label>
            <Input
              id="requestDate"
              type="date"
              value={form.requestDate}
              onChange={(e) => updateField('requestDate', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="category">카테고리</Label>
            <Select value={form.category} onValueChange={(value) => updateField('category', value)}>
              <SelectTrigger id="category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">선택 안 함</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="asIs">As-Is</Label>
            <Textarea id="asIs" value={form.asIs} onChange={(e) => updateField('asIs', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="toBe">To-Be</Label>
            <Textarea id="toBe" value={form.toBe} onChange={(e) => updateField('toBe', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="note">비고</Label>
            <Textarea id="note" value={form.note} onChange={(e) => updateField('note', e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="isConfidential"
              checked={form.isConfidential}
              onCheckedChange={(checked) => updateField('isConfidential', Boolean(checked))}
            />
            <Label htmlFor="isConfidential">비공개 요구사항 (2차 이상만 조회 가능)</Label>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? '등록 중...' : '등록'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add pj/components/RequirementFormDialog.jsx
git commit -m "style: 등록 폼 카테고리를 shadcn Select로 교체 및 인디고 버튼 적용"
```

---

### Task 6: 브라우저 검증 (기능 회귀 확인 + 시각 확인)

**Files:** 없음 (검증 전용)

> 이 태스크는 실제 Supabase 프로젝트(URL, SERVICE ROLE KEY)가 이미 설정된 `.env.local`이
> 필요하다 (1단계에서 이미 구성됨). 없다면 사용자에게 확인한다.

- [ ] **Step 1: lint 확인**

Run: `npm run lint`
Expected: 0 errors, 0 warnings

- [ ] **Step 2: 개발 서버 실행**

Run: `npm run dev`
Expected: `http://localhost:3000` 기동

- [ ] **Step 3: 진입 화면 시각 확인**

브라우저에서 `/` 접속 → 슬레이트 배경 위 흰 카드, shadcn Select 드롭다운 렌더링 확인 →
이름 선택 → 브랜드 드롭다운이 활성화되고 해당 브랜드만 나오는지 확인 (Task 15와 동일한
권한 시나리오) → 브랜드 선택 → 인디고 "입장" 버튼 클릭 → `/requirements`로 이동 확인.

- [ ] **Step 4: 목록 화면 시각 확인**

TopBar가 흰 배경 + 하단 테두리로 보이는지, 전역 관리자 배지가 인디고 필로 보이는지 확인.
기존에 등록된 요구사항들의 상태 배지가 의미별 색상(대기=슬레이트, 진행중=인디고,
완료=에메랄드 등)으로 보이는지, `is_confidential` 항목에 로즈색 "비공개" 배지가 붙는지
확인. 브라우저 창을 모바일 너비로 줄여 카드형 레이아웃이 여전히 정상 렌더링되는지 확인.

- [ ] **Step 5: 등록 폼 시각 확인**

"+ 새 요구사항" 클릭 → 카테고리 필드가 shadcn Select로 바뀌었는지, "선택 안 함"을 포함해
브랜드 카테고리들이 옵션으로 나오는지 확인 → 카테고리를 선택하지 않고("선택 안 함" 유지)
제출 → 목록에 카테고리 "-"로 표시되는지 확인 → 카테고리를 선택하고 다시 하나 등록 →
목록에 카테고리명이 표시되는지 확인.

- [ ] **Step 6: 기능 회귀 확인**

Task 15에서 검증했던 시나리오 중 최소 2가지를 다시 확인한다: (a) 3차 사용자로 로그인 시
비공개 요구사항이 안 보이는지, (b) 3차 사용자가 "비공개 요구사항" 체크박스로 등록해도
정상적으로 등록되고 본인 목록에 계속 보이는지(비공개로는 표시되지 않고, Important 버그
수정 결과대로 일반 공개 항목으로 등록됨).

- [ ] **Step 7: 콘솔 에러 확인**

브라우저 개발자 도구 콘솔에 에러가 없는지 확인 (특히 shadcn Select 관련 hydration
경고가 없는지).

- [ ] **Step 8: 최종 커밋**

검증 중 사소한 스타일 버그를 발견해 수정했다면 건별로 커밋한다. 문제가 없다면 이 태스크는
커밋 없이 종료한다.

---

## Self-Review 결과

- **스펙 커버리지**: 컬러 토큰(Task 2~5 전체에 slate/indigo 적용), 상태 배지 의미 매핑
  (Task 4), shadcn Select 교체(Task 1, 2, 5), 4개 화면 전부(Task 2~5) — 스펙의 모든 항목에
  대응하는 태스크가 있다. 스펙에 명시되지 않았던 `app/requirements/layout.js`의 배경색
  한 줄 추가는 스펙의 "페이지 배경 slate-50" 요구사항을 완성하기 위해 Task 3에 포함했고
  이유를 태스크 설명에 명시했다.
- **범위 제외 확인**: 아이콘, 스켈레톤, 브랜딩 강화는 어떤 태스크에도 포함하지 않았다 —
  스펙과 일치.
- **placeholder 없음**: 모든 코드 스텝에 완성된 코드 포함. Task 1의 "export 이름이 다르면
  조정"은 실행 가능한 구체적 지시이며 TBD가 아니다 — CLI가 생성하는 파일의 정확한 내용을
  사전에 알 수 없는 것은 Task 2(shadcn 설치)에서도 동일하게 겪었던 제약이고, 그때도 동일한
  방식(표준 컨벤션 기반 코드 + 검증 지시)으로 성공적으로 처리되었다.
- **타입/시그니처 일관성**: `handleMemberChange(value)`가 이제 이벤트 객체가 아니라 값을
  직접 받는 시그니처로 바뀐 것을 Task 2 안에서 일관되게 반영했다. `emptyForm()`의
  `category: 'none'` 기본값과 `handleSubmit`의 `'none' → null` 변환이 Task 5 안에서
  일관된다. `STATUS_STYLES`/`DEFAULT_STATUS_STYLE` 네이밍이 Task 4 파일 전체에서 일관된다.
