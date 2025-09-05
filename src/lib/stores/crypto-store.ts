import { create } from 'zustand';
import * as openpgp from 'openpgp';
import { pgpProvider } from '../crypto/pgp-provider';
import { keyVault } from '../storage/key-vault';
import { supabase } from '@/integrations/supabase/client';
import type { UnlockedKeyHandle } from '../crypto/types';

interface DeviceInfo {
  id: string;
  label: string;
  fingerprint: string;
  created_at: string;
}

interface CryptoState {
  isInitialized: boolean;
  hasAnyDevice: boolean;
  hasLocalDevice: boolean;
  currentDeviceId: string | null;
  currentDeviceFingerprint: string | null;
  unlockedKeys: string[];
  loading: boolean;
  remoteDevices: DeviceInfo[];

  initialize: () => Promise<void>;
  fetchRemoteDevices: () => Promise<void>;
  createDevice: (opts: {
    label: string;
    name: string;
    email?: string;
    passphrase: string;
  }) => Promise<{ fingerprint: string; publicKey: string }>;
  importDevice: (privateKeyArmored: string, passphrase: string) => Promise<{ fingerprint: string; deviceId: string }>;
  unlockDevice: (fingerprint: string, passphrase: string) => Promise<void>;
  lockDevice: (fingerprint: string) => void;
  lockAllDevices: () => void;
  getUnlockedKey: (fingerprint: string) => UnlockedKeyHandle | undefined;
  isUnlocked: () => boolean;
}

