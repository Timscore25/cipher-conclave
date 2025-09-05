import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCryptoStore } from '@/lib/stores/crypto-store';
import { Lock, Shield } from 'lucide-react';

export default function UnlockPrompt() {
  const { currentDeviceFingerprint, unlockDevice } = useCryptoStore();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDeviceFingerprint) return;

    setError(null);
    setLoading(true);

    // Validate passphrase input
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
      setError('Passphrase is required');
      setLoading(false);
      return;
    }

    try {
      if (import.meta.env.VITE_DEBUG_CRYPTO === 'true') {
        console.log('[UnlockPrompt] Attempting to unlock device:', { 
          fingerprint: currentDeviceFingerprint,
          passphraseLength: passphrase.length 
        });
      }

      await unlockDevice(currentDeviceFingerprint, passphrase);
      setPassphrase('');
      
      if (import.meta.env.VITE_DEBUG_CRYPTO === 'true') {
        console.log('[UnlockPrompt] Device unlocked successfully');
      }
    } catch (err: any) {
      const errorMessage = err.message?.includes('incorrect passphrase') || err.message?.includes('Failed to decrypt')
        ? 'Invalid passphrase. Please try again.'
        : err.message || 'Failed to unlock device';
      
      setError(errorMessage);
      
      if (import.meta.env.VITE_DEBUG_CRYPTO === 'true') {
        console.error('[UnlockPrompt] Unlock failed:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <div>
            <CardTitle>Unlock Your Device</CardTitle>
            <CardDescription>
              Enter your passphrase to access your encrypted messages
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="passphrase">Passphrase</Label>
              <Input
                id="passphrase"
                type="password"
                placeholder="Enter your passphrase"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={loading}
                required
                autoFocus
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading || !passphrase}>
              {loading ? 'Unlocking...' : 'Unlock Device'}
            </Button>
          </form>

          {currentDeviceFingerprint && (
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Device Fingerprint</span>
              </div>
              <code className="text-xs text-muted-foreground font-mono break-all">
                {currentDeviceFingerprint}
              </code>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}