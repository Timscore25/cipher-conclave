import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { PGPRoomsAPI } from '@/lib/api';

interface Room {
  id: string;
  name: string;
  owner_user_id: string;
  created_at: string;
  member_count?: number;
}

interface RoomsState {
  rooms: Room[];
  currentRoomId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadRooms: () => Promise<void>;
  createRoom: (name: string) => Promise<void>;
  joinRoom: (roomId: string, deviceFpr: string) => Promise<void>;
  leaveRoom: (roomId: string) => Promise<void>;
  setCurrentRoom: (roomId: string | null) => void;
  clearError: () => void;
}

export const useRoomsStore = create<RoomsState>((set, get) => ({
  rooms: [],
  currentRoomId: null,
  isLoading: false,
  error: null,

  loadRooms: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select(`
          *,
          room_members!inner(device_id, devices!inner(user_id))
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform and count members
      const rooms = data.map(room => ({
        id: room.id,
        name: room.name,
        owner_user_id: room.owner_user_id,
        created_at: room.created_at,
        member_count: room.room_members?.length || 0,
      }));

      set({ rooms, isLoading: false });
    } catch (error) {
      console.error('Failed to load rooms:', error);
      set({ error: 'Failed to load rooms', isLoading: false });
    }
  },

  createRoom: async (name: string) => {
    set({ isLoading: true, error: null });
    try {
      await PGPRoomsAPI.createRoom({ name });
      await get().loadRooms();
    } catch (error) {
      console.error('Failed to create room:', error);
      set({ error: 'Failed to create room', isLoading: false });
    }
  },

  joinRoom: async (roomId: string, deviceFpr: string) => {
    set({ isLoading: true, error: null });
    try {
      await PGPRoomsAPI.joinRoom({ room_id: roomId, device_fpr: deviceFpr });
      await get().loadRooms();
    } catch (error) {
      console.error('Failed to join room:', error);
      set({ error: 'Failed to join room', isLoading: false });
    }
  },

  leaveRoom: async (roomId: string) => {
    set({ isLoading: true, error: null });
    try {
      await PGPRoomsAPI.leaveRoom(roomId);
      await get().loadRooms();
      if (get().currentRoomId === roomId) {
        set({ currentRoomId: null });
      }
    } catch (error) {
      console.error('Failed to leave room:', error);
      set({ error: 'Failed to leave room', isLoading: false });
    }
  },

  setCurrentRoom: (roomId: string | null) => {
    set({ currentRoomId: roomId });
  },

  clearError: () => {
    set({ error: null });
  },
}));