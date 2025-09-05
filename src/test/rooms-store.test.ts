import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useRoomsStore } from '../lib/stores/rooms-store';

// Mock Supabase
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  rpc: vi.fn(),
  functions: {
    invoke: vi.fn()
  }
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase
}));

describe('Rooms Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useRoomsStore.getState().clearError();
  });

  describe('loadRooms', () => {
    it('should handle loading state correctly', async () => {
      const store = useRoomsStore.getState();
      
      // Mock successful response
      mockSupabase.order.mockResolvedValueOnce({
        data: [
          {
            id: '1',
            name: 'Test Room',
            owner_user_id: 'user1',
            crypto_mode: 'pgp',
            created_at: '2024-01-01T00:00:00Z',
            room_members: [{ device_id: 'device1' }]
          }
        ],
        error: null
      });

      expect(useRoomsStore.getState().isLoading).toBe(false);
      
      const loadPromise = store.loadRooms();
      expect(useRoomsStore.getState().isLoading).toBe(true);
      
      await loadPromise;
      
      const finalState = useRoomsStore.getState();
      expect(finalState.isLoading).toBe(false);
      expect(finalState.rooms).toHaveLength(1);
      expect(finalState.error).toBeNull();
    });

    it('should handle empty rooms correctly', async () => {
      const store = useRoomsStore.getState();
      
      mockSupabase.order.mockResolvedValueOnce({
        data: [],
        error: null
      });

      await store.loadRooms();
      
      const state = useRoomsStore.getState();
      expect(state.rooms).toHaveLength(0);
      expect(state.error).toBeNull();
      expect(state.isLoading).toBe(false);
    });

    it('should handle errors correctly', async () => {
      const store = useRoomsStore.getState();
      
      mockSupabase.order.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' }
      });

      await store.loadRooms();
      
      const state = useRoomsStore.getState();
      expect(state.rooms).toHaveLength(0);
      expect(state.error).toBe('Database error');
      expect(state.isLoading).toBe(false);
    });

    it('should count room members correctly', async () => {
      const store = useRoomsStore.getState();
      
      mockSupabase.order.mockResolvedValueOnce({
        data: [
          {
            id: '1',
            name: 'Test Room',
            owner_user_id: 'user1',
            crypto_mode: 'pgp',
            created_at: '2024-01-01T00:00:00Z',
            room_members: { device_id: 'device1' }
          },
          {
            id: '1',
            name: 'Test Room',
            owner_user_id: 'user1',
            crypto_mode: 'pgp',
            created_at: '2024-01-01T00:00:00Z',
            room_members: { device_id: 'device2' }
          }
        ],
        error: null
      });

      await store.loadRooms();
      
      const state = useRoomsStore.getState();
      expect(state.rooms).toHaveLength(1);
      expect(state.rooms[0].member_count).toBe(2);
    });
  });

  describe('createRoom', () => {
    it('should create room successfully', async () => {
      const store = useRoomsStore.getState();
      
      mockSupabase.rpc.mockResolvedValueOnce({
        data: 'new-room-id',
        error: null
      });

      await store.createRoom('New Room');
      
      const state = useRoomsStore.getState();
      expect(mockSupabase.rpc).toHaveBeenCalledWith('create_room_with_membership', {
        p_name: 'New Room'
      });
      expect(state.currentRoomId).toBe('new-room-id');
      expect(state.error).toBeNull();
    });

    it('should handle create room errors', async () => {
      const store = useRoomsStore.getState();
      
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Permission denied' }
      });

      await expect(store.createRoom('New Room')).rejects.toThrow();
      
      const state = useRoomsStore.getState();
      expect(state.error).toBe('Permission denied');
      expect(state.isLoading).toBe(false);
    });

    it('should trim room name', async () => {
      const store = useRoomsStore.getState();
      
      mockSupabase.rpc.mockResolvedValueOnce({
        data: 'new-room-id',
        error: null
      });

      await store.createRoom('  Trimmed Room  ');
      
      expect(mockSupabase.rpc).toHaveBeenCalledWith('create_room_with_membership', {
        p_name: 'Trimmed Room'
      });
    });
  });

  describe('setCurrentRoom', () => {
    it('should set current room', () => {
      const store = useRoomsStore.getState();
      
      store.setCurrentRoom('room-123');
      
      expect(useRoomsStore.getState().currentRoomId).toBe('room-123');
    });

    it('should clear current room', () => {
      const store = useRoomsStore.getState();
      
      store.setCurrentRoom('room-123');
      expect(useRoomsStore.getState().currentRoomId).toBe('room-123');
      
      store.setCurrentRoom(null);
      expect(useRoomsStore.getState().currentRoomId).toBeNull();
    });
  });

  describe('clearError', () => {
    it('should clear error', async () => {
      const store = useRoomsStore.getState();
      
      // Trigger an error
      mockSupabase.order.mockResolvedValueOnce({
        data: null,
        error: { message: 'Test error' }
      });

      await store.loadRooms();
      expect(useRoomsStore.getState().error).toBe('Test error');
      
      store.clearError();
      expect(useRoomsStore.getState().error).toBeNull();
    });
  });
});