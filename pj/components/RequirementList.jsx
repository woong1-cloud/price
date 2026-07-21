import { Badge } from '@/components/ui/badge';

const STATUS_VARIANT = {
  대기: 'secondary',
  요청: 'secondary',
  검토: 'outline',
  정책정의: 'outline',
  진행중: 'default',
  완료: 'default',
};

export function RequirementList({ requirements }) {
  if (requirements.length === 0) {
    return <p className="text-sm text-gray-500">등록된 요구사항이 없습니다.</p>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded border md:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
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
              <tr key={req.id} className="border-t">
                <td className="p-2">{req.request_date}</td>
                <td className="p-2">
                  <Badge variant={STATUS_VARIANT[req.status] ?? 'secondary'}>{req.status}</Badge>
                </td>
                <td className="p-2">{req.category?.category_name ?? '-'}</td>
                <td className="p-2">
                  {req.title}
                  {req.is_confidential && <span className="ml-1 text-xs text-red-500">비공개</span>}
                </td>
                <td className="p-2">{req.requester?.name ?? '-'}</td>
                <td className="p-2">{req.priority ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        {requirements.map((req) => (
          <div key={req.id} className="rounded border p-3">
            <div className="flex items-center justify-between">
              <Badge variant={STATUS_VARIANT[req.status] ?? 'secondary'}>{req.status}</Badge>
              <span className="text-xs text-gray-500">{req.request_date}</span>
            </div>
            <p className="mt-2 font-medium">
              {req.title}
              {req.is_confidential && <span className="ml-1 text-xs text-red-500">비공개</span>}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {req.category?.category_name ?? '-'} · {req.requester?.name ?? '-'}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
