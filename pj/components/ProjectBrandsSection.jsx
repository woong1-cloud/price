'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DEPLOY_STATUSES, DEPLOY_DONE } from '@/lib/projectStatuses';

const STATUS_STYLE = {
  전개예정: 'bg-slate-100 text-slate-500',
  진행중: 'bg-amber-50 text-amber-700',
  적용완료: 'bg-emerald-50 text-emerald-600',
};

function ProgressBar({ doneCount, totalCount, status }) {
  if (totalCount === 0) {
    // 0/0을 0%로 그리면 "시작했는데 진도가 없는 것"처럼 오해된다.
    return <span className="flex-1 text-[11px] text-slate-300">—</span>;
  }
  const pct = Math.round((doneCount / totalCount) * 100);
  return (
    <div className="flex flex-1 items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-200">
        <div
          className={`h-full ${status === DEPLOY_DONE ? 'bg-emerald-500' : 'bg-indigo-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-16 text-right text-[11px] text-slate-500">
        {doneCount}/{totalCount}건
      </span>
    </div>
  );
}

// props:
//   byBrand[]        computeProjectProgress의 byBrand
//   canEditStatus    (brandId) => boolean — 해당 브랜드 2차 이상인지
//   canManageBrands  전체관리자인지 (전개 대상 추가/제거 버튼)
//   availableBrands  아직 전개 대상이 아닌 브랜드 [{id, name}]
//   onChangeStatus   (brandId, status) => Promise
//   onAddBrand       (brandId) => Promise
//   onRemoveBrand    (brandId) => Promise
export function ProjectBrandsSection({
  byBrand,
  canEditStatus,
  canManageBrands,
  availableBrands,
  onChangeStatus,
  onAddBrand,
  onRemoveBrand,
}) {
  const [adding, setAdding] = useState('');

  const doneBrandCount = byBrand.filter((b) => b.status === DEPLOY_DONE).length;

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <h2 className="text-sm font-medium text-slate-700">전개 현황</h2>
        <span className="text-xs text-slate-500">
          {byBrand.length}개 브랜드 · {doneBrandCount}개 적용완료
        </span>
      </div>

      {byBrand.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-500">아직 전개 대상 브랜드가 없습니다.</p>
      ) : (
        <ul>
          {byBrand.map((b) => (
            <li
              key={b.brandId}
              className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0"
            >
              <span className="w-20 flex-shrink-0 text-sm font-medium text-slate-900">
                {b.brandName}
              </span>

              {canEditStatus(b.brandId) ? (
                <Select
                  items={DEPLOY_STATUSES.map((s) => ({ value: s, label: s }))}
                  value={b.status}
                  onValueChange={(v) => onChangeStatus(b.brandId, v)}
                >
                  <SelectTrigger className="h-7 w-28 flex-shrink-0 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPLOY_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span
                  className={`w-28 flex-shrink-0 rounded px-2 py-0.5 text-center text-xs font-medium ${
                    STATUS_STYLE[b.status] ?? 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {b.status}
                </span>
              )}

              <ProgressBar doneCount={b.doneCount} totalCount={b.totalCount} status={b.status} />

              {canManageBrands && (
                <button
                  type="button"
                  onClick={() => onRemoveBrand(b.brandId)}
                  className="flex-shrink-0 text-xs text-slate-400 hover:text-red-600 hover:underline"
                >
                  제거
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManageBrands && availableBrands.length > 0 && (
        <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-2.5">
          <Select
            items={availableBrands.map((b) => ({ value: b.id, label: b.name }))}
            value={adding || null}
            onValueChange={setAdding}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="브랜드 선택" />
            </SelectTrigger>
            <SelectContent>
              {availableBrands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            disabled={!adding}
            onClick={async () => {
              await onAddBrand(adding);
              setAdding('');
            }}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            + 전개 브랜드 추가
          </button>
        </div>
      )}
    </section>
  );
}
