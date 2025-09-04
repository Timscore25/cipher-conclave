import { useState, useEffect } from 'react';
import { QrCode, Copy, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useCryptoStore } from '@/lib/stores/crypto-store';
import { generateDeviceQRPayload, generateQRCode } from '@/lib/verification/qr-utils';
import { useToast } from '@/hooks/use-toast';

interface ShowQRDialogProps {
  children: React.ReactNode;
}

export function ShowQRDialog({ children }: ShowQRDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const { user } = useAuthStore();
  const { currentDeviceFingerprint, getUnlockedKey } = useCryptoStore();
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && currentDeviceFingerprint && user) {
      generateQR();
    }
  }, [isOpen, currentDeviceFingerprint, user]);

  const generateQR = async () => {
    if (!currentDeviceFingerprint || !user) return;

    setIsGenerating(true);
    try {
      const unlockedKey = getUnlockedKey(currentDeviceFingerprint);
      if (!unlockedKey) {
        throw new Error('Device not unlocked');
      }

      // Get device info from storage
      const devices = JSON.parse(localStorage.getItem('pgp_devices') || '[]');
      const currentDevice = devices.find((d: any) => d.fingerprint === currentDeviceFingerprint);
      
      if (!currentDevice) {
        throw new Error('Device info not found');
      }

      const payload = generateDeviceQRPayload(
        currentDeviceFingerprint,
        user.id,
        currentDevice.label,
        currentDevice.publicKeyArmored
      );

      const qrDataUrl = await generateQRCode(payload);
      setQrCodeDataUrl(qrDataUrl);
    } catch (error) {
      console.error('Failed to generate QR code:', error);
      toast({
        title: "Failed to generate QR code",
        description: "Could not generate verification QR code.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyFingerprint = async () => {
    if (currentDeviceFingerprint) {
      await navigator.clipboard.writeText(currentDeviceFingerprint);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied to clipboard",
        description: "Device fingerprint copied.",
      });
    }
  };

  const getDeviceInfo = () => {
    if (!currentDeviceFingerprint) return null;
    
    const devices = JSON.parse(localStorage.getItem('pgp_devices') || '[]');
    return devices.find((d: any) => d.fingerprint === currentDeviceFingerprint);
  };

  const deviceInfo = getDeviceInfo();

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <QrCode className="w-5 h-5" />
            <span>Show My Device</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Device Info */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Device</label>
              <p className="font-medium">{deviceInfo?.label || 'Unknown Device'}</p>
            </div>
            
            <div>
              <label className="text-sm font-medium text-muted-foreground">Fingerprint</label>
              <div className="flex items-center space-x-2 mt-1">
                <Badge variant="outline" className="font-mono text-xs">
                  {currentDeviceFingerprint?.substring(0, 16)}...
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={copyFingerprint}
                  className="h-6 w-6 p-0"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
            </div>
          </div>

          {/* QR Code */}
          <div className="text-center space-y-4">
            <div className="mx-auto w-64 h-64 border border-border rounded-lg flex items-center justify-center bg-white">
              {isGenerating ? (
                <div className="text-muted-foreground">Generating QR code...</div>
              ) : qrCodeDataUrl ? (
                <img 
                  src={qrCodeDataUrl} 
                  alt="Device QR Code" 
                  className="w-full h-full object-contain p-2"
                />
              ) : (
                <QrCode className="w-16 h-16 text-muted-foreground" />
              )}
            </div>
            
            <div className="text-sm text-muted-foreground">
              <p>Scan this QR code with another device</p>
              <p>to verify and establish trust</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}