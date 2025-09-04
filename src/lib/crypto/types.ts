export interface PublicKeyInfo {
  fingerprint: string;
  armoredKey: string;
  userId?: string;
  deviceLabel?: string;
}

export interface UnlockedKeyHandle {
  privateKey: any; // OpenPGP private key
  publicKey: any; // OpenPGP public key
  fingerprint: string;
}

export interface MessageEnvelope {
  version: string;
  algorithm: string;
  recipientKeys: Array<{
    fingerprint: string;
    encryptedSessionKey: Uint8Array;
  }>;
  ciphertext: Uint8Array;
  signature: Uint8Array;
  metadata: {
    contentType: 'text' | 'file' | 'system';
    attachments?: Array<{
      name: string;
      size: number;
      mimeType: string;
      encryptedFileKey: Uint8Array;
    }>;
  };
}

export interface DecryptedAttachment {
  name: string;
  data: Uint8Array;
  mimeType: string;
}

export interface CryptoProvider {
  generateIdentity(opts: {
    name: string;
    email?: string;
    passphrase: string;
  }): Promise<{
    publicKeyArmored: string;
    privateKeyWrapped: Uint8Array;
    fingerprint: string;
  }>;

  unlockPrivateKey(
    wrapped: Uint8Array,
    passphrase: string
  ): Promise<UnlockedKeyHandle>;

  lockPrivateKey(
    handle: UnlockedKeyHandle,
    passphrase: string
  ): Promise<Uint8Array>;

  encryptToMany(params: {
    plaintext: Uint8Array;
    recipients: PublicKeyInfo[];
    signingKey: UnlockedKeyHandle;
    attachments?: Array<{
      name: string;
      bytes: Uint8Array;
      mime: string;
    }>;
  }): Promise<MessageEnvelope>;

  decryptFromMany(params: {
    envelope: MessageEnvelope;
    myPrivateKey: UnlockedKeyHandle;
  }): Promise<{
    plaintext: Uint8Array;
    attachments?: DecryptedAttachment[];
    verified: boolean;
    signerFingerprint?: string;
  }>;

  fingerprint(pubkeyArmored: string): Promise<string>;
}