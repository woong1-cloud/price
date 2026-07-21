'use client';

import { useIdentity } from './IdentityProvider';

export function TopBar() {
  const { identity, switchUser } = useIdentity();
  return (
    <header className="flex items-center justify-between border-b p-4">
      <div className="text-sm">
        <span className="font-medium">{identity.name}</span>
        {identity.isGlobalAdmin && <span className="ml-2 text-gray-500">전체 관리자</span>}
      </div>
      <button onClick={switchUser} className="text-sm text-gray-500 underline">
        다른 사용자로 전환
      </button>
    </header>
  );
}
