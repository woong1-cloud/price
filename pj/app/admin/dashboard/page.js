'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useIdentity } from '@/components/IdentityProvider';
import { isGlobalAdmin } from '@/lib/tiers';
import { saveIdentity } from '@/lib/identity';
import { DEPLOY_DONE } from '@/lib/projectStatuses';

const PERIODS = [
  { value: '7', label: '7일' },
  { value: '30', label: '30일' },
  { value: 'all', label: '전체' },
];

export default function AdminDashboardPage() {
  const { identity } = useIdentity();
  const router = useRouter();
  const globalAdmin = isGlobalAdmin(identity);

  const [period, setPeriod] = useState('7');
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!globalAdmin) router.replace('/requirements');
  }, [globalAdmin, router]);

  useEffect(() => {
    if (!globalAdmin) return undefined;
    let cancelled = false;
    fetch(`/api/dashboard?days=${period}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error ?? '대시보드 데이터를 불러오지 못했습니다.');
        setData(d);
        setLoadError('');
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [globalAdmin, period]);

  function goToBrand(brandId) {
    saveIdentity({ ...identity, brandId, tier: '1차' });
    router.push('/requirements');
  }

  if (!globalAdmin) {
    return <p className="text-sm text-slate-500">권한이 없습니다. 목록으로 이동합니다...</p>;
  }
  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!data) return <p className="text-sm text-slate-500">불러오는 중...</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">대시보드</h1>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                period === p.value ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="브랜드 수" value={data.overall.brandCount} />
        <SummaryCard label="전체 미해결" value={data.overall.openCount} />
        <SummaryCard label="선택 기간 완료" value={data.overall.completedInPeriod} />
      </div>

      {data.byBrand.length === 0 ? (
        <p className="text-sm text-slate-500">표시할 브랜드가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data.byBrand.map((b) => (
            <button
              key={b.brandId}
              type="button"
              onClick={() => goToBrand(b.brandId)}
              className="rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-indigo-300 hover:shadow-sm"
            >
              <p className="font-medium text-slate-900">{b.brandName}</p>
              <dl className="mt-2 flex flex-col gap-1 text-sm text-slate-500">
                <div className="flex justify-between">
                  <dt>미해결</dt>
                  <dd className="font-medium text-slate-900">{b.openCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>완료</dt>
                  <dd className="font-medium text-slate-900">{b.completedInPeriod}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>평균 소요일</dt>
                  <dd className="font-medium text-slate-900">
                    {b.avgCompletionDays === null ? '-' : `${b.avgCompletionDays.toFixed(1)}일`}
                  </dd>
                </div>
              </dl>
            </button>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-slate-700">프로젝트</h2>

        <div className="grid grid-cols-4 gap-3">
          <SummaryCard label="활성 프로젝트" value={data.projectSummary.activeProjectCount} />
          <SummaryCard label="전개예정" value={data.projectSummary.plannedBrandCount} />
          <SummaryCard label="진행중" value={data.projectSummary.inProgressBrandCount} />
          <SummaryCard label="적용완료" value={data.projectSummary.doneBrandCount} />
        </div>

        {data.mismatches.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">확인 필요</p>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-amber-900">
              {data.mismatches.map((m) => (
                <li key={`${m.projectId}-${m.brandId}`}>
                  <Link href={`/projects/${m.projectId}`} className="underline hover:no-underline">
                    {m.projectName}
                  </Link>
                  {' · '}
                  {m.brandName} — 적용완료인데 미완료 {m.remainingCount}건
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.projects.length === 0 ? (
          <p className="text-sm text-slate-500">등록된 프로젝트가 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2">프로젝트</th>
                <th className="py-2 text-right">전개 브랜드</th>
                <th className="py-2 text-right">적용완료</th>
                <th className="py-2 text-right">전체 진척</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((p) => (
                <tr key={p.projectId} className="border-b border-slate-100">
                  <td className="py-2">
                    <Link
                      href={`/projects/${p.projectId}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {p.projectName}
                    </Link>
                  </td>
                  <td className="py-2 text-right text-slate-500">{p.byBrand.length}</td>
                  <td className="py-2 text-right text-slate-500">
                    {p.byBrand.filter((b) => b.status === DEPLOY_DONE).length}
                  </td>
                  <td className="py-2 text-right text-slate-500">
                    {p.overall.totalCount === 0
                      ? '—'
                      : `${p.overall.doneCount}/${p.overall.totalCount}건`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
