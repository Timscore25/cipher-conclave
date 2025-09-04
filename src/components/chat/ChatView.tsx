import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Hash, Send, Paperclip, Shield, AlertTriangle, CheckCircle, Users, Settings } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';

interface Message {
  id: string;
  authorName: string;
  authorFingerprint: string;
  content: string;
  timestamp: Date;
  verified: boolean;
  encrypted: boolean;
  attachments?: Array<{
    name: string;
    size: number;
    mimeType: string;
  }>;
}

interface ChatViewProps {
  roomId: string;
}

// Mock data for development
const mockMessages: Message[] = [
  {
    id: '1',
    authorName: 'Alice',
    authorFingerprint: 'ABC123',
    content: 'Welcome to PGPRooms! This message is end-to-end encrypted.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
    verified: true,
    encrypted: true,
  },
  {
    id: '2',
    authorName: 'Bob',
    authorFingerprint: 'DEF456',
    content: 'Thanks Alice! The encryption verification is working perfectly.',
    timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    verified: true,
    encrypted: true,
  },
  {
    id: '3',
    authorName: 'Charlie',
    authorFingerprint: 'GHI789',
    content: 'I can confirm all keys are properly verified on my end as well.',
    timestamp: new Date(Date.now() - 1000 * 60 * 15), // 15 minutes ago
    verified: false,
    encrypted: true,
  },
];

export default function ChatView({ roomId }: ChatViewProps) {
  const [messages] = useState<Message[]>(mockMessages);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setLoading(true);
    
    // TODO: Implement message sending with encryption
    console.log('Sending message:', newMessage);
    
    setNewMessage('');
    setLoading(false);
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    // TODO: Implement file attachment encryption
    console.log('Selected files:', files);
  };

  const formatTimestamp = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  };

  const MessageItem = ({ message }: { message: Message }) => (
    <Card className="p-4 mb-3">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className="font-medium text-sm">{message.authorName}</span>
          <div className="flex items-center space-x-1">
            {message.verified ? (
              <CheckCircle className="w-3 h-3 text-accent" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-yellow-500" />
            )}
            {message.encrypted && (
              <Shield className="w-3 h-3 text-primary" />
            )}
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatTimestamp(message.timestamp)}
        </span>
      </div>

      <p className="text-sm mb-2">{message.content}</p>

      {message.attachments && message.attachments.length > 0 && (
        <div className="space-y-2">
          {message.attachments.map((attachment, index) => (
            <div key={index} className="flex items-center space-x-2 p-2 bg-muted rounded text-xs">
              <Paperclip className="w-3 h-3" />
              <span>{attachment.name}</span>
              <span className="text-muted-foreground">({Math.round(attachment.size / 1024)} KB)</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center space-x-2 mt-2 text-xs text-muted-foreground">
        <code className="bg-muted px-1 rounded">{message.authorFingerprint}</code>
        <Badge variant="outline" className="text-xs">
          {message.verified ? 'Verified' : 'Unverified'}
        </Badge>
      </div>
    </Card>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Hash className="w-5 h-5 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">Room #{roomId}</h2>
              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                <Users className="w-3 h-3" />
                <span>3 members</span>
                <Shield className="w-3 h-3 text-accent" />
                <span>E2E encrypted</span>
              </div>
            </div>
          </div>
          
          <Button variant="ghost" size="sm">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4">
            {messages.map((message) => (
              <MessageItem key={message.id} message={message} />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Message Input */}
      <div className="border-t border-border/50 p-4">
        <form onSubmit={handleSendMessage} className="flex space-x-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleFileSelect}
            disabled={loading}
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your encrypted message..."
            disabled={loading}
            className="flex-1"
          />
          
          <Button type="submit" disabled={loading || !newMessage.trim()}>
            <Send className="w-4 h-4" />
          </Button>
          
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </form>
        
        <p className="text-xs text-muted-foreground mt-2 flex items-center space-x-1">
          <Shield className="w-3 h-3" />
          <span>Messages are end-to-end encrypted and signed</span>
        </p>
      </div>
    </div>
  );
}