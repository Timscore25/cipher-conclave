import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Shield, Smartphone, AlertTriangle } from 'lucide-react';
import { passkeyManager, PasskeyConfig } from '@/lib/webauthn/passkey-manager';
import { useToast } from '@/hooks/use-toast';

export function PasskeySettings() {
  const [config, setConfig] = useState<PasskeyConfig>({ enabled: false });
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const init = async () => {
      const supported = await passkeyManager.isSupported();
      const currentConfig = await passkeyManager.getConfig();
      setIsSupported(supported);
      setConfig(currentConfig);
    };
    init();
  }, []);

  const handleEnablePasskey = async () => {
    if (!isSupported) {
      toast({
        title: 'Not Supported',
        description: 'WebAuthn passkeys are not supported on this device',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const success = await passkeyManager.enablePasskey(
        'user-' + Date.now(), // In real app, use actual user ID
        'PGP Rooms Device'
      );

      if (success) {
        const updatedConfig = await passkeyManager.getConfig();
        setConfig(updatedConfig);
        toast({
          title: 'Passkey Enabled',
          description: 'You can now unlock your device with biometrics or PIN',
        });
      } else {
        toast({
          title: 'Setup Failed',
          description: 'Failed to set up passkey. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Setup Error',
        description: error.message || 'An error occurred during setup',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisablePasskey = async () => {
    setIsLoading(true);
    try {
      await passkeyManager.disablePasskey();
      setConfig({ enabled: false });
      toast({
        title: 'Passkey Disabled',
        description: 'Passkey unlock has been disabled',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to disable passkey',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Passkey Unlock
        </CardTitle>
        <CardDescription>
          Enable biometric or PIN unlock for your encrypted private keys
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isSupported && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-muted border">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm text-muted-foreground">
              WebAuthn passkeys are not supported on this device or browser
            </span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="passkey-enabled" className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Enable Passkey Unlock
            </Label>
            <p className="text-sm text-muted-foreground">
              Use your device's biometric authentication or PIN to unlock
            </p>
          </div>
          <Switch
            id="passkey-enabled"
            checked={config.enabled}
            disabled={!isSupported || isLoading}
            onCheckedChange={config.enabled ? handleDisablePasskey : handleEnablePasskey}
          />
        </div>

        {config.enabled && (
          <div className="p-3 rounded-md bg-accent/10 border border-accent/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Passkey Status</span>
              <Badge variant="secondary" className="bg-accent text-accent-foreground">
                Active
              </Badge>
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              {config.passkeyLabel && (
                <p>Device: {config.passkeyLabel}</p>
              )}
              {config.createdAt && (
                <p>Created: {new Date(config.createdAt).toLocaleDateString()}</p>
              )}
            </div>
          </div>
        )}

        <div className="space-y-2 text-sm text-muted-foreground">
          <h4 className="font-medium text-foreground">Security Notes:</h4>
          <ul className="space-y-1 ml-4 list-disc">
            <li>Passkeys provide an additional layer of security for your private keys</li>
            <li>Your private keys never leave this device, even with passkey unlock</li>
            <li>You can always fall back to passphrase unlock if needed</li>
            <li>Disabling passkey unlock does not affect your existing encrypted keys</li>
          </ul>
        </div>

        {config.enabled && (
          <Button 
            variant="outline" 
            onClick={handleDisablePasskey}
            disabled={isLoading}
            className="w-full"
          >
            Disable Passkey Unlock
          </Button>
        )}
      </CardContent>
    </Card>
  );
}