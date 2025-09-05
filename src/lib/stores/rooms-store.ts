import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

interface Room {
  id: string;
  name: string;
  owner_user_id: string;
  crypto_mode: 'pgp' | 'mls';
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

function logRooms(message: string, ...args: any[]) {
  if (import.meta.env.VITE_DEBUG_ROOMS === 'true') {
    console.log(`[ROOMS] ${message}`, ...args);
  }
}

export const useRoomsStore = create<RoomsState>((set, get) => ({
  rooms: [],
  currentRoomId: null,
  isLoading: false,
  error: null,

  loadRooms: async () => {
    set({ isLoading: true, error: null });
    
    logRooms('Loading rooms...');
    
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select(`
          id,
          name,
          owner_user_id,
          crypto_mode,
          created_at,
          room_members!inner(device_id)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        logRooms('Failed to load rooms (query error):', error);
        throw error;
      }

      logRooms('Raw rooms data:', data);

      // Transform and count members
      const roomsMap = new Map<string, Room>();
      
      data.forEach(room => {
        if (!roomsMap.has(room.id)) {
          roomsMap.set(room.id, {
            id: room.id,
            name: room.name,
            owner_user_id: room.owner_user_id,
            crypto_mode: (room.crypto_mode || 'pgp') as 'pgp' | 'mls',
            created_at: room.created_at,
            member_count: 0,
          });
        }
        
        // Count unique members
        const roomData = roomsMap.get(room.id)!;
        if (room.room_members) {
          roomData.member_count = (roomData.member_count || 0) + 1;
        }
      });

      const rooms = Array.from(roomsMap.values());
      
      logRooms(`Successfully loaded ${rooms.length} rooms:`, rooms);
      
      set({ rooms, isLoading: false, error: null });
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to load rooms';
      logRooms('Load rooms error:', error);
      
      set({ 
        rooms: [],
        error: errorMessage, 
        isLoading: false 
      });
    }
  },

  createRoom: async (name: string) => {
    set({ isLoading: true, error: null });
    
    logRooms('Creating room:', { name });
    
    try {
      const { data: roomId, error } = await supabase.rpc('create_room_with_membership', { 
        p_name: name.trim() 
      });

      if (error) {
        logRooms('Failed to create room (RPC error):', error);
        throw error;
      }

      logRooms('Room created successfully:', { roomId });

      // Optimistically add the room to the list
      const newRoom: Room = {
        id: roomId,
        name: name.trim(),
        owner_user_id: '', // Will be filled on refresh
        crypto_mode: 'pgp',
        created_at: new Date().toISOString(),
        member_count: 1,
      };

      set(state => ({
        rooms: [newRoom, ...state.rooms],
        currentRoomId: roomId,
        isLoading: false,
        error: null
      }));

      // Refresh the rooms list to get accurate data
      setTimeout(() => get().loadRooms(), 100);
      
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to create room';
      logRooms('Create room error:', error);
      
      set({ 
        error: errorMessage, 
        isLoading: false 
      });
      throw error; // Re-throw so UI can handle it
    }
  },

  joinRoom: async (roomId: string, deviceFpr: string) => {
    set({ isLoading: true, error: null });
    
    logRooms('Joining room:', { roomId, deviceFpr });
    
    try {
      // For now, we'll use the edge function for joining
      // TODO: Consider creating an RPC function for this too
      const { data, error } = await supabase.functions.invoke('rooms', {
        body: { action: 'join', room_id: roomId, device_fpr: deviceFpr },
      });

      if (error) {
        logRooms('Failed to join room (edge function error):', error);
        throw error;
      }

      logRooms('Joined room successfully:', data);
      
      await get().loadRooms();
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to join room';
      logRooms('Join room error:', error);
      
      set({ 
        error: errorMessage, 
        isLoading: false 
      });
    }
  },

  leaveRoom: async (roomId: string) => {
    set({ isLoading: true, error: null });
    
    logRooms('Leaving room:', { roomId });
    
    try {
      const { data, error } = await supabase.functions.invoke('rooms', {
        body: { action: 'leave', room_id: roomId },
      });

      if (error) {
        logRooms('Failed to leave room (edge function error):', error);
        throw error;
      }

      logRooms('Left room successfully:', data);
      
      await get().loadRooms();
      if (get().currentRoomId === roomId) {
        set({ currentRoomId: null });
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to leave room';
      logRooms('Leave room error:', error);
      
      set({ 
        error: errorMessage, 
        isLoading: false 
      });
    }
  },

  setCurrentRoom: (roomId: string | null) => {
    logRooms('Setting current room:', { roomId });
    set({ currentRoomId: roomId });
  },

  clearError: () => {
    logRooms('Clearing error');
    set({ error: null });
  },
}));