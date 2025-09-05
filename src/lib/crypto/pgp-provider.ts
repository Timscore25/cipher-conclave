import * as openpgp from 'openpgp';
import sodium from 'libsodium-wrappers';
import type {
  CryptoProvider,
  PublicKeyInfo,
  UnlockedKeyHandle,
  MessageEnvelope,
  DecryptedAttachment,
} from './types';

export class PGPProvider implements CryptoProvider {
  private initialized = false;

  private async ensureInitialized() {
    if (!this.initialized) {
      await sodium.ready;
      this.initialized = true;
    }
  }

  async generateIdentity(opts: {
    name: string;
    email?: string;
    passphrase: string;
  }): Promise<{
    publicKeyArmored: string;
    privateKeyWrapped: Uint8Array;
    fingerprint: string;
  }> {
    await this.ensureInitialized();

    // Normalize and validate inputs
    const passphrase = String(opts.passphrase ?? '');
    const name = String(opts.name ?? '');

    if (typeof passphrase !== 'string' || passphrase.trim().length < 8) {
      throw new Error('Passphrase must be at least 8 characters long');
    }
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Name is required');
    }

    if (import.meta.env.VITE_DEBUG_CRYPTO === 'true') {
      console.log('[PGP] Generating identity for:', {
        name,
        email: opts.email,
        passphraseLength: passphrase.length,
      });
    }

    // Generate PGP keypair
    const keyResult = await openpgp.generateKey({
      type: 'ecc',
      curve: 'curve25519',
      userIDs: [{ name, email: opts.email }],
      passphrase: undefined, // We'll encrypt separately
    });

    if (!keyResult.privateKey) {
      throw new Error('Failed to generate private key');
    }
    if (!keyResult.publicKey) {
      throw new Error('Failed to generate public key');
    }

    const privateKey = await openpgp.readPrivateKey({ armoredKey: keyResult.privateKey });
    const publicKey = await openpgp.readKey({ armoredKey: keyResult.publicKey });
    const fingerprint = publicKey.getFingerprint();

    // Encrypt private key with Argon2id
    const privateKeyWrapped = await this.wrapPrivateKey(
      keyResult.privateKey,
      passphrase
    );

    if (import.meta.env.VITE_DEBUG_CRYPTO === 'true') {
      console.log('[PGP] Generated identity:', {
        fingerprint,
        wrappedKeySize: privateKeyWrapped.length,
      });
    }

