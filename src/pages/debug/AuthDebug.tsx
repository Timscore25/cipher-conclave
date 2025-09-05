import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { logAuth, probeNetwork } from '@/lib/auth/debug';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

export default function AuthDebug() {
  const { initialized, session, user } = useAuthStore();
  const { toast } = useToast();
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [testEmail, setTestEmail] = useState('test@example.com');
  const [testPassword, setTestPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  
  const debugEnabled = import.meta.env.VITE_DEBUG_AUTH === 'true';

  // Environment info
  const envInfo = useMemo(() => {
    const url = import.meta.env.VITE_SUPABASE_URL || 'https://ddttwqzfbzjntxieeusd.supabase.co';
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdHR3cXpmYnpqbnR4aWVldXNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwMjc5MDcsImV4cCI6MjA3MjYwMzkwN30.GYw7o2zt33NmJwLKnRf4fS3GnYMTJPeQFncbaepHofs';
    
    return {
      supabaseUrl: new URL(url).host,
      anonKeyPrefix: key.slice(0, 6) + '...',
      debugMode: debugEnabled,
      localStorage: typeof window !== 'undefined' && 'localStorage' in window
    };
  }, [debugEnabled]);

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

  const testSignUp = async () => {
    setLoading(true);
    try {
      console.log('[DEBUG SIGNUP] Testing signup for:', testEmail);
      const { data, error } = await supabase.auth.signUp({
        email: testEmail,
        password: testPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { display_name: 'Debug Test User' }
        }
      });
      
      if (error) {
        console.error('[DEBUG SIGNUP] Error:', error);
        toast({ title: 'Test Sign-up Failed', description: error.message, variant: 'destructive' });
      } else {
        console.log('[DEBUG SIGNUP] Success:', data.user?.id, data.user?.email);
        toast({ title: 'Test Sign-up Success', description: `User created: ${data.user?.email}` });
        await load();
      }
    } catch (err) {
      console.error('[DEBUG SIGNUP] Unexpected error:', err);
      toast({ title: 'Test Sign-up Failed', description: 'Unexpected error occurred', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const testSignIn = async () => {
    setLoading(true);
    try {
      console.log('[DEBUG SIGNIN] Testing signin for:', testEmail);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword
      });
      
      if (error) {
        console.error('[DEBUG SIGNIN] Error:', error);
        toast({ title: 'Test Sign-in Failed', description: error.message, variant: 'destructive' });
      } else {
        console.log('[DEBUG SIGNIN] Success:', data.user?.id, data.user?.email);
        toast({ title: 'Test Sign-in Success', description: `Signed in: ${data.user?.email}` });
        await load();
      }
    } catch (err) {
      console.error('[DEBUG SIGNIN] Unexpected error:', err);
      toast({ title: 'Test Sign-in Failed', description: 'Unexpected error occurred', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
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
            <Alert>
              <AlertDescription>
                Enable VITE_DEBUG_AUTH=true to access this page.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Auth Debug Dashboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription>
                Debug mode is enabled. Check the browser console for detailed logs.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Auth State</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm font-mono">
            <div>initialized: {String(initialized)}</div>
            <div>hasSession: {String(!!session)}</div>
            <div>user: {user?.email || 'null'}</div>
            <div>userId: {user?.id || 'null'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Environment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm font-mono">
            <div>Supabase URL: {envInfo.supabaseUrl}</div>
            <div>Anon Key: {envInfo.anonKeyPrefix}</div>
            <div>Debug Mode: {String(envInfo.debugMode)}</div>
            <div>localStorage: {String(envInfo.localStorage)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Direct Supabase Queries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-semibold">getSession():</h4>
              <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                {JSON.stringify(sessionInfo, null, 2)}
              </pre>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">getUser():</h4>
              <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                {JSON.stringify(userInfo, null, 2)}
              </pre>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={load}>Refresh Queries</Button>
              <Button 
                size="sm" 
                variant="secondary" 
                onClick={async () => { 
                  await supabase.auth.signOut(); 
                  logAuth('signOut from debug'); 
                  await load(); 
                }}
              >
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Test Auth Functions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="test-email">Test Email</Label>
                <Input
                  id="test-email"
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="test-password">Test Password</Label>
                <Input
                  id="test-password"
                  type="password"
                  value={testPassword}
                  onChange={(e) => setTestPassword(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                onClick={testSignUp}
                disabled={loading}
              >
                {loading ? 'Testing...' : 'Test Sign-up'}
              </Button>
              <Button 
                size="sm" 
                variant="secondary"
                onClick={testSignIn}
                disabled={loading}
              >
                {loading ? 'Testing...' : 'Test Sign-in'}
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={async () => {
                  setLoading(true);
                  try {
                    const { data, error } = await supabase.functions.invoke('admin-create-user', {
                      body: { 
                        email: testEmail, 
                        password: testPassword,
                        displayName: 'Debug Admin User'
                      }
                    });
                    
                    if (error) {
                      console.error('[ADMIN CREATE] Error:', error);
                      toast({ title: 'Admin Create Failed', description: error.message, variant: 'destructive' });
                    } else {
                      console.log('[ADMIN CREATE] Success:', data);
                      toast({ title: 'Admin Create Success', description: `User created via admin API: ${testEmail}` });
                      await load();
                    }
                  } catch (err) {
                    console.error('[ADMIN CREATE] Unexpected error:', err);
                    toast({ title: 'Admin Create Failed', description: 'Unexpected error occurred', variant: 'destructive' });
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                Admin Create User
              </Button>
            </div>
            <Alert>
              <AlertDescription>
                These test functions call Supabase auth directly and log results to console.
                Check console logs and network tab for detailed debugging info.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}