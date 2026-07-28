'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIdentity } from '@/components/IdentityProvider';
import { canManageBrand } from '@/lib/tiers';
import { BrandTeamSection } from '@/components/BrandTeamSection';
import { CategorySettings } from '@/components/CategorySettings';

export default function SettingsPage() {
  const { identity } = useIdentity();
  const router = useRouter();
  const manageBrand = canManageBrand(identity);

  const [members, setMembers] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!manageBrand) router.replace('/requirements');
  }, [manageBrand, router]);

  useEffect(() => {
    if (!manageBrand) return undefined;
    let cancelled = false;
    fetch(`/api/brand-team?brandId=${identity.brandId}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error ?? '팀원 배치를 불러오지 못했습니다.');
        setMembers(d.members ?? []);
        setLoadError('');
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message);
      });
    fetch('/api/team-members')
      .then((res) => res.json())
      .then((d) => {
        if (!cancelled) setTeamMembers(d.teamMembers ?? []);
      })
      .catch(() => {});
    fetch(`/api/brand-categories?brandId=${identity.brandId}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error ?? '카테고리를 불러오지 못했습니다.');
        setCategories(d.categories ?? []);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [manageBrand, identity.brandId, reloadToken]);

  function refresh() {
    setReloadToken((t) => t + 1);
  }

  if (!manageBrand) {
    return <p className="text-sm text-slate-500">권한이 없습니다. 목록으로 이동합니다...</p>;
  }
  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold text-slate-900">브랜드 설정</h1>
      <BrandTeamSection members={members} teamMembers={teamMembers} identity={identity} onChanged={refresh} />
      <CategorySettings categories={categories} identity={identity} onChanged={refresh} />
    </div>
  );
}
