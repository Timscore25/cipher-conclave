import { describe, it, expect, beforeEach } from 'vitest';
import { pgpProvider } from '@/lib/crypto/pgp-provider';
import { generateDeviceQRPayload, generateQRCode, parseQRPayload, computeShortAuthString } from '@/lib/verification/qr-utils';
import { createNetworkSecuritySpy } from './setup';

describe('Crypto Operations', () => {
  let networkSpy: ReturnType<typeof createNetworkSecuritySpy>;
  
  beforeEach(() => {
    networkSpy = createNetworkSecuritySpy();
  });

  describe('PGP Round-trip Encryption', () => {
    it('should encrypt and decrypt for 3 users × 2 devices each', async () => {
      // Create test users and devices
      const users = await Promise.all([
        Promise.all([
          pgpProvider.generateIdentity({ name: 'User1-Device1', passphrase: 'test1' }),
          pgpProvider.generateIdentity({ name: 'User1-Device2', passphrase: 'test1' }),
        ]),
        Promise.all([
          pgpProvider.generateIdentity({ name: 'User2-Device1', passphrase: 'test2' }),
          pgpProvider.generateIdentity({ name: 'User2-Device2', passphrase: 'test2' }),
        ]),
        Promise.all([
          pgpProvider.generateIdentity({ name: 'User3-Device1', passphrase: 'test3' }),
          pgpProvider.generateIdentity({ name: 'User3-Device2', passphrase: 'test3' }),
        ]),
      ]);

      // Create recipients list (all devices)
      const recipients = users.flat().map(device => ({
        fingerprint: device.fingerprint,
        armoredKey: device.publicKeyArmored,
      }));

      // Test message and attachment
      const plaintext = new TextEncoder().encode('Test encrypted message');
      const attachment = {
        name: 'test.txt',
        bytes: new TextEncoder().encode('Test attachment content'),
        mime: 'text/plain',
      };

      // Unlock first device for signing
      const signingDevice = await pgpProvider.unlockPrivateKey(
        users[0][0].privateKeyWrapped,
        'test1'
      );

      // Encrypt to all recipients
      const { envelope, ciphertext } = await pgpProvider.encryptToMany({
        plaintext,
        recipients,
        signingKey: signingDevice,
        attachments: [attachment],
      });

      // Verify envelope structure
      expect(envelope.v).toBe(1);
      expect(envelope.recipients).toHaveLength(6); // 3 users × 2 devices
      expect(envelope.hasAttachments).toBe(true);
      expect(envelope.attachmentKeys).toHaveLength(1);

      // Test decryption for each device
      for (let userIndex = 0; userIndex < users.length; userIndex++) {
        for (let deviceIndex = 0; deviceIndex < users[userIndex].length; deviceIndex++) {
          const device = users[userIndex][deviceIndex];
          const unlockedKey = await pgpProvider.unlockPrivateKey(
            device.privateKeyWrapped,
            `test${userIndex + 1}`
          );

          const result = await pgpProvider.decryptFromMany({
            envelope,
            ciphertext,
            myPrivateKey: unlockedKey,
          });

          // Verify decryption
          expect(new TextDecoder().decode(result.plaintext)).toBe('Test encrypted message');
          expect(result.verified).toBe(true);
          expect(result.signerFingerprint).toBe(signingDevice.fingerprint);
          expect(result.attachments).toHaveLength(1);
          
          if (result.attachments) {
            const decryptedAttachment = result.attachments[0];
            expect(decryptedAttachment.name).toBe('test.txt');
            expect(decryptedAttachment.mimeType).toBe('text/plain');
            expect(new TextDecoder().decode(decryptedAttachment.data)).toBe('Test attachment content');
          }
        }
      }

      // Verify no private keys were sent over network
      expect(networkSpy.hasPrivateKeyLeakage()).toBe(false);
    });
  });

  describe('QR Code and SAS Verification', () => {
    it('should encode and decode QR payload correctly', async () => {
      const payload = generateDeviceQRPayload(
        'test-fingerprint',
        'user-123',
        'Test Device',
        'test-public-key-armored'
      );

      expect(payload.fpr).toBe('test-fingerprint');
      expect(payload.userId).toBe('user-123');
      expect(payload.deviceLabel).toBe('Test Device');
      expect(payload.publicKeyArmored).toBe('test-public-key-armored');
      expect(payload.timestamp).toBeTypeOf('number');

      // Generate QR code
      const qrDataUrl = await generateQRCode(payload);
      expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);

      // Create QR data string for parsing test
      const qrData = `pgprooms://verify/${btoa(JSON.stringify(payload))}`;
      
      // Parse back
      const parsed = parseQRPayload(qrData);
      expect(parsed).toEqual(payload);
    });

    it('should reject invalid QR payloads', () => {
      // Invalid protocol
      expect(parseQRPayload('invalid://verify/test')).toBeNull();
      
      // Invalid base64
      expect(parseQRPayload('pgprooms://verify/invalid-base64!')).toBeNull();
      
      // Missing required fields
      const incompletePayload = { fpr: 'test' };
      const qrData = `pgprooms://verify/${btoa(JSON.stringify(incompletePayload))}`;
      expect(parseQRPayload(qrData)).toBeNull();
    });

    it('should compute SAS correctly', async () => {
      const fpr1 = 'A1B2C3D4E5F6';
      const fpr2 = 'F6E5D4C3B2A1';
      
      const sas1 = await computeShortAuthString(fpr1, fpr2);
      const sas2 = await computeShortAuthString(fpr2, fpr1); // Reversed order
      
      // Should be deterministic regardless of order
      expect(sas1).toBe(sas2);
      expect(sas1).toMatch(/^[0-9A-F]{6}$/);
      expect(sas1).toHaveLength(6);
    });

    it('should generate different SAS for different fingerprints', async () => {
      const fpr1 = 'A1B2C3D4E5F6';
      const fpr2 = 'F6E5D4C3B2A1';
      const fpr3 = '123456789ABC';
      
      const sas1 = await computeShortAuthString(fpr1, fpr2);
      const sas2 = await computeShortAuthString(fpr1, fpr3);
      
      expect(sas1).not.toBe(sas2);
    });
  });
});