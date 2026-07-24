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
import { TIER_LABELS } from '@/lib/tiers';

const TIERS = ['2차', '3차'];
const SUB_ROLES = ['기획', '개발', '뷰어'];

// props: open, onOpenChange, candidates(미배치 전사 활성 직원), identity, onAssigned()
export function BrandTeamAssignDialog({ open, onOpenChange, candidates, identity, onAssigned }) {
  const [search, setSearch] = useState('');
  const [targetId, setTargetId] = useState(null);
  const [tier, setTier] = useState('3차');
  const [subRole, setSubRole] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // 다이얼로그가 열릴 때마다 입력을 초기화한다. useEffect 안에서 직접 setState를 호출하지
  // 않고 렌더 중 이전 open 값과 비교해 파생시킨다(react-hooks/set-state-in-effect 회피).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSearch('');
      setTargetId(null);
      setTier('3차');
      setSubRole(null);
      setError('');
    }
  }

  const results = search
    ? candidates.filter((m) => m.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  async function handleAssign() {
    if (!targetId) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/brand-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: identity.memberId,
          brandId: identity.brandId,
          targetMemberId: targetId,
          tier,
          subRole,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        throw new Error(d.error ?? '배치 실패');
      }
      onAssigned();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const targetName = candidates.find((m) => m.id === targetId)?.name ?? '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>팀원 배치</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          {error && <p className="text-red-600">{error}</p>}
          <div className="flex flex-col gap-1">
            <Label>직원 검색</Label>
            <Input placeholder="이름으로 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
            <ul className="mt-1 flex flex-col gap-1">
              {results.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setTargetId(m.id)}
                    className={`w-full rounded border px-2 py-1.5 text-left ${
                      targetId === m.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'
                    }`}
                  >
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {targetId && (
            <>
              <p className="text-slate-500">&lsquo;{targetName}&rsquo; 배치</p>
              <div className="flex flex-col gap-1">
                <Label>권한 등급</Label>
                <Select
                  items={TIERS.map((t) => ({ value: t, label: TIER_LABELS[t] }))}
                  value={tier}
                  onValueChange={setTier}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIERS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIER_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label>역할</Label>
                <Select
                  items={SUB_ROLES.map((s) => ({ value: s, label: s }))}
                  value={subRole}
                  onValueChange={setSubRole}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="미지정" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUB_ROLES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={handleAssign}
            disabled={!targetId || submitting}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {submitting ? '배치 중...' : '배치'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
