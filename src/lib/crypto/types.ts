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

export type RecipientPacket = { 
  fpr: string; 
  ekp: Uint8Array; // encrypted key packet
};

export type MessageEnvelope = {
  v: 1;
  roomId: string;
  authorDeviceFpr: string;
  recipients: RecipientPacket[];   // one per device fingerprint
  signerFpr: string;
  algo: { aead: 'AES-GCM'; hash: 'SHA-256' };
  createdAt: string;               // ISO
  hasAttachments?: boolean;
  attachmentKeys?: {
    name: string;
    keyWrapped: Uint8Array;
    mime: string;
    size: number;
    sha256: string;
  }[];
  sig?: Uint8Array;                // detached signature for metadata if used
};

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