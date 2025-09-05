import { passkeyManager, PasskeyUnlockResult } from '@/lib/webauthn/passkey-manager';
import { pgpProvider } from '@/lib/crypto/pgp-provider';
import { keyVault } from '@/lib/storage/key-vault';
import { UnlockedKeyHandle } from '@/lib/crypto/types';

export interface UnlockOptions {
  fingerprint: string;
  passphrase?: string;
  usePasskey?: boolean;
}

export interface UnlockResult {
  success: boolean;
  unlockedKey?: UnlockedKeyHandle;
  error?: string;
  methodUsed?: 'passphrase' | 'passkey' | 'hybrid';
}

export class EnhancedUnlock {
  async unlockDevice(options: UnlockOptions): Promise<UnlockResult> {
    const { fingerprint, passphrase, usePasskey } = options;

    try {
      // Get stored device
      const device = await keyVault.getDevice(fingerprint);
      if (!device) {
        return { success: false, error: 'Device not found' };
      }

      // Check if passkey unlock is available and requested
      if (usePasskey && __FEATURE_PASSKEY_UNLOCK__) {
        const passkeyConfig = await passkeyManager.getConfig();
        
        if (passkeyConfig.enabled) {
          return await this.unlockWithPasskey(device, passphrase);
        }
      }

      // Standard passphrase unlock
      if (!passphrase) {
        return { success: false, error: 'Passphrase required' };
      }

      return await this.unlockWithPassphrase(device, passphrase);
      
    } catch (error: any) {
      console.error('Unlock failed:', error);
      return { success: false, error: error.message || 'Unlock failed' };
    }
  }

  private async unlockWithPassphrase(device: any, passphrase: string): Promise<UnlockResult> {
    try {
      const unlockedKey = await pgpProvider.unlockPrivateKey(
        device.privateKeyWrapped,
        passphrase
      );

      return {
        success: true,
        unlockedKey,
        methodUsed: 'passphrase'
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'Invalid passphrase'
      };
    }
  }

  private async unlockWithPasskey(device: any, fallbackPassphrase?: string): Promise<UnlockResult> {
    try {
      // Try passkey unlock first
      const passkeyResult: PasskeyUnlockResult = await passkeyManager.unlockWithPasskey();
      
      if (!passkeyResult.success || !passkeyResult.wrappingKey) {
        // Fall back to passphrase if available
        if (fallbackPassphrase) {
          return await this.unlockWithPassphrase(device, fallbackPassphrase);
        }
        
        return {
          success: false,
          error: passkeyResult.error || 'Passkey unlock failed'
        };
      }

      // Check if we have a passkey-wrapped private key
      const passkeyWrappedKey = device.passkeyWrappedKey;
      if (!passkeyWrappedKey) {
        // First time using passkey - need to wrap the existing key
        if (!fallbackPassphrase) {
          return {
            success: false,
            error: 'Passphrase required for initial passkey setup'
          };
        }

        // Unlock with passphrase first
        const passphraseResult = await this.unlockWithPassphrase(device, fallbackPassphrase);
        if (!passphraseResult.success) {
          return passphraseResult;
        }

        // Wrap the private key with passkey
        const wrappedWithPasskey = await passkeyManager.wrapPrivateKey(
          device.privateKeyWrapped,
          passkeyResult.wrappingKey
        );

        // Store the passkey-wrapped version
        await keyVault.storeDevice({
          ...device,
          passkeyWrappedKey: wrappedWithPasskey
        });

        return {
          success: true,
          unlockedKey: passphraseResult.unlockedKey,
          methodUsed: 'hybrid'
        };
      }

      // Unwrap with passkey
      const privateKeyWrapped = await passkeyManager.unwrapPrivateKey(
        passkeyWrappedKey,
        passkeyResult.wrappingKey
      );

      // Now unlock the Argon2id-wrapped key (still need passphrase for this layer)
      if (!fallbackPassphrase) {
        return {
          success: false,
          error: 'Passphrase still required for final key unlock'
        };
      }

      const unlockedKey = await pgpProvider.unlockPrivateKey(
        privateKeyWrapped,
        fallbackPassphrase
      );

      return {
        success: true,
        unlockedKey,
        methodUsed: 'passkey'
      };

    } catch (error: any) {
      console.error('Passkey unlock error:', error);
      return {
        success: false,
        error: error.message || 'Passkey unlock failed'
      };
    }
  }

  async isPasskeyAvailable(): Promise<boolean> {
    if (!__FEATURE_PASSKEY_UNLOCK__) {
      return false;
    }

    const isSupported = await passkeyManager.isSupported();
    const config = await passkeyManager.getConfig();
    
    return isSupported && config.enabled;
  }
}

export const enhancedUnlock = new EnhancedUnlock();