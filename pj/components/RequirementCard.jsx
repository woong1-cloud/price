'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useRouter } from 'next/navigation';

const PRIORITY_STYLE = {
  상: 'bg-rose-50 text-rose-600',
  중: 'bg-amber-50 text-amber-700',
  하: 'bg-slate-100 text-slate-500',
};

// props:
//   req             요구사항
//   onMerge         (req) => void
//   draggable       false면 드래그 핸들을 잠근다(권한 없는 브랜드의 카드)
//   showBrandBadge  카드에 브랜드명 배지를 표시(프로젝트 보드처럼 여러 브랜드가 섞일 때)
//   canOpen         false면 제목을 링크로 만들지 않는다. 프로젝트 보드는 전 브랜드 카드를
//                   띄우는데, 요구사항 상세는 그 브랜드 권한이 있어야 열린다. 링크를 그냥
//                   두면 눌렀을 때 권한 오류 페이지로 떨어진다.
export function RequirementCard({
  req,
  onMerge,
  draggable = true,
  showBrandBadge = false,
  canOpen = true,
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: req.id,
    disabled: !draggable,
  });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border border-slate-200 bg-white p-3 ${
        req.status === '완료' ? 'opacity-75' : ''
      }`}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {showBrandBadge && req.brand_name && (
          <span className="rounded bg-slate-900/85 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {req.brand_name}
          </span>
        )}
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

      {canOpen ? (
        <button
          type="button"
          onClick={() => router.push(`/requirements/${req.id}`)}
          className="block text-left text-[13px] text-slate-900 hover:underline"
        >
          {req.title}
        </button>
      ) : (
        <p className="block text-left text-[13px] text-slate-500" title="이 브랜드에 대한 권한이 없습니다.">
          {req.title}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">{req.category?.category_name ?? '-'}</span>
        <div className="flex items-center gap-1.5">
          {draggable && (
            <button
              type="button"
              onClick={() => onMerge(req)}
              className="text-[11px] text-indigo-600 hover:underline"
            >
              중복처리
            </button>
          )}
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-500">
            {req.assignee?.name ? req.assignee.name.slice(0, 2) : '미'}
          </span>
        </div>
      </div>

      {draggable ? (
        <button
          type="button"
          {...listeners}
          {...attributes}
          className="mt-2 w-full cursor-grab rounded bg-slate-50 py-1 text-[11px] text-slate-400"
          aria-label="드래그해서 상태 변경"
        >
          ⋮⋮ 이동
        </button>
      ) : (
        <p className="mt-2 w-full rounded bg-slate-50 py-1 text-center text-[11px] text-slate-300">
          권한 없음
        </p>
      )}
    </div>
  );
}
