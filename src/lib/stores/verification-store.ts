import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

interface VerificationRecord {
  target_fpr: string;
  method: 'qr' | 'sas';
  verified_at: string;
  verifier_device_id: string;
}

interface VerificationState {
  verifications: VerificationRecord[];
  isLoading: boolean;
  error: string | null;

  // Actions
  loadVerifications: () => Promise<void>;
  isFingerrintVerified: (fingerprint: string) => boolean;
  addVerification: (targetFpr: string, method: 'qr' | 'sas') => Promise<void>;
  clearError: () => void;
}

export const useVerificationStore = create<VerificationState>((set, get) => ({
  verifications: [],
  isLoading: false,
  error: null,

  loadVerifications: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('key_verifications')
        .select('*')
        .order('verified_at', { ascending: false });

      if (error) throw error;

      set({ verifications: data || [], isLoading: false });
    } catch (error) {
      console.error('Failed to load verifications:', error);
      set({ error: 'Failed to load verifications', isLoading: false });
    }
  },

  isFingerrintVerified: (fingerprint: string) => {
    const { verifications } = get();
    return verifications.some(v => v.target_fpr === fingerprint);
  },

  addVerification: async (targetFpr: string, method: 'qr' | 'sas') => {
    set({ isLoading: true, error: null });
    try {
      // Get current user's device ID
      const { data: devices, error: deviceError } = await supabase
        .from('devices')
        .select('id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .limit(1)
        .single();

      if (deviceError) throw deviceError;

      const { error } = await supabase
        .from('key_verifications')
        .insert({
          verifier_device_id: devices.id,
          target_fpr: targetFpr,
          method,
        });

      if (error) throw error;

      // Reload verifications
      await get().loadVerifications();
    } catch (error) {
      console.error('Failed to add verification:', error);
      set({ error: 'Failed to add verification', isLoading: false });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));