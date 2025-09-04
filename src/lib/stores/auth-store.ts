import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: any }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error?: any }>;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;

    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        set({ session, user: session?.user ?? null, loading: false });
        
        // Create user profile if new signup
        if (event === 'SIGNED_IN' && session?.user) {
          const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('id', session.user.id)
            .single();
            
          if (!existingUser) {
            await supabase.from('users').insert({
              id: session.user.id,
              display_name: session.user.user_metadata?.display_name || 'Anonymous User',
            });
          }
        }
      }
    );

    // Then check for existing session
    const { data: { session } } = await supabase.auth.getSession();
    set({
      session,
      user: session?.user ?? null,
      loading: false,
      initialized: true,
    });

    // Store subscription for cleanup
    (window as any).__authSubscription = subscription;
  },

  signUp: async (email: string, password: string, displayName: string) => {
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

    set({ loading: false });
    return { error };
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true });
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    set({ loading: false });
    return { error };
  },

  signOut: async () => {
    set({ loading: true });
    await supabase.auth.signOut();
    set({ user: null, session: null, loading: false });
  },
}));