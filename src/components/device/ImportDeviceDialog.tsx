import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCryptoStore } from '@/lib/stores/crypto-store';
import { useToast } from '@/hooks/use-toast';
import { Download, Key, QrCode } from 'lucide-react';

interface ImportDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ImportDeviceDialog({ open, onOpenChange }: ImportDeviceDialogProps) {
  const { importDevice, loading } = useCryptoStore();
  const { toast } = useToast();
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!privateKey.trim()) {
      setError('Private key is required');
      return;
    }

    if (!passphrase.trim()) {
      setError('Passphrase is required');
      return;
    }

    try {
      await importDevice(privateKey.trim(), passphrase);
      
      toast({
        title: 'Device imported successfully',
        description: 'Your device is now available and unlocked.',
      });
      
      // Reset form and close dialog
      setPrivateKey('');
      setPassphrase('');
      onOpenChange(false);
    } catch (err: any) {
      const errorMessage = err.message?.includes('incorrect passphrase') || err.message?.includes('Failed to decrypt')
        ? 'Invalid passphrase. Please check your passphrase and try again.'
        : err.message?.includes('Invalid private key')
        ? 'Invalid private key format. Please ensure you are pasting a complete PGP private key.'
        : err.message || 'Failed to import device';
      
      setError(errorMessage);
    }
  };

  const handleClose = () => {
    setPrivateKey('');
    setPassphrase('');
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Download className="w-5 h-5" />
            <span>Import Device</span>
          </DialogTitle>
          <DialogDescription>
            Import an existing device using your private key or QR code
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="private-key" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="private-key" className="flex items-center space-x-2">
              <Key className="w-4 h-4" />
              <span>Private Key</span>
            </TabsTrigger>
            <TabsTrigger value="qr-code" className="flex items-center space-x-2">
              <QrCode className="w-4 h-4" />
              <span>QR Code</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="private-key" className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleImport} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="private-key">Private Key</Label>
                <Textarea
                  id="private-key"
                  placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----&#10;...&#10;-----END PGP PRIVATE KEY BLOCK-----"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  disabled={loading}
                  rows={10}
                  className="font-mono text-sm"
                />
                <p className="text-sm text-muted-foreground">
                  Paste your complete armored private key, including the BEGIN and END lines.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="import-passphrase">Passphrase</Label>
                <Input
                  id="import-passphrase"
                  type="password"
                  placeholder="Enter your private key passphrase"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || !privateKey.trim() || !passphrase.trim()}>
                  {loading ? 'Importing...' : 'Import Device'}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="qr-code" className="space-y-4">
            <div className="text-center p-8 border-2 border-dashed border-muted rounded-lg">
              <QrCode className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">QR Code Import</h3>
              <p className="text-muted-foreground mb-4">
                QR code import is not yet implemented. Please use the Private Key method.
              </p>
              <Button variant="outline" disabled>
                Scan QR Code
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}