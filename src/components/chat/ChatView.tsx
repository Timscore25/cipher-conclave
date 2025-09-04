import { useEffect, useState, useRef } from 'react';
import { Send, Paperclip, Shield, AlertTriangle, Download, FileText, UserPlus, QrCode, Camera, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useRoomsStore } from '@/lib/stores/rooms-store';
import { useMessagesStore, type Message } from '@/lib/stores/messages-store';
import { useCryptoStore } from '@/lib/stores/crypto-store';
import { useVerificationStore } from '@/lib/stores/verification-store';
import { useToast } from '@/hooks/use-toast';
import { ShowQRDialog } from '@/components/verification/ShowQRDialog';
import { ScanQRDialog } from '@/components/verification/ScanQRDialog';
import { InviteDialog } from '@/components/invitations/InviteDialog';
import { ExportDialog } from '@/components/export/ExportDialog';

export default function ChatView() {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { currentRoomId, rooms } = useRoomsStore();
  const {
    messagesByRoom,
    isLoading,
    error,
    loadMessages,
    sendMessage,
    subscribeToRoom,
    unsubscribeFromRoom,
    clearError
  } = useMessagesStore();

  const { currentDeviceFingerprint } = useCryptoStore();
  const { isFingerrintVerified, loadVerifications } = useVerificationStore();
  const { toast } = useToast();

  const currentRoom = rooms.find(r => r.id === currentRoomId);
  const messages = currentRoomId ? messagesByRoom[currentRoomId] || [] : [];

  // Load messages and subscribe when room changes
  useEffect(() => {
    if (currentRoomId) {
      loadMessages(currentRoomId);
      subscribeToRoom(currentRoomId);
    }
    
    return () => {
      unsubscribeFromRoom();
    };
  }, [currentRoomId, loadMessages, subscribeToRoom, unsubscribeFromRoom]);

  // Load verifications on mount
  useEffect(() => {
    loadVerifications();
  }, [loadVerifications]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if ((!message.trim() && attachments.length === 0) || !currentRoomId) return;

    setIsSending(true);
    try {
      await sendMessage(currentRoomId, message.trim(), attachments.length > 0 ? attachments : undefined);
      setMessage('');
      setAttachments([]);
      toast({
        title: "Message sent",
        description: "Your message has been encrypted and sent.",
      });
    } catch (error) {
      toast({
        title: "Failed to send message",
        description: "An error occurred while sending your message.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setAttachments(prev => [...prev, ...files]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderMessage = (msg: Message) => {
    const hasError = !!msg.decryptionError;
    const isVerified = msg.isVerified && !hasError;
    const isSignerVerified = isFingerrintVerified(msg.signer_fpr);

    return (
      <div key={msg.id} className="mb-4 p-3 rounded-lg bg-card">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="font-medium text-sm">
              {msg.devices?.label || 'Unknown Device'}
            </span>
            {isVerified && (
              <Badge variant="secondary" className="text-xs">
                <Shield className="w-3 h-3 mr-1" />
                Verified
              </Badge>
            )}
            {isSignerVerified && (
              <Badge variant="default" className="text-xs">
                <Shield className="w-3 h-3 mr-1" />
                Trusted
              </Badge>
            )}
            {hasError && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Decrypt Error
              </Badge>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs text-muted-foreground">
              {formatTime(msg.created_at)}
            </span>
            {!hasError && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                    <MoreVertical className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <ExportDialog message={msg}>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Download className="w-4 h-4 mr-2" />
                      Export Message
                    </DropdownMenuItem>
                  </ExportDialog>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {hasError ? (
          <div className="text-sm text-destructive">
            {msg.decryptionError}
          </div>
        ) : (
          <>
            {msg.decryptedText && (
              <div className="text-sm whitespace-pre-wrap break-words">
                {msg.decryptedText}
              </div>
            )}
            
            {msg.decryptedAttachments && msg.decryptedAttachments.length > 0 && (
              <div className="mt-2 space-y-2">
                {msg.decryptedAttachments.map((attachment, index) => (
                  <div key={index} className="flex items-center space-x-2 p-2 bg-accent rounded">
                    <FileText className="w-4 h-4" />
                    <span className="text-sm flex-1">{attachment.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        // Create download link for decrypted file
                        const blob = new Blob([attachment.data], { type: attachment.mimeType });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = attachment.name;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  if (!currentRoomId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <p className="text-lg mb-2">No room selected</p>
          <p className="text-sm">Select a room from the sidebar to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h2 className="text-lg font-semibold">{currentRoom?.name}</h2>
          <p className="text-sm text-muted-foreground">
            End-to-end encrypted chat
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <ShowQRDialog>
            <Button size="sm" variant="outline">
              <QrCode className="w-4 h-4 mr-2" />
              Show QR
            </Button>
          </ShowQRDialog>
          
          <ScanQRDialog>
            <Button size="sm" variant="outline">
              <Camera className="w-4 h-4 mr-2" />
              Scan QR
            </Button>
          </ScanQRDialog>
          
          <InviteDialog roomId={currentRoomId} roomName={currentRoom?.name || 'Room'}>
            <Button size="sm" variant="default">
              <UserPlus className="w-4 h-4 mr-2" />
              Invite
            </Button>
          </InviteDialog>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {isLoading && messages.length === 0 ? (
            <div className="text-center text-muted-foreground">
              Loading messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground">
              <p>No messages yet</p>
              <p className="text-sm">Send the first message to start the conversation</p>
            </div>
          ) : (
            messages.map(renderMessage)
          )}
          
          {error && (
            <div className="text-center text-destructive text-sm">
              {error}
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
      </ScrollArea>

      {/* Message Composer */}
      <div className="p-4 border-t">
        {attachments.length > 0 && (
          <div className="mb-3 space-y-2">
            {attachments.map((file, index) => (
              <div key={index} className="flex items-center space-x-2 p-2 bg-accent rounded text-sm">
                <FileText className="w-4 h-4" />
                <span className="flex-1">{file.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeAttachment(index)}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex space-x-2">
          <div className="flex-1 space-y-2">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              className="resize-none"
              rows={1}
              disabled={!currentDeviceFingerprint}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!isSending) {
                    handleSendMessage();
                  }
                }
              }}
            />
          </div>
          
          <div className="flex flex-col space-y-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={!currentDeviceFingerprint}
            >
              <Paperclip className="w-4 h-4" />
            </Button>
            
            <Button
              onClick={handleSendMessage}
              disabled={(!message.trim() && attachments.length === 0) || isSending || !currentDeviceFingerprint}
              size="sm"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          multiple
          className="hidden"
        />

        {!currentDeviceFingerprint && (
          <div className="mt-2 text-xs text-muted-foreground text-center">
            Please unlock a device to send messages
          </div>
        )}
      </div>
    </div>
  );
}