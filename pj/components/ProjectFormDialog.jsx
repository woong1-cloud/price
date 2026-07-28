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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// props: open, onOpenChange, project(수정 대상 또는 null), teamMembers[], onSaved()
export function ProjectFormDialog({ open, onOpenChange, project, teamMembers, onSaved }) {
  const mode = project ? 'edit' : 'create';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('none');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 다이얼로그가 열리는 렌더에서 폼을 대상 값으로 맞춘다(useEffect 대신 파생 상태).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(project?.name ?? '');
      setDescription(project?.description ?? '');
      setOwner(project?.owner?.id ?? 'none');
      setError('');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const url = mode === 'create' ? '/api/projects' : `/api/projects/${project.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          owner: owner === 'none' ? null : owner,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '저장에 실패했습니다.');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const ownerItems = [
    { value: 'none', label: '지정 안 함' },
    ...teamMembers.map((m) => ({ value: m.id, label: m.name })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '새 프로젝트' : '프로젝트 수정'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
          {error && <p className="text-red-600">{error}</p>}
          <div className="flex flex-col gap-1">
            <Label htmlFor="project-name">프로젝트 이름</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="project-description">설명</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="project-owner">총괄 담당자</Label>
            <Select items={ownerItems} value={owner} onValueChange={setOwner}>
              <SelectTrigger id="project-owner" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ownerItems.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
