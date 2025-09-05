import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

// Debug logging controlled by environment
const DEBUG_AUTH = import.meta.env.VITE_DEBUG_AUTH === 'true';
const debugLog = (...args: any[]) => {
  if (DEBUG_AUTH) {
    console.log('[AUTH DEBUG]', ...args);
  }
};

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  emailConfirmationRequired: boolean;
  
  // Actions
  setSession: (session: Session | null) => void;
  setInitialized: () => void;
  signIn: (email: string, password: string) => Promise<{ error?: any }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error?: any; emailConfirmationRequired?: boolean }>;
  signOut: () => Promise<void>;
  resendConfirmation: (email: string) => Promise<{ error?: any }>;
  initAuthListener: () => () => void; // Returns cleanup function
}

// Module-level guard to prevent multiple initializations
let authListenerInitialized = false;
let authSubscription: any = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  initialized: false,
  emailConfirmationRequired: false,

  setSession: (session: Session | null) => {
    debugLog('setSession called with:', session?.user?.email || 'null');
    set({ 
      session, 
      user: session?.user ?? null,
      loading: false,
      emailConfirmationRequired: false
    });
    
    // Handle user profile creation in background
    if (session?.user && !authListenerInitialized) {
      setTimeout(() => {
        createUserProfile(session.user);
      }, 0);
    }
  },

  setInitialized: () => {
    debugLog('Auth store initialized');
    set({ initialized: true, loading: false });
  },

  initAuthListener: () => {
    if (authListenerInitialized) {
      debugLog('Auth listener already initialized');
      return () => {};
    }
    
    debugLog('Initializing auth listener');
    authListenerInitialized = true;

    // Set up auth state listener - NEVER use async callbacks here
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        debugLog('Auth state change:', event, session?.user?.email || 'no user');
        
        // Only synchronous state updates here
        get().setSession(session);
        
        // Handle router navigation in the UI layer, not here
      }
    );
    
    authSubscription = subscription;

    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        debugLog('Error getting session:', error);
      } else {
        debugLog('Initial session loaded:', session?.user?.email || 'no session');
      }
      get().setSession(session);
      get().setInitialized();
    });

    // Return cleanup function
    return () => {
      debugLog('Cleaning up auth listener');
      authListenerInitialized = false;
      if (authSubscription) {
        authSubscription.unsubscribe();
        authSubscription = null;
      }
    };
  },

  signUp: async (email: string, password: string, displayName: string) => {
    debugLog('Sign up attempt for:', email);
    set({ loading: true });
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          display_name: displayName,
        },
      },
    });

    if (error) {
      debugLog('Sign up error:', error);
      set({ loading: false });
      return { error };
    }

    debugLog('Sign up successful, email confirmation required');
    set({ 
      loading: false, 
      emailConfirmationRequired: true 
    });
    
    return { emailConfirmationRequired: true };
  },

  signIn: async (email: string, password: string) => {
    debugLog('Sign in attempt for:', email);
    set({ loading: true, emailConfirmationRequired: false });
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      debugLog('Sign in error:', error);
      
      // Handle email confirmation error specifically
      if (error.message.includes('email_not_confirmed') || error.message.includes('Email not confirmed')) {
        set({ 
          loading: false, 
          emailConfirmationRequired: true 
        });
        return { error: { ...error, message: 'Please check your email and click the confirmation link before signing in.' } };
      }
      
      set({ loading: false });
      return { error };
    }

    debugLog('Sign in successful');
    set({ loading: false });
    return {};
  },

  signOut: async () => {
    debugLog('Sign out');
    set({ loading: true });
    await supabase.auth.signOut();
    set({ 
      user: null, 
      session: null, 
      loading: false,
      emailConfirmationRequired: false
    });
  },

  resendConfirmation: async (email: string) => {
    debugLog('Resend confirmation for:', email);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      }
    });
    
    if (error) {
      debugLog('Resend confirmation error:', error);
    } else {
      debugLog('Confirmation email resent successfully');
    }
    
    return { error };
  },
}));

// Helper function to create user profile (runs in background)
async function createUserProfile(user: User) {
  try {
    debugLog('Checking/creating user profile for:', user.email);
    
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single();
      
    if (!existingUser) {
      debugLog('Creating new user profile');
      await supabase.from('users').insert({
        id: user.id,
        display_name: user.user_metadata?.display_name || 'Anonymous User',
      });
    } else {
      debugLog('User profile already exists');
    }
  } catch (error) {
    debugLog('Error managing user profile:', error);
  }
}