import { supabase } from '@/integrations/supabase/client';

export interface RoomInvitation {
  id: string;
  room_id: string;
  created_by: string;
  expires_at: string;
  uses_remaining: number;
  created_at: string;
}

export interface InvitationInfo {
  room_name: string;
  inviter_name: string;
  member_count: number;
  expires_at: string;
}

const INVITATION_TTL_HOURS = 24;

export async function createRoomInvitation(roomId: string, maxUses: number = 10): Promise<string> {
  const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 60 * 60 * 1000);
  
  // Use rpc function since types aren't updated yet
  const { data, error } = await supabase.rpc('create_room_invitation', {
    p_room_id: roomId,
    p_expires_at: expiresAt.toISOString(),
    p_uses_remaining: maxUses,
  });

  if (error) throw error;

  // Return invitation link
  const baseUrl = window.location.origin;
  return `${baseUrl}/invite/${data}`;
}

export async function getInvitationInfo(invitationId: string): Promise<InvitationInfo | null> {
  try {
    // Use rpc function to get invitation info
    const { data, error } = await supabase.rpc('get_invitation_info', {
      p_invitation_id: invitationId,
    });

    if (error || !data) return null;

    return {
      room_name: data.room_name,
      inviter_name: data.inviter_name,
      member_count: data.member_count || 0,
      expires_at: data.expires_at,
    };
  } catch (error) {
    console.error('Failed to get invitation info:', error);
    return null;
  }
}

export async function acceptInvitation(invitationId: string, deviceFingerprint: string): Promise<string> {
  try {
    // Use rpc function to accept invitation
    const { data, error } = await supabase.rpc('accept_invitation', {
      p_invitation_id: invitationId,
      p_device_fingerprint: deviceFingerprint,
    });

    if (error) throw error;

    return data; // Returns room_id
  } catch (error) {
    console.error('Failed to accept invitation:', error);
    throw error;
  }
}