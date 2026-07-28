'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIdentity } from '@/components/IdentityProvider';
import { canProcess } from '@/lib/tiers';
import { KanbanBoard } from '@/components/KanbanBoard';
import { MergeDialog } from '@/components/MergeDialog';

export default function BoardPage() {
  const { identity } = useIdentity();
  const router = useRouter();
  const processAllowed = canProcess(identity);

  const [reqs, setReqs] = useState([]);
  const [error, setError] = useState('');
  const [mergeSource, setMergeSource] = useState(null);

  useEffect(() => {
    if (!processAllowed) router.replace('/requirements');
  }, [processAllowed, router]);

  const load = useCallback(() => {
    fetch(`/api/requirements?brandId=${identity.brandId}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (!res.ok) throw new Error(d.error ?? '불러오지 못했습니다.');
        setReqs(d.requirements ?? []);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, [identity.brandId]);

  useEffect(() => {
    if (!processAllowed) return;
    load();
  }, [processAllowed, load]);

  async function handleStatusChange(card, newStatus) {
    const prevStatus = card.status;
    setReqs((prev) => prev.map((r) => (r.id === card.id ? { ...r, status: newStatus } : r)));

    const res = await fetch(`/api/requirements/${card.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId: card.brand_id ?? identity.brandId, status: newStatus }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '상태 변경 실패');
      setReqs((prev) => prev.map((r) => (r.id === card.id ? { ...r, status: prevStatus } : r)));
    }
  }

  if (!processAllowed) {
    return <p className="text-sm text-slate-500">권한이 없습니다. 목록으로 이동합니다...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-900">요구사항 보드</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <KanbanBoard requirements={reqs} onStatusChange={handleStatusChange} onMerge={setMergeSource} />
      {mergeSource && (
        <MergeDialog
          source={mergeSource}
          onClose={() => setMergeSource(null)}
          onMerged={() => {
            setMergeSource(null);
            load();
          }}
        />
      )}
    </div>
  );
}
