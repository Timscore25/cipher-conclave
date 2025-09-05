import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '@/lib/stores/auth-store';

// Mock Supabase client
const mockSupabase = {
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    resend: vi.fn()
  },
  from: vi.fn()
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase
}));

describe('Auth Store', () => {
  beforeEach(() => {
    // Reset store state
    useAuthStore.getState().setSession(null);
    useAuthStore.getState().initialized = false;
    useAuthStore.getState().loading = true;
    
    // Reset mocks
    vi.clearAllMocks();
  });

  it('should initialize with correct default state', () => {
    const store = useAuthStore.getState();
    expect(store.user).toBeNull();
    expect(store.session).toBeNull();
    expect(store.loading).toBe(true);
    expect(store.initialized).toBe(false);
    expect(store.emailConfirmationRequired).toBe(false);
  });

  it('should set initialized state', () => {
    const store = useAuthStore.getState();
    
    store.setInitialized();
    
    expect(store.initialized).toBe(true);
    expect(store.loading).toBe(false);
  });

  it('should update session and user when setSession is called', () => {
    const mockSession = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: {}
      },
      access_token: 'token-123',
      refresh_token: 'refresh-123'
    } as any;

    const store = useAuthStore.getState();
    store.setSession(mockSession);

    expect(store.session).toBe(mockSession);
    expect(store.user).toBe(mockSession.user);
    expect(store.loading).toBe(false);
    expect(store.emailConfirmationRequired).toBe(false);
  });

  it('should clear session and user when setSession is called with null', () => {
    const store = useAuthStore.getState();
    
    // First set a session
    store.setSession({
      user: { id: 'user-123', email: 'test@example.com' },
      access_token: 'token'
    } as any);
    
    // Then clear it
    store.setSession(null);

    expect(store.session).toBeNull();
    expect(store.user).toBeNull();
    expect(store.loading).toBe(false);
  });

  it('should setup auth listener correctly', () => {
    const mockSubscription = { unsubscribe: vi.fn() };
    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: mockSubscription }
    });
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null
    });

    const store = useAuthStore.getState();
    const cleanup = store.initAuthListener();

    expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalled();
    expect(mockSupabase.auth.getSession).toHaveBeenCalled();
    expect(typeof cleanup).toBe('function');
  });

  it('should handle auth state changes', async () => {
    const mockSession = {
      user: { id: 'user-123', email: 'test@example.com' }
    } as any;
    
    let authStateCallback: (event: string, session: any) => void;
    
    mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
      authStateCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null
    });

    const store = useAuthStore.getState();
    store.initAuthListener();

    // Simulate auth state change
    authStateCallback('SIGNED_IN', mockSession);

    expect(store.session).toBe(mockSession);
    expect(store.user).toBe(mockSession.user);
  });
});