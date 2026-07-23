'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BrandTeamAssignDialog } from '@/components/BrandTeamAssignDialog';

const TIERS = ['2차', '3차'];
const SUB_ROLES = ['기획', '개발', '뷰어'];

// props: members(브랜드 배치 목록), teamMembers(전사 활성 풀), identity, onChanged()
export function BrandTeamSection({ members, teamMembers, identity, onChanged }) {
  const [error, setError] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);

  const assignedIds = new Set(members.map((m) => m.id));
  const candidates = teamMembers.filter((m) => !assignedIds.has(m.id));

  async function updateRole(targetMemberId, patch) {
    setError('');
    const res = await fetch(`/api/brand-team/${targetMemberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: identity.memberId, brandId: identity.brandId, ...patch }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '변경 실패');
      return;
    }
    onChanged();
  }

  async function remove(targetMemberId) {
    setError('');
    const res = await fetch(
      `/api/brand-team/${targetMemberId}?memberId=${identity.memberId}&brandId=${identity.brandId}`,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '해제 실패');
      return;
    }
    onChanged();
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">팀원 배치</h2>
        <button
          type="button"
          onClick={() => setAssignOpen(true)}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
        >
          + 배치
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2">이름</th>
            <th className="py-2">tier</th>
            <th className="py-2">역할</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-b border-slate-100">
              <td className="py-2">{m.name}</td>
              <td className="py-2">
                <Select
                  items={TIERS.map((t) => ({ value: t, label: t }))}
                  value={m.tier}
                  onValueChange={(v) => updateRole(m.id, { tier: v })}
                >
                  <SelectTrigger className="h-8 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIERS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              <td className="py-2">
                <Select
                  items={SUB_ROLES.map((s) => ({ value: s, label: s }))}
                  value={m.subRole ?? null}
                  onValueChange={(v) => updateRole(m.id, { subRole: v })}
                >
                  <SelectTrigger className="h-8 w-24 text-xs">
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
              </td>
              <td className="py-2 text-right">
                <button type="button" onClick={() => remove(m.id)} className="text-rose-600 hover:underline">
                  해제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <BrandTeamAssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        candidates={candidates}
        identity={identity}
        onAssigned={() => {
          setAssignOpen(false);
          onChanged();
        }}
      />
    </section>
  );
}
