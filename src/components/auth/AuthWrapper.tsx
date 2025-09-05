import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useCryptoStore } from '@/lib/stores/crypto-store';
import AuthFlow from './AuthFlow';
import OnboardingFlow from './OnboardingFlow';
import { Skeleton } from '@/components/ui/skeleton';

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, loading, initialized, initAuthListener } = useAuthStore();
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
    if (initialized && user) {
      initializeCrypto();
    }
  }, [initialized, user, initializeCrypto]);

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
  if (!user) {
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
  return children;
}