'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useRouter } from 'next/navigation';

const PRIORITY_STYLE = {
  상: 'bg-rose-50 text-rose-600',
  중: 'bg-amber-50 text-amber-700',
  하: 'bg-slate-100 text-slate-500',
};

export function RequirementCard({ req, onMerge }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: req.id });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border border-slate-200 bg-white p-3 ${
        req.status === '완료' ? 'opacity-75' : ''
      }`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        {req.priority && PRIORITY_STYLE[req.priority] && (
          <span className={`rounded px-1.5 py-0.5 text-[11px] ${PRIORITY_STYLE[req.priority]}`}>
            {req.priority}
          </span>
        )}
        {req.duplicate_count > 0 && (
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-700">
            중복 {req.duplicate_count}
          </span>
        )}
        {req.image_count > 0 && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
            📎 {req.image_count}
          </span>
        )}
        {req.is_confidential && (
          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-600">비공개</span>
        )}
      </div>

      <button
        type="button"
        onClick={() => router.push(`/requirements/${req.id}`)}
        className="block text-left text-[13px] text-slate-900 hover:underline"
      >
        {req.title}
      </button>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">{req.category?.category_name ?? '-'}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onMerge(req)}
            className="text-[11px] text-indigo-600 hover:underline"
          >
            중복처리
          </button>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-500">
            {req.assignee?.name ? req.assignee.name.slice(0, 2) : '미'}
          </span>
        </div>
      </div>

      <button
        type="button"
        {...listeners}
        {...attributes}
        className="mt-2 w-full cursor-grab rounded bg-slate-50 py-1 text-[11px] text-slate-400"
        aria-label="드래그해서 상태 변경"
      >
        ⋮⋮ 이동
      </button>
    </div>
  );
}
