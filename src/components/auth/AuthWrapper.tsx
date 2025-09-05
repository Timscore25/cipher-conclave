import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useCryptoStore } from '@/lib/stores/crypto-store';
import AuthFlow from './AuthFlow';
import OnboardingFlow from './OnboardingFlow';
import { Skeleton } from '@/components/ui/skeleton';
import { logAuth } from '@/lib/auth/debug';

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, session, loading, initialized, initAuthListener } = useAuthStore();
  const { isInitialized: cryptoInitialized, hasDevice, initialize: initializeCrypto } = useCryptoStore();
  const authCleanupRef = useRef<(() => void) | null>(null);

  // Initialize auth listener once
  useEffect(() => {
    if (!authCleanupRef.current) {
      authCleanupRef.current = initAuthListener();
    }
    
    return () => {
      if (authCleanupRef.current) {
        authCleanupRef.current();
        authCleanupRef.current = null;
      }
    };
  }, [initAuthListener]);

// Initialize crypto after auth is ready
useEffect(() => {
  logAuth('AuthWrapper decision', { initialized, hasSession: !!session, hasUser: !!user, cryptoInitialized, hasDevice });
  if (initialized && user) {
    initializeCrypto();
  }
}, [initialized, user, session, cryptoInitialized, hasDevice, initializeCrypto]);

  // Show loading while initializing
  if (loading || !initialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  // User not authenticated  
  if (!user || !session) {
    logAuth('AuthWrapper: rendering AuthFlow', { hasUser: !!user, hasSession: !!session });
    return <AuthFlow />;
  }

  // Wait for crypto initialization
  if (!cryptoInitialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  // User authenticated but no crypto device
  if (!hasDevice) {
    return <OnboardingFlow />;
  }

  // All good - show main app
  logAuth('AuthWrapper: rendering main app', { user: user.email, hasSession: !!session });
  return children;
}