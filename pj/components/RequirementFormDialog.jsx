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

function emptyForm() {
  return {
    title: '',
    priority: '',
    urgency: '',
    requestDate: new Date().toISOString().slice(0, 10),
    category: '',
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
          category: form.category || null,
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
            <select
              id="category"
              className="rounded border p-2 text-sm"
              value={form.category}
              onChange={(e) => updateField('category', e.target.value)}
            >
              <option value="">선택 안 함</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.category_name}</option>
              ))}
            </select>
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
            <Button type="submit" disabled={submitting}>
              {submitting ? '등록 중...' : '등록'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
