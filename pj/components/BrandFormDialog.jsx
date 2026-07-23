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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const WORKFLOW_TEMPLATES = ['표준', '커스텀'];

function emptyForm(brand) {
  return {
    name: brand?.name ?? '',
    code: brand?.code ?? '',
    workflowTemplate: brand?.workflow_template ?? '표준',
  };
}

// props: open, onOpenChange, brand(수정 대상, 없으면 생성 모드), teamMembers(전사 활성 직원),
// identity, onSaved()
export function BrandFormDialog({ open, onOpenChange, brand, teamMembers, identity, onSaved }) {
  const isEdit = Boolean(brand);
  const [form, setForm] = useState(() => emptyForm(brand));
  const [search, setSearch] = useState('');
  const [adminId, setAdminId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // 다이얼로그가 열릴 때마다 입력을 초기화한다. useEffect 안에서 직접 setState를 호출하지
  // 않고 렌더 중 이전 open 값과 비교해 파생시킨다(react-hooks/set-state-in-effect 회피).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(emptyForm(brand));
      setSearch('');
      setAdminId(null);
      setError('');
    }
  }

  const searchResults = search
    ? teamMembers.filter((m) => m.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isEdit && !adminId) {
      setError('초기 2차 관리자를 선택해주세요.');
      return;
    }
    setSubmitting(true);
    setError('');
    const url = isEdit ? `/api/brands/${brand.id}` : '/api/brands';
    const method = isEdit ? 'PATCH' : 'POST';
    const body = isEdit
      ? { memberId: identity.memberId, name: form.name, code: form.code, workflowTemplate: form.workflowTemplate }
      : {
          memberId: identity.memberId,
          name: form.name,
          code: form.code,
          workflowTemplate: form.workflowTemplate,
          adminMemberId: adminId,
        };
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        throw new Error(d.error ?? '저장에 실패했습니다.');
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const adminName = teamMembers.find((m) => m.id === adminId)?.name ?? '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? '브랜드 수정' : '새 브랜드'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
          {error && <p className="text-red-600">{error}</p>}
          <div className="flex flex-col gap-1">
            <Label htmlFor="brand-name">이름</Label>
            <Input id="brand-name" value={form.name} onChange={(e) => updateField('name', e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="brand-code">코드</Label>
            <Input id="brand-code" value={form.code} onChange={(e) => updateField('code', e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="brand-workflow">워크플로 템플릿</Label>
            <Select
              items={WORKFLOW_TEMPLATES.map((w) => ({ value: w, label: w }))}
              value={form.workflowTemplate}
              onValueChange={(v) => updateField('workflowTemplate', v)}
            >
              <SelectTrigger id="brand-workflow" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORKFLOW_TEMPLATES.map((w) => (
                  <SelectItem key={w} value={w}>
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isEdit && (
            <div className="flex flex-col gap-1">
              <Label>초기 2차 관리자</Label>
              <Input placeholder="이름으로 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
              {adminId && <p className="text-xs text-slate-500">선택됨: {adminName}</p>}
              <ul className="mt-1 flex flex-col gap-1">
                {searchResults.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setAdminId(m.id)}
                      className={`w-full rounded border px-2 py-1.5 text-left ${
                        adminId === m.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'
                      }`}
                    >
                      {m.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
