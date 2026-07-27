'use client';

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { clearIdentity, loadIdentity } from '@/lib/identity';
import { createClient } from '@/lib/supabaseBrowser';

const IdentityContext = createContext(null);

// Identity lives in localStorage, an external (non-React) source of truth.
// Nothing besides this app's own saveIdentity/clearIdentity calls mutates it
// while a page is mounted, and those are always immediately followed by a
// full navigation, so there's nothing to actively subscribe to here.
function subscribeToIdentity() {
  return () => {};
}

function getServerIdentitySnapshot() {
  return null;
}

export function IdentityProvider({ children }) {
  const router = useRouter();
  const identity = useSyncExternalStore(subscribeToIdentity, loadIdentity, getServerIdentitySnapshot);

  useEffect(() => {
    // Read localStorage directly here rather than trusting the `identity`
    // render value: on a hard navigation straight to a page under this
    // provider, the first render uses the SSR/hydration snapshot (always
    // null), and this effect can fire before useSyncExternalStore's
    // post-hydration correction lands. Checking storage directly avoids
    // redirecting away from a valid session during that window.
    if (!loadIdentity()) {
      router.replace('/login');
    }
  }, [router]);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearIdentity();
    router.replace('/login');
  }

  if (!identity) {
    return <div className="p-6 text-sm text-slate-500">불러오는 중...</div>;
  }

  return (
    <IdentityContext.Provider value={{ identity, logout }}>
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
