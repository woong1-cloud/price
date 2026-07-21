'use client';

import { useCallback, useEffect, useState } from 'react';
import { useIdentity } from '@/components/IdentityProvider';
import { RequirementList } from '@/components/RequirementList';
import { RequirementFormDialog } from '@/components/RequirementFormDialog';

export default function RequirementsPage() {
  const { identity } = useIdentity();
  const [requirements, setRequirements] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadRequirements = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/requirements?brandId=${identity.brandId}&memberId=${identity.memberId}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '요구사항을 불러오지 못했습니다.');
      setRequirements(data.requirements);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [identity.brandId, identity.memberId]);

  useEffect(() => {
    loadRequirements();
    fetch(`/api/brand-categories?brandId=${identity.brandId}`)
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []));
  }, [identity.brandId, loadRequirements]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">요구사항 목록</h1>
        <button
          onClick={() => setDialogOpen(true)}
          className="rounded bg-black px-3 py-2 text-sm text-white"
        >
          + 새 요구사항
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">불러오는 중...</p>
      ) : (
        <RequirementList requirements={requirements} />
      )}
      <RequirementFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categories}
        identity={identity}
        onCreated={loadRequirements}
      />
    </div>
  );
}
