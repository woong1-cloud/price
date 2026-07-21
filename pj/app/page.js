'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveIdentity } from '@/lib/identity';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

  function handleMemberChange(value) {
    setMemberId(value);
    setBrandId('');
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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center bg-slate-50 p-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">요구사항 관리</h1>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="member" className="text-sm font-medium text-slate-700">이름</label>
            <Select value={memberId || undefined} onValueChange={handleMemberChange}>
              <SelectTrigger id="member" className="w-full">
                <SelectValue placeholder="선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="brand" className="text-sm font-medium text-slate-700">브랜드</label>
            <Select
              value={brandId || undefined}
              onValueChange={setBrandId}
              disabled={!memberId || loadingBrands}
            >
              <SelectTrigger id="brand" className="w-full">
                <SelectValue placeholder="선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 p-2 text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            disabled={!memberId || !brandId}
          >
            입장
          </button>
        </form>
      </div>
    </main>
  );
}
