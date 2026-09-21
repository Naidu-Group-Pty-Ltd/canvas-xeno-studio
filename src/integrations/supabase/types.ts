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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_folders: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          parent_id: string | null
          project_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          parent_id?: string | null
          project_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          parent_id?: string | null
          project_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_folders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "asset_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_type: Database["public"]["Enums"]["asset_type"]
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          file_size: number | null
          folder_id: string | null
          generation_id: string | null
          height: number | null
          id: string
          is_favorite: boolean
          metadata: Json
          mime_type: string | null
          project_id: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          storage_bucket: string
          storage_path: string
          title: string | null
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          asset_type: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          file_size?: number | null
          folder_id?: string | null
          generation_id?: string | null
          height?: number | null
          id?: string
          is_favorite?: boolean
          metadata?: Json
          mime_type?: string | null
          project_id?: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          storage_bucket: string
          storage_path: string
          title?: string | null
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          asset_type?: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          file_size?: number | null
          folder_id?: string | null
          generation_id?: string | null
          height?: number | null
          id?: string
          is_favorite?: boolean
          metadata?: Json
          mime_type?: string | null
          project_id?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          storage_bucket?: string
          storage_path?: string
          title?: string | null
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "asset_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_events: {
        Row: {
          created_at: string
          event_type: string
          generation_id: string
          id: string
          payload: Json
        }
        Insert: {
          created_at?: string
          event_type: string
          generation_id: string
          id?: string
          payload?: Json
        }
        Update: {
          created_at?: string
          event_type?: string
          generation_id?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "generation_events_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_inputs: {
        Row: {
          asset_id: string | null
          created_at: string
          generation_id: string
          hf_public_url: string | null
          id: string
          input_type: Database["public"]["Enums"]["input_role"]
          metadata: Json
          position: number
          storage_bucket: string | null
          storage_path: string | null
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          generation_id: string
          hf_public_url?: string | null
          id?: string
          input_type: Database["public"]["Enums"]["input_role"]
          metadata?: Json
          position?: number
          storage_bucket?: string | null
          storage_path?: string | null
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          generation_id?: string
          hf_public_url?: string | null
          id?: string
          input_type?: Database["public"]["Enums"]["input_role"]
          metadata?: Json
          position?: number
          storage_bucket?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_inputs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_inputs_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          actual_cost_usd: number | null
          client_request_id: string | null
          completed_at: string | null
          cost_source: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          estimated_cost_usd: number | null
          generation_group_id: string | null
          hf_cancel_url: string | null
          hf_request_id: string | null
          hf_status_url: string | null
          id: string
          ingest_status: Database["public"]["Enums"]["ingest_status"]
          last_polled_at: string | null
          model_path: string
          model_registry_id: string
          operation: Database["public"]["Enums"]["operation_type"]
          parameters: Json
          parent_generation_id: string | null
          poll_attempts: number
          project_id: string | null
          prompt: string | null
          provider: string
          provider_response: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["generation_status"]
          submission_started_at: string | null
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_cost_usd?: number | null
          client_request_id?: string | null
          completed_at?: string | null
          cost_source?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          generation_group_id?: string | null
          hf_cancel_url?: string | null
          hf_request_id?: string | null
          hf_status_url?: string | null
          id?: string
          ingest_status?: Database["public"]["Enums"]["ingest_status"]
          last_polled_at?: string | null
          model_path: string
          model_registry_id: string
          operation: Database["public"]["Enums"]["operation_type"]
          parameters?: Json
          parent_generation_id?: string | null
          poll_attempts?: number
          project_id?: string | null
          prompt?: string | null
          provider?: string
          provider_response?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["generation_status"]
          submission_started_at?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_cost_usd?: number | null
          client_request_id?: string | null
          completed_at?: string | null
          cost_source?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          generation_group_id?: string | null
          hf_cancel_url?: string | null
          hf_request_id?: string | null
          hf_status_url?: string | null
          id?: string
          ingest_status?: Database["public"]["Enums"]["ingest_status"]
          last_polled_at?: string | null
          model_path?: string
          model_registry_id?: string
          operation?: Database["public"]["Enums"]["operation_type"]
          parameters?: Json
          parent_generation_id?: string | null
          poll_attempts?: number
          project_id?: string | null
          prompt?: string | null
          provider?: string
          provider_response?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["generation_status"]
          submission_started_at?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generations_model_registry_id_fkey"
            columns: ["model_registry_id"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_parent_generation_id_fkey"
            columns: ["parent_generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      model_registry: {
        Row: {
          capabilities: Json
          created_at: string
          default_parameters: Json
          description: string | null
          display_name: string
          family: string
          id: string
          is_active: boolean
          model_path: string
          operation: Database["public"]["Enums"]["operation_type"]
          output_type: Database["public"]["Enums"]["asset_type"]
          parameter_schema: Json
          provider: string
          recommended_for: string | null
          sort_order: number
          ui_schema: Json
          updated_at: string
        }
        Insert: {
          capabilities?: Json
          created_at?: string
          default_parameters?: Json
          description?: string | null
          display_name: string
          family: string
          id?: string
          is_active?: boolean
          model_path: string
          operation: Database["public"]["Enums"]["operation_type"]
          output_type: Database["public"]["Enums"]["asset_type"]
          parameter_schema?: Json
          provider?: string
          recommended_for?: string | null
          sort_order?: number
          ui_schema?: Json
          updated_at?: string
        }
        Update: {
          capabilities?: Json
          created_at?: string
          default_parameters?: Json
          description?: string | null
          display_name?: string
          family?: string
          id?: string
          is_active?: boolean
          model_path?: string
          operation?: Database["public"]["Enums"]["operation_type"]
          output_type?: Database["public"]["Enums"]["asset_type"]
          parameter_schema?: Json
          provider?: string
          recommended_for?: string | null
          sort_order?: number
          ui_schema?: Json
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_archived: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_archived?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_ledger: {
        Row: {
          actual_cost_usd: number | null
          billing_status: string
          created_at: string
          estimated_cost_usd: number | null
          generation_id: string
          id: string
          model_registry_id: string
          user_id: string
        }
        Insert: {
          actual_cost_usd?: number | null
          billing_status?: string
          created_at?: string
          estimated_cost_usd?: number | null
          generation_id: string
          id?: string
          model_registry_id: string
          user_id: string
        }
        Update: {
          actual_cost_usd?: number | null
          billing_status?: string
          created_at?: string
          estimated_cost_usd?: number | null
          generation_id?: string
          id?: string
          model_registry_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_ledger_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: true
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_ledger_model_registry_id_fkey"
            columns: ["model_registry_id"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_active_member: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "member"
      asset_type: "image" | "video" | "audio"
      generation_status:
        | "draft"
        | "estimating"
        | "ready"
        | "local_queued"
        | "submitting"
        | "submission_uncertain"
        | "queued"
        | "in_progress"
        | "completed"
        | "failed"
        | "nsfw"
        | "canceled"
      ingest_status:
        | "not_required"
        | "pending"
        | "processing"
        | "completed"
        | "failed"
      input_role:
        | "image"
        | "video"
        | "audio"
        | "first_frame"
        | "last_frame"
        | "reference"
        | "source"
      operation_type:
        | "text-to-image"
        | "image-to-image"
        | "text-to-video"
        | "image-to-video"
        | "reference-to-video"
        | "video-to-video"
        | "video-extend"
        | "video-edit"
        | "motion-transfer"
        | "object-swap"
        | "motion-control"
        | "cinematic-video"
        | "image-edit"
      source_type: "generated" | "uploaded"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "member"],
      asset_type: ["image", "video", "audio"],
      generation_status: [
        "draft",
        "estimating",
        "ready",
        "local_queued",
        "submitting",
        "submission_uncertain",
        "queued",
        "in_progress",
        "completed",
        "failed",
        "nsfw",
        "canceled",
      ],
      ingest_status: [
        "not_required",
        "pending",
        "processing",
        "completed",
        "failed",
      ],
      input_role: [
        "image",
        "video",
        "audio",
        "first_frame",
        "last_frame",
        "reference",
        "source",
      ],
      operation_type: [
        "text-to-image",
        "image-to-image",
        "text-to-video",
        "image-to-video",
        "reference-to-video",
        "video-to-video",
        "video-extend",
        "video-edit",
        "motion-transfer",
        "object-swap",
        "motion-control",
        "cinematic-video",
        "image-edit",
      ],
      source_type: ["generated", "uploaded"],
    },
  },
} as const
