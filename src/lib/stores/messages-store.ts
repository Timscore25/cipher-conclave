import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { PGPRoomsAPI } from '@/lib/api';
import { pgpProvider } from '@/lib/crypto/pgp-provider';
import { useCryptoStore } from './crypto-store';
import type { MessageEnvelope, DecryptedAttachment } from '@/lib/crypto/types';

export interface Message {
  id: string;
  room_id: string;
  envelope: MessageEnvelope;
  ciphertext: Uint8Array;
  signer_fpr: string;
  content_type: 'text' | 'file';
  created_at: string;
  author_device_id: string;
  devices?: {
    fingerprint: string;
    label: string;
    user_id: string;
  };
  attachments?: Array<{
    id: string;
    storage_path: string;
    size: number;
    mime_type: string;
    sha256: string;
  }>;

  // Decrypted content (client-side only)
  decryptedText?: string;
  decryptedAttachments?: DecryptedAttachment[];
  isVerified?: boolean;
  signerFingerprint?: string;
  decryptionError?: string;
}

interface MessagesState {
  messagesByRoom: Record<string, Message[]>;
  isLoading: boolean;
  error: string | null;
  realtimeSubscription: any;

  // Actions
  loadMessages: (roomId: string, since?: string) => Promise<void>;
  sendMessage: (roomId: string, plaintext: string, attachments?: File[]) => Promise<void>;
  decryptMessage: (message: Message) => Promise<void>;
  subscribeToRoom: (roomId: string) => void;
  unsubscribeFromRoom: () => void;
  clearMessages: (roomId: string) => void;
  clearError: () => void;
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  messagesByRoom: {},
  isLoading: false,
  error: null,
  realtimeSubscription: null,

  loadMessages: async (roomId: string, since?: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await PGPRoomsAPI.listMessages({ room_id: roomId, since });
      const messages: Message[] = response.messages.map((msg: any) => ({
        ...msg,
        ciphertext: new Uint8Array(atob(msg.ciphertext).split('').map(c => c.charCodeAt(0))),
      }));

      // Decrypt messages
      for (const message of messages) {
        await get().decryptMessage(message);
      }

      set(state => ({
        messagesByRoom: {
          ...state.messagesByRoom,
          [roomId]: since 
            ? [...(state.messagesByRoom[roomId] || []), ...messages]
            : messages,
        },
        isLoading: false,
      }));
    } catch (error) {
      console.error('Failed to load messages:', error);
      set({ error: 'Failed to load messages', isLoading: false });
    }
  },

  sendMessage: async (roomId: string, plaintext: string, attachments?: File[]) => {
    set({ isLoading: true, error: null });
    try {
      const cryptoStore = useCryptoStore.getState();
      const currentFingerprint = cryptoStore.currentDeviceFingerprint;
      
      if (!currentFingerprint) {
        throw new Error('No current device available');
      }
      
      const unlockedKey = cryptoStore.getUnlockedKey(currentFingerprint);
      
      if (!unlockedKey) {
        throw new Error('No unlocked device key available');
      }

      // Get room members' public keys
      const { data: membersData, error: membersError } = await supabase
        .from('room_members')
        .select(`
          devices!inner(fingerprint, public_key_armored, user_id)
        `)
        .eq('room_id', roomId);

      if (membersError) throw membersError;

      const recipients = membersData.map((member: any) => ({
        fingerprint: member.devices.fingerprint,
        armoredKey: member.devices.public_key_armored,
        userId: member.devices.user_id,
      }));

      // Prepare attachments for encryption
      const attachmentData = attachments ? await Promise.all(
        attachments.map(async (file) => ({
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
          mime: file.type,
        }))
      ) : undefined;

      // Encrypt message
      const result = await pgpProvider.encryptToMany({
        plaintext: new TextEncoder().encode(plaintext),
        recipients,
        signingKey: unlockedKey,
        attachments: attachmentData,
      });

      // Set room ID in envelope
      result.envelope.roomId = roomId;

      // Convert ciphertext to base64
      const ciphertextBase64 = btoa(String.fromCharCode(...result.ciphertext));

      // Send message
      await PGPRoomsAPI.sendMessage({
        room_id: roomId,
        envelope: result.envelope,
        ciphertext: ciphertextBase64,
        signer_fpr: unlockedKey.fingerprint,
        content_type: attachments ? 'file' : 'text',
      });

      set({ isLoading: false });
    } catch (error) {
      console.error('Failed to send message:', error);
      set({ error: 'Failed to send message', isLoading: false });
    }
  },

  decryptMessage: async (message: Message) => {
    try {
      const cryptoStore = useCryptoStore.getState();
      const currentFingerprint = cryptoStore.currentDeviceFingerprint;
      
      if (!currentFingerprint) {
        message.decryptionError = 'No current device available';
        return;
      }
      
      const unlockedKey = cryptoStore.getUnlockedKey(currentFingerprint);
      
      if (!unlockedKey) {
        message.decryptionError = 'No unlocked device key available';
        return;
      }

      const result = await pgpProvider.decryptFromMany({
        envelope: message.envelope,
        ciphertext: message.ciphertext,
        myPrivateKey: unlockedKey,
      });

      message.decryptedText = new TextDecoder().decode(result.plaintext);
      message.decryptedAttachments = result.attachments;
      message.isVerified = result.verified;
      message.signerFingerprint = result.signerFingerprint;
    } catch (error) {
      console.error('Failed to decrypt message:', error);
      message.decryptionError = 'Failed to decrypt message';
    }
  },

  subscribeToRoom: (roomId: string) => {
    const existing = get().realtimeSubscription;
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newMessage: Message = {
            ...payload.new,
            ciphertext: new Uint8Array(atob(payload.new.ciphertext).split('').map(c => c.charCodeAt(0))),
          } as Message;

          get().decryptMessage(newMessage);

          set(state => ({
            messagesByRoom: {
              ...state.messagesByRoom,
              [roomId]: [...(state.messagesByRoom[roomId] || []), newMessage],
            },
          }));
        }
      )
      .subscribe();

    set({ realtimeSubscription: channel });
  },

  unsubscribeFromRoom: () => {
    const subscription = get().realtimeSubscription;
    if (subscription) {
      supabase.removeChannel(subscription);
      set({ realtimeSubscription: null });
    }
  },

  clearMessages: (roomId: string) => {
    set(state => ({
      messagesByRoom: {
        ...state.messagesByRoom,
        [roomId]: [],
      },
    }));
  },

  clearError: () => {
    set({ error: null });
  },
}));