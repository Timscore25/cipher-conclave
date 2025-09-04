import { openDB, type IDBPDatabase } from 'idb';
import type { UnlockedKeyHandle } from '../crypto/types';

interface StoredDevice {
  id: string;
  userId: string;
  label: string;
  fingerprint: string;
  publicKeyArmored: string;
  privateKeyWrapped: Uint8Array;
  createdAt: Date;
}

interface StoredUser {
  id: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: Date;
}

class KeyVault {
  private db: IDBPDatabase | null = null;
  private unlockedKeys = new Map<string, UnlockedKeyHandle>();

  async initialize(): Promise<void> {
    if (this.db) return;

    this.db = await openDB('PGPRoomsVault', 1, {
      upgrade(db) {
        // Stored devices (our own devices)
        const devicesStore = db.createObjectStore('devices', {
          keyPath: 'id',
        });
        devicesStore.createIndex('fingerprint', 'fingerprint', { unique: true });
        devicesStore.createIndex('userId', 'userId');

        // Stored users (our own user profiles)
        db.createObjectStore('users', {
          keyPath: 'id',
        });

        // Known public keys (other users' devices)
        const publicKeysStore = db.createObjectStore('publicKeys', {
          keyPath: 'fingerprint',
        });
        publicKeysStore.createIndex('userId', 'userId');

        // Key verifications
        const verificationsStore = db.createObjectStore('verifications', {
          keyPath: ['verifierFingerprint', 'targetFingerprint'],
        });
        verificationsStore.createIndex('verifier', 'verifierFingerprint');
        verificationsStore.createIndex('target', 'targetFingerprint');

        // App settings
        db.createObjectStore('settings', {
          keyPath: 'key',
        });
      },
    });
  }

  async storeDevice(device: Omit<StoredDevice, 'createdAt'>): Promise<void> {
    await this.initialize();
    
    const storedDevice: StoredDevice = {
      ...device,
      createdAt: new Date(),
    };

    await this.db!.put('devices', storedDevice);
  }

  async getDevices(): Promise<StoredDevice[]> {
    await this.initialize();
    return this.db!.getAll('devices');
  }

  async getDevice(id: string): Promise<StoredDevice | undefined> {
    await this.initialize();
    return this.db!.get('devices', id);
  }

  async getDeviceByFingerprint(fingerprint: string): Promise<StoredDevice | undefined> {
    await this.initialize();
    return this.db!.getFromIndex('devices', 'fingerprint', fingerprint);
  }

  async deleteDevice(id: string): Promise<void> {
    await this.initialize();
    const device = await this.getDevice(id);
    if (device) {
      this.unlockedKeys.delete(device.fingerprint);
      await this.db!.delete('devices', id);
    }
  }

  async storeUser(user: Omit<StoredUser, 'createdAt'>): Promise<void> {
    await this.initialize();
    
    const storedUser: StoredUser = {
      ...user,
      createdAt: new Date(),
    };

    await this.db!.put('users', storedUser);
  }

  async getUser(id: string): Promise<StoredUser | undefined> {
    await this.initialize();
    return this.db!.get('users', id);
  }

  async storePublicKey(publicKey: {
    fingerprint: string;
    userId?: string;
    deviceLabel?: string;
    publicKeyArmored: string;
    verified?: boolean;
  }): Promise<void> {
    await this.initialize();
    await this.db!.put('publicKeys', {
      ...publicKey,
      createdAt: new Date(),
    });
  }

  async getPublicKey(fingerprint: string): Promise<any> {
    await this.initialize();
    return this.db!.get('publicKeys', fingerprint);
  }

  async getPublicKeysByUser(userId: string): Promise<any[]> {
    await this.initialize();
    return this.db!.getAllFromIndex('publicKeys', 'userId', userId);
  }

  async getAllPublicKeys(): Promise<any[]> {
    await this.initialize();
    return this.db!.getAll('publicKeys');
  }

  async storeVerification(verification: {
    verifierFingerprint: string;
    targetFingerprint: string;
    method: 'qr' | 'sas';
    verifiedAt: Date;
  }): Promise<void> {
    await this.initialize();
    await this.db!.put('verifications', verification);
  }

  async getVerification(
    verifierFingerprint: string,
    targetFingerprint: string
  ): Promise<any> {
    await this.initialize();
    return this.db!.get('verifications', [verifierFingerprint, targetFingerprint]);
  }

  async getVerificationsByVerifier(verifierFingerprint: string): Promise<any[]> {
    await this.initialize();
    return this.db!.getAllFromIndex('verifications', 'verifier', verifierFingerprint);
  }

  async storeSetting(key: string, value: any): Promise<void> {
    await this.initialize();
    await this.db!.put('settings', { key, value });
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    await this.initialize();
    const result = await this.db!.get('settings', key);
    return result?.value;
  }

  // In-memory unlocked key management
  storeUnlockedKey(fingerprint: string, handle: UnlockedKeyHandle): void {
    this.unlockedKeys.set(fingerprint, handle);
  }

  getUnlockedKey(fingerprint: string): UnlockedKeyHandle | undefined {
    return this.unlockedKeys.get(fingerprint);
  }

  lockKey(fingerprint: string): void {
    this.unlockedKeys.delete(fingerprint);
  }

  lockAllKeys(): void {
    this.unlockedKeys.clear();
  }

  getUnlockedKeyFingerprints(): string[] {
    return Array.from(this.unlockedKeys.keys());
  }

  async clear(): Promise<void> {
    await this.initialize();
    this.lockAllKeys();
    
    const stores = ['devices', 'users', 'publicKeys', 'verifications', 'settings'];
    for (const store of stores) {
      await this.db!.clear(store);
    }
  }
}

export const keyVault = new KeyVault();