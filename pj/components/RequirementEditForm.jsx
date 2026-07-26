'use client';

import { useEffect, useState } from 'react';
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

const LEVELS = ['상', '중', '하'];
const LEVEL_STYLE = {
  상: { on: 'border-rose-300 bg-rose-50 text-rose-600', off: 'border-slate-200 text-slate-400 hover:bg-slate-50' },
  중: { on: 'border-amber-300 bg-amber-50 text-amber-700', off: 'border-slate-200 text-slate-400 hover:bg-slate-50' },
  하: { on: 'border-slate-300 bg-slate-100 text-slate-600', off: 'border-slate-200 text-slate-400 hover:bg-slate-50' },
};

function LevelSelect({ id, value, onChange }) {
  return (
    <div id={id} className="flex gap-1.5">
      {LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onChange(value === level ? '' : level)}
          className={`flex-1 rounded-lg border px-2 py-1.5 text-sm transition-colors ${
            value === level ? LEVEL_STYLE[level].on : LEVEL_STYLE[level].off
          }`}
        >
          {level}
        </button>
      ))}
    </div>
  );
}

// props: requirement(현재 값), canSetConfidential, identity, onSaved(updatedRequirement), onCancel()
export function RequirementEditForm({ requirement, canSetConfidential, identity, onSaved, onCancel }) {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    title: requirement.title ?? '',
    priority: requirement.priority ?? '',
    urgency: requirement.urgency ?? '',
    category: requirement.category?.id ?? 'none',
    asIs: requirement.as_is ?? '',
    toBe: requirement.to_be ?? '',
    note: requirement.note ?? '',
    isConfidential: requirement.is_confidential ?? false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/brand-categories?brandId=${identity.brandId}`)
      .then((res) => res.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => {});
  }, [identity.brandId]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/requirements/${requirement.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: identity.memberId,
          brandId: identity.brandId,
          title: form.title,
          priority: form.priority || null,
          urgency: form.urgency || null,
          category: form.category === 'none' ? null : form.category,
          asIs: form.asIs,
          toBe: form.toBe,
          note: form.note,
          isConfidential: form.isConfidential,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '수정에 실패했습니다.');
      onSaved(data.requirement);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-indigo-200 bg-indigo-50/30 p-4"
    >
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-title">제목</Label>
        <Input id="edit-title" value={form.title} onChange={(e) => updateField('title', e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="edit-priority">우선순위</Label>
          <LevelSelect id="edit-priority" value={form.priority} onChange={(v) => updateField('priority', v)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="edit-urgency">긴급도</Label>
          <LevelSelect id="edit-urgency" value={form.urgency} onChange={(v) => updateField('urgency', v)} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-category">카테고리</Label>
        <Select
          items={[
            { value: 'none', label: '선택 안 함' },
            ...categories.map((c) => ({ value: c.id, label: c.category_name })),
          ]}
          value={form.category}
          onValueChange={(value) => updateField('category', value)}
        >
          <SelectTrigger id="edit-category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">선택 안 함</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.category_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-asIs">As-Is</Label>
        <Textarea id="edit-asIs" value={form.asIs} onChange={(e) => updateField('asIs', e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-toBe">To-Be</Label>
        <Textarea id="edit-toBe" value={form.toBe} onChange={(e) => updateField('toBe', e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-note">비고</Label>
        <Textarea id="edit-note" value={form.note} onChange={(e) => updateField('note', e.target.value)} />
      </div>
      {canSetConfidential && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="edit-isConfidential"
            checked={form.isConfidential}
            onCheckedChange={(checked) => updateField('isConfidential', Boolean(checked))}
          />
          <Label htmlFor="edit-isConfidential">비공개 요구사항 (브랜드 관리자 이상만 조회 가능)</Label>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          취소
        </Button>
        <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
          {submitting ? '저장 중...' : '저장'}
        </Button>
      </div>
    </form>
  );
}
