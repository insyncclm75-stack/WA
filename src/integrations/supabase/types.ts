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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      achievement_definitions: {
        Row: {
          id: string
          name: string
          description: string
          icon: string
          category: string
          threshold: number
          sort_order: number
        }
        Insert: {
          id: string
          name: string
          description: string
          icon: string
          category: string
          threshold?: number
          sort_order?: number
        }
        Update: {
          id?: string
          name?: string
          description?: string
          icon?: string
          category?: string
          threshold?: number
          sort_order?: number
        }
        Relationships: []
      }
      campaign_contacts: {
        Row: {
          campaign_id: string
          contact_id: string
          created_at: string
          id: string
          org_id: string
        }
        Insert: {
          campaign_id: string
          contact_id: string
          created_at?: string
          id?: string
          org_id: string
        }
        Update: {
          campaign_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          description: string | null
          id: string
          media_url: string | null
          name: string
          org_id: string
          scheduled_at: string | null
          status: string
          template_id: string | null
          template_message: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          media_url?: string | null
          name: string
          org_id: string
          scheduled_at?: string | null
          status?: string
          template_id?: string | null
          template_message?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          media_url?: string | null
          name?: string
          org_id?: string
          scheduled_at?: string | null
          status?: string
          template_id?: string | null
          template_message?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          org_id: string
          phone_number: string
          source: string | null
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          org_id: string
          phone_number: string
          source?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          org_id?: string
          phone_number?: string
          source?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          campaign_id: string
          contact_id: string
          content: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          exotel_message_id: string | null
          id: string
          interactive_data: Record<string, unknown> | null
          media_url: string | null
          message_type: string
          org_id: string
          read_at: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          contact_id: string
          content?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          exotel_message_id?: string | null
          id?: string
          interactive_data?: Record<string, unknown> | null
          media_url?: string | null
          message_type?: string
          org_id: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          contact_id?: string
          content?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          exotel_message_id?: string | null
          id?: string
          interactive_data?: Record<string, unknown> | null
          media_url?: string | null
          message_type?: string
          org_id?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_achievements: {
        Row: {
          id: string
          org_id: string
          achievement_id: string
          unlocked_at: string
        }
        Insert: {
          id?: string
          org_id: string
          achievement_id: string
          unlocked_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          achievement_id?: string
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_achievements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievement_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      org_credentials: {
        Row: {
          id: string
          org_id: string
          exotel_api_key: string | null
          exotel_api_token: string | null
          exotel_subdomain: string | null
          exotel_waba_id: string | null
          exotel_account_sid: string | null
          exotel_sender_number: string | null
          is_configured: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          exotel_api_key?: string | null
          exotel_api_token?: string | null
          exotel_subdomain?: string | null
          exotel_waba_id?: string | null
          exotel_account_sid?: string | null
          exotel_sender_number?: string | null
          is_configured?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          exotel_api_key?: string | null
          exotel_api_token?: string | null
          exotel_subdomain?: string | null
          exotel_waba_id?: string | null
          exotel_account_sid?: string | null
          exotel_sender_number?: string | null
          is_configured?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_credentials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_memberships: {
        Row: {
          id: string
          org_id: string
          user_id: string
          role: Database["public"]["Enums"]["org_role"]
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          role?: Database["public"]["Enums"]["org_role"]
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          logo_url: string | null
          website: string | null
          industry: string | null
          created_by: string | null
          onboarding_completed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          logo_url?: string | null
          website?: string | null
          industry?: string | null
          created_by?: string | null
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          logo_url?: string | null
          website?: string | null
          industry?: string | null
          created_by?: string | null
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          buttons: Record<string, unknown>[] | null
          category: string | null
          content: string
          created_at: string
          exotel_template_id: string | null
          id: string
          language: string | null
          name: string
          org_id: string
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          buttons?: Record<string, unknown>[] | null
          category?: string | null
          content: string
          created_at?: string
          exotel_template_id?: string | null
          id?: string
          language?: string | null
          name: string
          org_id: string
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          buttons?: Record<string, unknown>[] | null
          category?: string | null
          content?: string
          created_at?: string
          exotel_template_id?: string | null
          id?: string
          language?: string | null
          name?: string
          org_id?: string
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      chatbot_flows: {
        Row: {
          id: string
          org_id: string
          name: string
          description: string | null
          trigger_type: string
          trigger_value: string | null
          status: string
          nodes: Json
          edges: Json
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          description?: string | null
          trigger_type?: string
          trigger_value?: string | null
          status?: string
          nodes?: Json
          edges?: Json
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          description?: string | null
          trigger_type?: string
          trigger_value?: string | null
          status?: string
          nodes?: Json
          edges?: Json
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      chatbot_sessions: {
        Row: {
          id: string
          flow_id: string
          contact_id: string
          conversation_id: string | null
          org_id: string
          current_node_id: string
          variables: Json
          status: string
          started_at: string
          updated_at: string
          expires_at: string | null
        }
        Insert: {
          id?: string
          flow_id: string
          contact_id: string
          conversation_id?: string | null
          org_id: string
          current_node_id: string
          variables?: Json
          status?: string
          started_at?: string
          updated_at?: string
          expires_at?: string | null
        }
        Update: {
          id?: string
          flow_id?: string
          contact_id?: string
          conversation_id?: string | null
          org_id?: string
          current_node_id?: string
          variables?: Json
          status?: string
          started_at?: string
          updated_at?: string
          expires_at?: string | null
        }
        Relationships: []
      }
      outbound_webhooks: {
        Row: {
          id: string
          org_id: string
          name: string
          url: string
          secret: string | null
          events: string[]
          status: string
          headers: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          url: string
          secret?: string | null
          events?: string[]
          status?: string
          headers?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          url?: string
          secret?: string | null
          events?: string[]
          status?: string
          headers?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          id: string
          org_id: string
          name: string
          key_hash: string
          key_prefix: string
          scopes: string[]
          last_used_at: string | null
          expires_at: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          key_hash: string
          key_prefix: string
          scopes?: string[]
          last_used_at?: string | null
          expires_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          key_hash?: string
          key_prefix?: string
          scopes?: string[]
          last_used_at?: string | null
          expires_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          id: string
          webhook_id: string
          event: string
          payload: Json
          response_status: number | null
          response_body: string | null
          delivered_at: string
          success: boolean
        }
        Insert: {
          id?: string
          webhook_id: string
          event: string
          payload: Json
          response_status?: number | null
          response_body?: string | null
          delivered_at?: string
          success?: boolean
        }
        Update: {
          id?: string
          webhook_id?: string
          event?: string
          payload?: Json
          response_status?: number | null
          response_body?: string | null
          delivered_at?: string
          success?: boolean
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          org_id: string
          user_id: string | null
          action: string
          resource_type: string | null
          resource_id: string | null
          details: Json
          ip_address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id?: string | null
          action: string
          resource_type?: string | null
          resource_id?: string | null
          details?: Json
          ip_address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string | null
          action?: string
          resource_type?: string | null
          resource_id?: string | null
          details?: Json
          ip_address?: string | null
          created_at?: string
        }
        Relationships: []
      }
      agent_metrics: {
        Row: {
          id: string
          org_id: string
          user_id: string
          date: string
          conversations_handled: number
          messages_sent: number
          avg_response_time_sec: number | null
          conversations_resolved: number
          csat_score: number | null
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          date: string
          conversations_handled?: number
          messages_sent?: number
          avg_response_time_sec?: number | null
          conversations_resolved?: number
          csat_score?: number | null
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string
          date?: string
          conversations_handled?: number
          messages_sent?: number
          avg_response_time_sec?: number | null
          conversations_resolved?: number
          csat_score?: number | null
        }
        Relationships: []
      }
      campaign_variants: {
        Row: {
          id: string
          campaign_id: string
          name: string
          template_id: string | null
          template_message: string | null
          media_url: string | null
          weight: number
          sent_count: number
          delivered_count: number
          read_count: number
          failed_count: number
          created_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          name?: string
          template_id?: string | null
          template_message?: string | null
          media_url?: string | null
          weight?: number
          sent_count?: number
          delivered_count?: number
          read_count?: number
          failed_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          name?: string
          template_id?: string | null
          template_message?: string | null
          media_url?: string | null
          weight?: number
          sent_count?: number
          delivered_count?: number
          read_count?: number
          failed_count?: number
          created_at?: string
        }
        Relationships: []
      }
      daily_analytics: {
        Row: {
          id: string
          org_id: string
          date: string
          messages_sent: number
          messages_delivered: number
          messages_read: number
          messages_failed: number
          messages_inbound: number
          conversations_created: number
          contacts_created: number
          avg_response_time_min: number | null
        }
        Insert: {
          id?: string
          org_id: string
          date: string
          messages_sent?: number
          messages_delivered?: number
          messages_read?: number
          messages_failed?: number
          messages_inbound?: number
          conversations_created?: number
          contacts_created?: number
          avg_response_time_min?: number | null
        }
        Update: {
          id?: string
          org_id?: string
          date?: string
          messages_sent?: number
          messages_delivered?: number
          messages_read?: number
          messages_failed?: number
          messages_inbound?: number
          conversations_created?: number
          contacts_created?: number
          avg_response_time_min?: number | null
        }
        Relationships: []
      }
      pii_encryption_keys: {
        Row: {
          id: string
          org_id: string
          key_ciphertext: string
          key_hint: string | null
          status: string
          created_by: string | null
          created_at: string
          rotated_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          key_ciphertext: string
          key_hint?: string | null
          status?: string
          created_by?: string | null
          created_at?: string
          rotated_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          key_ciphertext?: string
          key_hint?: string | null
          status?: string
          created_by?: string | null
          created_at?: string
          rotated_at?: string | null
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          id: string
          org_id: string
          contact_id: string | null
          user_identifier: string
          consent_version: string
          purpose: string
          consented_at: string
          withdrawn_at: string | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          contact_id?: string | null
          user_identifier: string
          consent_version?: string
          purpose?: string
          consented_at?: string
          withdrawn_at?: string | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          contact_id?: string | null
          user_identifier?: string
          consent_version?: string
          purpose?: string
          consented_at?: string
          withdrawn_at?: string | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Relationships: []
      }
      data_requests: {
        Row: {
          id: string
          org_id: string
          contact_id: string | null
          requested_by_phone: string | null
          request_type: string
          status: string
          due_date: string
          completed_at: string | null
          admin_notes: string | null
          details: Json
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          contact_id?: string | null
          requested_by_phone?: string | null
          request_type: string
          status?: string
          due_date?: string
          completed_at?: string | null
          admin_notes?: string | null
          details?: Json
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          contact_id?: string | null
          requested_by_phone?: string | null
          request_type?: string
          status?: string
          due_date?: string
          completed_at?: string | null
          admin_notes?: string | null
          details?: Json
          created_at?: string
        }
        Relationships: []
      }
      breach_notifications: {
        Row: {
          id: string
          org_id: string
          triggered_by: string
          title: string
          description: string
          impact: string
          remedial_steps: string
          dpo_contact: string
          affected_count: number
          notified_board: boolean
          notified_principals: boolean
          triggered_at: string
        }
        Insert: {
          id?: string
          org_id: string
          triggered_by: string
          title: string
          description: string
          impact: string
          remedial_steps: string
          dpo_contact: string
          affected_count?: number
          notified_board?: boolean
          notified_principals?: boolean
          triggered_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          triggered_by?: string
          title?: string
          description?: string
          impact?: string
          remedial_steps?: string
          dpo_contact?: string
          affected_count?: number
          notified_board?: boolean
          notified_principals?: boolean
          triggered_at?: string
        }
        Relationships: []
      }
      pii_access_log: {
        Row: {
          id: string
          org_id: string
          user_id: string | null
          contact_id: string | null
          table_name: string
          column_name: string
          purpose: string
          accessed_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id?: string | null
          contact_id?: string | null
          table_name: string
          column_name: string
          purpose?: string
          accessed_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string | null
          contact_id?: string | null
          table_name?: string
          column_name?: string
          purpose?: string
          accessed_at?: string
        }
        Relationships: []
      }
      contact_segments: {
        Row: {
          id: string
          org_id: string
          name: string
          description: string | null
          filters: Json
          contact_count: number
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          description?: string | null
          filters?: Json
          contact_count?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          description?: string | null
          filters?: Json
          contact_count?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: {
        Args: {
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: {
          _user_id: string
          _org_id: string
        }
        Returns: boolean
      }
      has_org_role: {
        Args: {
          _user_id: string
          _org_id: string
          _role: Database["public"]["Enums"]["org_role"]
        }
        Returns: boolean
      }
      get_user_org_ids: {
        Args: {
          _user_id: string
        }
        Returns: string[]
      }
      encrypt_pii_value: {
        Args: {
          p_org_id: string
          plaintext: string
        }
        Returns: string
      }
      decrypt_pii_value: {
        Args: {
          p_org_id: string
          ciphertext: string
        }
        Returns: string
      }
      get_contact_decrypted: {
        Args: {
          p_contact_id: string
          p_purpose?: string
        }
        Returns: Json
      }
      encrypt_key_for_storage: {
        Args: {
          p_org_id: string
          p_key: string
          p_master: string
          p_user_id: string
          p_hint: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "platform_admin"
      org_role: "admin" | "member"
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
      app_role: ["admin", "user", "platform_admin"],
      org_role: ["admin", "member"],
    },
  },
} as const
