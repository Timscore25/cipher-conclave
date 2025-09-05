export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          created_at: string
          id: string
          message_id: string
          mime_type: string
          sha256: string
          size: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          mime_type: string
          sha256: string
          size: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          mime_type?: string
          sha256?: string
          size?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          fingerprint: string
          id: string
          label: string
          public_key_armored: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fingerprint: string
          id?: string
          label: string
          public_key_armored: string
          user_id: string
        }
        Update: {
          created_at?: string
          fingerprint?: string
          id?: string
          label?: string
          public_key_armored?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      key_verifications: {
        Row: {
          method: Database["public"]["Enums"]["verification_method"]
          target_fpr: string
          verified_at: string
          verifier_device_id: string
        }
        Insert: {
          method: Database["public"]["Enums"]["verification_method"]
          target_fpr: string
          verified_at?: string
          verifier_device_id: string
        }
        Update: {
          method?: Database["public"]["Enums"]["verification_method"]
          target_fpr?: string
          verified_at?: string
          verifier_device_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_verifications_verifier_device_id_fkey"
            columns: ["verifier_device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_device_id: string
          ciphertext: string
          content_type: Database["public"]["Enums"]["message_content_type"]
          created_at: string
          envelope: Json
          id: string
          room_id: string
          signer_fpr: string
        }
        Insert: {
          author_device_id: string
          ciphertext: string
          content_type?: Database["public"]["Enums"]["message_content_type"]
          created_at?: string
          envelope: Json
          id?: string
          room_id: string
          signer_fpr: string
        }
        Update: {
          author_device_id?: string
          ciphertext?: string
          content_type?: Database["public"]["Enums"]["message_content_type"]
          created_at?: string
          envelope?: Json
          id?: string
          room_id?: string
          signer_fpr?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_device_id_fkey"
            columns: ["author_device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      mls_app_messages: {
        Row: {
          authenticated_data: string | null
          ciphertext: string
          content_type: string
          created_at: string
          epoch: number
          group_id: string
          id: string
          local_seq_id: string | null
          sender_device_id: string
          seq: number
        }
        Insert: {
          authenticated_data?: string | null
          ciphertext: string
          content_type?: string
          created_at?: string
          epoch: number
          group_id: string
          id?: string
          local_seq_id?: string | null
          sender_device_id: string
          seq: number
        }
        Update: {
          authenticated_data?: string | null
          ciphertext?: string
          content_type?: string
          created_at?: string
          epoch?: number
          group_id?: string
          id?: string
          local_seq_id?: string | null
          sender_device_id?: string
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "mls_app_messages_sender_device_id_fkey"
            columns: ["sender_device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      mls_groups: {
        Row: {
          created_at: string
          created_by_device_id: string
          current_epoch: number
          group_id: string
          group_state: string
          id: string
          room_id: string
          state_checksum: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_device_id: string
          current_epoch?: number
          group_id: string
          group_state: string
          id?: string
          room_id: string
          state_checksum: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_device_id?: string
          current_epoch?: number
          group_id?: string
          group_state?: string
          id?: string
          room_id?: string
          state_checksum?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mls_groups_created_by_device_id_fkey"
            columns: ["created_by_device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mls_groups_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      mls_handshake_messages: {
        Row: {
          created_at: string
          epoch: number
          group_id: string
          id: string
          local_seq_id: string | null
          message_data: string
          message_type: string
          sender_device_id: string
          seq: number
        }
        Insert: {
          created_at?: string
          epoch: number
          group_id: string
          id?: string
          local_seq_id?: string | null
          message_data: string
          message_type: string
          sender_device_id: string
          seq: number
        }
        Update: {
          created_at?: string
          epoch?: number
          group_id?: string
          id?: string
          local_seq_id?: string | null
          message_data?: string
          message_type?: string
          sender_device_id?: string
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "mls_handshake_messages_sender_device_id_fkey"
            columns: ["sender_device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      mls_key_packages: {
        Row: {
          created_at: string
          device_id: string
          expires_at: string
          id: string
          key_package: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          device_id: string
          expires_at?: string
          id?: string
          key_package: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string
          expires_at?: string
          id?: string
          key_package?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mls_key_packages_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      room_invitations: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          room_id: string
          uses_remaining: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          room_id: string
          uses_remaining?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          room_id?: string
          uses_remaining?: number
        }
        Relationships: [
          {
            foreignKeyName: "room_invitations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_invites: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          inviter_device_id: string
          max_uses: number
          redeemed_at: string | null
          room_id: string
          token: string
          uses_count: number
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          inviter_device_id: string
          max_uses?: number
          redeemed_at?: string | null
          room_id: string
          token: string
          uses_count?: number
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          inviter_device_id?: string
          max_uses?: number
          redeemed_at?: string | null
          room_id?: string
          token?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "room_invites_inviter_device_id_fkey"
            columns: ["inviter_device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_invites_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_members: {
        Row: {
          added_at: string
          device_id: string
          role: Database["public"]["Enums"]["room_member_role"]
          room_id: string
        }
        Insert: {
          added_at?: string
          device_id: string
          role?: Database["public"]["Enums"]["room_member_role"]
          room_id: string
        }
        Update: {
          added_at?: string
          device_id?: string
          role?: Database["public"]["Enums"]["room_member_role"]
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_members_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          crypto_mode: string
          id: string
          name: string
          owner_user_id: string
        }
        Insert: {
          created_at?: string
          crypto_mode?: string
          id?: string
          name: string
          owner_user_id: string
        }
        Update: {
          created_at?: string
          crypto_mode?: string
          id?: string
          name?: string
          owner_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: {
        Args: { p_device_fingerprint: string; p_token: string }
        Returns: string
      }
      cleanup_expired_invites: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_expired_key_packages: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      create_room_invite: {
        Args: { p_expires_at: string; p_max_uses?: number; p_room_id: string }
        Returns: string
      }
      create_room_with_membership: {
        Args: { p_name: string }
        Returns: string
      }
      generate_invite_token: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_invite_info: {
        Args: { p_token: string }
        Returns: Json
      }
    }
    Enums: {
      message_content_type: "text" | "file" | "system"
      room_member_role: "admin" | "member"
      verification_method: "qr" | "sas"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      message_content_type: ["text", "file", "system"],
      room_member_role: ["admin", "member"],
      verification_method: ["qr", "sas"],
    },
  },
} as const
