import { keyVault } from '@/lib/storage/key-vault';

export interface PasskeyConfig {
  enabled: boolean;
  credentialId?: string;
  passkeyLabel?: string;
  createdAt?: number;
}

export interface PasskeyUnlockResult {
  success: boolean;
  wrappingKey?: Uint8Array;
  error?: string;
}

export class PasskeyManager {
  private static readonly SETTINGS_KEY = 'passkey_config';
  private static readonly RPID = 'pgprooms.app';
  private static readonly RP_NAME = 'PGP Rooms';

  async isSupported(): Promise<boolean> {
    return !!(
      window.PublicKeyCredential &&
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable &&
      await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    );
  }

  async getConfig(): Promise<PasskeyConfig> {
    const config = await keyVault.getSetting(PasskeyManager.SETTINGS_KEY);
    return config ? JSON.parse(config as string) : { enabled: false };
  }

  async enablePasskey(userHandle: string, displayName: string): Promise<boolean> {
    try {
      if (!await this.isSupported()) {
        throw new Error('WebAuthn not supported on this device');
      }

      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = new TextEncoder().encode(userHandle);

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            id: PasskeyManager.RPID,
            name: PasskeyManager.RP_NAME,
          },
          user: {
            id: userId,
            name: userHandle,
            displayName,
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' }, // ES256
            { alg: -257, type: 'public-key' }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'required',
          },
          timeout: 60000,
        },
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error('Failed to create passkey');
      }

      const config: PasskeyConfig = {
        enabled: true,
        credentialId: this.arrayBufferToBase64(credential.rawId),
        passkeyLabel: displayName,
        createdAt: Date.now(),
      };

      await keyVault.storeSetting(PasskeyManager.SETTINGS_KEY, JSON.stringify(config));
      
      return true;
    } catch (error) {
      console.error('Failed to enable passkey:', error);
      return false;
    }
  }

  async disablePasskey(): Promise<void> {
    const config: PasskeyConfig = { enabled: false };
    await keyVault.storeSetting(PasskeyManager.SETTINGS_KEY, JSON.stringify(config));
  }

  async unlockWithPasskey(): Promise<PasskeyUnlockResult> {
    try {
      const config = await this.getConfig();
      if (!config.enabled || !config.credentialId) {
        return { success: false, error: 'Passkey not configured' };
      }

      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const credentialId = this.base64ToArrayBuffer(config.credentialId);

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{
            id: credentialId,
            type: 'public-key',
          }],
          userVerification: 'required',
          timeout: 60000,
        },
      }) as PublicKeyCredential;

      if (!assertion || !assertion.response) {
        return { success: false, error: 'Authentication failed' };
      }

      // Derive wrapping key from authenticator data
      const authData = (assertion.response as AuthenticatorAssertionResponse).authenticatorData;
      const clientDataJSON = assertion.response.clientDataJSON;
      
      // Combine authenticator data and client data for key derivation
      const keyMaterial = new Uint8Array(authData.byteLength + clientDataJSON.byteLength);
      keyMaterial.set(new Uint8Array(authData), 0);
      keyMaterial.set(new Uint8Array(clientDataJSON), authData.byteLength);

      // Derive 256-bit wrapping key using HKDF
      const wrappingKey = await this.deriveWrappingKey(keyMaterial);

      return { success: true, wrappingKey };
    } catch (error: any) {
      console.error('Passkey unlock failed:', error);
      return { 
        success: false, 
        error: error.name === 'NotAllowedError' ? 'Authentication cancelled' : 'Authentication failed' 
      };
    }
  }

  async wrapPrivateKey(privateKeyWrapped: Uint8Array, passkeyWrappingKey: Uint8Array): Promise<Uint8Array> {
    // Generate random IV for encryption
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Import wrapping key
    const key = await crypto.subtle.importKey(
      'raw',
      passkeyWrappingKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    // Encrypt the already-wrapped private key
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      privateKeyWrapped
    );

    // Combine IV + encrypted data
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), iv.length);

    return result;
  }

  async unwrapPrivateKey(passkeyWrappedKey: Uint8Array, passkeyWrappingKey: Uint8Array): Promise<Uint8Array> {
    // Extract IV and encrypted data
    const iv = passkeyWrappedKey.slice(0, 12);
    const encrypted = passkeyWrappedKey.slice(12);

    // Import wrapping key
    const key = await crypto.subtle.importKey(
      'raw',
      passkeyWrappingKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // Decrypt to get the Argon2id-wrapped private key
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );

    return new Uint8Array(decrypted);
  }

  private async deriveWrappingKey(keyMaterial: Uint8Array): Promise<Uint8Array> {
    // Import the key material
    const baseKey = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'HKDF' },
      false,
      ['deriveKey']
    );

    // Derive 256-bit AES key
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new TextEncoder().encode('pgprooms-passkey-salt'),
        info: new TextEncoder().encode('pgprooms-wrapping-key'),
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    // Export as raw key bytes
    const keyBytes = await crypto.subtle.exportKey('raw', derivedKey);
    return new Uint8Array(keyBytes);
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

export const passkeyManager = new PasskeyManager();