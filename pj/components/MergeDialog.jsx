'use client';

import { useEffect, useState } from 'react';
import { useIdentity } from '@/components/IdentityProvider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// props: source(req), onClose(), onMerged()
export function MergeDialog({ source, onClose, onMerged }) {
  const { identity } = useIdentity();
  const [candidates, setCandidates] = useState([]);
  const [allReqs, setAllReqs] = useState([]);
  const [search, setSearch] = useState('');
  const [targetId, setTargetId] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/requirements/${source.id}/similar?memberId=${identity.memberId}&brandId=${identity.brandId}`)
      .then((res) => res.json())
      .then((d) => setCandidates(d.candidates ?? []))
      .catch(() => {});
    fetch(`/api/requirements?brandId=${identity.brandId}&memberId=${identity.memberId}`)
      .then((res) => res.json())
      .then((d) => setAllReqs((d.requirements ?? []).filter((r) => r.id !== source.id && r.status !== '중복')))
      .catch(() => {});
  }, [source.id, identity.memberId, identity.brandId]);

  const searchResults = search
    ? allReqs.filter((r) => r.title.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  async function doMerge() {
    if (!targetId) return;
    setSubmitting(true);
    setError('');
    const res = await fetch(`/api/requirements/${source.id}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: identity.memberId, brandId: identity.brandId, targetId }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '병합 실패');
      return;
    }
    onMerged();
  }

  const targetTitle =
    candidates.find((c) => c.id === targetId)?.title ??
    allReqs.find((r) => r.id === targetId)?.title ??
    '';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>중복 처리</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-slate-500">
            &lsquo;{source.title}&rsquo; 을(를) 아래 기존 요청에 병합합니다.
          </p>

          {error && <p className="text-red-600">{error}</p>}

          <div>
            <p className="mb-1 font-medium text-slate-700">유사 후보</p>
            {candidates.length === 0 && <p className="text-slate-400">유사한 요청을 찾지 못했습니다.</p>}
            <ul className="flex flex-col gap-1">
              {candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setTargetId(c.id)}
                    className={`w-full rounded border px-2 py-1.5 text-left ${
                      targetId === c.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'
                    }`}
                  >
                    {c.title}{' '}
                    <span className="text-xs text-slate-400">
                      · {c.requester_name ?? '-'} · 유사도 {(c.score * 100).toFixed(0)}%
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-1 font-medium text-slate-700">직접 검색</p>
            <Input
              placeholder="제목으로 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <ul className="mt-1 flex flex-col gap-1">
              {searchResults.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setTargetId(r.id)}
                    className={`w-full rounded border px-2 py-1.5 text-left ${
                      targetId === r.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'
                    }`}
                  >
                    {r.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {targetId && (
            <p className="rounded bg-amber-50 p-2 text-amber-700">
              &lsquo;{targetTitle}&rsquo; 에 병합합니다. 되돌릴 수 없습니다.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={doMerge}
            disabled={!targetId || submitting}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {submitting ? '병합 중...' : '병합'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
