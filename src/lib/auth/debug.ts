// Auth debug utilities
// Logs and probes are gated by VITE_DEBUG_AUTH

const DEBUG_AUTH = import.meta.env.VITE_DEBUG_AUTH === 'true';

export function logAuth(...args: any[]) {
  if (DEBUG_AUTH) {
    // Prefix to make filtering easy
    // eslint-disable-next-line no-console
    console.log('[AUTH DEBUG]', ...args);
  }
}

export function probeNetwork() {
  try {
    const testKey = '__auth_probe__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    logAuth('probeNetwork', {
      localStorage: 'available',
      userAgent: navigator.userAgent,
      url: window.location.origin,
    });
  } catch (e) {
    logAuth('probeNetwork', {
      localStorage: 'UNAVAILABLE',
      error: (e as Error)?.message,
      userAgent: navigator.userAgent,
    });
  }
}

export function attachAuthProbes(supabase: any) {
  if (!DEBUG_AUTH) return;

  logAuth('attachAuthProbes: start');
  probeNetwork();

  // Log initial session
  supabase.auth.getSession().then(({ data, error }: any) => {
    if (error) {
      logAuth('getSession error', error);
    } else {
      logAuth('getSession result', { hasSession: !!data?.session, user: data?.session?.user?.email });
    }
  });

  // Subscribe to auth events
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
    logAuth('onAuthStateChange', { event, hasSession: !!session, user: session?.user?.email });
  });

  // Clean up when the page unloads
  window.addEventListener('beforeunload', () => {
    try {
      subscription?.unsubscribe?.();
      logAuth('attachAuthProbes: unsubscribed');
    } catch {}
  });
}