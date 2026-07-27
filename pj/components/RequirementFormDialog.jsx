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
import { ImageDropzone } from '@/components/ImageDropzone';

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
  const [imageFiles, setImageFiles] = useState([]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // 제출 없이(Esc·바깥 클릭·닫기 버튼) 다이얼로그를 닫으면 이전 입력이 다음에 열었을 때
  // 그대로 남아있지 않도록 초기화한다.
  function handleOpenChange(next) {
    if (!next) {
      setForm(emptyForm());
      setImageFiles([]);
      setError('');
    }
    onOpenChange(next);
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
      const created = data.requirement;
      let imageUploadFailed = false;
      if (imageFiles.length > 0 && created?.id) {
        try {
          const fd = new FormData();
          fd.append('memberId', identity.memberId);
          fd.append('brandId', identity.brandId);
          imageFiles.forEach((f) => fd.append('files', f));
          const imgRes = await fetch(`/api/requirements/${created.id}/images`, {
            method: 'POST',
            body: fd,
          });
          if (!imgRes.ok) {
            const imgData = await imgRes.json();
            throw new Error(imgData.error ?? '이미지 업로드에 실패했습니다.');
          }
        } catch (imgErr) {
          // 본문은 이미 저장됨 — 상세에서 이미지 재시도 가능. 다이얼로그를 닫지 않고
          // 경고를 계속 보여준다(닫으면 애니메이션과 함께 메시지가 바로 사라져 버림).
          imageUploadFailed = true;
          setError(`요구사항은 등록됐지만 이미지 업로드에 실패했습니다: ${imgErr.message}`);
        }
      }
      setForm(emptyForm());
      setImageFiles([]);
      onCreated();
      if (!imageUploadFailed) {
        onOpenChange(false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
              <LevelSelect
                id="priority"
                value={form.priority}
                onChange={(v) => updateField('priority', v)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="urgency">긴급도</Label>
              <LevelSelect
                id="urgency"
                value={form.urgency}
                onChange={(v) => updateField('urgency', v)}
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
            <Select
              items={[
                { value: 'none', label: '선택 안 함' },
                ...categories.map((c) => ({ value: c.id, label: c.category_name })),
              ]}
              value={form.category}
              onValueChange={(value) => updateField('category', value)}
            >
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
          <div className="flex flex-col gap-1">
            <Label>이미지 첨부</Label>
            <ImageDropzone
              files={imageFiles}
              onAdd={(added) => setImageFiles((prev) => [...prev, ...added])}
              onRemove={(i) => setImageFiles((prev) => prev.filter((_, idx) => idx !== i))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="isConfidential"
              checked={form.isConfidential}
              onCheckedChange={(checked) => updateField('isConfidential', Boolean(checked))}
            />
            <Label htmlFor="isConfidential">비공개 요구사항 (브랜드 관리자 이상만 조회 가능)</Label>
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
