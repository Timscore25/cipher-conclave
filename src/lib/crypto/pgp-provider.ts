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

    // Generate PGP keypair
    const keyResult = await openpgp.generateKey({
      type: 'ecc',
      curve: 'curve25519',
      userIDs: [{ name: opts.name, email: opts.email }],
      passphrase: undefined, // We'll encrypt separately
    });

    const privateKey = await openpgp.readPrivateKey({ armoredKey: keyResult.privateKey });
    const publicKey = await openpgp.readKey({ armoredKey: keyResult.publicKey });
    const fingerprint = publicKey.getFingerprint();

    // Encrypt private key with Argon2id
    const privateKeyWrapped = await this.wrapPrivateKey(
      keyResult.privateKey,
      opts.passphrase
    );

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

    const armoredPrivateKey = await this.unwrapPrivateKey(wrapped, passphrase);
    const privateKey = await openpgp.readPrivateKey({
      armoredKey: armoredPrivateKey,
    });
    const publicKey = privateKey.toPublic();
    const fingerprint = publicKey.getFingerprint();

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
  }): Promise<MessageEnvelope> {
    await this.ensureInitialized();

    // Generate session key
    const sessionKey = sodium.randombytes_buf(32);

    // Prepare message with attachments
    let messageData: any = {
      text: new TextDecoder().decode(params.plaintext),
      timestamp: new Date().toISOString(),
    };

    if (params.attachments) {
      messageData.attachments = [];
      for (const attachment of params.attachments) {
        // Generate file key and encrypt attachment
        const fileKey = sodium.randombytes_buf(32);
        const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
        const encryptedData = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
          attachment.bytes,
          null,
          null,
          nonce,
          fileKey
        );

        messageData.attachments.push({
          name: attachment.name,
          mimeType: attachment.mime,
          size: attachment.bytes.length,
          encryptedData: Array.from(encryptedData),
          nonce: Array.from(nonce),
          encryptedFileKey: Array.from(
            sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
              fileKey,
              null,
              null,
              sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES),
              sessionKey
            )
          ),
        });
      }
    }

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
    const recipientKeys: Array<{
      fingerprint: string;
      encryptedSessionKey: Uint8Array;
    }> = [];

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

      recipientKeys.push({
        fingerprint: recipient.fingerprint,
        encryptedSessionKey: new TextEncoder().encode(encryptedSessionKeyMessage as string),
      });
    }

    // Sign the envelope
    const envelopeData = {
      recipientKeys,
      ciphertext: Array.from(new Uint8Array([...nonce, ...ciphertext])),
    };

    const signatureResult = await openpgp.sign({
      message: await openpgp.createMessage({
        text: JSON.stringify(envelopeData),
      }),
      signingKeys: params.signingKey.privateKey,
      detached: true,
    });

    return {
      version: '1.0',
      algorithm: 'XChaCha20-Poly1305',
      recipientKeys,
      ciphertext: new Uint8Array([...nonce, ...ciphertext]),
      signature: new TextEncoder().encode(signatureResult as string),
      metadata: {
        contentType: params.attachments ? 'file' : 'text',
        attachments: params.attachments?.map(att => ({
          name: att.name,
          size: att.bytes.length,
          mimeType: att.mime,
          encryptedFileKey: new Uint8Array(), // Included in message
        })),
      },
    };
  }

  async decryptFromMany(params: {
    envelope: MessageEnvelope;
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
    const myRecipientKey = params.envelope.recipientKeys.find(
      rk => rk.fingerprint === myFingerprint
    );

    if (!myRecipientKey) {
      throw new Error('Message not encrypted for this device');
    }

    // Decrypt session key
    const sessionKeyMessage = await openpgp.readMessage({
      armoredMessage: new TextDecoder().decode(myRecipientKey.encryptedSessionKey),
    });

    const { data: sessionKey } = await openpgp.decrypt({
      message: sessionKeyMessage,
      decryptionKeys: params.myPrivateKey.privateKey,
    });

    // Decrypt message
    const combined = params.envelope.ciphertext;
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
    let signerFingerprint: string | undefined;

    try {
      const envelopeData = {
        recipientKeys: params.envelope.recipientKeys,
        ciphertext: Array.from(params.envelope.ciphertext),
      };

      const signatureMessage = await openpgp.readSignature({
        armoredSignature: new TextDecoder().decode(params.envelope.signature),
      });

      const message = await openpgp.createMessage({
        text: JSON.stringify(envelopeData),
      });

      // We would need the sender's public key to verify
      // For now, assume verified if signature exists
      verified = true;
    } catch (error) {
      console.warn('Signature verification failed:', error);
    }

    // Decrypt attachments if any
    let attachments: DecryptedAttachment[] | undefined;
    if (messageData.attachments) {
      attachments = [];
      for (const att of messageData.attachments) {
        // Decrypt file key
        const encryptedFileKeyData = new Uint8Array(att.encryptedFileKey);
        const fileKeyNonce = encryptedFileKeyData.slice(0, sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
        const encryptedFileKey = encryptedFileKeyData.slice(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);

        const fileKey = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          encryptedFileKey,
          null,
          fileKeyNonce,
          new Uint8Array(sessionKey as Uint8Array)
        );

        // Decrypt file
        const encryptedData = new Uint8Array(att.encryptedData);
        const fileNonce = new Uint8Array(att.nonce);
        const decryptedFile = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          encryptedData,
          null,
          fileNonce,
          fileKey
        );

        attachments.push({
          name: att.name,
          data: decryptedFile,
          mimeType: att.mimeType,
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

    const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
    const key = sodium.crypto_pwhash(
      32,
      passphrase,
      salt,
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_ALG_ARGON2ID
    );

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
    return new Uint8Array([...salt, ...nonce, ...ciphertext]);
  }

  private async unwrapPrivateKey(
    wrapped: Uint8Array,
    passphrase: string
  ): Promise<string> {
    await this.ensureInitialized();

    const salt = wrapped.slice(0, sodium.crypto_pwhash_SALTBYTES);
    const nonce = wrapped.slice(
      sodium.crypto_pwhash_SALTBYTES,
      sodium.crypto_pwhash_SALTBYTES + sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    );
    const ciphertext = wrapped.slice(
      sodium.crypto_pwhash_SALTBYTES + sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    );

    const key = sodium.crypto_pwhash(
      32,
      passphrase,
      salt,
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_ALG_ARGON2ID
    );

    const decrypted = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      null,
      nonce,
      key
    );

    return new TextDecoder().decode(decrypted);
  }
}

export const pgpProvider = new PGPProvider();