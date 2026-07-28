'use client';

import { useMemo } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { BOARD_STATUSES } from '@/lib/statuses';
import { RequirementCard } from '@/components/RequirementCard';

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

// 데이터는 부모가 소유한다. 이 컴포넌트는 받은 배열을 컬럼으로 나눠 그리고
// 드롭 이벤트를 위로 올려보내기만 한다(브랜드 보드/프로젝트 보드 공용).
//
// props:
//   requirements      화면에 뿌릴 요구사항 배열
//   onStatusChange    (req, newStatus) => void — 낙관적 갱신/롤백은 부모 책임
//   onMerge           (req) => void — 카드의 중복처리 버튼
//   canDragCard       (req) => boolean — 카드 단위 드래그 허용 여부
//   showBrandBadge    카드에 브랜드명 배지를 표시할지(프로젝트 보드에서 true)
export function KanbanBoard({
  requirements,
  onStatusChange,
  onMerge,
  canDragCard = () => true,
  showBrandBadge = false,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(BOARD_STATUSES.map((s) => [s, []]));
    for (const r of requirements) {
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
  }, [requirements]);

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id;
    const card = requirements.find((r) => r.id === active.id);
    if (!card || card.status === newStatus || !BOARD_STATUSES.includes(newStatus)) return;
    if (!canDragCard(card)) return;
    onStatusChange(card, newStatus);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {BOARD_STATUSES.map((status) => (
          <Column key={status} status={status} items={byStatus[status]}>
            {byStatus[status].map((req) => (
              <RequirementCard
                key={req.id}
                req={req}
                onMerge={onMerge}
                draggable={canDragCard(req)}
                showBrandBadge={showBrandBadge}
              />
            ))}
          </Column>
        ))}
      </div>
    </DndContext>
  );
}
