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
  
  const { data, error } = await supabase
    .from('room_invitations')
    .insert({
      room_id: roomId,
      expires_at: expiresAt.toISOString(),
      uses_remaining: maxUses,
    })
    .select('id')
    .single();

  if (error) throw error;

  // Return invitation link
  const baseUrl = window.location.origin;
  return `${baseUrl}/invite/${data.id}`;
}

export async function getInvitationInfo(invitationId: string): Promise<InvitationInfo | null> {
  try {
    const { data, error } = await supabase
      .from('room_invitations')
      .select(`
        room_id,
        expires_at,
        uses_remaining,
        rooms!inner(name),
        profiles!inner(display_name)
      `)
      .eq('id', invitationId)
      .gt('expires_at', new Date().toISOString())
      .gt('uses_remaining', 0)
      .single();

    if (error || !data) return null;

    // Get member count
    const { count } = await supabase
      .from('room_members')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', data.room_id);

    return {
      room_name: data.rooms.name,
      inviter_name: data.profiles.display_name,
      member_count: count || 0,
      expires_at: data.expires_at,
    };
  } catch (error) {
    console.error('Failed to get invitation info:', error);
    return null;
  }
}

export async function acceptInvitation(invitationId: string, deviceFingerprint: string): Promise<string> {
  try {
    // Start transaction to consume invitation and join room
    const { data: invitation, error: inviteError } = await supabase
      .from('room_invitations')
      .select('room_id, uses_remaining')
      .eq('id', invitationId)
      .gt('expires_at', new Date().toISOString())
      .gt('uses_remaining', 0)
      .single();

    if (inviteError || !invitation) {
      throw new Error('Invalid or expired invitation');
    }

    // Get user's device ID
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('id')
      .eq('fingerprint', deviceFingerprint)
      .single();

    if (deviceError || !device) {
      throw new Error('Device not found');
    }

    // Check if already a member
    const { data: existingMember } = await supabase
      .from('room_members')
      .select('id')
      .eq('room_id', invitation.room_id)
      .eq('device_id', device.id)
      .single();

    if (existingMember) {
      return invitation.room_id; // Already a member
    }

    // Join room
    const { error: joinError } = await supabase
      .from('room_members')
      .insert({
        room_id: invitation.room_id,
        device_id: device.id,
        role: 'member',
      });

    if (joinError) throw joinError;

    // Decrement invitation uses
    const { error: updateError } = await supabase
      .from('room_invitations')
      .update({ uses_remaining: invitation.uses_remaining - 1 })
      .eq('id', invitationId);

    if (updateError) {
      console.warn('Failed to update invitation uses:', updateError);
    }

    return invitation.room_id;
  } catch (error) {
    console.error('Failed to accept invitation:', error);
    throw error;
  }
}