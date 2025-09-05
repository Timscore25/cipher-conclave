import { create } from 'zustand';
import { mlsProvider, MLSGroupState, MLSMessage, MLSApplicationMessage, MLSHandshakeMessage } from '@/lib/crypto/mls-provider';
import { useCryptoStore } from './crypto-store';
import { supabase } from '@/integrations/supabase/client';
import { DecryptedAttachment } from '@/lib/crypto/types';

export interface MLSMessageDisplay {
  id: string;
  groupId: string;
  epoch: number;
  sender: string;
  senderLabel?: string;
  content?: string;
  attachments?: DecryptedAttachment[];
  verified: boolean;
  timestamp: string;
  decrypted?: boolean;
  decryptionError?: string;
}

interface MLSState {
  groupStates: Map<string, MLSGroupState>;
  messagesByGroup: Map<string, MLSMessageDisplay[]>;
  isLoading: boolean;
  error: string | null;
  
  // Group management
  createGroup: (roomId: string) => Promise<void>;
  joinGroup: (roomId: string, welcomeMessage: any) => Promise<void>;
  addMembersToGroup: (roomId: string, deviceFingerprints: string[]) => Promise<void>;
  
  // Messaging
  sendMessage: (roomId: string, plaintext: string, attachments?: File[]) => Promise<void>;
  loadMessages: (roomId: string, sinceSeq?: number) => Promise<void>;
  
  // State management
  syncGroupState: (roomId: string) => Promise<void>;
  rebuildGroupState: (roomId: string) => Promise<void>;
  
  // Out-of-order handling
  processBufferedMessages: (roomId: string) => Promise<void>;
  
  // Utilities
  clearError: () => void;
  clearMessages: (roomId: string) => void;
}

