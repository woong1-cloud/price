'use client';

import Link from 'next/link';
import { useIdentity } from './IdentityProvider';
import { canProcess, canManageBrand, isGlobalAdmin } from '@/lib/tiers';

export function TopBar() {
  const { identity, logout } = useIdentity();
  const processAllowed = canProcess(identity);
  const manageBrand = canManageBrand(identity);
  const globalAdmin = isGlobalAdmin(identity);
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium text-slate-900">{identity.name}</span>
        {identity.isGlobalAdmin && (
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
            전체 관리자
          </span>
        )}
        <Link href="/requirements" className="text-slate-500 hover:text-slate-700">
          목록
        </Link>
        {processAllowed && (
          <Link href="/requirements/board" className="text-slate-500 hover:text-slate-700">
            보드
          </Link>
        )}
        {manageBrand && (
          <Link href="/requirements/settings" className="text-slate-500 hover:text-slate-700">
            설정
          </Link>
        )}
        {globalAdmin && (
          <Link href="/admin/brands" className="text-slate-500 hover:text-slate-700">
            브랜드 관리
          </Link>
        )}
        {globalAdmin && (
          <Link href="/admin/dashboard" className="text-slate-500 hover:text-slate-700">
            대시보드
          </Link>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Link href="/change-password" className="text-sm text-slate-500 hover:text-slate-700">
          비밀번호 변경
        </Link>
        <button onClick={logout} className="text-sm text-slate-500 underline hover:text-slate-700">
          로그아웃
        </button>
      </div>
    </header>
  );
}
