'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { useIdentity } from '@/components/IdentityProvider';
import { BOARD_STATUSES } from '@/lib/statuses';
import { RequirementCard } from '@/components/RequirementCard';
import { MergeDialog } from '@/components/MergeDialog';

function Column({ status, items, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="min-w-[180px] flex-shrink-0">
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <span className="text-sm font-medium text-slate-700">{status}</span>
        <span className="text-xs text-slate-400">{items.length}</span>
        {status === '대기' && (
          <span className="ml-auto rounded border border-indigo-200 px-1.5 text-[11px] text-indigo-600">
            Triage
          </span>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[120px] flex-col gap-2 rounded-lg p-1.5 ${
          isOver ? 'bg-indigo-50' : 'bg-slate-100/50'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function KanbanBoard() {
  const { identity } = useIdentity();
  const [reqs, setReqs] = useState([]);
  const [error, setError] = useState('');
  const [mergeSource, setMergeSource] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function load() {
    fetch(`/api/requirements?brandId=${identity.brandId}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (!res.ok) throw new Error(d.error ?? '불러오지 못했습니다.');
        setReqs(d.requirements ?? []);
        setError('');
      })
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.brandId]);

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(BOARD_STATUSES.map((s) => [s, []]));
    for (const r of reqs) {
      if (map[r.status]) map[r.status].push(r);
    }
    // 대기는 오래된 것 먼저, 나머지는 최신 먼저
    for (const s of BOARD_STATUSES) {
      map[s].sort((a, b) =>
        s === '대기'
          ? a.request_date.localeCompare(b.request_date)
          : b.request_date.localeCompare(a.request_date),
      );
    }
    return map;
  }, [reqs]);

  async function onDragEnd(event) {
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id;
    const card = reqs.find((r) => r.id === active.id);
    if (!card || card.status === newStatus || !BOARD_STATUSES.includes(newStatus)) return;

    const prevStatus = card.status;
    setReqs((prev) => prev.map((r) => (r.id === active.id ? { ...r, status: newStatus } : r)));

    const res = await fetch(`/api/requirements/${active.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId: identity.brandId, status: newStatus }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '상태 변경 실패');
      setReqs((prev) => prev.map((r) => (r.id === active.id ? { ...r, status: prevStatus } : r)));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {BOARD_STATUSES.map((status) => (
            <Column key={status} status={status} items={byStatus[status]}>
              {byStatus[status].map((req) => (
                <RequirementCard key={req.id} req={req} onMerge={setMergeSource} />
              ))}
            </Column>
          ))}
        </div>
      </DndContext>
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
