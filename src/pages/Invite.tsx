import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shield, Users, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getInvitationInfo, acceptInvitation, type InvitationInfo } from '@/lib/invitations/invitation-utils';
import { useCryptoStore } from '@/lib/stores/crypto-store';
import { useRoomsStore } from '@/lib/stores/rooms-store';
import { useToast } from '@/hooks/use-toast';

export default function InvitePage() {
  const { invitationId } = useParams<{ invitationId: string }>();
  const navigate = useNavigate();
  
  const [inviteInfo, setInviteInfo] = useState<InvitationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string>('');
  
  const { currentDeviceFingerprint } = useCryptoStore();
  const { setCurrentRoom, loadRooms } = useRoomsStore();
  const { toast } = useToast();

  useEffect(() => {
    if (invitationId) {
      loadInvitationInfo();
    }
  }, [invitationId]);

  const loadInvitationInfo = async () => {
    if (!invitationId) return;
    
    setIsLoading(true);
    try {
      const info = await getInvitationInfo(invitationId);
      if (info) {
        setInviteInfo(info);
      } else {
        setError('Invitation not found or expired');
      }
    } catch (error) {
      console.error('Failed to load invitation:', error);
      setError('Failed to load invitation information');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!invitationId || !currentDeviceFingerprint) return;
    
    setIsJoining(true);
    try {
      const roomId = await acceptInvitation(invitationId, currentDeviceFingerprint);
      
      // Refresh rooms and navigate to the new room
      await loadRooms();
      setCurrentRoom(roomId);
      
      toast({
        title: "Joined room successfully",
        description: `Welcome to ${inviteInfo?.room_name}!`,
      });
      
      navigate('/');
    } catch (error) {
      console.error('Failed to join room:', error);
      toast({
        title: "Failed to join room",
        description: "Could not accept the invitation.",
        variant: "destructive",
      });
    } finally {
      setIsJoining(false);
    }
  };

  const formatExpiryTime = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours > 0) {
      return `${diffHours}h ${diffMinutes}m`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes}m`;
    } else {
      return 'Expired';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (error || !inviteInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-2" />
            <CardTitle>Invitation Invalid</CardTitle>
            <CardDescription>
              {error || 'This invitation link is invalid or has expired'}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate('/')} variant="outline">
              Go to App
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isExpired = new Date(inviteInfo.expires_at) <= new Date();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <CardTitle>Join Secure Room</CardTitle>
          <CardDescription>
            You've been invited to join an end-to-end encrypted chat room
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold">{inviteInfo.room_name}</h3>
              <p className="text-sm text-muted-foreground">
                Invited by {inviteInfo.inviter_name}
              </p>
            </div>
            
            <div className="flex items-center justify-center space-x-4 text-sm text-muted-foreground">
              <div className="flex items-center space-x-1">
                <Users className="w-4 h-4" />
                <span>{inviteInfo.member_count} members</span>
              </div>
              <div className="flex items-center space-x-1">
                <Clock className="w-4 h-4" />
                <span>Expires in {formatExpiryTime(inviteInfo.expires_at)}</span>
              </div>
            </div>

            {!currentDeviceFingerprint && (
              <Alert>
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  Please unlock a device to join the room
                </AlertDescription>
              </Alert>
            )}

            {isExpired && (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  This invitation has expired
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="space-y-2">
            <Button 
              onClick={handleJoinRoom}
              disabled={!currentDeviceFingerprint || isExpired || isJoining}
              className="w-full"
            >
              {isJoining ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Joining...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Join Room
                </>
              )}
            </Button>
            
            <Button variant="outline" onClick={() => navigate('/')} className="w-full">
              Cancel
            </Button>
          </div>

          <div className="text-xs text-center text-muted-foreground">
            <p>🔒 All messages are end-to-end encrypted</p>
            <p>Your private keys never leave your device</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}