'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearIdentity, loadIdentity } from '@/lib/identity';

const IdentityContext = createContext(null);

export function IdentityProvider({ children }) {
  const router = useRouter();
  const [identity, setIdentity] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const stored = loadIdentity();
    if (!stored) {
      router.replace('/');
      return;
    }
    setIdentity(stored);
    setChecked(true);
  }, [router]);

  function switchUser() {
    clearIdentity();
    router.replace('/');
  }

  if (!checked) {
    return <div className="p-6 text-sm text-gray-500">불러오는 중...</div>;
  }

  return (
    <IdentityContext.Provider value={{ identity, switchUser }}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  const context = useContext(IdentityContext);
  if (!context) {
    throw new Error('useIdentity는 IdentityProvider 내부에서만 사용할 수 있습니다.');
  }
  return context;
}
