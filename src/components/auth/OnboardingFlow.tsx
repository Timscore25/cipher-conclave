import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCryptoStore } from '@/lib/stores/crypto-store';
import { useAuthStore } from '@/lib/stores/auth-store';
import { Shield, Key, Smartphone, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function OnboardingFlow() {
  const { createDevice, loading } = useCryptoStore();
  const { user } = useAuthStore();
  const { toast } = useToast();
  
  const [step, setStep] = useState<'intro' | 'setup' | 'passphrase' | 'success'>('intro');
  const [error, setError] = useState<string | null>(null);
  
  const [deviceForm, setDeviceForm] = useState({
    label: '',
    passphrase: '',
    confirmPassphrase: '',
  });

  const [generatedKeys, setGeneratedKeys] = useState<{
    fingerprint: string;
    publicKey: string;
  } | null>(null);

  const handleCreateDevice = async () => {
    setError(null);

    // Comprehensive validation
    if (typeof deviceForm.label !== 'string' || !deviceForm.label.trim()) {
      setError('Device label is required');
      return;
    }

    if (typeof deviceForm.passphrase !== 'string' || deviceForm.passphrase.length < 12) {
      setError('Passphrase must be at least 12 characters long');
      return;
    }

    if (typeof deviceForm.confirmPassphrase !== 'string' || deviceForm.passphrase !== deviceForm.confirmPassphrase) {
      setError('Passphrases do not match');
      return;
    }

    // Additional passphrase strength check
    if (deviceForm.passphrase.length > 128) {
      setError('Passphrase is too long (maximum 128 characters)');
      return;
    }

    try {
      if (import.meta.env.VITE_DEBUG_CRYPTO === 'true') {
        console.log('[OnboardingFlow] Creating device with validation passed');
      }

      const keys = await createDevice({
        label: deviceForm.label.trim(),
        name: user?.user_metadata?.display_name || 'User',
        email: user?.email,
        passphrase: deviceForm.passphrase,
      });

      setGeneratedKeys(keys);
      setStep('success');
      
      toast({
        title: 'Device Created Successfully',
        description: 'Your encryption keys have been generated and secured.',
      });
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to create device';
      setError(errorMessage);
      
      if (import.meta.env.VITE_DEBUG_CRYPTO === 'true') {
        console.error('[OnboardingFlow] Device creation failed:', err);
      }
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'intro':
        return (
          <>
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <Shield className="w-8 h-8 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">Welcome to PGPRooms</CardTitle>
                <CardDescription className="mt-2">
                  Let's set up end-to-end encryption for your account
                </CardDescription>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <Key className="w-5 h-5 text-accent mt-1" />
                  <div>
                    <h4 className="font-medium">Generate Your Keys</h4>
                    <p className="text-sm text-muted-foreground">
                      We'll create a unique encryption key pair for this device
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <Smartphone className="w-5 h-5 text-accent mt-1" />
                  <div>
                    <h4 className="font-medium">Device-Specific</h4>
                    <p className="text-sm text-muted-foreground">
                      Each device gets its own keys for maximum security
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-accent mt-1" />
                  <div>
                    <h4 className="font-medium">Your Responsibility</h4>
                    <p className="text-sm text-muted-foreground">
                      Keep your passphrase safe - we cannot recover it
                    </p>
                  </div>
                </div>
              </div>

              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Your private keys are encrypted and stored locally. They never leave your device.
                </AlertDescription>
              </Alert>

              <Button onClick={() => setStep('setup')} className="w-full">
                Get Started
              </Button>
            </CardContent>
          </>
        );

      case 'setup':
        return (
          <>
            <CardHeader>
              <CardTitle>Device Setup</CardTitle>
              <CardDescription>
                Give this device a name to identify it in your account
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="device-label">Device Label</Label>
                <Input
                  id="device-label"
                  placeholder="e.g., MacBook Pro, iPhone, Work Laptop"
                  value={deviceForm.label}
                  onChange={(e) => setDeviceForm({ ...deviceForm, label: e.target.value })}
                  disabled={loading}
                />
              </div>

              <div className="flex space-x-2">
                <Button variant="outline" onClick={() => setStep('intro')}>
                  Back
                </Button>
                <Button onClick={() => setStep('passphrase')} className="flex-1">
                  Continue
                </Button>
              </div>
            </CardContent>
          </>
        );

      case 'passphrase':
        return (
          <>
            <CardHeader>
              <CardTitle>Secure Your Keys</CardTitle>
              <CardDescription>
                Create a strong passphrase to encrypt your private key
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="passphrase">Passphrase</Label>
                <Input
                  id="passphrase"
                  type="password"
                  placeholder="Enter a strong passphrase (12+ characters)"
                  value={deviceForm.passphrase}
                  onChange={(e) => setDeviceForm({ ...deviceForm, passphrase: e.target.value })}
                  disabled={loading}
                  minLength={12}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-passphrase">Confirm Passphrase</Label>
                <Input
                  id="confirm-passphrase"
                  type="password"
                  placeholder="Confirm your passphrase"
                  value={deviceForm.confirmPassphrase}
                  onChange={(e) => setDeviceForm({ ...deviceForm, confirmPassphrase: e.target.value })}
                  disabled={loading}
                  minLength={12}
                />
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Choose a passphrase you'll remember. If lost, your encrypted messages cannot be recovered.
                </AlertDescription>
              </Alert>

              <div className="flex space-x-2">
                <Button variant="outline" onClick={() => setStep('setup')}>
                  Back
                </Button>
                <Button onClick={handleCreateDevice} className="flex-1" disabled={loading}>
                  {loading ? 'Generating Keys...' : 'Create Device'}
                </Button>
              </div>
            </CardContent>
          </>
        );

      case 'success':
        return (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center">
                <Shield className="w-8 h-8 text-accent" />
              </div>
              <CardTitle className="text-2xl text-accent">Setup Complete!</CardTitle>
              <CardDescription>
                Your device is now ready for secure messaging
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {generatedKeys && (
                <div className="space-y-2">
                  <Label>Your Key Fingerprint</Label>
                  <div className="font-mono text-sm p-2 bg-muted rounded border break-all">
                    {generatedKeys.fingerprint}
                  </div>
                </div>
              )}

              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Your keys are now stored securely on this device. You can start messaging immediately.
                </AlertDescription>
              </Alert>

              <Button onClick={() => window.location.reload()} className="w-full">
                Continue to PGPRooms
              </Button>
            </CardContent>
          </>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="border-border/50 shadow-lg">
          {renderStep()}
        </Card>
      </div>
    </div>
  );
}