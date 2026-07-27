'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIdentity } from '@/components/IdentityProvider';
import { canProcess } from '@/lib/tiers';
import { KanbanBoard } from '@/components/KanbanBoard';

export default function BoardPage() {
  const { identity } = useIdentity();
  const router = useRouter();
  const processAllowed = canProcess(identity);

  useEffect(() => {
    if (!processAllowed) router.replace('/requirements');
  }, [processAllowed, router]);

  if (!processAllowed) return <p className="text-sm text-slate-500">권한이 없습니다. 목록으로 이동합니다...</p>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-900">요구사항 보드</h1>
      <KanbanBoard />
    </div>
  );
}
