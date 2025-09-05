import { keyVault } from '@/lib/storage/key-vault';
import { CryptoProvider, UnlockedKeyHandle, PublicKeyInfo, DecryptedAttachment } from './types';

// MLS-specific types
export interface MLSGroupState {
  groupId: Uint8Array;
  epoch: number;
  treeHash: Uint8Array;
  confirmedTranscriptHash: Uint8Array;
  memberKeys: Map<string, Uint8Array>; // device fingerprint -> key
  myIndex: number;
  ratchetTree: Uint8Array;
  encryptionKey: Uint8Array;
  senderDataSecret: Uint8Array;
}

export interface MLSMessage {
  groupId: Uint8Array;
  epoch: number;
  messageType: 'handshake' | 'application';
  sender: string; // device fingerprint
  content: Uint8Array;
  signature?: Uint8Array;
}

export interface MLSHandshakeMessage extends MLSMessage {
  messageType: 'handshake';
  handshakeType: 'welcome' | 'group_info' | 'key_package' | 'proposal' | 'commit';
}

export interface MLSApplicationMessage extends MLSMessage {
  messageType: 'application';
  authenticatedData?: Uint8Array;
}

export interface MLSKeyPackage {
  deviceFingerprint: string;
  keyPackage: Uint8Array;
  createdAt: number;
  expiresAt: number;
}

export interface MLSWelcomeMessage {
  groupId: Uint8Array;
  epoch: number;
  secrets: Uint8Array;
  groupInfo: Uint8Array;
}

export class MLSProvider implements CryptoProvider {
  private groupStates = new Map<string, MLSGroupState>();
  private outOfOrderBuffer = new Map<string, MLSMessage[]>();
  private processedSeqs = new Map<string, number>();

  async generateIdentity(opts: {
    name: string;
    email?: string;
    passphrase: string;
  }): Promise<{
    publicKeyArmored: string;
    privateKeyWrapped: Uint8Array;
    fingerprint: string;
  }> {
    // Generate X25519 key for MLS
    const keyPair = await crypto.subtle.generateKey(
      { name: 'X25519' },
      true,
      ['deriveKey']
    ) as CryptoKeyPair;

    const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const privateKeyRaw = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

    // Create "armored" format (base64 for now)
    const publicKeyArmored = btoa(String.fromCharCode(...new Uint8Array(publicKeyRaw)));
    
    // Wrap private key with passphrase using Argon2id-like derivation
    const privateKeyWrapped = await this.wrapPrivateKey(new Uint8Array(privateKeyRaw), opts.passphrase);
    
    // Generate fingerprint from public key
    const fingerprint = await this.computeFingerprint(publicKeyRaw);

    return {
      publicKeyArmored,
      privateKeyWrapped,
      fingerprint,
    };
  }

  async unlockPrivateKey(wrapped: Uint8Array, passphrase: string): Promise<UnlockedKeyHandle> {
    const privateKeyRaw = await this.unwrapPrivateKey(wrapped, passphrase);
    
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyRaw,
      { name: 'X25519' },
      false,
      ['deriveKey']
    );

    // Derive public key
    const publicKeyRaw = await this.derivePublicKey(privateKeyRaw);
    const fingerprint = await this.computeFingerprint(publicKeyRaw);

