'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useIdentity } from '@/components/IdentityProvider';
import { isGlobalAdmin } from '@/lib/tiers';
import { ProjectFormDialog } from '@/components/ProjectFormDialog';

const STATUS_STYLE = {
  전개예정: 'bg-slate-100 text-slate-500',
  진행중: 'bg-amber-50 text-amber-700',
  적용완료: 'bg-emerald-50 text-emerald-600',
};

export default function ProjectsPage() {
  const { identity } = useIdentity();
  const globalAdmin = isGlobalAdmin(identity);

  const [scope, setScope] = useState('brand'); // 'brand' | 'all'
  const [projects, setProjects] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    fetch('/api/team-members')
      .then((res) => res.json())
      .then((d) => setTeamMembers(d.teamMembers ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (scope === 'brand') params.set('brandId', identity.brandId);
    fetch(`/api/projects?${params.toString()}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error ?? '프로젝트를 불러오지 못했습니다.');
        setProjects(d.projects ?? []);
        setError('');
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, identity.brandId, reloadToken]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">프로젝트</h1>
        {globalAdmin && (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700"
          >
            + 새 프로젝트
          </button>
        )}
      </div>

      <div className="flex gap-1">
        <ScopeButton active={scope === 'brand'} onClick={() => setScope('brand')}>
          내 브랜드
        </ScopeButton>
        <ScopeButton active={scope === 'all'} onClick={() => setScope('all')}>
          전사 전체
        </ScopeButton>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loaded ? (
        <p className="text-sm text-slate-500">불러오는 중...</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-slate-500">
          {scope === 'brand'
            ? '이 브랜드에 전개된 프로젝트가 없습니다.'
            : '등록된 프로젝트가 없습니다.'}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">프로젝트</th>
              <th className="py-2">{scope === 'brand' ? '전개 상태' : '브랜드별 전개'}</th>
              <th className="py-2 text-right">진척</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} scope={scope} brandId={identity.brandId} />
            ))}
          </tbody>
        </table>
      )}

      <ProjectFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={null}
        teamMembers={teamMembers}
        onSaved={refresh}
      />
    </div>
  );
}

function ScopeButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm ${
        active ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

function ProjectRow({ project, scope, brandId }) {
  const mine = project.byBrand.find((b) => b.brandId === brandId);
  const shown = scope === 'brand' ? mine : null;
  const counts = scope === 'brand' ? mine : project.overall;

  return (
    <tr className="border-b border-slate-100">
      <td className="py-2">
        <Link href={`/projects/${project.id}`} className="font-medium text-indigo-600 hover:underline">
          {project.name}
        </Link>
      </td>
      <td className="py-2">
        {shown ? (
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${
              STATUS_STYLE[shown.status] ?? 'bg-slate-100 text-slate-500'
            }`}
          >
            {shown.status}
          </span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {project.byBrand.map((b) => (
              <span
                key={b.brandId}
                className={`rounded px-1.5 py-0.5 text-[11px] ${
                  STATUS_STYLE[b.status] ?? 'bg-slate-100 text-slate-500'
                }`}
                title={b.status}
              >
                {b.brandName}
              </span>
            ))}
            {project.byBrand.length === 0 && <span className="text-xs text-slate-400">-</span>}
          </span>
        )}
      </td>
      <td className="py-2 text-right text-slate-500">
        {!counts || counts.totalCount === 0 ? '—' : `${counts.doneCount}/${counts.totalCount}건`}
      </td>
    </tr>
  );
}
