'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useIdentity } from '@/components/IdentityProvider';
import { canManage } from '@/lib/tiers';
import { RequirementList } from '@/components/RequirementList';
import { RequirementFormDialog } from '@/components/RequirementFormDialog';
import { FilterBar } from '@/components/FilterBar';

export default function RequirementsPage() {
  const { identity } = useIdentity();
  const manage = canManage(identity);
  const [requirements, setRequirements] = useState([]);
  const [categories, setCategories] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [filters, setFilters] = useState({ assignee: '', category: '', priority: '' });
  // 직접 setLoading(true/false)를 effect 안에서 호출하지 않고, "이 조회 조건에 대한
  // 응답을 이미 받았는지"를 key 비교로 파생시킨다(react-hooks/set-state-in-effect 회피).
  const [loadedKey, setLoadedKey] = useState('');
  const [error, setError] = useState('');

  const currentKey = JSON.stringify({
    brandId: identity.brandId,
    memberId: identity.memberId,
    reloadToken,
    filters,
  });
  const loading = loadedKey !== currentKey;

  function refreshRequirements() {
    setReloadToken((t) => t + 1);
  }

  useEffect(() => {
    fetch('/api/team-members')
      .then((res) => res.json())
      .then((d) => setTeamMembers(d.teamMembers ?? []))
      .catch(() => {});
    fetch(`/api/brand-categories?brandId=${identity.brandId}`)
      .then((res) => res.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => {});
  }, [identity.brandId]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ brandId: identity.brandId, memberId: identity.memberId });
    if (filters.assignee) params.set('assignee', filters.assignee);
    if (filters.category) params.set('category', filters.category);
    if (filters.priority) params.set('priority', filters.priority);
    fetch(`/api/requirements?${params.toString()}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error ?? '요구사항을 불러오지 못했습니다.');
        setRequirements(d.requirements ?? []);
        setError('');
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(currentKey);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.brandId, identity.memberId, reloadToken, filters]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">요구사항 목록</h1>
        <div className="flex items-center gap-2">
          {manage && (
            <Link
              href="/requirements/board"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              보드
            </Link>
          )}
          <button
            onClick={() => setDialogOpen(true)}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white transition-colors hover:bg-indigo-700"
          >
            + 새 요구사항
          </button>
        </div>
      </div>

      <FilterBar
        teamMembers={teamMembers}
        categories={categories}
        value={filters}
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-500">불러오는 중...</p>
      ) : (
        <RequirementList requirements={requirements} />
      )}
      <RequirementFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categories}
        identity={identity}
        onCreated={refreshRequirements}
      />
    </div>
  );
}
