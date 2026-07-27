'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';

// props: categories(sort_order 오름차순 정렬됨), identity, onChanged()
export function CategorySettings({ categories, identity, onChanged }) {
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  async function addCategory(event) {
    event.preventDefault();
    if (!newName.trim()) return;
    setError('');
    const res = await fetch('/api/brand-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId: identity.brandId, categoryName: newName }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '추가 실패');
      return;
    }
    setNewName('');
    onChanged();
  }

  async function removeCategory(id) {
    setError('');
    const res = await fetch(
      `/api/brand-categories/${id}?brandId=${identity.brandId}`,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '삭제 실패');
      return;
    }
    onChanged();
  }

  async function move(index, direction) {
    const other = categories[index + direction];
    const current = categories[index];
    if (!other) return;
    setError('');
    const [resA, resB] = await Promise.all([
      fetch(`/api/brand-categories/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: identity.brandId, sortOrder: other.sort_order }),
      }),
      fetch(`/api/brand-categories/${other.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: identity.brandId, sortOrder: current.sort_order }),
      }),
    ]);
    if (!resA.ok || !resB.ok) {
      setError('순서 변경 실패');
    }
    onChanged();
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-slate-700">카테고리</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="flex flex-col gap-1 text-sm">
        {categories.map((c, i) => (
          <li key={c.id} className="flex items-center justify-between rounded border border-slate-200 px-2 py-1.5">
            <span>{c.category_name}</span>
            <div className="flex items-center gap-2 text-xs">
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="text-slate-500 disabled:opacity-30">
                ↑
              </button>
              <button
                type="button"
                disabled={i === categories.length - 1}
                onClick={() => move(i, 1)}
                className="text-slate-500 disabled:opacity-30"
              >
                ↓
              </button>
              <button type="button" onClick={() => removeCategory(c.id)} className="text-rose-600 hover:underline">
                삭제
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={addCategory} className="flex gap-2">
        <Input placeholder="새 카테고리" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">
          추가
        </button>
      </form>
    </section>
  );
}
