import { useState } from 'react';
import { UserPlus, Copy, Check, Share2, Clock, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createRoomInvitation } from '@/lib/invitations/invitation-utils';
import { useToast } from '@/hooks/use-toast';

interface InviteDialogProps {
  roomId: string;
  roomName: string;
  children: React.ReactNode;
}

export function InviteDialog({ roomId, roomName, children }: InviteDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [maxUses, setMaxUses] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const { toast } = useToast();

  const generateInviteLink = async () => {
    setIsGenerating(true);
    try {
      const link = await createRoomInvitation(roomId, maxUses);
      setInviteLink(link);
      toast({
        title: "Invitation created",
        description: "Share this link with others to invite them to the room.",
      });
    } catch (error) {
      console.error('Failed to create invitation:', error);
      toast({
        title: "Failed to create invitation",
        description: "Could not generate invitation link.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyInviteLink = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Link copied",
        description: "Invitation link copied to clipboard.",
      });
    }
  };

  const shareInviteLink = async () => {
    if (navigator.share && inviteLink) {
      try {
        await navigator.share({
          title: `Join ${roomName}`,
          text: `You've been invited to join the secure chat room "${roomName}"`,
          url: inviteLink,
        });
      } catch (error) {
        // Fallback to copy if share fails
        copyInviteLink();
      }
    } else {
      copyInviteLink();
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
            <UserPlus className="w-5 h-5" />
            <span>Invite to Room</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div>
            <p className="text-sm text-muted-foreground">
              Create an invitation link for <strong>{roomName}</strong>
            </p>
          </div>

          {!inviteLink ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="max-uses">Maximum Uses</Label>
                <Input
                  id="max-uses"
                  type="number"
                  min="1"
                  max="100"
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  How many people can use this invitation
                </p>
              </div>

              <Alert>
                <Clock className="w-4 h-4" />
                <AlertDescription>
                  Invitation will expire in 24 hours
                </AlertDescription>
              </Alert>

              <Button 
                onClick={generateInviteLink} 
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? 'Generating...' : 'Generate Invitation'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Invitation Link</Label>
                <div className="flex items-center space-x-2 mt-1">
                  <Input
                    value={inviteLink}
                    readOnly
                    className="flex-1 font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyInviteLink}
                    className="flex-shrink-0"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex items-center space-x-1">
                  <Users className="w-3 h-3" />
                  <span>{maxUses} uses remaining</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>Expires in 24h</span>
                </div>
              </div>

              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  onClick={shareInviteLink}
                  className="flex-1"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
                <Button 
                  onClick={() => {
                    setInviteLink('');
                    setIsOpen(false);
                  }}
                  className="flex-1"
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}