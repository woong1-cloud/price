'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useIdentity } from '@/components/IdentityProvider';
import { isGlobalAdmin, canProcess, canManageBrand } from '@/lib/tiers';
import { KanbanBoard } from '@/components/KanbanBoard';
import { MergeDialog } from '@/components/MergeDialog';
import { ProjectBrandsSection } from '@/components/ProjectBrandsSection';
import { ProjectFormDialog } from '@/components/ProjectFormDialog';

export default function ProjectDetailPage() {
  const { id } = useParams();
  const { identity } = useIdentity();
  const globalAdmin = isGlobalAdmin(identity);

  const [data, setData] = useState(null);
  const [myBrands, setMyBrands] = useState([]);
  const [allBrands, setAllBrands] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [mergeSource, setMergeSource] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    fetch('/api/my-brands')
      .then((res) => res.json())
      .then((d) => setMyBrands(d.brands ?? []))
      .catch(() => {});
    fetch('/api/team-members')
      .then((res) => res.json())
      .then((d) => setTeamMembers(d.teamMembers ?? []))
      .catch(() => {});
  }, []);

  // 전개 대상 추가 드롭다운에 쓸 전체 브랜드 목록 — 전체관리자만 필요하다.
  useEffect(() => {
    if (!globalAdmin) return;
    fetch('/api/brands')
      .then((res) => res.json())
      .then((d) => setAllBrands((d.brands ?? []).filter((b) => b.is_active)))
      .catch(() => {});
  }, [globalAdmin]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${id}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error ?? '프로젝트를 불러오지 못했습니다.');
        setData(d);
        setError('');
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadToken]);

  // 브랜드별 내 등급 — 프로젝트 보드는 카드마다 브랜드가 다르므로 카드 단위로 판정한다.
  const tierByBrand = useMemo(
    () => new Map(myBrands.map((b) => [b.id, b.tier])),
    [myBrands],
  );

  const canEditStatus = useCallback(
    (brandId) => canManageBrand({ isGlobalAdmin: globalAdmin, tier: tierByBrand.get(brandId) }),
    [globalAdmin, tierByBrand],
  );

  const canDragCard = useCallback(
    (req) => canProcess({ isGlobalAdmin: globalAdmin, tier: tierByBrand.get(req.brand_id) }),
    [globalAdmin, tierByBrand],
  );

  // 카드에 브랜드명을 붙인다(KanbanBoard의 showBrandBadge가 이 필드를 읽는다).
  const boardRequirements = useMemo(() => {
    if (!data) return [];
    const nameById = new Map(data.byBrand.map((b) => [b.brandId, b.brandName]));
    return data.requirements.map((r) => ({ ...r, brand_name: nameById.get(r.brand_id) ?? '' }));
  }, [data]);

  const availableBrands = useMemo(() => {
    if (!data) return [];
    const taken = new Set(data.byBrand.map((b) => b.brandId));
    return allBrands.filter((b) => !taken.has(b.id));
  }, [data, allBrands]);

  async function callApi(url, options, failMessage) {
    setActionError('');
    const res = await fetch(url, options);
    if (!res.ok) {
      const d = await res.json();
      setActionError(d.error ?? failMessage);
      return false;
    }
    refresh();
    return true;
  }

  async function handleStatusChange(card, newStatus) {
    const prevStatus = card.status;
    setData((prev) =>
      prev
        ? {
            ...prev,
            requirements: prev.requirements.map((r) =>
              r.id === card.id ? { ...r, status: newStatus } : r,
            ),
          }
        : prev,
    );

    const res = await fetch(`/api/requirements/${card.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId: card.brand_id, status: newStatus }),
    });
    if (!res.ok) {
      const d = await res.json();
      setActionError(d.error ?? '상태 변경 실패');
      setData((prev) =>
        prev
          ? {
              ...prev,
              requirements: prev.requirements.map((r) =>
                r.id === card.id ? { ...r, status: prevStatus } : r,
              ),
            }
          : prev,
      );
      return;
    }
    // 진척률을 다시 계산해야 하므로 서버 데이터를 새로 받는다.
    refresh();
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">불러오는 중...</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/projects" className="text-xs text-slate-500 hover:underline">
            ← 프로젝트 목록
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">
            {data.project.name}
            {!data.project.is_active && (
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                보관됨
              </span>
            )}
          </h1>
          {data.project.description && (
            <p className="mt-1 text-sm text-slate-500">{data.project.description}</p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            총괄 담당자 {data.project.owner?.name ?? '미지정'}
          </p>
        </div>
        {globalAdmin && (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            수정
          </button>
        )}
      </div>

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      <ProjectBrandsSection
        byBrand={data.byBrand}
        canEditStatus={canEditStatus}
        canManageBrands={globalAdmin}
        availableBrands={availableBrands}
        onChangeStatus={(brandId, status) =>
          callApi(
            `/api/projects/${id}/brands/${brandId}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status }),
            },
            '전개 상태 변경 실패',
          )
        }
        onAddBrand={(brandId) =>
          callApi(
            `/api/projects/${id}/brands`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ brandId }),
            },
            '전개 브랜드 추가 실패',
          )
        }
        onRemoveBrand={(brandId) =>
          callApi(`/api/projects/${id}/brands/${brandId}`, { method: 'DELETE' }, '전개 브랜드 제거 실패')
        }
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-700">
          연결된 요구사항 <span className="text-slate-400">{data.requirements.length}건</span>
        </h2>
        {data.requirements.length === 0 ? (
          <p className="text-sm text-slate-500">
            아직 연결된 요구사항이 없습니다. 요구사항 상세 화면에서 이 프로젝트로 연결하세요.
          </p>
        ) : (
          <KanbanBoard
            requirements={boardRequirements}
            onStatusChange={handleStatusChange}
            onMerge={setMergeSource}
            canDragCard={canDragCard}
            showBrandBadge
          />
        )}
      </section>

      {mergeSource && (
        <MergeDialog
          source={mergeSource}
          onClose={() => setMergeSource(null)}
          onMerged={() => {
            setMergeSource(null);
            refresh();
          }}
        />
      )}

      <ProjectFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={data.project}
        teamMembers={teamMembers}
        onSaved={refresh}
      />
    </div>
  );
}
