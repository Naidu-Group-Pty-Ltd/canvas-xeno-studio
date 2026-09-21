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
      arena_entries: {
        Row: {
          created_at: string
          estimated_cost_usd: number | null
          generation_id: string | null
          id: string
          model_registry_id: string
          session_id: string
        }
        Insert: {
          created_at?: string
          estimated_cost_usd?: number | null
          generation_id?: string | null
          id?: string
          model_registry_id: string
          session_id: string
        }
        Update: {
          created_at?: string
          estimated_cost_usd?: number | null
          generation_id?: string | null
          id?: string
          model_registry_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arena_entries_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_entries_model_registry_id_fkey"
            columns: ["model_registry_id"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "arena_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      arena_sessions: {
        Row: {
          blind_review: boolean
          created_at: string
          created_by: string
          estimated_cost_usd: number | null
          id: string
          media_type: string
          parameters: Json
          project_id: string | null
          prompt: string
          status: string
        }
        Insert: {
          blind_review?: boolean
          created_at?: string
          created_by: string
          estimated_cost_usd?: number | null
          id?: string
          media_type?: string
          parameters?: Json
          project_id?: string | null
          prompt: string
          status?: string
        }
        Update: {
          blind_review?: boolean
          created_at?: string
          created_by?: string
          estimated_cost_usd?: number | null
          id?: string
          media_type?: string
          parameters?: Json
          project_id?: string | null
          prompt?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "arena_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      arena_votes: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          is_winner: boolean
          notes: string | null
          scores: Json
          session_id: string
          voter_id: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          is_winner?: boolean
          notes?: string | null
          scores?: Json
          session_id: string
          voter_id: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          is_winner?: boolean
          notes?: string | null
          scores?: Json
          session_id?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arena_votes_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "arena_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_votes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "arena_sessions"
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
      campaigns: {
        Row: {
          budget_usd: number | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_archived: boolean
          metadata: Json
          name: string
          objective: string | null
          project_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          budget_usd?: number | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_archived?: boolean
          metadata?: Json
          name: string
          objective?: string | null
          project_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          budget_usd?: number | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_archived?: boolean
          metadata?: Json
          name?: string
          objective?: string | null
          project_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      continuity_pack_items: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          pack_id: string
          position: number
          role: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          pack_id: string
          position?: number
          role?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          pack_id?: string
          position?: number
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "continuity_pack_items_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "continuity_pack_items_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "continuity_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      continuity_packs: {
        Row: {
          attributes: Json
          created_at: string
          created_by: string
          description: string | null
          guidance: string | null
          id: string
          name: string
          pack_type: string
          project_id: string | null
          updated_at: string
        }
        Insert: {
          attributes?: Json
          created_at?: string
          created_by: string
          description?: string | null
          guidance?: string | null
          id?: string
          name: string
          pack_type?: string
          project_id?: string | null
          updated_at?: string
        }
        Update: {
          attributes?: Json
          created_at?: string
          created_by?: string
          description?: string | null
          guidance?: string | null
          id?: string
          name?: string
          pack_type?: string
          project_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "continuity_packs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      director_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json
          role: string
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json
          role: string
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "director_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "director_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      director_sessions: {
        Row: {
          campaign_id: string | null
          created_at: string
          created_by: string
          id: string
          project_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          project_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "director_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          key: string
          label: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          key: string
          label: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          key?: string
          label?: string
          updated_at?: string
        }
        Relationships: []
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
      model_performance_metrics: {
        Row: {
          aspect_ratio: string | null
          average_actual_cost: number | null
          average_estimated_cost: number | null
          average_latency_seconds: number | null
          average_user_rating: number | null
          benchmark_score: number | null
          failure_rate: number | null
          id: string
          model_registry_id: string
          operation: string
          resolution: string | null
          sample_count: number
          selection_rate: number | null
          success_rate: number | null
          updated_at: string
        }
        Insert: {
          aspect_ratio?: string | null
          average_actual_cost?: number | null
          average_estimated_cost?: number | null
          average_latency_seconds?: number | null
          average_user_rating?: number | null
          benchmark_score?: number | null
          failure_rate?: number | null
          id?: string
          model_registry_id: string
          operation: string
          resolution?: string | null
          sample_count?: number
          selection_rate?: number | null
          success_rate?: number | null
          updated_at?: string
        }
        Update: {
          aspect_ratio?: string | null
          average_actual_cost?: number | null
          average_estimated_cost?: number | null
          average_latency_seconds?: number | null
          average_user_rating?: number | null
          benchmark_score?: number | null
          failure_rate?: number | null
          id?: string
          model_registry_id?: string
          operation?: string
          resolution?: string | null
          sample_count?: number
          selection_rate?: number | null
          success_rate?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_performance_metrics_model_registry_id_fkey"
            columns: ["model_registry_id"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      model_registry: {
        Row: {
          auth_mode: string
          benchmark_enabled: boolean
          capabilities: Json
          capability_tags: string[]
          created_at: string
          default_parameters: Json
          description: string | null
          display_name: string
          documentation_status: string
          family: string
          id: string
          is_active: boolean
          max_reference_audio: number
          max_reference_images: number
          max_reference_videos: number
          metadata: Json
          model_family: string | null
          model_path: string
          operation: Database["public"]["Enums"]["operation_type"]
          output_type: Database["public"]["Enums"]["asset_type"]
          parameter_schema: Json
          pricing_mode: string
          provider: string
          provider_family: string | null
          recommended_for: string | null
          router_enabled: boolean
          sort_order: number
          supports_audio_input: boolean
          supports_batch: boolean
          supports_cancel: boolean
          supports_edit: boolean
          supports_extend: boolean
          supports_first_frame: boolean
          supports_image_input: boolean
          supports_last_frame: boolean
          supports_native_audio: boolean
          supports_seed: boolean
          supports_text: boolean
          supports_video_input: boolean
          transport_strategy: string
          ui_schema: Json
          updated_at: string
        }
        Insert: {
          auth_mode?: string
          benchmark_enabled?: boolean
          capabilities?: Json
          capability_tags?: string[]
          created_at?: string
          default_parameters?: Json
          description?: string | null
          display_name: string
          documentation_status?: string
          family: string
          id?: string
          is_active?: boolean
          max_reference_audio?: number
          max_reference_images?: number
          max_reference_videos?: number
          metadata?: Json
          model_family?: string | null
          model_path: string
          operation: Database["public"]["Enums"]["operation_type"]
          output_type: Database["public"]["Enums"]["asset_type"]
          parameter_schema?: Json
          pricing_mode?: string
          provider?: string
          provider_family?: string | null
          recommended_for?: string | null
          router_enabled?: boolean
          sort_order?: number
          supports_audio_input?: boolean
          supports_batch?: boolean
          supports_cancel?: boolean
          supports_edit?: boolean
          supports_extend?: boolean
          supports_first_frame?: boolean
          supports_image_input?: boolean
          supports_last_frame?: boolean
          supports_native_audio?: boolean
          supports_seed?: boolean
          supports_text?: boolean
          supports_video_input?: boolean
          transport_strategy?: string
          ui_schema?: Json
          updated_at?: string
        }
        Update: {
          auth_mode?: string
          benchmark_enabled?: boolean
          capabilities?: Json
          capability_tags?: string[]
          created_at?: string
          default_parameters?: Json
          description?: string | null
          display_name?: string
          documentation_status?: string
          family?: string
          id?: string
          is_active?: boolean
          max_reference_audio?: number
          max_reference_images?: number
          max_reference_videos?: number
          metadata?: Json
          model_family?: string | null
          model_path?: string
          operation?: Database["public"]["Enums"]["operation_type"]
          output_type?: Database["public"]["Enums"]["asset_type"]
          parameter_schema?: Json
          pricing_mode?: string
          provider?: string
          provider_family?: string | null
          recommended_for?: string | null
          router_enabled?: boolean
          sort_order?: number
          supports_audio_input?: boolean
          supports_batch?: boolean
          supports_cancel?: boolean
          supports_edit?: boolean
          supports_extend?: boolean
          supports_first_frame?: boolean
          supports_image_input?: boolean
          supports_last_frame?: boolean
          supports_native_audio?: boolean
          supports_seed?: boolean
          supports_text?: boolean
          supports_video_input?: boolean
          transport_strategy?: string
          ui_schema?: Json
          updated_at?: string
        }
        Relationships: []
      }
      operation_dependencies: {
        Row: {
          created_at: string
          dependency_mode: string
          depends_on_operation_id: string
          operation_id: string
        }
        Insert: {
          created_at?: string
          dependency_mode?: string
          depends_on_operation_id: string
          operation_id: string
        }
        Update: {
          created_at?: string
          dependency_mode?: string
          depends_on_operation_id?: string
          operation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_dependencies_depends_on_operation_id_fkey"
            columns: ["depends_on_operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_dependencies_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          operation_id: string
          payload: Json
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          operation_id: string
          payload?: Json
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          operation_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "operation_events_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      operations: {
        Row: {
          actual_cost_usd: number | null
          attempt: number
          campaign_id: string | null
          canceled_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          dedupe_key: string | null
          dispatch_started_at: string | null
          error_code: string | null
          error_message: string | null
          estimated_cost_usd: number | null
          failed_at: string | null
          generation_group_id: string | null
          generation_id: string | null
          id: string
          input_payload: Json
          max_attempts: number
          model_registry_id: string | null
          normalized_input: Json
          operation_type: string
          output_payload: Json | null
          parent_operation_id: string | null
          priority: number
          project_id: string | null
          provider: string | null
          provider_cancel_url: string | null
          provider_request_id: string | null
          provider_status_url: string | null
          queued_at: string | null
          retry_policy: Json
          root_operation_id: string | null
          scene_id: string | null
          shot_id: string | null
          started_at: string | null
          status: string
          storyboard_id: string | null
          submitted_at: string | null
          updated_at: string
          workflow_node_id: string | null
          workflow_run_id: string | null
        }
        Insert: {
          actual_cost_usd?: number | null
          attempt?: number
          campaign_id?: string | null
          canceled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          dedupe_key?: string | null
          dispatch_started_at?: string | null
          error_code?: string | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          failed_at?: string | null
          generation_group_id?: string | null
          generation_id?: string | null
          id?: string
          input_payload?: Json
          max_attempts?: number
          model_registry_id?: string | null
          normalized_input?: Json
          operation_type: string
          output_payload?: Json | null
          parent_operation_id?: string | null
          priority?: number
          project_id?: string | null
          provider?: string | null
          provider_cancel_url?: string | null
          provider_request_id?: string | null
          provider_status_url?: string | null
          queued_at?: string | null
          retry_policy?: Json
          root_operation_id?: string | null
          scene_id?: string | null
          shot_id?: string | null
          started_at?: string | null
          status?: string
          storyboard_id?: string | null
          submitted_at?: string | null
          updated_at?: string
          workflow_node_id?: string | null
          workflow_run_id?: string | null
        }
        Update: {
          actual_cost_usd?: number | null
          attempt?: number
          campaign_id?: string | null
          canceled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          dedupe_key?: string | null
          dispatch_started_at?: string | null
          error_code?: string | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          failed_at?: string | null
          generation_group_id?: string | null
          generation_id?: string | null
          id?: string
          input_payload?: Json
          max_attempts?: number
          model_registry_id?: string | null
          normalized_input?: Json
          operation_type?: string
          output_payload?: Json | null
          parent_operation_id?: string | null
          priority?: number
          project_id?: string | null
          provider?: string | null
          provider_cancel_url?: string | null
          provider_request_id?: string | null
          provider_status_url?: string | null
          queued_at?: string | null
          retry_policy?: Json
          root_operation_id?: string | null
          scene_id?: string | null
          shot_id?: string | null
          started_at?: string | null
          status?: string
          storyboard_id?: string | null
          submitted_at?: string | null
          updated_at?: string
          workflow_node_id?: string | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_model_registry_id_fkey"
            columns: ["model_registry_id"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_parent_operation_id_fkey"
            columns: ["parent_operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_storyboard_id_fkey"
            columns: ["storyboard_id"]
            isOneToOne: false
            referencedRelation: "storyboards"
            referencedColumns: ["id"]
          },
        ]
      }
      production_plan_versions: {
        Row: {
          change_summary: string | null
          created_at: string
          created_by: string | null
          id: string
          plan: Json
          plan_id: string
          version: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          plan: Json
          plan_id: string
          version: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          plan?: Json
          plan_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_plan_versions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "production_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      production_plans: {
        Row: {
          campaign_id: string | null
          created_at: string
          created_by: string
          id: string
          plan: Json
          project_id: string | null
          session_id: string | null
          status: string
          storyboard_id: string | null
          title: string
          total_estimated_cost_usd: number | null
          updated_at: string
          version: number
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          plan: Json
          project_id?: string | null
          session_id?: string | null
          status?: string
          storyboard_id?: string | null
          title: string
          total_estimated_cost_usd?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          plan?: Json
          project_id?: string | null
          session_id?: string | null
          status?: string
          storyboard_id?: string | null
          title?: string
          total_estimated_cost_usd?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_plans_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "director_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_plans_storyboard_id_fkey"
            columns: ["storyboard_id"]
            isOneToOne: false
            referencedRelation: "storyboards"
            referencedColumns: ["id"]
          },
        ]
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
      scenes: {
        Row: {
          continuity_requirements: string | null
          created_at: string
          environment: string | null
          id: string
          name: string
          purpose: string | null
          scene_number: number
          storyboard_id: string
          updated_at: string
        }
        Insert: {
          continuity_requirements?: string | null
          created_at?: string
          environment?: string | null
          id?: string
          name: string
          purpose?: string | null
          scene_number: number
          storyboard_id: string
          updated_at?: string
        }
        Update: {
          continuity_requirements?: string | null
          created_at?: string
          environment?: string | null
          id?: string
          name?: string
          purpose?: string | null
          scene_number?: number
          storyboard_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenes_storyboard_id_fkey"
            columns: ["storyboard_id"]
            isOneToOne: false
            referencedRelation: "storyboards"
            referencedColumns: ["id"]
          },
        ]
      }
      shot_takes: {
        Row: {
          asset_id: string | null
          created_at: string
          created_by: string | null
          generation_id: string | null
          id: string
          is_selected: boolean
          notes: string | null
          rating: number | null
          shot_id: string
          take_number: number
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          created_by?: string | null
          generation_id?: string | null
          id?: string
          is_selected?: boolean
          notes?: string | null
          rating?: number | null
          shot_id: string
          take_number: number
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          created_by?: string | null
          generation_id?: string | null
          id?: string
          is_selected?: boolean
          notes?: string | null
          rating?: number | null
          shot_id?: string
          take_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "shot_takes_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shot_takes_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shot_takes_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      shots: {
        Row: {
          created_at: string
          description: string | null
          duration_seconds: number | null
          estimated_cost_usd: number | null
          id: string
          name: string | null
          operation_type: string | null
          prompt: string | null
          recommended_model_id: string | null
          scene_id: string
          selected_take_id: string | null
          shot_number: number
          spec: Json
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          estimated_cost_usd?: number | null
          id?: string
          name?: string | null
          operation_type?: string | null
          prompt?: string | null
          recommended_model_id?: string | null
          scene_id: string
          selected_take_id?: string | null
          shot_number: number
          spec?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          estimated_cost_usd?: number | null
          id?: string
          name?: string | null
          operation_type?: string | null
          prompt?: string | null
          recommended_model_id?: string | null
          scene_id?: string
          selected_take_id?: string | null
          shot_number?: number
          spec?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shots_recommended_model_id_fkey"
            columns: ["recommended_model_id"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shots_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      storyboards: {
        Row: {
          campaign_id: string | null
          created_at: string
          created_by: string
          creative_direction: Json
          id: string
          objective: string | null
          primary_aspect_ratio: string | null
          project_id: string | null
          status: string
          target_duration_seconds: number | null
          title: string
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          created_by: string
          creative_direction?: Json
          id?: string
          objective?: string | null
          primary_aspect_ratio?: string | null
          project_id?: string | null
          status?: string
          target_duration_seconds?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          created_by?: string
          creative_direction?: Json
          id?: string
          objective?: string | null
          primary_aspect_ratio?: string | null
          project_id?: string | null
          status?: string
          target_duration_seconds?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storyboards_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storyboards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      workflow_edges: {
        Row: {
          condition: Json | null
          id: string
          source_node_key: string
          target_node_key: string
          version: number
          workflow_template_id: string
        }
        Insert: {
          condition?: Json | null
          id?: string
          source_node_key: string
          target_node_key: string
          version?: number
          workflow_template_id: string
        }
        Update: {
          condition?: Json | null
          id?: string
          source_node_key?: string
          target_node_key?: string
          version?: number
          workflow_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_edges_workflow_template_id_fkey"
            columns: ["workflow_template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_nodes: {
        Row: {
          config: Json
          id: string
          label: string | null
          node_key: string
          node_type: string
          position: Json
          version: number
          workflow_template_id: string
        }
        Insert: {
          config?: Json
          id?: string
          label?: string | null
          node_key: string
          node_type: string
          position?: Json
          version?: number
          workflow_template_id: string
        }
        Update: {
          config?: Json
          id?: string
          label?: string | null
          node_key?: string
          node_type?: string
          position?: Json
          version?: number
          workflow_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_nodes_workflow_template_id_fkey"
            columns: ["workflow_template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          actual_cost_usd: number | null
          campaign_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          estimated_cost_usd: number | null
          id: string
          input_payload: Json
          project_id: string | null
          started_at: string | null
          status: string
          workflow_template_id: string
          workflow_version: number
        }
        Insert: {
          actual_cost_usd?: number | null
          campaign_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          estimated_cost_usd?: number | null
          id?: string
          input_payload?: Json
          project_id?: string | null
          started_at?: string | null
          status?: string
          workflow_template_id: string
          workflow_version?: number
        }
        Update: {
          actual_cost_usd?: number | null
          campaign_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          estimated_cost_usd?: number | null
          id?: string
          input_payload?: Json
          project_id?: string | null
          started_at?: string | null
          status?: string
          workflow_template_id?: string
          workflow_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_template_id_fkey"
            columns: ["workflow_template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          current_version: number
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_ready_operations: {
        Args: { claim_limit?: number }
        Returns: {
          actual_cost_usd: number | null
          attempt: number
          campaign_id: string | null
          canceled_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          dedupe_key: string | null
          dispatch_started_at: string | null
          error_code: string | null
          error_message: string | null
          estimated_cost_usd: number | null
          failed_at: string | null
          generation_group_id: string | null
          generation_id: string | null
          id: string
          input_payload: Json
          max_attempts: number
          model_registry_id: string | null
          normalized_input: Json
          operation_type: string
          output_payload: Json | null
          parent_operation_id: string | null
          priority: number
          project_id: string | null
          provider: string | null
          provider_cancel_url: string | null
          provider_request_id: string | null
          provider_status_url: string | null
          queued_at: string | null
          retry_policy: Json
          root_operation_id: string | null
          scene_id: string | null
          shot_id: string | null
          started_at: string | null
          status: string
          storyboard_id: string | null
          submitted_at: string | null
          updated_at: string
          workflow_node_id: string | null
          workflow_run_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "operations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
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
