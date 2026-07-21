'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveIdentity } from '@/lib/identity';

export default function EntryPage() {
  const router = useRouter();
  const [teamMembers, setTeamMembers] = useState([]);
  const [brands, setBrands] = useState([]);
  const [memberId, setMemberId] = useState('');
  const [brandId, setBrandId] = useState('');
  // Tracks which memberId `brands` currently reflects, so "loading" can be
  // derived during render instead of toggled with a synchronous setState
  // inside the effect below.
  const [brandsLoadedFor, setBrandsLoadedFor] = useState('');
  const [error, setError] = useState('');
  const loadingBrands = Boolean(memberId) && brandsLoadedFor !== memberId;

  useEffect(() => {
    fetch('/api/team-members')
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (!res.ok) throw new Error(data.error ?? '팀원 목록을 불러오지 못했습니다.');
        setTeamMembers(data.teamMembers ?? []);
      })
      .catch((err) => setError(err.message || '팀원 목록을 불러오지 못했습니다.'));
  }, []);

  useEffect(() => {
    if (!memberId) {
      return;
    }
    let cancelled = false;
    fetch(`/api/my-brands?memberId=${memberId}`)
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? '브랜드 목록을 불러오지 못했습니다.');
        setBrands(data.brands ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || '브랜드 목록을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setBrandsLoadedFor(memberId);
      });
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  function handleMemberChange(event) {
    const value = event.target.value;
    setMemberId(value);
    if (!value) {
      setBrands([]);
      setBrandId('');
      setBrandsLoadedFor('');
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const member = teamMembers.find((m) => m.id === memberId);
    if (!member || !brandId) return;
    saveIdentity({
      memberId: member.id,
      name: member.name,
      isGlobalAdmin: member.is_global_admin,
      brandId,
    });
    router.push('/requirements');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">요구사항 관리</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="member" className="text-sm font-medium">이름</label>
          <select
            id="member"
            className="rounded border p-2"
            value={memberId}
            onChange={handleMemberChange}
            required
          >
            <option value="">선택하세요</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="brand" className="text-sm font-medium">브랜드</label>
          <select
            id="brand"
            className="rounded border p-2"
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            required
            disabled={!memberId || loadingBrands}
          >
            <option value="">선택하세요</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded bg-black p-2 text-white disabled:opacity-50"
          disabled={!memberId || !brandId}
        >
          입장
        </button>
      </form>
    </main>
  );
}
