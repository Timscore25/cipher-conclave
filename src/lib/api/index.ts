import { supabase } from '@/integrations/supabase/client';

export interface CreateRoomRequest {
  name: string;
}

export interface JoinRoomRequest {
  room_id: string;
  device_fpr: string;
}

export interface SendMessageRequest {
  room_id: string;
  envelope: any;
  ciphertext: string; // base64 encoded
  signer_fpr: string;
  content_type?: 'text' | 'file';
}

export interface ListMessagesRequest {
  room_id: string;
  since?: string;
}

export class PGPRoomsAPI {
  static async createRoom(params: CreateRoomRequest) {
    const { data, error } = await supabase.functions.invoke('rooms', {
      body: { action: 'create', ...params },
    });

    if (error) throw error;
    return data;
  }

  static async joinRoom(params: JoinRoomRequest) {
    const { data, error } = await supabase.functions.invoke('rooms', {
      body: { action: 'join', ...params },
    });

    if (error) throw error;
    return data;
  }

  static async leaveRoom(room_id: string) {
    const { data, error } = await supabase.functions.invoke('rooms', {
      body: { action: 'leave', room_id },
    });

    if (error) throw error;
    return data;
  }

  static async sendMessage(params: SendMessageRequest) {
    const { data, error } = await supabase.functions.invoke('messages', {
      body: { action: 'send', ...params },
    });

    if (error) throw error;
    return data;
  }

  static async listMessages(params: ListMessagesRequest) {
    const { data, error } = await supabase.functions.invoke('messages', {
      body: { action: 'list', ...params },
    });

    if (error) throw error;
    return data;
  }

  static async uploadAttachment(roomId: string, messageId: string, file: File, encryptedData: Uint8Array) {
    const fileName = `${roomId}/${messageId}/${file.name}.bin`;
    
    const { data, error } = await supabase.storage
      .from('attachments')
      .upload(fileName, encryptedData, {
        contentType: 'application/octet-stream',
        metadata: {
          originalName: file.name,
          mimeType: file.type,
        },
      });

    if (error) throw error;
    return data;
  }

  static async downloadAttachment(path: string) {
    const { data, error } = await supabase.storage
      .from('attachments')
      .download(path);

    if (error) throw error;
    return data;
  }
}