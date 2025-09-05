import { describe, it, expect, beforeAll } from 'vitest';
import { pgpProvider } from '../lib/crypto/pgp-provider';
import { keyVault } from '../lib/storage/key-vault';

describe('Crypto Provider - Key Creation & Wrapping', () => {
  beforeAll(async () => {
    await keyVault.initialize();
    await keyVault.clear(); // Clean slate for tests
  });

  describe('Input Validation', () => {
    it('should reject empty passphrase', async () => {
      await expect(
        pgpProvider.generateIdentity({
          name: 'Test User',
          email: 'test@example.com',
          passphrase: ''
        })
      ).rejects.toThrow('Passphrase must be at least 8 characters long');
    });

    it('should reject null/undefined passphrase', async () => {
      await expect(
        pgpProvider.generateIdentity({
          name: 'Test User',
          email: 'test@example.com',
          passphrase: null as any
        })
      ).rejects.toThrow('Passphrase must be at least 8 characters long');
    });

    it('should reject short passphrase', async () => {
      await expect(
        pgpProvider.generateIdentity({
          name: 'Test User',
          email: 'test@example.com',
          passphrase: '1234567' // Only 7 chars
        })
      ).rejects.toThrow('Passphrase must be at least 8 characters long');
    });

    it('should reject empty name', async () => {
      await expect(
        pgpProvider.generateIdentity({
          name: '',
          email: 'test@example.com',
          passphrase: 'validpassphrase123'
        })
      ).rejects.toThrow('Name is required');
    });
  });

  describe('Key Generation & Wrapping', () => {
    it('should successfully generate and wrap identity with valid input', async () => {
      const result = await pgpProvider.generateIdentity({
        name: 'Test User',
        email: 'test@example.com',
        passphrase: 'validpassphrase123'
      });

      expect(result).toBeDefined();
      expect(result.fingerprint).toBeTypeOf('string');
      expect(result.fingerprint.length).toBeGreaterThan(0);
      expect(result.publicKeyArmored).toContain('-----BEGIN PGP PUBLIC KEY BLOCK-----');
      expect(result.privateKeyWrapped).toBeInstanceOf(Uint8Array);
      expect(result.privateKeyWrapped.length).toBeGreaterThan(100); // Should be substantial
    });

    it('should handle unicode passphrase correctly', async () => {
      const unicodePassphrase = 'validpaß©phrase123🔐';
      
      const result = await pgpProvider.generateIdentity({
        name: 'Test User',
        email: 'test@example.com',
        passphrase: unicodePassphrase
      });

      expect(result).toBeDefined();
      expect(result.privateKeyWrapped.length).toBeGreaterThan(100);
    });
  });

  describe('Key Unwrapping & Round-trip', () => {
    it('should unwrap key with correct passphrase', async () => {
      const passphrase = 'correctpassphrase123';
      
      // Generate identity
      const identity = await pgpProvider.generateIdentity({
        name: 'Test User',
        email: 'test@example.com',
        passphrase
      });

      // Unlock with correct passphrase
      const unlockedKey = await pgpProvider.unlockPrivateKey(
        identity.privateKeyWrapped,
        passphrase
      );

      expect(unlockedKey).toBeDefined();
      expect(unlockedKey.fingerprint).toBe(identity.fingerprint);
      expect(unlockedKey.privateKey).toBeDefined();
      expect(unlockedKey.publicKey).toBeDefined();
    });

    it('should fail to unwrap with wrong passphrase', async () => {
      const correctPassphrase = 'correctpassphrase123';
      const wrongPassphrase = 'wrongpassphrase123';
      
      // Generate identity
      const identity = await pgpProvider.generateIdentity({
        name: 'Test User',
        email: 'test@example.com',
        passphrase: correctPassphrase
      });

      // Try to unlock with wrong passphrase
      await expect(
        pgpProvider.unlockPrivateKey(
          identity.privateKeyWrapped,
          wrongPassphrase
        )
      ).rejects.toThrow('Failed to decrypt private key');
    });

    it('should reject malformed wrapped key data', async () => {
      const invalidWrapped = new Uint8Array([1, 2, 3, 4, 5]); // Too small

      await expect(
        pgpProvider.unlockPrivateKey(
          invalidWrapped,
          'anypassphrase123'
        )
      ).rejects.toThrow('Wrapped key data is too small');
    });

    it('should handle empty wrapped key', async () => {
      await expect(
        pgpProvider.unlockPrivateKey(
          new Uint8Array(0),
          'anypassphrase123'
        )
      ).rejects.toThrow('Wrapped private key is required');
    });

    it('should handle null wrapped key', async () => {
      await expect(
        pgpProvider.unlockPrivateKey(
          null as any,
          'anypassphrase123'
        )
      ).rejects.toThrow('Wrapped private key is required');
    });
  });

  describe('Multiple Keys & Consistency', () => {
    it('should generate different fingerprints for different identities', async () => {
      const identity1 = await pgpProvider.generateIdentity({
        name: 'User One',
        email: 'user1@example.com',
        passphrase: 'passphrase123'
      });

      const identity2 = await pgpProvider.generateIdentity({
        name: 'User Two', 
        email: 'user2@example.com',
        passphrase: 'passphrase456'
      });

      expect(identity1.fingerprint).not.toBe(identity2.fingerprint);
      expect(identity1.publicKeyArmored).not.toBe(identity2.publicKeyArmored);
    });

    it('should consistently derive same key from same passphrase and wrapped data', async () => {
      const passphrase = 'consistencytest123';
      
      // Generate identity
      const identity = await pgpProvider.generateIdentity({
        name: 'Test User',
        email: 'test@example.com',
        passphrase
      });

      // Unlock multiple times
      const unlock1 = await pgpProvider.unlockPrivateKey(
        identity.privateKeyWrapped,
        passphrase
      );
      
      const unlock2 = await pgpProvider.unlockPrivateKey(
        identity.privateKeyWrapped,
        passphrase
      );

      expect(unlock1.fingerprint).toBe(unlock2.fingerprint);
      expect(unlock1.fingerprint).toBe(identity.fingerprint);
    });
  });
});