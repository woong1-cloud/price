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

// props: open, onOpenChange, member(대상 팀원, {id, name, auth_user_id}), onSaved()
// member.auth_user_id 유무로 "계정 생성"/"비밀번호 재설정" 모드가 자동으로 정해진다.
export function AccountCredentialDialog({ open, onOpenChange, member, onSaved }) {
  const mode = member?.auth_user_id ? 'reset' : 'create';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setEmail('');
      setPassword('');
      setError('');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const url = mode === 'create' ? '/api/admin/create-account' : '/api/admin/reset-password';
      const body =
        mode === 'create'
          ? { targetMemberId: member.id, email, password }
          : { targetMemberId: member.id, password };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '처리에 실패했습니다.');
      onOpenChange(false);
      onSaved();
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
          <DialogTitle>
            {mode === 'create' ? `${member?.name ?? ''} 계정 생성` : `${member?.name ?? ''} 비밀번호 재설정`}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
          {error && <p className="text-red-600">{error}</p>}
          {mode === 'create' && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="account-email">이메일</Label>
              <Input
                id="account-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="account-password">임시 비밀번호</Label>
            <Input
              id="account-password"
              type="text"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? '처리 중...' : mode === 'create' ? '계정 생성' : '비밀번호 재설정'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
