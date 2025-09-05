import { useState, useEffect } from 'react';
import { Plus, Users, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useRoomsStore } from '@/lib/stores/rooms-store';
import { useCryptoStore } from '@/lib/stores/crypto-store';
import { useToast } from '@/hooks/use-toast';

interface RoomsListProps {
  isRetroTheme?: boolean;
}

export function RoomsList({ isRetroTheme = false }: RoomsListProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const { 
    rooms, 
    currentRoomId, 
    isLoading, 
    error, 
    loadRooms, 
    createRoom, 
    setCurrentRoom,
    clearError 
  } = useRoomsStore();
  
  const { currentDeviceFingerprint } = useCryptoStore();
  const { toast } = useToast();

  // Load rooms on mount
  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;

    setIsCreating(true);
    try {
      await createRoom(newRoomName.trim());
      setNewRoomName('');
      setIsCreateDialogOpen(false);
      toast({
        title: "Room created",
        description: `Successfully created room "${newRoomName}".`,
      });
    } catch (error) {
      toast({
        title: "Failed to create room",
        description: "An error occurred while creating the room.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRoomSelect = (roomId: string) => {
    setCurrentRoom(roomId);
    if (error) clearError();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className={`text-lg font-semibold ${isRetroTheme ? 'retro-heading' : ''}`}>
          {isRetroTheme ? '# Channels' : 'Rooms'}
        </h2>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              size="sm" 
              variant="outline" 
              disabled={!currentDeviceFingerprint}
              className={isRetroTheme ? 'retro-button' : ''}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Room</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="room-name">Room Name</Label>
                <Input
                  id="room-name"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Enter room name..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isCreating) {
                      handleCreateRoom();
                    }
                  }}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateRoom}
                  disabled={!newRoomName.trim() || isCreating}
                >
                  {isCreating ? 'Creating...' : 'Create Room'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => handleRoomSelect(room.id)}
              className={`
                w-full text-left p-3 rounded-lg mb-2 transition-colors
                ${isRetroTheme ? 'retro-channel' : ''}
                ${currentRoomId === room.id
                  ? `${isRetroTheme ? 'active' : 'bg-primary text-primary-foreground'}`
                  : `${isRetroTheme ? '' : 'hover:bg-accent hover:text-accent-foreground'}`
                }
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                  <Hash className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium truncate">
                    {isRetroTheme ? `${room.name}` : room.name}
                  </span>
                  <Badge 
                    variant={room.crypto_mode === 'mls' ? 'default' : 'secondary'} 
                    className={`text-xs ml-2 ${isRetroTheme ? 'retro-badge' : ''}`}
                  >
                    {room.crypto_mode?.toUpperCase() || 'PGP'}
                  </Badge>
                </div>
                {room.member_count && (
                  <Badge variant="secondary" className={`ml-2 ${isRetroTheme ? 'retro-badge' : ''}`}>
                    <Users className="w-3 h-3 mr-1" />
                    {room.member_count}
                  </Badge>
                )}
              </div>
            </button>
          ))}

          {rooms.length === 0 && !isLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <Hash className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No rooms yet</p>
              <p className="text-sm">Create a room to start chatting</p>
            </div>
          )}

          {isLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <p>Loading rooms...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-4 text-destructive text-sm">
              {error}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}