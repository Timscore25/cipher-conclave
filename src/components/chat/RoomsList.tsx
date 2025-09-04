import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Hash, Users, Lock } from 'lucide-react';

interface Room {
  id: string;
  name: string;
  memberCount: number;
  lastMessage?: string;
  lastMessageTime?: Date;
  unreadCount?: number;
}

interface RoomsListProps {
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
}

// Mock data for development
const mockRooms: Room[] = [
  {
    id: '1',
    name: 'General',
    memberCount: 5,
    lastMessage: 'Welcome to PGPRooms!',
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    unreadCount: 2,
  },
  {
    id: '2', 
    name: 'Security Team',
    memberCount: 3,
    lastMessage: 'Keys verified successfully',
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
  },
];

export default function RoomsList({ selectedRoomId, onSelectRoom }: RoomsListProps) {
  const [rooms] = useState<Room[]>(mockRooms);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;
    
    // TODO: Implement room creation
    console.log('Creating room:', newRoomName);
    setCreateRoomOpen(false);
    setNewRoomName('');
  };

  const formatLastSeen = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with Create Room button */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Rooms</h3>
          <Dialog open={createRoomOpen} onOpenChange={setCreateRoomOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                <Plus className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Room</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="room-name">Room Name</Label>
                  <Input
                    id="room-name"
                    placeholder="Enter room name"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                  />
                </div>
                <Button onClick={handleCreateRoom} className="w-full">
                  Create Room
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Rooms List */}
      <div className="flex-1 overflow-y-auto">
        {rooms.length === 0 ? (
          <div className="p-4 text-center">
            <div className="space-y-3">
              <Hash className="w-8 h-8 mx-auto text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">No rooms yet</p>
                <p className="text-xs text-muted-foreground">Create your first room to get started</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {rooms.map((room) => (
              <Card 
                key={room.id}
                className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                  selectedRoomId === room.id ? 'bg-muted border-primary/50' : ''
                }`}
                onClick={() => onSelectRoom(room.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      <Hash className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{room.name}</span>
                    </div>
                    {room.unreadCount && (
                      <div className="bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {room.unreadCount}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center space-x-1">
                      <Users className="w-3 h-3" />
                      <span>{room.memberCount} members</span>
                    </div>
                    {room.lastMessageTime && (
                      <span>{formatLastSeen(room.lastMessageTime)}</span>
                    )}
                  </div>
                  
                  {room.lastMessage && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {room.lastMessage}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Security Status */}
      <div className="p-4 border-t border-border/50">
        <div className="flex items-center space-x-2 text-xs text-accent">
          <Lock className="w-3 h-3" />
          <span>End-to-end encrypted</span>
        </div>
      </div>
    </div>
  );
}