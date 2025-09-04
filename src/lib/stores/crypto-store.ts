import { create } from 'zustand';
import { pgpProvider } from '../crypto/pgp-provider';
import { keyVault } from '../storage/key-vault';
import type { UnlockedKeyHandle } from '../crypto/types';

interface CryptoState {
  isInitialized: boolean;
  hasDevice: boolean;
  currentDeviceFingerprint: string | null;
  unlockedKeys: string[];
  loading: boolean;

  initialize: () => Promise<void>;
  createDevice: (opts: {
    label: string;
    name: string;
    email?: string;
    passphrase: string;
  }) => Promise<{ fingerprint: string; publicKey: string }>;
  unlockDevice: (fingerprint: string, passphrase: string) => Promise<void>;
  lockDevice: (fingerprint: string) => void;
  lockAllDevices: () => void;
  getUnlockedKey: (fingerprint: string) => UnlockedKeyHandle | undefined;
}

export const useCryptoStore = create<CryptoState>((set, get) => ({
  isInitialized: false,
  hasDevice: false,
  currentDeviceFingerprint: null,
  unlockedKeys: [],
  loading: false,

  initialize: async () => {
    if (get().isInitialized) return;

    try {
      set({ loading: true });
      await keyVault.initialize();
      
      const devices = await keyVault.getDevices();
      const hasDevice = devices.length > 0;
      const currentDeviceFingerprint = hasDevice ? devices[0].fingerprint : null;

      set({
        isInitialized: true,
        hasDevice,
        currentDeviceFingerprint,
        loading: false,
      });
    } catch (error) {
      console.error('Failed to initialize crypto store:', error);
      set({ loading: false });
    }
  },

  createDevice: async (opts) => {
    set({ loading: true });

    try {
      const result = await pgpProvider.generateIdentity(opts);
      
      // Generate a unique device ID
      const deviceId = crypto.randomUUID();
      
      await keyVault.storeDevice({
        id: deviceId,
        userId: crypto.randomUUID(), // Will be replaced with actual user ID after auth
        label: opts.label,
        fingerprint: result.fingerprint,
        publicKeyArmored: result.publicKeyArmored,
        privateKeyWrapped: result.privateKeyWrapped,
      });

      set({
        hasDevice: true,
        currentDeviceFingerprint: result.fingerprint,
        loading: false,
      });

      return {
        fingerprint: result.fingerprint,
        publicKey: result.publicKeyArmored,
      };
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  unlockDevice: async (fingerprint: string, passphrase: string) => {
    const device = await keyVault.getDeviceByFingerprint(fingerprint);
    if (!device) {
      throw new Error('Device not found');
    }

    const handle = await pgpProvider.unlockPrivateKey(
      device.privateKeyWrapped,
      passphrase
    );

    keyVault.storeUnlockedKey(fingerprint, handle);
    
    set({
      unlockedKeys: keyVault.getUnlockedKeyFingerprints(),
    });
  },

  lockDevice: (fingerprint: string) => {
    keyVault.lockKey(fingerprint);
    set({
      unlockedKeys: keyVault.getUnlockedKeyFingerprints(),
    });
  },

  lockAllDevices: () => {
    keyVault.lockAllKeys();
    set({
      unlockedKeys: [],
    });
  },

  getUnlockedKey: (fingerprint: string) => {
    return keyVault.getUnlockedKey(fingerprint);
  },
}));