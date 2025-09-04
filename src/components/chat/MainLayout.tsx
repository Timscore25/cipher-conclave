import { useState, useEffect } from 'react';
import { Sidebar, SidebarContent, SidebarHeader, SidebarProvider } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useCryptoStore } from '@/lib/stores/crypto-store';
import RoomsList from './RoomsList';
import ChatView from './ChatView';
import UnlockPrompt from './UnlockPrompt';
import { LogOut, Lock, Shield } from 'lucide-react';

export default function MainLayout() {
  const { signOut, user } = useAuthStore();
  const { currentDeviceFingerprint, unlockedKeys } = useCryptoStore();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const isDeviceUnlocked = currentDeviceFingerprint && unlockedKeys.includes(currentDeviceFingerprint);

  return (
    <SidebarProvider>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <Sidebar>
          <SidebarHeader className="border-b border-border/50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Shield className="w-4 h-4 text-primary-foreground" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm">PGPRooms</h2>
                  <p className="text-xs text-muted-foreground truncate">
                    {user?.email}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-1">
                <div className={`w-2 h-2 rounded-full ${
                  isDeviceUnlocked ? 'bg-accent' : 'bg-destructive'
                }`} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={signOut}
                  className="h-8 w-8 p-0"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent>
            {isDeviceUnlocked ? (
              <RoomsList 
                selectedRoomId={selectedRoomId}
                onSelectRoom={setSelectedRoomId}
              />
            ) : (
              <div className="p-4">
                <div className="text-center space-y-3">
                  <Lock className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Device locked
                  </p>
                </div>
              </div>
            )}
          </SidebarContent>
        </Sidebar>

        {/* Main Content */}
        <main className="flex-1 flex flex-col">
          {!isDeviceUnlocked ? (
            <UnlockPrompt />
          ) : selectedRoomId ? (
            <ChatView roomId={selectedRoomId} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4 max-w-md">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                  <Shield className="w-8 h-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Welcome to PGPRooms</h3>
                  <p className="text-muted-foreground">
                    Select a room to start secure messaging, or create a new room to begin.
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </SidebarProvider>
  );
}