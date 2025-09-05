import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRoomsStore } from '@/lib/stores/rooms-store';
import { useCryptoStore } from '@/lib/stores/crypto-store';
import { useToast } from '@/hooks/use-toast';
import DeviceStatusBanner from '@/components/device/DeviceStatusBanner';
import ImportDeviceDialog from '@/components/device/ImportDeviceDialog';
import UnlockPrompt from '@/components/chat/UnlockPrompt';
import { Plus, Hash, Users, AlertCircle, Loader2 } from 'lucide-react';

export default function RoomsList() {
  const { 
    rooms, 
    isLoading: loading, 
    error, 
    loadRooms: fetchRooms, 
    createRoom, 
    setCurrentRoom: selectRoom, 
    currentRoomId: selectedRoomId 
  } = useRoomsStore();
  const { hasAnyDevice, hasLocalDevice, isUnlocked } = useCryptoStore();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const checkDeviceAndExecute = (action: 'create' | 'select', roomId?: string) => {
    if (!hasAnyDevice) {
      toast({
        title: 'Add a device to start',
        description: 'Create or import a device to begin chatting.',
        variant: 'destructive',
      });
      return false;
    }

    if (!hasLocalDevice) {
      toast({
        title: 'Import your device',
        description: 'Your device is not available on this browser. Please import your device.',
        variant: 'destructive',
      });
      setShowImportDialog(true);
      return false;
    }

    if (!isUnlocked()) {
      toast({
        title: 'Unlock your device',
        description: 'Enter your passphrase to continue.',
        variant: 'destructive',
      });
      setPendingAction(action === 'create' ? 'create' : `select:${roomId}`);
      setShowUnlockPrompt(true);
      return false;
    }

    return true;
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!roomName.trim()) {
      toast({
        title: 'Error',
        description: 'Room name is required',
        variant: 'destructive',
      });
      return;
    }

    if (!checkDeviceAndExecute('create')) {
      return;
    }

    try {
      setIsCreating(true);
      await createRoom(roomName.trim());
      
      toast({
        title: 'Success',
        description: `Room "${roomName.trim()}" created successfully`,
      });
      
      setRoomName('');
      setShowCreateDialog(false);
    } catch (error: any) {
      console.error('[ROOMS] Create room failed:', error);
      
      let errorMessage = 'Failed to create room';
      if (error.message?.includes('permission denied') || error.message?.includes('RLS')) {
        errorMessage = 'Permission denied. Your account may not have proper permissions. Please sign out/in or contact support.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelectRoom = (roomId: string) => {
    if (checkDeviceAndExecute('select', roomId)) {
      selectRoom(roomId);
    }
  };

  const handleUnlockSuccess = () => {
    setShowUnlockPrompt(false);
    
    if (pendingAction) {
      if (pendingAction === 'create') {
        setShowCreateDialog(true);
      } else if (pendingAction.startsWith('select:')) {
        const roomId = pendingAction.split(':')[1];
        selectRoom(roomId);
      }
      setPendingAction(null);
    }
  };

  if (showUnlockPrompt) {
    return <UnlockPrompt onSuccess={handleUnlockSuccess} onCancel={() => setShowUnlockPrompt(false)} />;
  }

  return (
    <>
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center space-x-2">
              <Hash className="w-5 h-5" />
              <span>Rooms</span>
            </span>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button 
                  size="sm" 
                  onClick={(e) => {
                    if (!checkDeviceAndExecute('create')) {
                      e.preventDefault();
                    }
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Room</DialogTitle>
                  <DialogDescription>
                    Create a new encrypted chat room
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateRoom} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="room-name">Room Name</Label>
                    <Input
                      id="room-name"
                      placeholder="Enter room name..."
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      disabled={isCreating}
                      required
                    />
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setShowCreateDialog(false)}
                      disabled={isCreating}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isCreating || !roomName.trim()}>
                      {isCreating ? 'Creating...' : 'Create Room'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
          
          <CardContent className="p-4">
            <DeviceStatusBanner
              onCreateDevice={() => {/* Will be handled by existing onboarding flow */}}
              onImportDevice={() => setShowImportDialog(true)}
              onUnlockDevice={() => setShowUnlockPrompt(true)}
            />

            {loading && (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading rooms...</span>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Failed to load rooms: {error}
                </AlertDescription>
              </Alert>
            )}

            {!loading && !error && rooms.length === 0 && (
              <div className="text-center p-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No rooms yet</p>
                <p className="text-sm">Create a room to start chatting</p>
              </div>
            )}

            {!loading && !error && rooms.length > 0 && (
              <div className="space-y-1">
                {rooms.map((room) => (
                  <Button
                    key={room.id}
                    variant={selectedRoomId === room.id ? "secondary" : "ghost"}
                    className="w-full justify-start"
                    onClick={() => handleSelectRoom(room.id)}
                  >
                    <Hash className="w-4 h-4 mr-2" />
                    {room.name}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <ImportDeviceDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
        />
      </>
    );
}