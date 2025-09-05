import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { logAuth, probeNetwork } from '@/lib/auth/debug';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AuthDebug() {
  const { initialized, session, user } = useAuthStore();
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const debugEnabled = import.meta.env.VITE_DEBUG_AUTH === 'true';

  const load = async () => {
    const [{ data: sess, error: sErr }, { data: usr, error: uErr }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ]);
    if (sErr) logAuth('AuthDebug getSession error', sErr);
    if (uErr) logAuth('AuthDebug getUser error', uErr);
    setSessionInfo(sess);
    setUserInfo(usr);
    logAuth('AuthDebug refreshed', { hasSession: !!sess?.session, user: usr?.user?.email });
  };

  useEffect(() => {
    if (!debugEnabled) return;
    probeNetwork();
    load();
  }, [debugEnabled]);

  if (!debugEnabled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle>Auth Debug is disabled</CardTitle>
          </CardHeader>
          <CardContent>
            Enable VITE_DEBUG_AUTH=true to access this page.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Auth State</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>initialized: {String(initialized)}</div>
            <div>hasSession: {String(!!session)}</div>
            <div>user: {user?.email || 'null'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Supabase Queries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <pre className="whitespace-pre-wrap break-words text-xs">getSession: {JSON.stringify(sessionInfo, null, 2)}</pre>
            <pre className="whitespace-pre-wrap break-words text-xs">getUser: {JSON.stringify(userInfo, null, 2)}</pre>
            <div className="flex gap-2 mt-2">
              <Button size="sm" onClick={load}>Refresh Session</Button>
              <Button size="sm" variant="secondary" onClick={async () => { await supabase.auth.signOut(); logAuth('signOut from debug'); load(); }}>Clear Session</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Environment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>localStorage: try console logs (probeNetwork)</div>
            <div>userAgent: {navigator.userAgent}</div>
            <div>SUPABASE_URL prefix: {"https://ddttwqzfbzjntxieeusd.supabase.co".slice(0, 30)}...</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}