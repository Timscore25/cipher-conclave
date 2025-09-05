import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Shield, ArrowRight, AlertTriangle, CheckCircle } from 'lucide-react';
import { useMLSStore } from '@/lib/stores/mls-store';
import { useToast } from '@/hooks/use-toast';

interface MLSMigrationBannerProps {
  roomId: string;
  roomName: string;
  currentCryptoMode: 'pgp' | 'mls';
  onMigrationComplete?: () => void;
}

export function MLSMigrationBanner({ 
  roomId, 
  roomName, 
  currentCryptoMode,
  onMigrationComplete 
}: MLSMigrationBannerProps) {
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeProgress, setUpgradeProgress] = useState(0);
  const [upgradeStep, setUpgradeStep] = useState('');
  const { toast } = useToast();
  const { createGroup, error } = useMLSStore();

  // Don't show banner if already using MLS
  if (currentCryptoMode === 'mls') {
    return (
      <Card className="border-accent/20 bg-accent/5">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-accent" />
            <div>
              <p className="font-medium text-accent-foreground">MLS Enabled</p>
              <p className="text-sm text-muted-foreground">
                This room uses Message Layer Security with Forward Secrecy and Post-Compromise Security
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="bg-accent text-accent-foreground">
            MLS (FS+PCS)
          </Badge>
        </CardContent>
      </Card>
    );
  }

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    setUpgradeProgress(0);
    
    try {
      setUpgradeStep('Creating MLS group...');
      setUpgradeProgress(25);
      
      // Create MLS group for this room
      await createGroup(roomId);
      
      if (error) {
        throw new Error(error);
      }
      
      setUpgradeStep('Generating welcome messages...');
      setUpgradeProgress(50);
      
      // Small delay to show progress
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setUpgradeStep('Updating room configuration...');
      setUpgradeProgress(75);
      
      // Another small delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setUpgradeStep('Migration complete!');
      setUpgradeProgress(100);
      
      toast({
        title: 'Upgrade Complete',
        description: `${roomName} now uses MLS encryption with Forward Secrecy and Post-Compromise Security.`,
      });
      
      // Call completion callback
      onMigrationComplete?.();
      
    } catch (error: any) {
      console.error('Migration failed:', error);
      toast({
        title: 'Upgrade Failed',
        description: error.message || 'Failed to upgrade room to MLS',
        variant: 'destructive',
      });
    } finally {
      setIsUpgrading(false);
      setUpgradeProgress(0);
      setUpgradeStep('');
    }
  };

  if (isUpgrading) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-primary animate-pulse" />
                <div>
                  <p className="font-medium">Upgrading to MLS...</p>
                  <p className="text-sm text-muted-foreground">{upgradeStep}</p>
                </div>
              </div>
              <Badge variant="outline" className="animate-pulse">
                Upgrading...
              </Badge>
            </div>
            
            <Progress value={upgradeProgress} className="h-2" />
            
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              <span>Do not close this window during upgrade</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <div>
              <CardTitle className="text-lg">Upgrade to MLS</CardTitle>
              <CardDescription>
                Enhanced security with Forward Secrecy and Post-Compromise Security
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline">Recommended</Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-accent" />
              Current (PGP)
            </h4>
            <ul className="space-y-1 text-muted-foreground ml-6">
              <li>• End-to-end encryption</li>
              <li>• Signature verification</li>
              <li>• Device-based keys</li>
            </ul>
          </div>
          
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Upgraded (MLS)
            </h4>
            <ul className="space-y-1 text-muted-foreground ml-6">
              <li>• <strong>Forward Secrecy</strong> - Past messages stay secure</li>
              <li>• <strong>Post-Compromise Security</strong> - Automatic key healing</li>
              <li>• Efficient group management</li>
              <li>• Future-proof cryptography</li>
            </ul>
          </div>
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-sm text-muted-foreground">
            <p>Your PGP message history will remain accessible after upgrade.</p>
          </div>
          
          <Button onClick={handleUpgrade} disabled={isUpgrading}>
            <Shield className="h-4 w-4 mr-2" />
            Upgrade to MLS
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}