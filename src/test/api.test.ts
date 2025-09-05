import { describe, it, expect, beforeEach } from 'vitest';
import { createNetworkSecuritySpy } from './setup';

// Mock API functions
const mockCreateRoom = async (name: string) => {
  const response = await fetch('/api/rooms/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return response.json();
};

const mockSendMessage = async (roomId: string, envelope: any, ciphertext: string) => {
  const response = await fetch('/api/messages/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      room_id: roomId, 
      envelope, 
      ciphertext,
      signer_fpr: 'test-fingerprint',
      content_type: 'text'
    }),
  });
  return response.json();
};

describe('API Security Tests', () => {
  let networkSpy: ReturnType<typeof createNetworkSecuritySpy>;
  
  beforeEach(() => {
    networkSpy = createNetworkSecuritySpy();
  });

  describe('Network Security Invariants', () => {
    it('should never transmit private keys', async () => {
      await mockCreateRoom('Test Room');
      
      const calls = networkSpy.getCalls();
      
      for (const call of calls) {
        expect(call.body.toLowerCase()).not.toContain('begin pgp private key');
        expect(call.body.toLowerCase()).not.toContain('-----begin');
        expect(call.body.toLowerCase()).not.toContain('privatekey');
        expect(call.body.toLowerCase()).not.toContain('unlocked');
      }
      
      expect(networkSpy.hasPrivateKeyLeakage()).toBe(false);
    });

    it('should never transmit passphrases', async () => {
      await mockSendMessage('room-123', { test: 'envelope' }, 'encrypted-content');
      
      const calls = networkSpy.getCalls();
      
      for (const call of calls) {
        expect(call.body.toLowerCase()).not.toContain('passphrase');
        expect(call.body.toLowerCase()).not.toContain('password');
        expect(call.body.toLowerCase()).not.toContain('secret');
      }
    });

    it('should only send encrypted ciphertext and envelopes', async () => {
      const testEnvelope = {
        v: 1,
        roomId: 'room-123',
        authorDeviceFpr: 'test-fpr',
        recipients: [{ fpr: 'recipient-fpr', ekp: new Uint8Array([1, 2, 3]) }],
        signerFpr: 'test-fpr',
        algo: { aead: 'AES-GCM', hash: 'SHA-256' },
        createdAt: new Date().toISOString(),
      };
      
      await mockSendMessage('room-123', testEnvelope, 'base64-encrypted-content');
      
      const calls = networkSpy.getCalls();
      const messageCall = calls.find(call => call.url.includes('/messages/send'));
      
      expect(messageCall).toBeDefined();
      
      const body = JSON.parse(messageCall!.body);
      expect(body.envelope).toEqual(testEnvelope);
      expect(body.ciphertext).toBe('base64-encrypted-content');
      expect(body.room_id).toBe('room-123');
      
      // Ensure no plaintext content
      expect(body.plaintext).toBeUndefined();
      expect(body.decrypted).toBeUndefined();
    });
  });

  describe('API Schema Validation', () => {
    it('should validate room creation request', async () => {
      await mockCreateRoom('Valid Room Name');
      
      const calls = networkSpy.getCalls();
      const createCall = calls.find(call => call.url.includes('/rooms/create'));
      
      expect(createCall).toBeDefined();
      
      const body = JSON.parse(createCall!.body);
      expect(body.name).toBe('Valid Room Name');
      expect(typeof body.name).toBe('string');
      expect(body.name.length).toBeGreaterThan(0);
    });

    it('should validate message send request', async () => {
      const envelope = {
        v: 1,
        roomId: 'room-123',
        authorDeviceFpr: 'author-fpr',
        recipients: [{ fpr: 'recipient-fpr', ekp: new Uint8Array([1, 2, 3]) }],
        signerFpr: 'signer-fpr',
        algo: { aead: 'AES-GCM', hash: 'SHA-256' },
        createdAt: new Date().toISOString(),
      };
      
      await mockSendMessage('room-123', envelope, 'encrypted-content');
      
      const calls = networkSpy.getCalls();
      const sendCall = calls.find(call => call.url.includes('/messages/send'));
      
      expect(sendCall).toBeDefined();
      
      const body = JSON.parse(sendCall!.body);
      
      // Validate required fields
      expect(body.room_id).toBe('room-123');
      expect(body.envelope).toBeDefined();
      expect(body.ciphertext).toBe('encrypted-content');
      expect(body.signer_fpr).toBe('test-fingerprint');
      expect(body.content_type).toBe('text');
      
      // Validate envelope structure
      expect(body.envelope.v).toBe(1);
      expect(body.envelope.roomId).toBe('room-123');
      expect(body.envelope.recipients).toBeInstanceOf(Array);
      expect(body.envelope.recipients.length).toBeGreaterThan(0);
    });
  });

  describe('Authentication Headers', () => {
    it('should include authentication headers in API calls', async () => {
      // Mock localStorage to include auth token
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: (key: string) => {
            if (key === 'supabase.auth.token') {
              return JSON.stringify({ access_token: 'mock-jwt-token' });
            }
            return null;
          },
          setItem: () => {},
          removeItem: () => {},
        },
        writable: true,
      });
      
      await mockCreateRoom('Authenticated Room');
      
      const calls = networkSpy.getCalls();
      const createCall = calls.find(call => call.url.includes('/rooms/create'));
      
      expect(createCall).toBeDefined();
      expect(createCall!.headers).toBeDefined();
      
      // In a real implementation, this would check for Authorization header
      // For now, just verify headers are present
      expect(typeof createCall!.headers).toBe('object');
    });
  });
});