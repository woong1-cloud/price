'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIdentity } from '@/components/IdentityProvider';
import { isGlobalAdmin } from '@/lib/tiers';
import { BrandFormDialog } from '@/components/BrandFormDialog';
import { TeamMemberFormDialog } from '@/components/TeamMemberFormDialog';

export default function AdminBrandsPage() {
  const { identity } = useIdentity();
  const router = useRouter();
  const globalAdmin = isGlobalAdmin(identity);

  const [brands, setBrands] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);

  useEffect(() => {
    if (!globalAdmin) router.replace('/requirements');
  }, [globalAdmin, router]);

  useEffect(() => {
    if (!globalAdmin) return undefined;
    let cancelled = false;
    fetch(`/api/brands?memberId=${identity.memberId}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error ?? '브랜드 목록을 불러오지 못했습니다.');
        setBrands(d.brands ?? []);
        setLoadError('');
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message);
      });
    fetch('/api/team-members?includeInactive=true')
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error ?? '팀원 목록을 불러오지 못했습니다.');
        setTeamMembers(d.teamMembers ?? []);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [globalAdmin, identity.memberId, reloadToken]);

  function refresh() {
    setReloadToken((t) => t + 1);
  }

  async function toggleBrandActive(brand) {
    setActionError('');
    const res = await fetch(`/api/brands/${brand.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: identity.memberId, isActive: !brand.is_active }),
    });
    if (!res.ok) {
      const d = await res.json();
      setActionError(d.error ?? '브랜드 상태 변경 실패');
      return;
    }
    refresh();
  }

  async function toggleMemberActive(member) {
    setActionError('');
    const res = await fetch(`/api/team-members/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: identity.memberId, isActive: !member.is_active }),
    });
    if (!res.ok) {
      const d = await res.json();
      setActionError(d.error ?? '재직여부 변경 실패');
      return;
    }
    refresh();
  }

  if (!globalAdmin) {
    return <p className="text-sm text-slate-500">권한이 없습니다. 목록으로 이동합니다...</p>;
  }
  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;

  const activeTeamMembers = teamMembers.filter((m) => m.is_active);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold text-slate-900">브랜드 관리</h1>
      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-700">브랜드</h2>
          <button
            type="button"
            onClick={() => {
              setEditingBrand(null);
              setBrandDialogOpen(true);
            }}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
          >
            + 새 브랜드
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">이름</th>
              <th className="py-2">코드</th>
              <th className="py-2">워크플로</th>
              <th className="py-2">상태</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {brands.map((b) => (
              <tr key={b.id} className="border-b border-slate-100">
                <td className="py-2">{b.name}</td>
                <td className="py-2 text-slate-500">{b.code}</td>
                <td className="py-2 text-slate-500">{b.workflow_template}</td>
                <td className="py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      b.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {b.is_active ? '활성' : '비활성'}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBrand(b);
                      setBrandDialogOpen(true);
                    }}
                    className="mr-3 text-indigo-600 hover:underline"
                  >
                    수정
                  </button>
                  <button type="button" onClick={() => toggleBrandActive(b)} className="text-slate-500 hover:underline">
                    {b.is_active ? '비활성화' : '활성화'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-700">팀원</h2>
          <button
            type="button"
            onClick={() => setMemberDialogOpen(true)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
          >
            + 새 직원
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">이름</th>
              <th className="py-2">재직여부</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {teamMembers.map((m) => (
              <tr key={m.id} className="border-b border-slate-100">
                <td className="py-2">{m.name}</td>
                <td className="py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      m.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {m.is_active ? '재직중' : '비활성'}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <button type="button" onClick={() => toggleMemberActive(m)} className="text-slate-500 hover:underline">
                    {m.is_active ? '비활성화' : '활성화'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <BrandFormDialog
        open={brandDialogOpen}
        onOpenChange={setBrandDialogOpen}
        brand={editingBrand}
        teamMembers={activeTeamMembers}
        identity={identity}
        onSaved={refresh}
      />
      <TeamMemberFormDialog
        open={memberDialogOpen}
        onOpenChange={setMemberDialogOpen}
        identity={identity}
        onCreated={refresh}
      />
    </div>
  );
}
