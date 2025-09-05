import { useEffect, useState, useRef } from 'react';
import { Send, Paperclip, Shield, AlertTriangle, Download, FileText, UserPlus, QrCode, Camera, MoreVertical, Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useRoomsStore } from '@/lib/stores/rooms-store';
import { useMessagesStore, type Message } from '@/lib/stores/messages-store';
import { useMLSStore, type MLSMessageDisplay } from '@/lib/stores/mls-store';
import { useCryptoStore } from '@/lib/stores/crypto-store';
import { useVerificationStore } from '@/lib/stores/verification-store';
import { useToast } from '@/hooks/use-toast';
import { ShowQRDialog } from '@/components/verification/ShowQRDialog';
import { ScanQRDialog } from '@/components/verification/ScanQRDialog';
import { InviteDialog } from '@/components/invitations/InviteDialog';
import { ExportDialog } from '@/components/export/ExportDialog';
import { MLSMigrationBanner } from '@/components/mls/MLSMigrationBanner';
import { parseEmotes } from '@/lib/chat/emotes';
import { getUsernameColor, SPECIAL_COLORS } from '@/lib/chat/usernameColor';

interface ChatViewProps {
  isRetroTheme?: boolean;
}

export default function ChatView({ isRetroTheme = false }: ChatViewProps) {
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

  const {
    messagesByGroup: mlsMessagesByGroup,
    isLoading: mlsIsLoading,
    error: mlsError,
    loadMessages: loadMLSMessages,
    sendMessage: sendMLSMessage,
    clearError: clearMLSError
  } = useMLSStore();

  const { currentDeviceFingerprint } = useCryptoStore();
  const { isFingerrintVerified, loadVerifications } = useVerificationStore();
  const { toast } = useToast();

  const currentRoom = rooms.find(r => r.id === currentRoomId);
  const isMLS = currentRoom?.crypto_mode === 'mls';
  
  // Use appropriate store based on crypto mode
  const messages = currentRoomId ? (isMLS ? mlsMessagesByGroup.get(currentRoomId) || [] : messagesByRoom[currentRoomId] || []) : [];
  const storeIsLoading = isMLS ? mlsIsLoading : isLoading;
  const storeError = isMLS ? mlsError : error;

  // Load messages and subscribe when room changes
  useEffect(() => {
    if (currentRoomId && currentRoom) {
      if (isMLS) {
        loadMLSMessages(currentRoomId);
      } else {
        loadMessages(currentRoomId);
        subscribeToRoom(currentRoomId);
      }
    }
    
    return () => {
      if (!isMLS) {
        unsubscribeFromRoom();
      }
    };
  }, [currentRoomId, currentRoom, isMLS, loadMessages, loadMLSMessages, subscribeToRoom, unsubscribeFromRoom]);

  // Load verifications on mount
  useEffect(() => {
    loadVerifications();
  }, [loadVerifications]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if ((!message.trim() && attachments.length === 0) || !currentRoomId || !currentRoom) return;

    setIsSending(true);
    try {
      if (isMLS) {
        await sendMLSMessage(currentRoomId, message.trim(), attachments.length > 0 ? attachments : undefined);
      } else {
        await sendMessage(currentRoomId, message.trim(), attachments.length > 0 ? attachments : undefined);
      }
      setMessage('');
      setAttachments([]);
      toast({
        title: "Message sent",
        description: `Your message has been encrypted with ${isMLS ? 'MLS' : 'PGP'} and sent.`,
      });
    } catch (error) {
      toast({
        title: "Failed to send message",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Render message content with emotes and mentions
  const renderMessageContent = (content: string) => {
    if (!isRetroTheme) {
      return <span>{content}</span>;
    }

    // Parse for mentions first (@username)
    const mentionRegex = /@(\w+)/g;
    let parts = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      // Add text before mention
      if (match.index > lastIndex) {
        const beforeText = content.slice(lastIndex, match.index);
        const emoteParts = parseEmotes(beforeText);
        parts.push(...emoteParts);
      }

      // Add mention
      parts.push({
        type: 'mention',
        content: match[0],
        username: match[1]
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      const remainingText = content.slice(lastIndex);
      const emoteParts = parseEmotes(remainingText);
      parts.push(...emoteParts);
    }

    // If no mentions found, just parse emotes
    if (parts.length === 0) {
      parts = parseEmotes(content);
    }

    return (
      <span>
        {parts.map((part, index) => {
          if (typeof part === 'string') {
            return <span key={index}>{part}</span>;
          }
          
          if (part.type === 'emote') {
            return (
              <img
                key={index}
                src={part.key}
                alt={part.alt}
                className="retro-emote"
              />
            );
          }
          
          if (part.type === 'mention') {
            return (
              <span key={index} className="retro-mention">
                {part.content}
              </span>
            );
          }
          
          return null;
        })}
      </span>
    );
  };

  // Unified message rendering
  const renderMessage = (msg: Message | MLSMessageDisplay, index: number) => {
    const isMlsMsg = 'groupId' in msg;
    const hasError = !!msg.decryptionError;
    const isVerified = isMlsMsg ? msg.verified : (msg.isVerified && !hasError);
    const senderFpr = isMlsMsg ? msg.sender : msg.signer_fpr;
    const isSignerVerified = isFingerrintVerified(senderFpr);
    const messageText = isMlsMsg ? msg.content : msg.decryptedText;
    const messageAttachments = isMlsMsg ? msg.attachments : msg.decryptedAttachments;
    const userName = isMlsMsg ? (msg.senderLabel || 'Unknown Device') : ((msg as Message).devices?.label || 'Unknown Device');
    const timestamp = formatTime(isMlsMsg ? msg.timestamp : msg.created_at);
    
    // Check if previous message is from same user (for grouping)
    const prevMsg = index > 0 ? messages[index - 1] : null;
    const prevIsMlsMsg = prevMsg ? 'groupId' in prevMsg : false;
    const prevUserName = prevMsg ? 
      (prevIsMlsMsg ? ((prevMsg as MLSMessageDisplay).senderLabel || 'Unknown Device') : ((prevMsg as Message).devices?.label || 'Unknown Device')) : 
      null;
    const isSameUser = prevUserName === userName && isRetroTheme;
    
    // Current user identification (simplified)
    const isCurrentUser = userName.includes('Device'); // This could be improved with better user identification

    if (isRetroTheme) {
      return (
        <div key={msg.id} className="retro-message">
          <div className="flex items-baseline gap-2">
            {/* Timestamp */}
            <span className="text-xs opacity-60 w-12 flex-shrink-0">
              [{timestamp}]
            </span>
            
            {/* Only show username if not grouped */}
            {!isSameUser && (
              <>
                <span 
                  className="font-bold text-sm"
                  style={{ color: isCurrentUser ? SPECIAL_COLORS.self : getUsernameColor(userName) }}
                >
                  {userName}
                </span>
                
                {/* Badges */}
                <div className="flex gap-1">
                  {isVerified && (
                    <span className="retro-badge verified">VERIFIED</span>
                  )}
                  {isCurrentUser && (
                    <span className="retro-badge you">YOU</span>
                  )}
                  <span className={`retro-badge ${isMlsMsg ? 'mls' : 'pgp'}`}>
                    {isMLS ? 'MLS' : 'PGP'}
                  </span>
                </div>
                
                <span className="text-muted-foreground">:</span>
              </>
            )}
            
            {/* Message content or error */}
            <div className="flex-1">
              {hasError ? (
                <span className="text-destructive text-sm">
                  [DECRYPT ERROR: {msg.decryptionError}]
                </span>
              ) : (
                messageText && renderMessageContent(messageText)
              )}
              
              {/* Attachments */}
              {messageAttachments && messageAttachments.length > 0 && (
                <div className="mt-1 text-xs opacity-75">
                  {messageAttachments.map((attachment, index) => (
                    <div key={index} className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      <span>[FILE: {attachment.name}]</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Default (non-retro) rendering
    return (
      <div key={msg.id} className="mb-4 p-3 rounded-lg bg-card">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="font-medium text-sm">
              {userName}
            </span>
            {isVerified && (
              <Badge variant="secondary" className="text-xs">
                <Shield className="w-3 h-3 mr-1" />
                Verified {isMlsMsg ? '(MLS)' : '(PGP)'}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {timestamp}
          </span>
        </div>

        {hasError ? (
          <div className="text-sm text-destructive">
            {msg.decryptionError}
          </div>
        ) : (
          <>
            {messageText && (
              <div className="text-sm whitespace-pre-wrap break-words">
                {messageText}
              </div>
            )}
            
            {messageAttachments && messageAttachments.length > 0 && (
              <div className="mt-2 space-y-2">
                {messageAttachments.map((attachment, index) => (
                  <div key={index} className="flex items-center space-x-2 p-2 bg-accent rounded">
                    <FileText className="w-4 h-4" />
                    <span className="text-sm flex-1">{attachment.name}</span>
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
      {/* Migration Banner for PGP rooms */}
      {currentRoom && (
        <MLSMigrationBanner 
          roomId={currentRoomId} 
          roomName={currentRoom.name}
          currentCryptoMode={currentRoom.crypto_mode}
          onMigrationComplete={() => {
            if (currentRoomId) {
              loadMLSMessages(currentRoomId);
            }
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center space-x-2">
          <h1 className={`text-xl font-semibold ${isRetroTheme ? 'retro-heading' : ''}`}>
            {isRetroTheme && currentRoom ? `# ${currentRoom.name}` : (currentRoom?.name || 'Select a room')}
          </h1>
          {currentRoom && (
            <Badge 
              variant={isMLS ? "default" : "secondary"} 
              className={`text-xs ${isRetroTheme ? 'retro-badge' : ''}`}
            >
              {isMLS ? 'MLS' : 'PGP'}
            </Badge>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <InviteDialog roomId={currentRoomId} roomName={currentRoom?.name || 'Room'}>
            <Button 
              size="sm" 
              variant="default"
              className={isRetroTheme ? 'retro-button' : ''}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Invite
            </Button>
          </InviteDialog>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className={isRetroTheme ? '' : 'space-y-4'}>
          {storeIsLoading && messages.length === 0 ? (
            <div className="text-center text-muted-foreground">
              Loading messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground">
              <p>No messages yet</p>
              <p className="text-sm">Send the first message to start the conversation</p>
            </div>
          ) : (
            messages.map((msg, index) => renderMessage(msg, index))
          )}
          
          {storeError && (
            <div className="text-center text-destructive text-sm">
              {storeError}
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
      </ScrollArea>

      {/* Message Composer */}
      <div className="p-4 border-t">
        <div className="flex space-x-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={isRetroTheme ? "Type message... (Shift+Enter for newline)" : "Type your message..."}
            className={`resize-none flex-1 ${isRetroTheme ? 'retro-input' : ''}`}
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
          
          {/* Emoji button */}
          {isRetroTheme && (
            <Button
              variant="ghost"
              size="sm"
              className="retro-button"
              disabled={!currentDeviceFingerprint}
            >
              <Smile className="w-4 h-4" />
            </Button>
          )}
          
          <Button
            onClick={handleSendMessage}
            disabled={(!message.trim() && attachments.length === 0) || isSending || !currentDeviceFingerprint}
            size="sm"
            className={isRetroTheme ? 'retro-button' : ''}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>

        {!currentDeviceFingerprint && (
          <div className="mt-2 text-xs text-muted-foreground text-center">
            Please unlock a device to send messages
          </div>
        )}
      </div>
    </div>
  );
}