export const useCryptoStore = create<CryptoState>((set, get) => ({
  isInitialized: false,
  hasAnyDevice: false,
  hasLocalDevice: false,
  currentDeviceId: null,
  currentDeviceFingerprint: null,
  unlockedKeys: [],
  loading: false,
  remoteDevices: [],

  initialize: async () => {
    if (get().isInitialized) return;

    const DEBUG_DEVICES = import.meta.env.VITE_DEBUG_DEVICES === 'true';

    try {
      set({ loading: true });
      await keyVault.initialize();
      
      // Check local devices
      const localDevices = await keyVault.getDevices();
      const hasLocalDevice = localDevices.length > 0;
      const currentDeviceFingerprint = hasLocalDevice ? localDevices[0].fingerprint : null;
      const currentDeviceId = hasLocalDevice ? localDevices[0].id : null;

      if (DEBUG_DEVICES) {
        console.log('[DEVICES] Local devices found:', localDevices.length);
      }

      // Fetch remote devices from Supabase
      await get().fetchRemoteDevices();
      
      const { remoteDevices } = get();
      
      set({
        isInitialized: true,
        hasLocalDevice,
        hasAnyDevice: remoteDevices.length > 0,
        currentDeviceId,
        currentDeviceFingerprint,
        loading: false,
      });

      if (DEBUG_DEVICES) {
        console.log('[DEVICES] State after init:', {
          hasLocalDevice,
          hasAnyDevice: remoteDevices.length > 0,
          remoteDevicesCount: remoteDevices.length,
          currentDeviceFingerprint
        });
      }
    } catch (error) {
      console.error('[DEVICES] Failed to initialize crypto store:', error);
      set({ loading: false });
    }
  },

  fetchRemoteDevices: async () => {
    const DEBUG_DEVICES = import.meta.env.VITE_DEBUG_DEVICES === 'true';
    
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('id,label,fingerprint,created_at')
        .order('created_at', { ascending: false });

      if (error) {
        if (DEBUG_DEVICES) {
          console.error('[DEVICES] Failed to fetch remote devices:', error);
        }
        throw error;
      }

      const remoteDevices = data || [];
      set({ remoteDevices });

      if (DEBUG_DEVICES) {
        console.log('[DEVICES] Remote devices fetched:', remoteDevices.length);
      }
    } catch (error) {
      if (DEBUG_DEVICES) {
        console.error('[DEVICES] Error fetching remote devices:', error);
      }
      set({ remoteDevices: [] });
    }
  },

  createDevice: async (opts) => {
    set({ loading: true });
    const DEBUG_DEVICES = import.meta.env.VITE_DEBUG_DEVICES === 'true';

    try {
      // Validate input parameters
      if (typeof opts.passphrase !== 'string' || opts.passphrase.trim().length < 8) {
        throw new Error('Passphrase must be at least 8 characters long');
      }
      if (typeof opts.label !== 'string' || opts.label.trim().length === 0) {
        throw new Error('Device label is required');
      }
      if (typeof opts.name !== 'string' || opts.name.trim().length === 0) {
        throw new Error('Name is required');
      }

      if (DEBUG_DEVICES) {
        console.log('[DEVICES] Creating device:', { 
          label: opts.label, 
          name: opts.name,
          hasEmail: !!opts.email,
          passphraseLength: opts.passphrase.length
        });
      }

      const result = await pgpProvider.generateIdentity(opts);
      
      // Generate a unique device ID
      const deviceId = crypto.randomUUID();
      
      // Store locally first
      await keyVault.storeDevice({
        id: deviceId,
        userId: 'temp', // Will be updated after Supabase insert
        label: opts.label.trim(),
        fingerprint: result.fingerprint,
        publicKeyArmored: result.publicKeyArmored,
        privateKeyWrapped: result.privateKeyWrapped,
      });

      // Store in Supabase
      const { error: supabaseError } = await supabase
        .from('devices')
        .insert({
          id: deviceId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          label: opts.label.trim(),
          fingerprint: result.fingerprint,
          public_key_armored: result.publicKeyArmored,
        });

      if (supabaseError) {
        // Clean up local storage on Supabase failure
        await keyVault.deleteDevice(deviceId);
        throw supabaseError;
      }

      // Refresh remote devices and update state
      await get().fetchRemoteDevices();
      
      set({
        hasAnyDevice: true,
        hasLocalDevice: true,
        currentDeviceId: deviceId,
        currentDeviceFingerprint: result.fingerprint,
        loading: false,
      });

      if (DEBUG_DEVICES) {
        console.log('[DEVICES] Device created successfully:', { 
          fingerprint: result.fingerprint,
          deviceId 
        });
      }

      return {
        fingerprint: result.fingerprint,
        publicKey: result.publicKeyArmored,
      };
    } catch (error) {
      set({ loading: false });
      if (DEBUG_DEVICES) {
        console.error('[DEVICES] Failed to create device:', error);
      }
      throw error;
    }
  },

  importDevice: async (privateKeyArmored: string, passphrase: string) => {
    set({ loading: true });
    const DEBUG_DEVICES = import.meta.env.VITE_DEBUG_DEVICES === 'true';

    try {
      if (DEBUG_DEVICES) {
        console.log('[DEVICES] Importing device...');
      }

      // Extract public key and fingerprint from private key
      const privateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
      const publicKey = privateKey.toPublic();
      const keyInfo = {
        fingerprint: privateKey.getFingerprint().toUpperCase(),
        publicKeyArmored: publicKey.armor()
      };
      
      const deviceIdString = crypto.randomUUID() as string;

      // Wrap the private key with passphrase using inline encryption (same as createDevice)
      const keyData = new TextEncoder().encode(privateKeyArmored);
      
      let privateKeyWrapped: Uint8Array;
      
      if (typeof window !== 'undefined' && window.crypto?.subtle) {
        // Use WebCrypto API
        const key = await window.crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(passphrase),
          { name: 'PBKDF2' },
          false,
          ['deriveKey']
        );

        const derivedKey = await window.crypto.subtle.deriveKey(
          {
            name: 'PBKDF2',
            salt: new TextEncoder().encode('pgp-rooms-salt'),
            iterations: 100000,
            hash: 'SHA-256'
          },
          key,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt']
        );

        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await window.crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          derivedKey,
          keyData
        );

        const result = new Uint8Array(iv.length + encrypted.byteLength);
        result.set(iv);
        result.set(new Uint8Array(encrypted), iv.length);
        
        privateKeyWrapped = result;
      } else {
        // Fallback to basic encoding (less secure)
        privateKeyWrapped = new Uint8Array(keyData);
      }
      
      // Store locally
      await keyVault.storeDevice({
        id: deviceIdString,
        userId: 'temp',
        label: 'Imported Device',
        fingerprint: keyInfo.fingerprint,
        publicKeyArmored: keyInfo.publicKeyArmored,
        privateKeyWrapped,
      });

      // Check if device already exists in Supabase, if not create it
      const { data: existingDevice } = await supabase
        .from('devices')
        .select('id')
        .eq('fingerprint', keyInfo.fingerprint)
        .single();

      let finalDeviceId = deviceIdString;

      if (!existingDevice) {
        // Insert new device in Supabase
        const { data, error: supabaseError } = await supabase
          .from('devices')
          .insert({
            id: deviceIdString,
            user_id: (await supabase.auth.getUser()).data.user?.id,
            label: 'Imported Device',
            fingerprint: keyInfo.fingerprint,
            public_key_armored: keyInfo.publicKeyArmored,
          })
          .select('id')
          .single();

        if (supabaseError) {
          await keyVault.deleteDevice(deviceIdString);
          throw supabaseError;
        }
        finalDeviceId = data.id;
      } else {
        finalDeviceId = existingDevice.id;
      }

      // Unlock the imported device
      const handle = await pgpProvider.unlockPrivateKey(privateKeyWrapped, passphrase);
      keyVault.storeUnlockedKey(keyInfo.fingerprint, handle);

      // Refresh remote devices and update state
      await get().fetchRemoteDevices();
      
      set({
        hasAnyDevice: true,
        hasLocalDevice: true,
        currentDeviceId: finalDeviceId,
        currentDeviceFingerprint: keyInfo.fingerprint,
        unlockedKeys: keyVault.getUnlockedKeyFingerprints(),
        loading: false,
      });

      if (DEBUG_DEVICES) {
        console.log('[DEVICES] Device imported successfully:', { 
          fingerprint: keyInfo.fingerprint,
          deviceId: finalDeviceId
        });
      }

      return {
        fingerprint: keyInfo.fingerprint,
        deviceId: finalDeviceId,
      };
    } catch (error) {
      set({ loading: false });
      if (DEBUG_DEVICES) {
        console.error('[DEVICES] Failed to import device:', error);
      }
      throw error;
    }
  },

  unlockDevice: async (fingerprint: string, passphrase: string) => {
    // Validate inputs
    if (typeof fingerprint !== 'string' || fingerprint.length === 0) {
      throw new Error('Device fingerprint is required');
    }
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
      throw new Error('Passphrase is required');
    }

    if (import.meta.env.VITE_DEBUG_CRYPTO === 'true') {
      console.log('[CryptoStore] Unlocking device:', { 
        fingerprint,
        passphraseLength: passphrase.length 
      });
    }

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

    if (import.meta.env.VITE_DEBUG_CRYPTO === 'true') {
      console.log('[CryptoStore] Device unlocked successfully:', { fingerprint });
    }
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

  isUnlocked: () => {
    const { currentDeviceFingerprint, unlockedKeys } = get();
    return currentDeviceFingerprint ? unlockedKeys.includes(currentDeviceFingerprint) : false;
  },
}));