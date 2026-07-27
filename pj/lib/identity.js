const STORAGE_KEY = 'requirements-app-identity';

// Cache the last parsed value keyed by the raw localStorage string so
// `loadIdentity` returns a referentially stable result when the underlying
// value hasn't changed. This makes it safe to use directly as a
// `useSyncExternalStore` snapshot (React compares snapshots with
// `Object.is` and would otherwise re-render on every call).
let cachedRaw;
let cachedIdentity;

export function loadIdentity() {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedIdentity;
  cachedRaw = raw;
  if (!raw) {
    cachedIdentity = null;
    return cachedIdentity;
  }
  try {
    cachedIdentity = JSON.parse(raw);
  } catch {
    cachedIdentity = null;
  }
  return cachedIdentity;
}

export function saveIdentity(identity) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export function clearIdentity() {
  window.localStorage.removeItem(STORAGE_KEY);
}
