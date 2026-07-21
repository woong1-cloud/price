'use client';

import { useIdentity } from './IdentityProvider';

export function TopBar() {
  const { identity, switchUser } = useIdentity();
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-slate-900">{identity.name}</span>
        {identity.isGlobalAdmin && (
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
            전체 관리자
          </span>
        )}
      </div>
      <button onClick={switchUser} className="text-sm text-slate-500 underline hover:text-slate-700">
        다른 사용자로 전환
      </button>
    </header>
  );
}