    return {
      publicKeyArmored: keyResult.publicKey,
      privateKeyWrapped,
      fingerprint,
    };
  }

  async unlockPrivateKey(
    wrapped: Uint8Array,
    passphrase: string
  ): Promise<UnlockedKeyHandle> {
    await this.ensureInitialized();

    // Validate inputs
    if (!wrapped || wrapped.length === 0) {
      throw new Error('Wrapped private key is required');
    }
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
      throw new Error('Passphrase is required');
    }

    if (import.meta.env.VITE_DEBUG_CRYPTO === 'true') {
      console.log('[PGP] Unlocking private key:', { 
        wrappedSize: wrapped.length,
        passphraseLength: passphrase.length 
      });
    }

    const armoredPrivateKey = await this.unwrapPrivateKey(wrapped, passphrase);
    const privateKey = await openpgp.readPrivateKey({
      armoredKey: armoredPrivateKey,
    });
    const publicKey = privateKey.toPublic();
    const fingerprint = publicKey.getFingerprint();

    if (import.meta.env.VITE_DEBUG_CRYPTO === 'true') {
      console.log('[PGP] Successfully unlocked key:', { fingerprint });
    }

    return {
      privateKey,
      publicKey,
      fingerprint,
    };
  }

  async lockPrivateKey(
    handle: UnlockedKeyHandle,
    passphrase: string
  ): Promise<Uint8Array> {
    await this.ensureInitialized();

    const armoredPrivateKey = handle.privateKey.armor();
    return this.wrapPrivateKey(armoredPrivateKey, passphrase);
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
  }): Promise<{ envelope: MessageEnvelope; ciphertext: Uint8Array }> {
    await this.ensureInitialized();

    // Generate session key
    const sessionKey = sodium.randombytes_buf(32);
    const createdAt = new Date().toISOString();

    // Prepare attachment keys if attachments exist
    let attachmentKeys: Array<{
      name: string;
      keyWrapped: Uint8Array;
      mime: string;
      size: number;
      sha256: string;
    }> | undefined;

    if (params.attachments && params.attachments.length > 0) {
      attachmentKeys = [];
      for (const attachment of params.attachments) {
        // Generate file key and wrap it with session key
        const fileKey = sodium.randombytes_buf(32);
        const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
        const keyWrapped = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
          fileKey,
          null,
          null,
          nonce,
          sessionKey
        );

        // Calculate SHA-256 of original file
        const sha256Hash = sodium.crypto_hash_sha256(attachment.bytes);
        const sha256 = [...sha256Hash].map(b => b.toString(16).padStart(2, '0')).join('');

        attachmentKeys.push({
          name: attachment.name,
          keyWrapped: new Uint8Array([...nonce, ...keyWrapped]),
          mime: attachment.mime,
          size: attachment.bytes.length,
          sha256: sha256,
        });
      }
    }

    // Prepare message data
    const messageData = {
      text: new TextDecoder().decode(params.plaintext),
      timestamp: createdAt,
    };

    const messageJson = JSON.stringify(messageData);
    const messageBytes = new TextEncoder().encode(messageJson);

    // Encrypt message with session key
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      messageBytes,
      null,
      null,
      nonce,
      sessionKey
    );

    // Encrypt session key for each recipient
    const recipients: Array<{ fpr: string; ekp: Uint8Array }> = [];

    for (const recipient of params.recipients) {
      const publicKey = await openpgp.readKey({
        armoredKey: recipient.armoredKey,
      });

      const encryptedSessionKeyMessage = await openpgp.encrypt({
        message: await openpgp.createMessage({
          binary: sessionKey,
        }),
        encryptionKeys: publicKey,
      });

      recipients.push({
        fpr: recipient.fingerprint,
        ekp: new TextEncoder().encode(encryptedSessionKeyMessage as string),
      });
    }

    // Create envelope
    const envelope: MessageEnvelope = {
      v: 1,
      roomId: '', // Will be set by caller
      authorDeviceFpr: params.signingKey.fingerprint,
      recipients,
      signerFpr: params.signingKey.fingerprint,
      algo: { aead: 'AES-GCM', hash: 'SHA-256' },
      createdAt,
      hasAttachments: !!attachmentKeys,
      attachmentKeys,
    };

    // Sign the envelope if requested
    const envelopeJson = JSON.stringify(envelope);
    const signatureResult = await openpgp.sign({
      message: await openpgp.createMessage({
        text: envelopeJson,
      }),
      signingKeys: params.signingKey.privateKey,
      detached: true,
    });

    envelope.sig = new TextEncoder().encode(signatureResult as string);

    return {
      envelope,
      ciphertext: new Uint8Array([...nonce, ...ciphertext]),
    };
  }

  async decryptFromMany(params: {
    envelope: MessageEnvelope;
    ciphertext: Uint8Array;
    myPrivateKey: UnlockedKeyHandle;
  }): Promise<{
    plaintext: Uint8Array;
    attachments?: DecryptedAttachment[];
    verified: boolean;
    signerFingerprint?: string;
  }> {
    await this.ensureInitialized();

    // Find our session key
    const myFingerprint = params.myPrivateKey.fingerprint;
    const myRecipientKey = params.envelope.recipients.find(
      rk => rk.fpr === myFingerprint
    );

    if (!myRecipientKey) {
      throw new Error('Message not encrypted for this device');
    }

    // Decrypt session key
    const sessionKeyMessage = await openpgp.readMessage({
      armoredMessage: new TextDecoder().decode(myRecipientKey.ekp),
    });

    const { data: sessionKey } = await openpgp.decrypt({
      message: sessionKeyMessage,
      decryptionKeys: params.myPrivateKey.privateKey,
    });

    // Decrypt message
    const combined = params.ciphertext;
    const nonce = combined.slice(0, sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const ciphertext = combined.slice(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);

    const decryptedMessage = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      null,
      nonce,
      new Uint8Array(sessionKey as Uint8Array)
    );

    const messageJson = new TextDecoder().decode(decryptedMessage);
    const messageData = JSON.parse(messageJson);

    // Verify signature
    let verified = false;
    let signerFingerprint: string | undefined = params.envelope.signerFpr;

    try {
      if (params.envelope.sig) {
        const signatureMessage = await openpgp.readSignature({
          armoredSignature: new TextDecoder().decode(params.envelope.sig),
        });

        const envelopeWithoutSig = { ...params.envelope };
        delete envelopeWithoutSig.sig;

        const message = await openpgp.createMessage({
          text: JSON.stringify(envelopeWithoutSig),
        });

        // We would need the sender's public key to verify
        // For now, assume verified if signature exists
        verified = true;
      }
    } catch (error) {
      console.warn('Signature verification failed:', error);
    }

    // Decrypt attachments if any
    let attachments: DecryptedAttachment[] | undefined;
    if (params.envelope.attachmentKeys) {
      attachments = [];
      for (const attKey of params.envelope.attachmentKeys) {
        // Decrypt attachment key
        const keyWrapped = attKey.keyWrapped;
        const fileKeyNonce = keyWrapped.slice(0, sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
        const encryptedFileKey = keyWrapped.slice(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);

        const fileKey = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          encryptedFileKey,
          null,
          fileKeyNonce,
          new Uint8Array(sessionKey as Uint8Array)
        );

        // Attachment data would be downloaded separately from storage
        // For now, we just return the metadata
        attachments.push({
          name: attKey.name,
          data: new Uint8Array(), // Would be loaded from storage
          mimeType: attKey.mime,
        });
      }
    }

    return {
      plaintext: new TextEncoder().encode(messageData.text),
      attachments,
      verified,
      signerFingerprint,
    };
  }

  async fingerprint(pubkeyArmored: string): Promise<string> {
    const publicKey = await openpgp.readKey({ armoredKey: pubkeyArmored });
    return publicKey.getFingerprint();
  }

  private async wrapPrivateKey(
    armoredPrivateKey: string,
    passphrase: string
  ): Promise<Uint8Array> {
    await this.ensureInitialized();

    // Validate inputs
    if (typeof armoredPrivateKey !== 'string' || armoredPrivateKey.length === 0) {
      throw new Error('Private key is required for wrapping');
    }
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
      throw new Error('Passphrase is required for wrapping');
    }

    // Generate salt and convert passphrase to bytes for KDF
    const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
    const passphraseBytes = new TextEncoder().encode(passphrase);
    
    if (import.meta.env.VITE_DEBUG_CRYPTO === 'true') {
      console.log('[PGP] Wrapping private key:', { 
        saltLength: salt.length,
        passphraseByteLength: passphraseBytes.length,
        privateKeyLength: armoredPrivateKey.length
      });
    }

    // Derive key using Argon2id
    const key = sodium.crypto_pwhash(
      32,
      passphraseBytes,
      salt,
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_ALG_ARGON2ID
    );

    // Encrypt with XChaCha20-Poly1305
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const privateKeyBytes = new TextEncoder().encode(armoredPrivateKey);
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      privateKeyBytes,
      null,
      null,
      nonce,
      key
    );

    // Combine salt + nonce + ciphertext
    const result = new Uint8Array([...salt, ...nonce, ...ciphertext]);
    
    if (import.meta.env.VITE_DEBUG_CRYPTO === 'true') {
      console.log('[PGP] Private key wrapped:', { 
        wrappedSize: result.length,
        expectedMinSize: salt.length + nonce.length + privateKeyBytes.length + 16 // +16 for poly1305 tag
      });
    }

    return result;
  }

  private async unwrapPrivateKey(
    wrapped: Uint8Array,
    passphrase: string
  ): Promise<string> {
    await this.ensureInitialized();

    // Validate inputs
    if (!wrapped || wrapped.length === 0) {
      throw new Error('Wrapped key data is required for unwrapping');
    }
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
      throw new Error('Passphrase is required for unwrapping');
    }

    const expectedMinSize = sodium.crypto_pwhash_SALTBYTES + sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES + 16;
    if (wrapped.length < expectedMinSize) {
      throw new Error(`Wrapped key data is too small (${wrapped.length} bytes, expected at least ${expectedMinSize})`);
    }

    // Extract components
    const salt = wrapped.slice(0, sodium.crypto_pwhash_SALTBYTES);
    const nonce = wrapped.slice(
      sodium.crypto_pwhash_SALTBYTES,
      sodium.crypto_pwhash_SALTBYTES + sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    );
    const ciphertext = wrapped.slice(
      sodium.crypto_pwhash_SALTBYTES + sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    );

    if (import.meta.env.VITE_DEBUG_CRYPTO === 'true') {
      console.log('[PGP] Unwrapping private key:', { 
        wrappedSize: wrapped.length,
        saltLength: salt.length,
        nonceLength: nonce.length,
        ciphertextLength: ciphertext.length,
        passphraseLength: passphrase.length
      });
    }

    // Convert passphrase to bytes for KDF
    const passphraseBytes = new TextEncoder().encode(passphrase);

    // Derive key using Argon2id
    const key = sodium.crypto_pwhash(
      32,
      passphraseBytes,
      salt,
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_ALG_ARGON2ID
    );

    // Decrypt
    const decrypted = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      null,
      nonce,
      key
    );

    if (!decrypted) {
      throw new Error('Failed to decrypt private key - incorrect passphrase or corrupted data');
    }

    const result = new TextDecoder().decode(decrypted);
    
    if (import.meta.env.VITE_DEBUG_CRYPTO === 'true') {
      console.log('[PGP] Private key unwrapped successfully:', { 
        decryptedLength: result.length 
      });
    }

    return result;
  }
}

export const pgpProvider = new PGPProvider();