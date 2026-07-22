import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

const STATUS_STYLES = {
  대기: 'bg-slate-100 text-slate-600',
  요청: 'bg-slate-100 text-slate-600',
  검토: 'bg-amber-50 text-amber-700',
  정책정의: 'bg-amber-50 text-amber-700',
  진행중: 'bg-indigo-50 text-indigo-700',
  완료: 'bg-emerald-50 text-emerald-700',
  중복: 'bg-slate-100 text-slate-400',
};
const DEFAULT_STATUS_STYLE = 'bg-slate-100 text-slate-600';

function StatusBadge({ status }) {
  return <Badge className={STATUS_STYLES[status] ?? DEFAULT_STATUS_STYLE}>{status}</Badge>;
}

function ConfidentialBadge() {
  return <Badge className="bg-rose-50 text-rose-600">비공개</Badge>;
}

function Meta({ req }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-slate-400">
      {req.is_confidential && <ConfidentialBadge />}
      {req.image_count > 0 && <span>📎 {req.image_count}</span>}
      {req.status === '중복' && <span>→ 병합됨</span>}
    </span>
  );
}

export function RequirementList({ requirements }) {
  if (requirements.length === 0) {
    return <p className="text-sm text-slate-500">등록된 요구사항이 없습니다.</p>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="p-2">요청일</th>
              <th className="p-2">상태</th>
              <th className="p-2">카테고리</th>
              <th className="p-2">제목</th>
              <th className="p-2">요청자</th>
              <th className="p-2">우선순위</th>
            </tr>
          </thead>
          <tbody>
            {requirements.map((req) => (
              <tr
                key={req.id}
                className={`border-t border-slate-200 hover:bg-slate-50 ${
                  req.status === '중복' ? 'opacity-60' : ''
                }`}
              >
                <td className="p-2 text-slate-600">{req.request_date}</td>
                <td className="p-2">
                  <StatusBadge status={req.status} />
                </td>
                <td className="p-2 text-slate-600">{req.category?.category_name ?? '-'}</td>
                <td className="p-2 text-slate-900">
                  <Link href={`/requirements/${req.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                    {req.title}
                  </Link>
                  <span className="ml-1.5">
                    <Meta req={req} />
                  </span>
                </td>
                <td className="p-2 text-slate-600">{req.requester?.name ?? '-'}</td>
                <td className="p-2 text-slate-600">{req.priority ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        {requirements.map((req) => (
          <Link
            key={req.id}
            href={`/requirements/${req.id}`}
            className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${
              req.status === '중복' ? 'opacity-60' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <StatusBadge status={req.status} />
              <span className="text-xs text-slate-500">{req.request_date}</span>
            </div>
            <p className="mt-2 font-medium text-slate-900">{req.title}</p>
            <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              {req.category?.category_name ?? '-'} · {req.requester?.name ?? '-'}
              <Meta req={req} />
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
