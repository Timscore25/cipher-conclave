import { useAuthStore } from '@/lib/stores/auth-store';
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { logAuth } from '@/lib/auth/debug';

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const { initialized, session } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (initialized && !session) {
      logAuth('AuthGuard: redirecting to login', { path: location.pathname });
      navigate('/', { replace: true });
    }
  }, [initialized, session, navigate, location.pathname]);

  if (!initialized) {
    return null; // Still initializing
  }

  if (!session) {
    return null; // Will redirect
  }

  return <>{children}</>;
}