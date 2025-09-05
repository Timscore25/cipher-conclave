import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCryptoStore } from '@/lib/stores/crypto-store';
import { Smartphone, Lock, Plus, Download, AlertTriangle } from 'lucide-react';

interface DeviceStatusBannerProps {
  onCreateDevice: () => void;
  onImportDevice: () => void;
  onUnlockDevice: () => void;
}

export default function DeviceStatusBanner({ 
  onCreateDevice, 
  onImportDevice, 
  onUnlockDevice 
}: DeviceStatusBannerProps) {
  const { hasAnyDevice, hasLocalDevice, isUnlocked, currentDeviceFingerprint, remoteDevices } = useCryptoStore();

  // No device anywhere - show create/import options
  if (!hasAnyDevice) {
    return (
      <Alert className="mb-4">
        <Plus className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <div>
            <strong>Add a device to start</strong>
            <p className="text-sm text-muted-foreground mt-1">
              Create a new device or import an existing one to begin chatting.
            </p>
          </div>
          <div className="flex space-x-2">
            <Button size="sm" onClick={onImportDevice} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Import
            </Button>
            <Button size="sm" onClick={onCreateDevice}>
              <Plus className="w-4 h-4 mr-2" />
              Create
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  // Has remote devices but no local device - needs import/unlock
  if (hasAnyDevice && !hasLocalDevice) {
    return (
      <Alert className="mb-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <div>
            <strong>Device not available locally</strong>
            <p className="text-sm text-muted-foreground mt-1">
              You have {remoteDevices.length} device(s) but none are available on this browser/origin.
            </p>
          </div>
          <div className="flex space-x-2">
            <Button size="sm" onClick={onImportDevice} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Import Device
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  // Has local device but not unlocked
  if (hasLocalDevice && !isUnlocked()) {
    return (
      <Alert className="mb-4">
        <Lock className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <div>
            <strong>Unlock your device</strong>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your passphrase to access encrypted messages.
            </p>
          </div>
          <Button size="sm" onClick={onUnlockDevice}>
            <Lock className="w-4 h-4 mr-2" />
            Unlock
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Device is unlocked - show status
  return (
    <div className="mb-4 p-3 bg-muted/50 rounded-lg border">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Smartphone className="w-4 h-4 text-green-600" />
          <span className="text-sm font-medium">Device ready</span>
        </div>
        {currentDeviceFingerprint && (
          <code className="text-xs text-muted-foreground font-mono">
            {currentDeviceFingerprint.slice(0, 8)}...
          </code>
        )}
      </div>
    </div>
  );
}