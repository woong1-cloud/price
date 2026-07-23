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

// props: open, onOpenChange, identity, onCreated()
export function TeamMemberFormDialog({ open, onOpenChange, identity, onCreated }) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // 다이얼로그가 열릴 때마다 입력을 초기화한다. useEffect 안에서 직접 setState를 호출하지
  // 않고 렌더 중 이전 open 값과 비교해 파생시킨다(react-hooks/set-state-in-effect 회피).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName('');
      setError('');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/team-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: identity.memberId, name }),
      });
      const d = await res.json();
      if (!res.ok) {
        throw new Error(d.error ?? '등록에 실패했습니다.');
      }
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 직원 등록</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
          {error && <p className="text-red-600">{error}</p>}
          <div className="flex flex-col gap-1">
            <Label htmlFor="member-name">이름</Label>
            <Input id="member-name" value={name} onChange={(e) => setName(e.target.value)} required />
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
