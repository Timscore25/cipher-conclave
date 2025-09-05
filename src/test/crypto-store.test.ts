import { describe, it, expect, beforeEach } from 'vitest';
import { useCryptoStore } from '../lib/stores/crypto-store';
import { keyVault } from '../lib/storage/key-vault';

describe('Crypto Store - Device Management', () => {
  beforeEach(async () => {
    await keyVault.initialize();
    await keyVault.clear();
    
    // Reset store state
    const store = useCryptoStore.getState();
    store.initialize();
  });

  describe('Device Creation Validation', () => {
    it('should reject device creation with invalid passphrase', async () => {
      const store = useCryptoStore.getState();

      await expect(
        store.createDevice({
          label: 'Test Device',
          name: 'Test User',
          email: 'test@example.com',
          passphrase: '123' // Too short
        })
      ).rejects.toThrow('Passphrase must be at least 8 characters long');
    });

    it('should reject device creation with empty label', async () => {
      const store = useCryptoStore.getState();

      await expect(
        store.createDevice({
          label: '',
          name: 'Test User',
          email: 'test@example.com',
          passphrase: 'validpassphrase123'
        })
      ).rejects.toThrow('Device label is required');
    });

    it('should reject device creation with whitespace-only label', async () => {
      const store = useCryptoStore.getState();

      await expect(
        store.createDevice({
          label: '   ',
          name: 'Test User',
          email: 'test@example.com',
          passphrase: 'validpassphrase123'
        })
      ).rejects.toThrow('Device label is required');
    });

    it('should reject device creation with empty name', async () => {
      const store = useCryptoStore.getState();

      await expect(
        store.createDevice({
          label: 'Test Device',
          name: '',
          email: 'test@example.com',
          passphrase: 'validpassphrase123'
        })
      ).rejects.toThrow('Name is required');
    });
  });

  describe('Successful Device Creation', () => {
    it('should successfully create device with valid parameters', async () => {
      const store = useCryptoStore.getState();

      const result = await store.createDevice({
        label: 'My Test Device',
        name: 'Test User',
        email: 'test@example.com',
        passphrase: 'validpassphrase123'
      });

      expect(result).toBeDefined();
      expect(result.fingerprint).toBeTypeOf('string');
      expect(result.publicKey).toContain('-----BEGIN PGP PUBLIC KEY BLOCK-----');
      
      // Check store state
      const state = useCryptoStore.getState();
      expect(state.hasAnyDevice).toBe(true);
      expect(state.currentDeviceFingerprint).toBe(result.fingerprint);
    });

    it('should trim device label whitespace', async () => {
      const store = useCryptoStore.getState();

      await store.createDevice({
        label: '  My Device  ',
        name: 'Test User',
        email: 'test@example.com',
        passphrase: 'validpassphrase123'
      });

      // Check that device was stored with trimmed label
      const devices = await keyVault.getDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].label).toBe('My Device');
    });

    it('should handle optional email parameter', async () => {
      const store = useCryptoStore.getState();

      const result = await store.createDevice({
        label: 'Test Device',
        name: 'Test User',
        passphrase: 'validpassphrase123'
        // No email provided
      });

      expect(result).toBeDefined();
      expect(result.fingerprint).toBeTypeOf('string');
    });
  });

  describe('Device Unlocking', () => {
    it('should unlock device with correct passphrase', async () => {
      const store = useCryptoStore.getState();
      const passphrase = 'testpassphrase123';

      // Create device
      const result = await store.createDevice({
        label: 'Test Device',
        name: 'Test User',
        email: 'test@example.com',
        passphrase
      });

      // Unlock device
      await store.unlockDevice(result.fingerprint, passphrase);

      // Check store state
      const state = useCryptoStore.getState();
      expect(state.unlockedKeys).toContain(result.fingerprint);
      
      // Check that we can get the unlocked key
      const unlockedKey = store.getUnlockedKey(result.fingerprint);
      expect(unlockedKey).toBeDefined();
      expect(unlockedKey!.fingerprint).toBe(result.fingerprint);
    });

    it('should reject unlock with wrong passphrase', async () => {
      const store = useCryptoStore.getState();
      const correctPassphrase = 'correctpassphrase123';
      const wrongPassphrase = 'wrongpassphrase123';

      // Create device
      const result = await store.createDevice({
        label: 'Test Device',
        name: 'Test User',
        email: 'test@example.com',
        passphrase: correctPassphrase
      });

      // Try to unlock with wrong passphrase
      await expect(
        store.unlockDevice(result.fingerprint, wrongPassphrase)
      ).rejects.toThrow('Failed to decrypt private key');
    });

    it('should reject unlock with empty passphrase', async () => {
      const store = useCryptoStore.getState();

      // Create device
      const result = await store.createDevice({
        label: 'Test Device',
        name: 'Test User',
        email: 'test@example.com',
        passphrase: 'correctpassphrase123'
      });

      // Try to unlock with empty passphrase
      await expect(
        store.unlockDevice(result.fingerprint, '')
      ).rejects.toThrow('Passphrase is required');
    });

    it('should reject unlock with invalid fingerprint', async () => {
      const store = useCryptoStore.getState();

      await expect(
        store.unlockDevice('invalid-fingerprint', 'anypassphrase123')
      ).rejects.toThrow('Device not found');
    });
  });

  describe('Device Locking', () => {
    it('should lock unlocked device', async () => {
      const store = useCryptoStore.getState();
      const passphrase = 'testpassphrase123';

      // Create and unlock device
      const result = await store.createDevice({
        label: 'Test Device',
        name: 'Test User',
        email: 'test@example.com',
        passphrase
      });

      await store.unlockDevice(result.fingerprint, passphrase);
      
      // Verify it's unlocked
      expect(useCryptoStore.getState().unlockedKeys).toContain(result.fingerprint);

      // Lock the device
      store.lockDevice(result.fingerprint);

      // Verify it's locked
      const state = useCryptoStore.getState();
      expect(state.unlockedKeys).not.toContain(result.fingerprint);
      expect(store.getUnlockedKey(result.fingerprint)).toBeUndefined();
    });

    it('should lock all devices', async () => {
      const store = useCryptoStore.getState();
      const passphrase = 'testpassphrase123';

      // Create and unlock multiple devices
      const device1 = await store.createDevice({
        label: 'Device 1',
        name: 'User 1',
        passphrase
      });

      // Clear store and create another device (simulate multiple devices)
      await keyVault.storeDevice({
        id: 'device2',
        userId: 'user2',
        label: 'Device 2',
        fingerprint: 'fingerprint2',
        publicKeyArmored: 'fake-key',
        privateKeyWrapped: new Uint8Array([1, 2, 3, 4, 5])
      });

      await store.unlockDevice(device1.fingerprint, passphrase);

      // Lock all devices
      store.lockAllDevices();

      // Verify all are locked
      const state = useCryptoStore.getState();
      expect(state.unlockedKeys).toHaveLength(0);
    });
  });
});