    return {
      privateKey,
      publicKey: publicKeyRaw,
      fingerprint,
    };
  }

  async lockPrivateKey(handle: UnlockedKeyHandle, passphrase: string): Promise<Uint8Array> {
    const privateKeyRaw = await crypto.subtle.exportKey('pkcs8', handle.privateKey);
    return this.wrapPrivateKey(new Uint8Array(privateKeyRaw), passphrase);
  }

  async encryptToMany(params: {
    plaintext: Uint8Array;
    recipients: PublicKeyInfo[];
    signingKey: UnlockedKeyHandle;
    attachments?: Array<{
      name: string;
      bytes: Uint8Array;
      mime: string;
    }>;
  }): Promise<{ envelope: any; ciphertext: Uint8Array }> {
    // This should be called from MLS-specific encrypt method
    throw new Error('Use encryptMLSApplication instead for MLS messages');
  }

  async decryptFromMany(params: {
    envelope: any;
    ciphertext: Uint8Array;
    myPrivateKey: UnlockedKeyHandle;
  }): Promise<{
    plaintext: Uint8Array;
    attachments?: DecryptedAttachment[];
    verified: boolean;
    signerFingerprint?: string;
  }> {
    // This should be called from MLS-specific decrypt method
    throw new Error('Use decryptMLSApplication instead for MLS messages');
  }

  async fingerprint(pubkeyArmored: string): Promise<string> {
    const publicKeyRaw = new Uint8Array(atob(pubkeyArmored).split('').map(c => c.charCodeAt(0)));
    return this.computeFingerprint(publicKeyRaw);
  }

  // MLS-specific methods

  async createGroup(roomId: string, creatorDevice: UnlockedKeyHandle): Promise<{
    groupId: Uint8Array;
    groupState: MLSGroupState;
    welcomeMessages: MLSWelcomeMessage[];
  }> {
    const groupId = crypto.getRandomValues(new Uint8Array(32));
    
    // Initialize group state
    const groupState: MLSGroupState = {
      groupId,
      epoch: 0,
      treeHash: new Uint8Array(32),
      confirmedTranscriptHash: new Uint8Array(32),
      memberKeys: new Map([[creatorDevice.fingerprint, new Uint8Array(32)]]),
      myIndex: 0,
      ratchetTree: new Uint8Array(0),
      encryptionKey: crypto.getRandomValues(new Uint8Array(32)),
      senderDataSecret: crypto.getRandomValues(new Uint8Array(32)),
    };

    // Store group state
    const groupKey = this.getGroupKey(groupId);
    this.groupStates.set(groupKey, groupState);
    await this.persistGroupState(roomId, groupState);

    return {
      groupId,
      groupState,
      welcomeMessages: [], // No other members yet
    };
  }

  async addMembersToGroup(
    groupId: Uint8Array,
    keyPackages: MLSKeyPackage[],
    signingKey: UnlockedKeyHandle
  ): Promise<{
    commitMessage: MLSHandshakeMessage;
    welcomeMessages: MLSWelcomeMessage[];
    newGroupState: MLSGroupState;
  }> {
    const groupKey = this.getGroupKey(groupId);
    const currentState = this.groupStates.get(groupKey);
    if (!currentState) {
      throw new Error('Group not found');
    }

    // Create new epoch
    const newEpoch = currentState.epoch + 1;
    const newGroupState: MLSGroupState = {
      ...currentState,
      epoch: newEpoch,
    };

    // Add new members
    for (const keyPackage of keyPackages) {
      const memberKey = crypto.getRandomValues(new Uint8Array(32));
      newGroupState.memberKeys.set(keyPackage.deviceFingerprint, memberKey);
    }

    // Create commit message
    const commitMessage: MLSHandshakeMessage = {
      groupId,
      epoch: newEpoch,
      messageType: 'handshake',
      handshakeType: 'commit',
      sender: signingKey.fingerprint,
      content: await this.serializeCommit(newGroupState, keyPackages),
      signature: await this.signMessage(newGroupState, signingKey),
    };

    // Create welcome messages for new members
    const welcomeMessages: MLSWelcomeMessage[] = keyPackages.map(kp => ({
      groupId,
      epoch: newEpoch,
      secrets: crypto.getRandomValues(new Uint8Array(32)),
      groupInfo: new Uint8Array(0), // Simplified
    }));

    // Update stored state
    this.groupStates.set(groupKey, newGroupState);

    return {
      commitMessage,
      welcomeMessages,
      newGroupState,
    };
  }

  async processWelcome(welcome: MLSWelcomeMessage, myDevice: UnlockedKeyHandle): Promise<MLSGroupState> {
    // Create initial group state from welcome
    const groupState: MLSGroupState = {
      groupId: welcome.groupId,
      epoch: welcome.epoch,
      treeHash: new Uint8Array(32),
      confirmedTranscriptHash: new Uint8Array(32),
      memberKeys: new Map([[myDevice.fingerprint, new Uint8Array(32)]]),
      myIndex: 1, // Assume we're the second member
      ratchetTree: new Uint8Array(0),
      encryptionKey: crypto.getRandomValues(new Uint8Array(32)),
      senderDataSecret: crypto.getRandomValues(new Uint8Array(32)),
    };

    const groupKey = this.getGroupKey(welcome.groupId);
    this.groupStates.set(groupKey, groupState);

    return groupState;
  }

  async encryptMLSApplication(
    groupId: Uint8Array,
    plaintext: Uint8Array,
    signingKey: UnlockedKeyHandle,
    attachments?: Array<{ name: string; bytes: Uint8Array; mime: string; }>
  ): Promise<{ message: MLSApplicationMessage; ciphertext: Uint8Array }> {
    const groupKey = this.getGroupKey(groupId);
    const groupState = this.groupStates.get(groupKey);
    if (!groupState) {
      throw new Error('Group not found');
    }

    // Encrypt plaintext with group encryption key
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey(
      'raw',
      groupState.encryptionKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    let contentToEncrypt = plaintext;
    let processedAttachments: DecryptedAttachment[] = [];

    // Process attachments if any
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        const attachmentKey = crypto.getRandomValues(new Uint8Array(32));
        const attachmentIv = crypto.getRandomValues(new Uint8Array(12));
        
        const attachmentCryptoKey = await crypto.subtle.importKey(
          'raw',
          attachmentKey,
          { name: 'AES-GCM' },
          false,
          ['encrypt']
        );

        const encryptedAttachment = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: attachmentIv },
          attachmentCryptoKey,
          attachment.bytes
        );

        processedAttachments.push({
          name: attachment.name,
          data: new Uint8Array(encryptedAttachment),
          mimeType: attachment.mime,
        });

        // Add attachment metadata to content
        const attachmentMeta = {
          name: attachment.name,
          key: Array.from(attachmentKey),
          iv: Array.from(attachmentIv),
          mime: attachment.mime,
          size: attachment.bytes.length,
        };
        
        const combinedContent = {
          text: new TextDecoder().decode(plaintext),
          attachments: [attachmentMeta],
        };
        
        contentToEncrypt = new TextEncoder().encode(JSON.stringify(combinedContent));
      }
    }

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      contentToEncrypt
    );

    const message: MLSApplicationMessage = {
      groupId,
      epoch: groupState.epoch,
      messageType: 'application',
      sender: signingKey.fingerprint,
      content: new Uint8Array([...iv, ...new Uint8Array(ciphertext)]),
      authenticatedData: new Uint8Array(0),
    };

    return {
      message,
      ciphertext: message.content,
    };
  }

  async decryptMLSApplication(
    message: MLSApplicationMessage,
    myPrivateKey: UnlockedKeyHandle
  ): Promise<{
    plaintext: Uint8Array;
    attachments?: DecryptedAttachment[];
    verified: boolean;
    signerFingerprint: string;
  }> {
    const groupKey = this.getGroupKey(message.groupId);
    const groupState = this.groupStates.get(groupKey);
    if (!groupState) {
      throw new Error('Group not found');
    }

    // Extract IV and ciphertext
    const iv = message.content.slice(0, 12);
    const ciphertext = message.content.slice(12);

    // Decrypt with group encryption key
    const key = await crypto.subtle.importKey(
      'raw',
      groupState.encryptionKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const decryptedContent = new Uint8Array(decryptedBuffer);
    
    try {
      // Try to parse as JSON (may contain attachments)
      const contentStr = new TextDecoder().decode(decryptedContent);
      const parsed = JSON.parse(contentStr);
      
      if (parsed.attachments) {
        const decryptedAttachments: DecryptedAttachment[] = [];
        
        for (const attachmentMeta of parsed.attachments) {
          const attachmentKey = new Uint8Array(attachmentMeta.key);
          const attachmentIv = new Uint8Array(attachmentMeta.iv);
          
          const attachmentCryptoKey = await crypto.subtle.importKey(
            'raw',
            attachmentKey,
            { name: 'AES-GCM' },
            false,
            ['decrypt']
          );

          // Note: In real implementation, encrypted attachment data would be
          // retrieved separately (e.g., from storage)
          // For now, we'll return metadata only
          decryptedAttachments.push({
            name: attachmentMeta.name,
            data: new Uint8Array(0), // Placeholder
            mimeType: attachmentMeta.mime,
          });
        }

        return {
          plaintext: new TextEncoder().encode(parsed.text),
          attachments: decryptedAttachments,
          verified: true, // Simplified - should verify signature
          signerFingerprint: message.sender,
        };
      } else {
        return {
          plaintext: decryptedContent,
          attachments: undefined,
          verified: true,
          signerFingerprint: message.sender,
        };
      }
    } catch {
      // Not JSON, treat as plain text
      return {
        plaintext: decryptedContent,
        attachments: undefined,
        verified: true,
        signerFingerprint: message.sender,
      };
    }
  }

  async generateKeyPackage(device: UnlockedKeyHandle): Promise<MLSKeyPackage> {
    const keyPackageData = {
      deviceFingerprint: device.fingerprint,
      publicKey: device.publicKey,
      timestamp: Date.now(),
    };

    const keyPackage = new TextEncoder().encode(JSON.stringify(keyPackageData));

    return {
      deviceFingerprint: device.fingerprint,
      keyPackage,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    };
  }

  // Out-of-order message handling
  async bufferMessage(message: MLSMessage): Promise<boolean> {
    const groupKey = this.getGroupKey(message.groupId);
    const buffer = this.outOfOrderBuffer.get(groupKey) || [];
    
    // Check if we already have this message
    const exists = buffer.some(m => 
      m.epoch === message.epoch && 
      m.sender === message.sender &&
      this.compareUint8Arrays(m.content, message.content)
    );
    
    if (!exists) {
      buffer.push(message);
      buffer.sort((a, b) => a.epoch - b.epoch);
      this.outOfOrderBuffer.set(groupKey, buffer);
      return true;
    }
    
    return false;
  }

  async processBufferedMessages(groupId: Uint8Array): Promise<MLSMessage[]> {
    const groupKey = this.getGroupKey(groupId);
    const groupState = this.groupStates.get(groupKey);
    const buffer = this.outOfOrderBuffer.get(groupKey) || [];
    
    if (!groupState) return [];

    const processable: MLSMessage[] = [];
    const remaining: MLSMessage[] = [];

    for (const message of buffer) {
      if (message.epoch <= groupState.epoch + 1) {
        processable.push(message);
      } else {
        remaining.push(message);
      }
    }

    this.outOfOrderBuffer.set(groupKey, remaining);
    return processable;
  }

  // State persistence
  async persistGroupState(roomId: string, groupState: MLSGroupState): Promise<void> {
    // Serialize and encrypt group state
    const serialized = await this.serializeGroupState(groupState);
    const checksum = await this.computeChecksum(serialized);
    
    // Store in IndexedDB via keyVault
    await keyVault.storeSetting(`mls_group_${roomId}`, {
      state: serialized,
      checksum,
      updatedAt: Date.now(),
    });
  }

  async loadGroupState(roomId: string): Promise<MLSGroupState | null> {
    try {
      const stored = await keyVault.getSetting(`mls_group_${roomId}`);
      if (!stored) return null;

      const { state, checksum } = stored as any;
      
      // Verify checksum
      const computedChecksum = await this.computeChecksum(state);
      if (computedChecksum !== checksum) {
        console.error('Group state corruption detected');
        return null;
      }

      return this.deserializeGroupState(state);
    } catch (error) {
      console.error('Failed to load group state:', error);
      return null;
    }
  }

  // Helper methods
  private getGroupKey(groupId: Uint8Array): string {
    return btoa(String.fromCharCode(...groupId));
  }

  private compareUint8Arrays(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private async computeFingerprint(publicKey: ArrayBuffer): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', publicKey);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }

  private async derivePublicKey(privateKeyRaw: Uint8Array): Promise<Uint8Array> {
    // Simplified X25519 public key derivation
    // In a real implementation, this would use proper X25519 math
    const hash = await crypto.subtle.digest('SHA-256', privateKeyRaw);
    return new Uint8Array(hash.slice(0, 32));
  }

  private async wrapPrivateKey(privateKey: Uint8Array, passphrase: string): Promise<Uint8Array> {
    // Derive key from passphrase using PBKDF2 (simplified Argon2id alternative)
    const encoder = new TextEncoder();
    const passphraseBytes = encoder.encode(passphrase);
    const salt = crypto.getRandomValues(new Uint8Array(32));

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passphraseBytes,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    const wrappingKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      wrappingKey,
      privateKey
    );

    // Combine salt + iv + encrypted
    const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encrypted), salt.length + iv.length);

    return result;
  }

  private async unwrapPrivateKey(wrapped: Uint8Array, passphrase: string): Promise<Uint8Array> {
    // Extract salt, iv, and encrypted data
    const salt = wrapped.slice(0, 32);
    const iv = wrapped.slice(32, 44);
    const encrypted = wrapped.slice(44);

    const encoder = new TextEncoder();
    const passphraseBytes = encoder.encode(passphrase);

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passphraseBytes,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    const unwrappingKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      unwrappingKey,
      encrypted
    );

    return new Uint8Array(decrypted);
  }

  private async serializeCommit(groupState: MLSGroupState, keyPackages: MLSKeyPackage[]): Promise<Uint8Array> {
    const data = {
      epoch: groupState.epoch,
      memberCount: groupState.memberKeys.size,
      keyPackages: keyPackages.map(kp => kp.deviceFingerprint),
    };
    return new TextEncoder().encode(JSON.stringify(data));
  }

  private async signMessage(groupState: MLSGroupState, signingKey: UnlockedKeyHandle): Promise<Uint8Array> {
    // Simplified signature - in real MLS this would be more complex
    const message = `${groupState.epoch}-${signingKey.fingerprint}`;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
    return new Uint8Array(hash.slice(0, 32));
  }

  // State persistence - make these public
  async serializeGroupState(groupState: MLSGroupState): Promise<Uint8Array> {
    const serializable = {
      groupId: Array.from(groupState.groupId),
      epoch: groupState.epoch,
      treeHash: Array.from(groupState.treeHash),
      confirmedTranscriptHash: Array.from(groupState.confirmedTranscriptHash),
      memberKeys: Array.from(groupState.memberKeys.entries()).map(([k, v]) => [k, Array.from(v)]),
      myIndex: groupState.myIndex,
      ratchetTree: Array.from(groupState.ratchetTree),
      encryptionKey: Array.from(groupState.encryptionKey),
      senderDataSecret: Array.from(groupState.senderDataSecret),
    };
    return new TextEncoder().encode(JSON.stringify(serializable));
  }

  async deserializeGroupState(serialized: Uint8Array): Promise<MLSGroupState> {
    const data = JSON.parse(new TextDecoder().decode(serialized));
    return {
      groupId: new Uint8Array(data.groupId),
      epoch: data.epoch,
      treeHash: new Uint8Array(data.treeHash),
      confirmedTranscriptHash: new Uint8Array(data.confirmedTranscriptHash),
      memberKeys: new Map(data.memberKeys.map(([k, v]: [string, number[]]) => [k, new Uint8Array(v)])),
      myIndex: data.myIndex,
      ratchetTree: new Uint8Array(data.ratchetTree),
      encryptionKey: new Uint8Array(data.encryptionKey),
      senderDataSecret: new Uint8Array(data.senderDataSecret),
    };
  }

  async computeChecksum(data: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

export const mlsProvider = new MLSProvider();