export const useMLSStore = create<MLSState>((set, get) => ({
  groupStates: new Map(),
  messagesByGroup: new Map(),
  isLoading: false,
  error: null,

  createGroup: async (roomId: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const cryptoStore = useCryptoStore.getState();
      const currentFingerprint = cryptoStore.currentDeviceFingerprint;
      
      if (!currentFingerprint) {
        throw new Error('No current device available');
      }
      
      const unlockedKey = cryptoStore.getUnlockedKey(currentFingerprint);
      
      if (!unlockedKey) {
        throw new Error('No unlocked device available');
      }

      // Create MLS group
      const { groupId, groupState } = await mlsProvider.createGroup(roomId, unlockedKey);
      
      // Store group state in database
      const groupIdBase64 = btoa(String.fromCharCode(...groupId));
      const stateBytes = await mlsProvider.serializeGroupState(groupState);
      const checksum = await mlsProvider.computeChecksum(stateBytes);
      
      const { error: dbError } = await supabase
        .from('mls_groups')
        .insert({
          room_id: roomId,
          group_id: `\\x${Buffer.from(groupId).toString('hex')}`,
          group_state: `\\x${Buffer.from(stateBytes).toString('hex')}`,
          current_epoch: groupState.epoch,
          created_by_device_id: (await supabase
            .from('devices')
            .select('id')
            .eq('fingerprint', unlockedKey.fingerprint)
            .single()
          ).data?.id,
          state_checksum: checksum,
        });

      if (dbError) {
        throw new Error(`Failed to store group: ${dbError.message}`);
      }

      // Update room crypto mode
      await supabase
        .from('rooms')
        .update({ crypto_mode: 'mls' })
        .eq('id', roomId);

      // Update local state
      const state = get();
      const newGroupStates = new Map(state.groupStates);
      newGroupStates.set(roomId, groupState);
      
      set({ groupStates: newGroupStates, isLoading: false });
      
    } catch (error: any) {
      console.error('Failed to create MLS group:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  joinGroup: async (roomId: string, welcomeMessage: any) => {
    set({ isLoading: true, error: null });
    
    try {
      const cryptoStore = useCryptoStore.getState();
      const currentFingerprint = cryptoStore.currentDeviceFingerprint;
      
      if (!currentFingerprint) {
        throw new Error('No current device available');
      }
      
      const unlockedKey = cryptoStore.getUnlockedKey(currentFingerprint);
      
      if (!unlockedKey) {
        throw new Error('No unlocked device available');
      }

      // Process welcome message
      const groupState = await mlsProvider.processWelcome(welcomeMessage, unlockedKey);
      
      // Update local state
      const state = get();
      const newGroupStates = new Map(state.groupStates);
      newGroupStates.set(roomId, groupState);
      
      set({ groupStates: newGroupStates, isLoading: false });
      
    } catch (error: any) {
      console.error('Failed to join MLS group:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  addMembersToGroup: async (roomId: string, deviceFingerprints: string[]) => {
    set({ isLoading: true, error: null });
    
    try {
      const cryptoStore = useCryptoStore.getState();
      const currentFingerprint = cryptoStore.currentDeviceFingerprint;
      
      if (!currentFingerprint) {
        throw new Error('No current device available');
      }
      
      const unlockedKey = cryptoStore.getUnlockedKey(currentFingerprint);
      
      if (!unlockedKey) {
        throw new Error('No unlocked device available');
      }

      const state = get();
      const groupState = state.groupStates.get(roomId);
      
      if (!groupState) {
        throw new Error('Group not found');
      }

      // Get device IDs from fingerprints first
      const { data: devices, error: deviceError } = await supabase
        .from('devices')
        .select('id, fingerprint')
        .in('fingerprint', deviceFingerprints);

      if (deviceError || !devices) {
        throw new Error('Failed to get device IDs');
      }

      const deviceIds = devices.map(d => d.id);

      // Get key packages for new members
      const { data: keyPackages, error: kpError } = await supabase
        .from('mls_key_packages')
        .select('*, devices!inner(fingerprint)')
        .in('device_id', deviceIds)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString());

      if (kpError || !keyPackages) {
        throw new Error('Failed to get key packages');
      }

      const mlsKeyPackages = keyPackages.map(kp => ({
        deviceFingerprint: (kp.devices as any).fingerprint,
        keyPackage: new Uint8Array(Buffer.from(kp.key_package.slice(2), 'hex')),
        createdAt: new Date(kp.created_at).getTime(),
        expiresAt: new Date(kp.expires_at).getTime(),
      }));

      // Add members to group
      const { commitMessage, welcomeMessages, newGroupState } = 
        await mlsProvider.addMembersToGroup(groupState.groupId, mlsKeyPackages, unlockedKey);

      // Send commit message
      const commitData = {
        group_id: btoa(String.fromCharCode(...commitMessage.groupId)),
        epoch: commitMessage.epoch,
        message_type: commitMessage.handshakeType,
        message_data: btoa(String.fromCharCode(...commitMessage.content)),
        local_seq_id: `commit-${Date.now()}-${Math.random()}`,
      };

      await supabase.functions.invoke('mls-handshake/send', {
        body: commitData,
      });

      // Send welcome messages (in a real app, these would be sent directly to new members)
      for (const welcome of welcomeMessages) {
        const welcomeData = {
          group_id: btoa(String.fromCharCode(...welcome.groupId)),
          epoch: welcome.epoch,
          message_type: 'welcome',
          message_data: btoa(String.fromCharCode(...welcome.secrets)),
          local_seq_id: `welcome-${Date.now()}-${Math.random()}`,
        };

        await supabase.functions.invoke('mls-handshake/send', {
          body: welcomeData,
        });
      }

      // Update local state
      const newGroupStates = new Map(state.groupStates);
      newGroupStates.set(roomId, newGroupState);
      
      set({ groupStates: newGroupStates, isLoading: false });
      
    } catch (error: any) {
      console.error('Failed to add members to group:', error);
      set({ error: error.message, isLoading: false });
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
        throw new Error('No unlocked device available');
      }

      const state = get();
      const groupState = state.groupStates.get(roomId);
      
      if (!groupState) {
        throw new Error('Group not found');
      }

      // Process attachments
      let processedAttachments: Array<{ name: string; bytes: Uint8Array; mime: string; }> | undefined;
      
      if (attachments && attachments.length > 0) {
        processedAttachments = [];
        for (const file of attachments) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          processedAttachments.push({
            name: file.name,
            bytes,
            mime: file.type,
          });
        }
      }

      // Encrypt message
      const { message, ciphertext } = await mlsProvider.encryptMLSApplication(
        groupState.groupId,
        new TextEncoder().encode(plaintext),
        unlockedKey,
        processedAttachments
      );

      // Send to delivery service
      const messageData = {
        group_id: btoa(String.fromCharCode(...message.groupId)),
        epoch: message.epoch,
        ciphertext: btoa(String.fromCharCode(...ciphertext)),
        authenticated_data: message.authenticatedData ? 
          btoa(String.fromCharCode(...message.authenticatedData)) : null,
        content_type: 'text',
        local_seq_id: `app-${Date.now()}-${Math.random()}`,
      };

      const { data, error } = await supabase.functions.invoke('mls-app/send', {
        body: messageData,
      });

      if (error) {
        throw new Error(`Failed to send message: ${error.message}`);
      }

      set({ isLoading: false });
      
    } catch (error: any) {
      console.error('Failed to send MLS message:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  loadMessages: async (roomId: string, sinceSeq?: number) => {
    set({ isLoading: true, error: null });
    
    try {
      const state = get();
      const groupState = state.groupStates.get(roomId);
      
      if (!groupState) {
        // Try to load group state first
        await get().syncGroupState(roomId);
        const updatedState = get();
        const loadedGroupState = updatedState.groupStates.get(roomId);
        if (!loadedGroupState) {
          throw new Error('Group not found');
        }
      }

      const currentGroupState = get().groupStates.get(roomId)!;
      const groupIdBase64 = btoa(String.fromCharCode(...currentGroupState.groupId));

      // Load messages from delivery service
      const params = new URLSearchParams({
        group_id: groupIdBase64,
        limit: '100',
      });
      
      if (sinceSeq !== undefined) {
        params.set('since_seq', sinceSeq.toString());
      }

      const { data, error } = await supabase.functions.invoke(`mls-app/list?${params.toString()}`);

      if (error) {
        throw new Error(`Failed to load messages: ${error.message}`);
      }

      const messages = data.messages || [];
      const decryptedMessages: MLSMessageDisplay[] = [];

      const cryptoStore = useCryptoStore.getState();
      const currentFingerprint = cryptoStore.currentDeviceFingerprint;
      let unlockedKey = null;
      
      if (currentFingerprint) {
        unlockedKey = cryptoStore.getUnlockedKey(currentFingerprint);
      }

      for (const msg of messages) {
        try {
          if (unlockedKey) {
            const mlsMessage: MLSApplicationMessage = {
              groupId: new Uint8Array(Buffer.from(msg.group_id, 'base64')),
              epoch: msg.epoch,
              messageType: 'application',
              sender: msg.devices.fingerprint,
              content: new Uint8Array(Buffer.from(msg.ciphertext, 'base64')),
              authenticatedData: msg.authenticated_data ? 
                new Uint8Array(Buffer.from(msg.authenticated_data, 'base64')) : undefined,
            };

            const decrypted = await mlsProvider.decryptMLSApplication(mlsMessage, unlockedKey);

            decryptedMessages.push({
              id: msg.id,
              groupId: msg.group_id,
              epoch: msg.epoch,
              sender: msg.devices.fingerprint,
              senderLabel: msg.devices.label,
              content: new TextDecoder().decode(decrypted.plaintext),
              attachments: decrypted.attachments,
              verified: decrypted.verified,
              timestamp: msg.created_at,
              decrypted: true,
            });
          } else {
            // Can't decrypt without unlocked key
            decryptedMessages.push({
              id: msg.id,
              groupId: msg.group_id,
              epoch: msg.epoch,
              sender: msg.devices.fingerprint,
              senderLabel: msg.devices.label,
              verified: false,
              timestamp: msg.created_at,
              decrypted: false,
              decryptionError: 'Device locked',
            });
          }
        } catch (decryptError: any) {
          console.error('Failed to decrypt message:', decryptError);
          decryptedMessages.push({
            id: msg.id,
            groupId: msg.group_id,
            epoch: msg.epoch,
            sender: msg.devices.fingerprint,
            senderLabel: msg.devices.label,
            verified: false,
            timestamp: msg.created_at,
            decrypted: false,
            decryptionError: decryptError.message,
          });
        }
      }

      // Update local state
      const currentState = get();
      const newMessagesByGroup = new Map(currentState.messagesByGroup);
      const existingMessages = newMessagesByGroup.get(roomId) || [];
      
      // Merge and deduplicate messages
      const allMessages = [...existingMessages, ...decryptedMessages];
      const uniqueMessages = allMessages.filter((msg, index, self) => 
        index === self.findIndex(m => m.id === msg.id)
      );
      
      uniqueMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      newMessagesByGroup.set(roomId, uniqueMessages);
      
      set({ messagesByGroup: newMessagesByGroup, isLoading: false });
      
    } catch (error: any) {
      console.error('Failed to load MLS messages:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  syncGroupState: async (roomId: string) => {
    try {
      // Load group state from database
      const { data: groupData, error } = await supabase
        .from('mls_groups')
        .select('*')
        .eq('room_id', roomId)
        .single();

      if (error || !groupData) {
        throw new Error('Group not found in database');
      }

      // Load state from IndexedDB
      const localState = await mlsProvider.loadGroupState(roomId);
      
      if (localState) {
        // Verify checksum
        const stateBytes = await mlsProvider.serializeGroupState(localState);
        const checksum = await mlsProvider.computeChecksum(stateBytes);
        
        if (checksum === groupData.state_checksum) {
          // State is valid, use local copy
          const state = get();
          const newGroupStates = new Map(state.groupStates);
          newGroupStates.set(roomId, localState);
          set({ groupStates: newGroupStates });
          return;
        }
      }

      // Load from database
      const groupStateBytes = new Uint8Array(Buffer.from(groupData.group_state.slice(2), 'hex'));
      const deserializedState = await mlsProvider.deserializeGroupState(groupStateBytes);
      
      // Update local state
      const state = get();
      const newGroupStates = new Map(state.groupStates);
      newGroupStates.set(roomId, deserializedState);
      set({ groupStates: newGroupStates });
      
      // Persist to IndexedDB
      await mlsProvider.persistGroupState(roomId, deserializedState);
      
    } catch (error: any) {
      console.error('Failed to sync group state:', error);
      set({ error: error.message });
    }
  },

  rebuildGroupState: async (roomId: string) => {
    set({ isLoading: true, error: null });
    
    try {
      // This would implement group state recovery from handshake messages
      // For now, just try to reload from server
      await get().syncGroupState(roomId);
      set({ isLoading: false });
      
    } catch (error: any) {
      console.error('Failed to rebuild group state:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  processBufferedMessages: async (roomId: string) => {
    try {
      const state = get();
      const groupState = state.groupStates.get(roomId);
      
      if (!groupState) {
        return;
      }

      const processable = await mlsProvider.processBufferedMessages(groupState.groupId);
      
      // Process each buffered message
      for (const message of processable) {
        // This would handle the buffered message processing
        console.log('Processing buffered message:', message);
      }
      
    } catch (error: any) {
      console.error('Failed to process buffered messages:', error);
    }
  },

  clearError: () => set({ error: null }),
  
  clearMessages: (roomId: string) => {
    const state = get();
    const newMessagesByGroup = new Map(state.messagesByGroup);
    newMessagesByGroup.delete(roomId);
    set({ messagesByGroup: newMessagesByGroup });
  },
}));