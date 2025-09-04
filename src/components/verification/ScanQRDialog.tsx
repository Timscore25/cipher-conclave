import { useState, useEffect, useRef } from 'react';
import { Camera, QrCode, Shield, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { parseQRPayload, computeShortAuthStringSync, type DeviceQRPayload } from '@/lib/verification/qr-utils';
import { useCryptoStore } from '@/lib/stores/crypto-store';
import { useToast } from '@/hooks/use-toast';
import jsQR from 'jsqr';

interface ScanQRDialogProps {
  children: React.ReactNode;
  onVerificationComplete?: (targetFingerprint: string) => void;
}

export function ScanQRDialog({ children, onVerificationComplete }: ScanQRDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [scannedPayload, setScannedPayload] = useState<DeviceQRPayload | null>(null);
  const [authString, setAuthString] = useState<string>('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [scanError, setScanError] = useState<string>('');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<number>();
  
  const { currentDeviceFingerprint } = useCryptoStore();
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setScannedPayload(null);
      setAuthString('');
      setScanError('');
    }

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
        
        // Start QR scanning loop
        scanIntervalRef.current = window.setInterval(scanForQR, 500);
      }
    } catch (error) {
      console.error('Failed to start camera:', error);
      setScanError('Unable to access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
  };

  const scanForQR = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code) {
      handleQRDetected(code.data);
    }
  };

  const handleQRDetected = async (qrData: string) => {
    try {
      const payload = parseQRPayload(qrData);
      if (!payload) {
        setScanError('Invalid QR code format');
        return;
      }

      if (!currentDeviceFingerprint) {
        setScanError('No device unlocked');
        return;
      }

      // Don't verify own device
      if (payload.fpr === currentDeviceFingerprint) {
        setScanError('Cannot verify your own device');
        return;
      }

      setScannedPayload(payload);
      
      // Compute authentication string
      const sas = await computeShortAuthStringSync(currentDeviceFingerprint, payload.fpr);
      setAuthString(sas);
      
      // Stop scanning
      stopCamera();
      setScanError('');
    } catch (error) {
      console.error('Failed to process QR code:', error);
      setScanError('Failed to process QR code');
    }
  };

  const confirmVerification = async () => {
    if (!scannedPayload || !currentDeviceFingerprint) return;

    setIsConfirming(true);
    try {
      // Write verification record
      const { supabase } = await import('@/integrations/supabase/client');
      
      const { error } = await supabase
        .from('key_verifications')
        .insert({
          verifier_device_id: currentDeviceFingerprint, // Note: This should be device ID, not fingerprint
          target_fpr: scannedPayload.fpr,
          method: 'qr',
        });

      if (error) {
        console.error('Failed to save verification:', error);
        throw error;
      }

      toast({
        title: "Device verified",
        description: `Successfully verified ${scannedPayload.deviceLabel}`,
      });

      onVerificationComplete?.(scannedPayload.fpr);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to confirm verification:', error);
      toast({
        title: "Verification failed",
        description: "Could not save verification record.",
        variant: "destructive",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Camera className="w-5 h-5" />
            <span>Scan Device QR</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {scanError && (
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>{scanError}</AlertDescription>
            </Alert>
          )}

          {!scannedPayload ? (
            <>
              {/* Camera View */}
              <div className="relative">
                <video
                  ref={videoRef}
                  className="w-full h-64 bg-black rounded-lg object-cover"
                  playsInline
                  muted
                />
                <canvas
                  ref={canvasRef}
                  className="hidden"
                />
                
                {/* Scanning overlay */}
                <div className="absolute inset-4 border-2 border-primary rounded-lg opacity-50">
                  <div className="w-full h-full border border-dashed border-primary-foreground"></div>
                </div>
              </div>
              
              <p className="text-sm text-muted-foreground text-center">
                Position the QR code within the frame to scan
              </p>
            </>
          ) : (
            <>
              {/* Verification Confirmation */}
              <div className="space-y-4">
                <Alert>
                  <Shield className="w-4 h-4" />
                  <AlertDescription>
                    QR code detected! Please verify the details below.
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Device</label>
                    <p className="font-medium">{scannedPayload.deviceLabel}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">User ID</label>
                    <p className="text-sm text-muted-foreground">{scannedPayload.userId}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Fingerprint</label>
                    <Badge variant="outline" className="font-mono text-xs">
                      {scannedPayload.fpr.substring(0, 16)}...
                    </Badge>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Authentication String</label>
                    <div className="text-2xl font-mono font-bold text-center py-2 bg-accent rounded">
                      {authString}
                    </div>
                    <p className="text-xs text-muted-foreground text-center mt-1">
                      Verify this matches on the other device
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            
            {scannedPayload && (
              <Button onClick={confirmVerification} disabled={isConfirming}>
                {isConfirming ? 'Confirming...' : 'Confirm & Trust'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}