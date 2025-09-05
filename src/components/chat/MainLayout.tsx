import { useState, useEffect } from 'react';
import { Sidebar, SidebarContent, SidebarHeader, SidebarProvider } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useCryptoStore } from '@/lib/stores/crypto-store';
import RoomsList from './RoomsList';
import ChatView from './ChatView';
import UnlockPrompt from './UnlockPrompt';
import { LogOut, Lock, Shield, Monitor } from 'lucide-react';

export function MainLayout() {
  const { signOut, user } = useAuthStore();
  const { currentDeviceFingerprint, unlockedKeys } = useCryptoStore();
  
  // Retro theme toggle with localStorage persistence
  const [isRetroTheme, setIsRetroTheme] = useState(() => {
    try {
      return localStorage.getItem('pgp-retro-theme') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('pgp-retro-theme', isRetroTheme.toString());
    } catch {
      // Ignore localStorage errors
    }
  }, [isRetroTheme]);

  const isDeviceUnlocked = currentDeviceFingerprint && unlockedKeys.includes(currentDeviceFingerprint);

  return (
    <div className={isRetroTheme ? 'theme-retro retro-overlay' : ''}>
      <SidebarProvider>
        <div className="flex h-screen bg-background">{/* Sidebar */}
          <Sidebar>
            <SidebarHeader className="border-b border-border/50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                    <Shield className="w-4 h-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className={`font-semibold text-sm ${isRetroTheme ? 'retro-heading' : ''}`}>
                      PGPRooms
                    </h2>
                    <p className="text-xs text-muted-foreground truncate">
                      {user?.email}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-1">
                  <div className={`w-2 h-2 rounded-full ${
                    isDeviceUnlocked ? 'bg-accent' : 'bg-destructive'
                  } ${isRetroTheme ? 'retro-glow' : ''}`} />
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
              
              {/* Retro Theme Toggle */}
              <div className="flex items-center justify-between pt-3 mt-3 border-t border-border/50">
                <div className="flex items-center space-x-2">
                  <Monitor className="w-4 h-4 text-muted-foreground" />
                  <Label htmlFor="retro-theme" className="text-xs">
                    Retro Theme
                  </Label>
                </div>
                <Switch
                  id="retro-theme"
                  checked={isRetroTheme}
                  onCheckedChange={setIsRetroTheme}
                />
              </div>
            </SidebarHeader>
            
            <SidebarContent>
              {isDeviceUnlocked ? (
                <RoomsList />
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
            ) : (
              <ChatView isRetroTheme={isRetroTheme} />
            )}
          </main>
        </div>
      </SidebarProvider>
    </div>
  );
}