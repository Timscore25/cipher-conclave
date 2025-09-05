import { useState, useEffect } from 'react';
import { Plus, Users, Hash, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRoomsStore } from '@/lib/stores/rooms-store';
import { useCryptoStore } from '@/lib/stores/crypto-store';
import { useToast } from '@/hooks/use-toast';

interface RoomsListProps {
  isRetroTheme?: boolean;
}

function logRoomsUI(message: string, ...args: any[]) {
  if (import.meta.env.VITE_DEBUG_ROOMS === 'true') {
    console.log(`[ROOMS_UI] ${message}`, ...args);
  }
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
    logRoomsUI('Component mounted, loading rooms...');
    loadRooms();
  }, [loadRooms]);

  // Log state changes
  useEffect(() => {
    logRoomsUI('State change:', { 
      roomsCount: rooms.length, 
      isLoading, 
      error, 
      currentRoomId,
      hasDevice: !!currentDeviceFingerprint
    });
  }, [rooms.length, isLoading, error, currentRoomId, currentDeviceFingerprint]);

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;

    logRoomsUI('Creating room:', { name: newRoomName.trim() });
    
    setIsCreating(true);
    try {
      await createRoom(newRoomName.trim());
      setNewRoomName('');
      setIsCreateDialogOpen(false);
      
      toast({
        title: "Room created",
        description: `Successfully created room "${newRoomName}".`,
      });
      
      logRoomsUI('Room created successfully');
    } catch (error: any) {
      logRoomsUI('Failed to create room:', error);
      
      const errorMessage = error.message || 'An error occurred while creating the room.';
      let description = errorMessage;
      
      // Provide helpful error messages for common issues
      if (errorMessage.includes('permission denied') || errorMessage.includes('RLS')) {
        description = 'Your account may not have the necessary permissions. Please sign out and sign in again, or contact support.';
      } else if (errorMessage.includes('No device found')) {
        description = 'You need to create a device first before creating rooms.';
      }
      
      toast({
        title: "Failed to create room",
        description,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRoomSelect = (roomId: string) => {
    logRoomsUI('Selecting room:', { roomId });
    setCurrentRoom(roomId);
    if (error) clearError();
  };

  const isEmptyState = !isLoading && rooms.length === 0 && !error;
  const hasError = !!error;

  logRoomsUI('Render state:', { isEmptyState, hasError, isLoading, roomsCount: rooms.length });

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
              title={!currentDeviceFingerprint ? 'Create a device first to create rooms' : 'Create a new room'}
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
          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
              <p>Loading rooms...</p>
            </div>
          )}

          {/* Error State */}
          {hasError && (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-medium mb-1">Failed to load rooms</div>
                  {import.meta.env.VITE_DEBUG_ROOMS === 'true' && (
                    <div className="text-xs opacity-75 font-mono">{error}</div>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={loadRooms}
                    className="mt-2"
                  >
                    Try Again
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Empty State */}
          {isEmptyState && (
            <div className="text-center py-12 px-4">
              <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <Hash className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No rooms yet</h3>
              <p className="text-muted-foreground mb-4">
                Create a room to start chatting with end-to-end encryption
              </p>
              {currentDeviceFingerprint ? (
                <Button 
                  onClick={() => setIsCreateDialogOpen(true)}
                  className={isRetroTheme ? 'retro-button' : ''}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Room
                </Button>
              ) : (
                <Alert className="max-w-sm mx-auto">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    You need to create a device first before you can create rooms.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Rooms List */}
          {!isLoading && !hasError && rooms.length > 0 && (
            <>
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
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}