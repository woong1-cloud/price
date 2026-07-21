'use client';

import { useEffect, useState } from 'react';
import { useIdentity } from '@/components/IdentityProvider';
import { RequirementList } from '@/components/RequirementList';
import { RequirementFormDialog } from '@/components/RequirementFormDialog';

export default function RequirementsPage() {
  const { identity } = useIdentity();
  const [requirements, setRequirements] = useState([]);
  const [categories, setCategories] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Bumped to force a manual refresh (e.g. after creating a requirement).
  const [reloadToken, setReloadToken] = useState(0);
  // Tracks which fetch attempt `requirements`/`categories`/`error` currently
  // reflect, so "loading" can be derived during render instead of toggled
  // with a synchronous setState inside the effect below. requirements and
  // categories fetch independently, so each gets its own error slot -
  // otherwise whichever settles last would clobber the other's error.
  const [loadResult, setLoadResult] = useState({
    key: null,
    requirementsError: '',
    categoriesError: '',
  });

  const currentKey = `${identity.brandId}:${identity.memberId}:${reloadToken}`;
  const loading = loadResult.key !== currentKey;
  const error =
    loadResult.key === currentKey
      ? loadResult.requirementsError || loadResult.categoriesError
      : '';

  function refreshRequirements() {
    setReloadToken((token) => token + 1);
  }

  useEffect(() => {
    let cancelled = false;

    // Merge this fetch's outcome into loadResult without clobbering whatever
    // the other (independent) fetch already recorded for the same key.
    function mergeLoadResult(partial) {
      setLoadResult((prev) => ({
        key: currentKey,
        requirementsError: prev.key === currentKey ? prev.requirementsError : '',
        categoriesError: prev.key === currentKey ? prev.categoriesError : '',
        ...partial,
      }));
    }

    fetch(`/api/requirements?brandId=${identity.brandId}&memberId=${identity.memberId}`)
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? '요구사항을 불러오지 못했습니다.');
        setRequirements(data.requirements);
        mergeLoadResult({ requirementsError: '' });
      })
      .catch((err) => {
        if (!cancelled) mergeLoadResult({ requirementsError: err.message });
      });

    fetch(`/api/brand-categories?brandId=${identity.brandId}`)
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? '카테고리를 불러오지 못했습니다.');
        setCategories(data.categories ?? []);
        mergeLoadResult({ categoriesError: '' });
      })
      .catch((err) => {
        if (!cancelled) {
          mergeLoadResult({ categoriesError: err.message || '카테고리를 불러오지 못했습니다.' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [identity.brandId, identity.memberId, currentKey]);

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
        onCreated={refreshRequirements}
      />
    </div>
  );
}
