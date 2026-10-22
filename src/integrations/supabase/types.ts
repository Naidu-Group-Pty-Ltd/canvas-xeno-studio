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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      api_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash?: string
          token_prefix?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          created_by: string | null
          id: string
          name: string
          parent_id: string | null
          project_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          parent_id?: string | null
          project_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
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
      audio_preparations: {
        Row: {
          analysis: Json | null
          attempts: number
          completed_at: string | null
          consent: Json | null
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          error_code: string | null
          error_message: string | null
          id: string
          media_task_id: string | null
          prepared_asset_id: string | null
          project_id: string | null
          sample_rate: number | null
          samples: number | null
          source_asset_id: string
          speech_storage_bucket: string | null
          speech_storage_path: string | null
          status: string
          transcript: string | null
          transcript_status: string
          updated_at: string
          words: Json | null
        }
        Insert: {
          analysis?: Json | null
          attempts?: number
          completed_at?: string | null
          consent?: Json | null
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          media_task_id?: string | null
          prepared_asset_id?: string | null
          project_id?: string | null
          sample_rate?: number | null
          samples?: number | null
          source_asset_id: string
          speech_storage_bucket?: string | null
          speech_storage_path?: string | null
          status?: string
          transcript?: string | null
          transcript_status?: string
          updated_at?: string
          words?: Json | null
        }
        Update: {
          analysis?: Json | null
          attempts?: number
          completed_at?: string | null
          consent?: Json | null
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          media_task_id?: string | null
          prepared_asset_id?: string | null
          project_id?: string | null
          sample_rate?: number | null
          samples?: number | null
          source_asset_id?: string
          speech_storage_bucket?: string | null
          speech_storage_path?: string | null
          status?: string
          transcript?: string | null
          transcript_status?: string
          updated_at?: string
          words?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audio_preparations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_preparations_media_task_id_fkey"
            columns: ["media_task_id"]
            isOneToOne: false
            referencedRelation: "media_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_preparations_prepared_asset_id_fkey"
            columns: ["prepared_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_preparations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_preparations_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_asset_relationships: {
        Row: {
          created_at: string
          id: string
          relationship: string
          source_asset_id: string
          target_asset_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          relationship: string
          source_asset_id: string
          target_asset_id: string
        }
        Update: {
          created_at?: string
          id?: string
          relationship?: string
          source_asset_id?: string
          target_asset_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_asset_relationships_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "avatar_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_asset_relationships_target_asset_id_fkey"
            columns: ["target_asset_id"]
            isOneToOne: false
            referencedRelation: "avatar_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_assets: {
        Row: {
          asset_role: string
          asset_type: string
          consent_required: boolean
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          file_size: number | null
          folder_id: string | null
          height: number | null
          id: string
          metadata: Json
          mime_type: string | null
          project_id: string | null
          provider_asset_id: string | null
          provider_url: string | null
          sensitivity: string
          source_type: string
          storage_bucket: string
          storage_path: string
          title: string | null
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          asset_role?: string
          asset_type: string
          consent_required?: boolean
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          file_size?: number | null
          folder_id?: string | null
          height?: number | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          project_id?: string | null
          provider_asset_id?: string | null
          provider_url?: string | null
          sensitivity?: string
          source_type?: string
          storage_bucket: string
          storage_path: string
          title?: string | null
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          asset_role?: string
          asset_type?: string
          consent_required?: boolean
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          file_size?: number | null
          folder_id?: string | null
          height?: number | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          project_id?: string | null
          provider_asset_id?: string | null
          provider_url?: string | null
          sensitivity?: string
          source_type?: string
          storage_bucket?: string
          storage_path?: string
          title?: string | null
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "avatar_assets_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "avatar_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "avatar_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_assets_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_characters: {
        Row: {
          avatar_type: string
          created_at: string
          created_by: string | null
          default_voice_id: string | null
          deleted_at: string | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          local_consent_status: string
          ownership_type: string
          preview_asset_id: string | null
          preview_url: string | null
          project_id: string | null
          provider: string
          provider_consent_status: string | null
          provider_group_id: string | null
          provider_payload: Json
          provider_training_status: string | null
          updated_at: string
        }
        Insert: {
          avatar_type?: string
          created_at?: string
          created_by?: string | null
          default_voice_id?: string | null
          deleted_at?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          local_consent_status?: string
          ownership_type?: string
          preview_asset_id?: string | null
          preview_url?: string | null
          project_id?: string | null
          provider?: string
          provider_consent_status?: string | null
          provider_group_id?: string | null
          provider_payload?: Json
          provider_training_status?: string | null
          updated_at?: string
        }
        Update: {
          avatar_type?: string
          created_at?: string
          created_by?: string | null
          default_voice_id?: string | null
          deleted_at?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          local_consent_status?: string
          ownership_type?: string
          preview_asset_id?: string | null
          preview_url?: string | null
          project_id?: string | null
          provider?: string
          provider_consent_status?: string | null
          provider_group_id?: string | null
          provider_payload?: Json
          provider_training_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_characters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_characters_default_voice_fk"
            columns: ["default_voice_id"]
            isOneToOne: false
            referencedRelation: "avatar_voices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_characters_preview_asset_id_fkey"
            columns: ["preview_asset_id"]
            isOneToOne: false
            referencedRelation: "avatar_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_characters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "avatar_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_consents: {
        Row: {
          asset_id: string | null
          attested_at: string | null
          attested_by: string | null
          character_id: string | null
          consent_category: string
          consent_method: string
          created_at: string
          id: string
          internal_attestation: string | null
          permission_description: string | null
          provider_consent_expires_at: string | null
          provider_consent_id: string | null
          provider_consent_url: string | null
          provider_payload: Json
          provider_required: boolean
          provider_status: string | null
          subject_type: string
          updated_at: string
          voice_id: string | null
          workflow: string | null
        }
        Insert: {
          asset_id?: string | null
          attested_at?: string | null
          attested_by?: string | null
          character_id?: string | null
          consent_category: string
          consent_method?: string
          created_at?: string
          id?: string
          internal_attestation?: string | null
          permission_description?: string | null
          provider_consent_expires_at?: string | null
          provider_consent_id?: string | null
          provider_consent_url?: string | null
          provider_payload?: Json
          provider_required?: boolean
          provider_status?: string | null
          subject_type: string
          updated_at?: string
          voice_id?: string | null
          workflow?: string | null
        }
        Update: {
          asset_id?: string | null
          attested_at?: string | null
          attested_by?: string | null
          character_id?: string | null
          consent_category?: string
          consent_method?: string
          created_at?: string
          id?: string
          internal_attestation?: string | null
          permission_description?: string | null
          provider_consent_expires_at?: string | null
          provider_consent_id?: string | null
          provider_consent_url?: string | null
          provider_payload?: Json
          provider_required?: boolean
          provider_status?: string | null
          subject_type?: string
          updated_at?: string
          voice_id?: string | null
          workflow?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avatar_consents_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "avatar_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_consents_attested_by_fkey"
            columns: ["attested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_consents_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "avatar_characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_consents_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "avatar_voices"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_creative_bridges: {
        Row: {
          avatar_asset_id: string
          bridged_by: string | null
          created_at: string
          creative_asset_id: string | null
          id: string
        }
        Insert: {
          avatar_asset_id: string
          bridged_by?: string | null
          created_at?: string
          creative_asset_id?: string | null
          id?: string
        }
        Update: {
          avatar_asset_id?: string
          bridged_by?: string | null
          created_at?: string
          creative_asset_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_creative_bridges_avatar_asset_id_fkey"
            columns: ["avatar_asset_id"]
            isOneToOne: true
            referencedRelation: "avatar_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_creative_bridges_bridged_by_fkey"
            columns: ["bridged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          parent_id: string | null
          project_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          parent_id?: string | null
          project_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          project_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_folders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "avatar_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "avatar_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_identity_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          subject_id: string | null
          subject_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          subject_id?: string | null
          subject_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          subject_id?: string | null
          subject_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avatar_identity_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_job_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          job_id: string
          payload: Json
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          job_id: string
          payload?: Json
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          job_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "avatar_job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "avatar_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_jobs: {
        Row: {
          attempt: number
          client_request_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          idempotency_key: string | null
          input_payload: Json
          job_type: string
          last_polled_at: string | null
          normalized_input: Json
          output_payload: Json | null
          parent_job_id: string | null
          poll_attempts: number
          project_id: string | null
          provider: string
          provider_batch_id: string | null
          provider_payload: Json | null
          provider_request_id: string | null
          provider_resource_type: string | null
          queued_at: string | null
          retry_policy: Json
          started_at: string | null
          status: string
          submission_started_at: string | null
          submission_state: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          attempt?: number
          client_request_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          input_payload?: Json
          job_type: string
          last_polled_at?: string | null
          normalized_input?: Json
          output_payload?: Json | null
          parent_job_id?: string | null
          poll_attempts?: number
          project_id?: string | null
          provider?: string
          provider_batch_id?: string | null
          provider_payload?: Json | null
          provider_request_id?: string | null
          provider_resource_type?: string | null
          queued_at?: string | null
          retry_policy?: Json
          started_at?: string | null
          status?: string
          submission_started_at?: string | null
          submission_state?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          attempt?: number
          client_request_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          input_payload?: Json
          job_type?: string
          last_polled_at?: string | null
          normalized_input?: Json
          output_payload?: Json | null
          parent_job_id?: string | null
          poll_attempts?: number
          project_id?: string | null
          provider?: string
          provider_batch_id?: string | null
          provider_payload?: Json | null
          provider_request_id?: string | null
          provider_resource_type?: string | null
          queued_at?: string | null
          retry_policy?: Json
          started_at?: string | null
          status?: string
          submission_started_at?: string | null
          submission_state?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "avatar_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "avatar_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_localizations: {
        Row: {
          audio_asset_id: string | null
          caption_asset_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          job_id: string | null
          kind: string
          mode: string | null
          output_asset_id: string | null
          project_id: string | null
          provider_payload: Json
          provider_resource_id: string | null
          source_asset_id: string | null
          status: string
          target_language: string | null
        }
        Insert: {
          audio_asset_id?: string | null
          caption_asset_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          job_id?: string | null
          kind: string
          mode?: string | null
          output_asset_id?: string | null
          project_id?: string | null
          provider_payload?: Json
          provider_resource_id?: string | null
          source_asset_id?: string | null
          status?: string
          target_language?: string | null
        }
        Update: {
          audio_asset_id?: string | null
          caption_asset_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          job_id?: string | null
          kind?: string
          mode?: string | null
          output_asset_id?: string | null
          project_id?: string | null
          provider_payload?: Json
          provider_resource_id?: string | null
          source_asset_id?: string | null
          status?: string
          target_language?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avatar_localizations_audio_asset_id_fkey"
            columns: ["audio_asset_id"]
            isOneToOne: false
            referencedRelation: "avatar_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_localizations_caption_asset_id_fkey"
            columns: ["caption_asset_id"]
            isOneToOne: false
            referencedRelation: "avatar_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_localizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_localizations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "avatar_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_localizations_output_asset_id_fkey"
            columns: ["output_asset_id"]
            isOneToOne: false
            referencedRelation: "avatar_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_localizations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "avatar_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_localizations_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "avatar_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_looks: {
        Row: {
          avatar_type: string | null
          character_id: string
          created_at: string
          default_provider_voice_id: string | null
          deleted_at: string | null
          display_name: string
          id: string
          is_default: boolean
          orientation: string | null
          preview_asset_id: string | null
          preview_url: string | null
          preview_video_url: string | null
          provider_look_id: string
          provider_payload: Json
          supported_engines: Json
          training_status: string | null
          updated_at: string
        }
        Insert: {
          avatar_type?: string | null
          character_id: string
          created_at?: string
          default_provider_voice_id?: string | null
          deleted_at?: string | null
          display_name: string
          id?: string
          is_default?: boolean
          orientation?: string | null
          preview_asset_id?: string | null
          preview_url?: string | null
          preview_video_url?: string | null
          provider_look_id: string
          provider_payload?: Json
          supported_engines?: Json
          training_status?: string | null
          updated_at?: string
        }
        Update: {
          avatar_type?: string | null
          character_id?: string
          created_at?: string
          default_provider_voice_id?: string | null
          deleted_at?: string | null
          display_name?: string
          id?: string
          is_default?: boolean
          orientation?: string | null
          preview_asset_id?: string | null
          preview_url?: string | null
          preview_video_url?: string | null
          provider_look_id?: string
          provider_payload?: Json
          supported_engines?: Json
          training_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_looks_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "avatar_characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_looks_preview_asset_id_fkey"
            columns: ["preview_asset_id"]
            isOneToOne: false
            referencedRelation: "avatar_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_projects: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_archived: boolean
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_provider_webhook_events: {
        Row: {
          event_type: string | null
          id: string
          payload: Json
          payload_hash: string
          processed_at: string | null
          processing_result: string | null
          provider: string
          provider_event_id: string | null
          received_at: string
          resource_id: string | null
        }
        Insert: {
          event_type?: string | null
          id?: string
          payload?: Json
          payload_hash: string
          processed_at?: string | null
          processing_result?: string | null
          provider?: string
          provider_event_id?: string | null
          received_at?: string
          resource_id?: string | null
        }
        Update: {
          event_type?: string | null
          id?: string
          payload?: Json
          payload_hash?: string
          processed_at?: string | null
          processing_result?: string | null
          provider?: string
          provider_event_id?: string | null
          received_at?: string
          resource_id?: string | null
        }
        Relationships: []
      }
      avatar_realtime_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          session_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          session_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_realtime_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "avatar_realtime_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_realtime_personas: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          language: string
          liveavatar_avatar_id: string | null
          liveavatar_context_id: string | null
          liveavatar_voice_id: string | null
          max_session_seconds: number
          mode: string
          name: string
          system_prompt: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          language?: string
          liveavatar_avatar_id?: string | null
          liveavatar_context_id?: string | null
          liveavatar_voice_id?: string | null
          max_session_seconds?: number
          mode?: string
          name: string
          system_prompt?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          language?: string
          liveavatar_avatar_id?: string | null
          liveavatar_context_id?: string | null
          liveavatar_voice_id?: string | null
          max_session_seconds?: number
          mode?: string
          name?: string
          system_prompt?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_realtime_personas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_realtime_session_secrets: {
        Row: {
          created_at: string
          session_id: string
          session_token: string
        }
        Insert: {
          created_at?: string
          session_id: string
          session_token: string
        }
        Update: {
          created_at?: string
          session_id?: string
          session_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_realtime_session_secrets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "avatar_realtime_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_realtime_sessions: {
        Row: {
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          end_reason: string | null
          ended_at: string | null
          error_message: string | null
          id: string
          is_sandbox: boolean
          job_id: string | null
          last_heartbeat_at: string | null
          mode: string
          persona_id: string | null
          provider_session_id: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          end_reason?: string | null
          ended_at?: string | null
          error_message?: string | null
          id?: string
          is_sandbox?: boolean
          job_id?: string | null
          last_heartbeat_at?: string | null
          mode?: string
          persona_id?: string | null
          provider_session_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          end_reason?: string | null
          ended_at?: string | null
          error_message?: string | null
          id?: string
          is_sandbox?: boolean
          job_id?: string | null
          last_heartbeat_at?: string | null
          mode?: string
          persona_id?: string | null
          provider_session_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_realtime_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_realtime_sessions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "avatar_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_realtime_sessions_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "avatar_realtime_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_resource_sync: {
        Row: {
          completed_at: string | null
          counts: Json
          error_message: string | null
          id: string
          resource_type: string
          started_at: string
          started_by: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          counts?: Json
          error_message?: string | null
          id?: string
          resource_type: string
          started_at?: string
          started_by?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          counts?: Json
          error_message?: string | null
          id?: string
          resource_type?: string
          started_at?: string
          started_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_resource_sync_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_settings: {
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
            foreignKeyName: "avatar_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_usage_ledger: {
        Row: {
          actual_cost_usd: number | null
          balance_after: number | null
          balance_before: number | null
          created_at: string
          id: string
          job_id: string | null
          metadata: Json
          provider: string
          provider_credits: number | null
          quantity: number | null
          realtime_session_id: string | null
          source: string
          unit: string | null
          usage_type: string
          user_id: string | null
        }
        Insert: {
          actual_cost_usd?: number | null
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          id?: string
          job_id?: string | null
          metadata?: Json
          provider?: string
          provider_credits?: number | null
          quantity?: number | null
          realtime_session_id?: string | null
          source: string
          unit?: string | null
          usage_type: string
          user_id?: string | null
        }
        Update: {
          actual_cost_usd?: number | null
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          id?: string
          job_id?: string | null
          metadata?: Json
          provider?: string
          provider_credits?: number | null
          quantity?: number | null
          realtime_session_id?: string | null
          source?: string
          unit?: string | null
          usage_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avatar_usage_ledger_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "avatar_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_usage_ledger_realtime_session_id_fkey"
            columns: ["realtime_session_id"]
            isOneToOne: false
            referencedRelation: "avatar_realtime_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_usage_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_videos: {
        Row: {
          aspect_ratio: string | null
          audio_asset_id: string | null
          character_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          engine: string | null
          generated_asset_id: string | null
          id: string
          job_id: string | null
          look_id: string | null
          motion_prompt: string | null
          output_format: string | null
          project_id: string | null
          provider_payload: Json
          provider_status: string | null
          provider_video_id: string | null
          resolution: string | null
          script: string | null
          thumbnail_asset_id: string | null
          video_type: string
          voice_id: string | null
        }
        Insert: {
          aspect_ratio?: string | null
          audio_asset_id?: string | null
          character_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          engine?: string | null
          generated_asset_id?: string | null
          id?: string
          job_id?: string | null
          look_id?: string | null
          motion_prompt?: string | null
          output_format?: string | null
          project_id?: string | null
          provider_payload?: Json
          provider_status?: string | null
          provider_video_id?: string | null
          resolution?: string | null
          script?: string | null
          thumbnail_asset_id?: string | null
          video_type: string
          voice_id?: string | null
        }
        Update: {
          aspect_ratio?: string | null
          audio_asset_id?: string | null
          character_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          engine?: string | null
          generated_asset_id?: string | null
          id?: string
          job_id?: string | null
          look_id?: string | null
          motion_prompt?: string | null
          output_format?: string | null
          project_id?: string | null
          provider_payload?: Json
          provider_status?: string | null
          provider_video_id?: string | null
          resolution?: string | null
          script?: string | null
          thumbnail_asset_id?: string | null
          video_type?: string
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avatar_videos_audio_asset_id_fkey"
            columns: ["audio_asset_id"]
            isOneToOne: false
            referencedRelation: "avatar_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_videos_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "avatar_characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_videos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_videos_generated_asset_id_fkey"
            columns: ["generated_asset_id"]
            isOneToOne: false
            referencedRelation: "avatar_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_videos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "avatar_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_videos_look_id_fkey"
            columns: ["look_id"]
            isOneToOne: false
            referencedRelation: "avatar_looks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_videos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "avatar_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_videos_thumbnail_asset_id_fkey"
            columns: ["thumbnail_asset_id"]
            isOneToOne: false
            referencedRelation: "avatar_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_videos_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "avatar_voices"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_voice_samples: {
        Row: {
          asset_id: string
          created_at: string
          duration_seconds: number | null
          id: string
          sample_role: string
          sort_order: number
          training_id: string | null
          voice_id: string | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          sample_role?: string
          sort_order?: number
          training_id?: string | null
          voice_id?: string | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          sample_role?: string
          sort_order?: number
          training_id?: string | null
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avatar_voice_samples_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "avatar_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_voice_samples_training_fk"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "avatar_voice_trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_voice_samples_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "avatar_voices"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_voice_trainings: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          id: string
          idempotency_key: string | null
          job_id: string | null
          mode: string
          provider_payload: Json
          provider_training_id: string | null
          requested_language: string | null
          sample_count: number
          status: string
          submitted_at: string | null
          total_duration_seconds: number | null
          voice_id: string | null
          voice_name: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          job_id?: string | null
          mode: string
          provider_payload?: Json
          provider_training_id?: string | null
          requested_language?: string | null
          sample_count?: number
          status?: string
          submitted_at?: string | null
          total_duration_seconds?: number | null
          voice_id?: string | null
          voice_name?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          job_id?: string | null
          mode?: string
          provider_payload?: Json
          provider_training_id?: string | null
          requested_language?: string | null
          sample_count?: number
          status?: string
          submitted_at?: string | null
          total_duration_seconds?: number | null
          voice_id?: string | null
          voice_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avatar_voice_trainings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_voice_trainings_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "avatar_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_voice_trainings_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "avatar_voices"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_voices: {
        Row: {
          character_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          display_name: string
          engine: string | null
          gender_metadata: string | null
          id: string
          is_default_for_character: boolean
          is_owned: boolean
          language: string | null
          locale: string | null
          preview_asset_id: string | null
          preview_url: string | null
          project_id: string | null
          provider: string
          provider_payload: Json
          provider_slot_status: string | null
          provider_voice_id: string
          status: string
          supports_pause: boolean | null
          updated_at: string
          voice_type: string
        }
        Insert: {
          character_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          display_name: string
          engine?: string | null
          gender_metadata?: string | null
          id?: string
          is_default_for_character?: boolean
          is_owned?: boolean
          language?: string | null
          locale?: string | null
          preview_asset_id?: string | null
          preview_url?: string | null
          project_id?: string | null
          provider?: string
          provider_payload?: Json
          provider_slot_status?: string | null
          provider_voice_id: string
          status?: string
          supports_pause?: boolean | null
          updated_at?: string
          voice_type: string
        }
        Update: {
          character_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          display_name?: string
          engine?: string | null
          gender_metadata?: string | null
          id?: string
          is_default_for_character?: boolean
          is_owned?: boolean
          language?: string | null
          locale?: string | null
          preview_asset_id?: string | null
          preview_url?: string | null
          project_id?: string | null
          provider?: string
          provider_payload?: Json
          provider_slot_status?: string | null
          provider_voice_id?: string
          status?: string
          supports_pause?: boolean | null
          updated_at?: string
          voice_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_voices_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "avatar_characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_voices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_voices_preview_asset_id_fkey"
            columns: ["preview_asset_id"]
            isOneToOne: false
            referencedRelation: "avatar_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_voices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "avatar_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_imports: {
        Row: {
          brand_kit_id: string | null
          code: Json | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          kind: string
          proposal: Json | null
          signals: Json
          source_title: string | null
          source_url: string | null
          stage: string | null
          staged: Json
          status: string
          updated_at: string
        }
        Insert: {
          brand_kit_id?: string | null
          code?: Json | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          kind: string
          proposal?: Json | null
          signals?: Json
          source_title?: string | null
          source_url?: string | null
          stage?: string | null
          staged?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          brand_kit_id?: string | null
          code?: Json | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          kind?: string
          proposal?: Json | null
          signals?: Json
          source_title?: string | null
          source_url?: string | null
          stage?: string | null
          staged?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_imports_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_imports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_kits: {
        Row: {
          accent_color: string
          background_color: string
          body_font: string
          call_to_action: string | null
          created_at: string
          created_by: string | null
          demo_record: Json | null
          design: Json
          dna: Json
          formulas: Json
          end_card_asset_id: string | null
          fonts: Json
          heading_font: string
          id: string
          is_archived: boolean
          is_default: boolean
          logo_asset_id: string | null
          name: string
          palette: Json
          production: Json
          project_id: string | null
          reference_asset_ids: string[]
          source: Json | null
          tagline: string | null
          terms: string[]
          text_color: string
          title_backing: string
          updated_at: string
          uppercase_titles: boolean
          website: string | null
        }
        Insert: {
          accent_color?: string
          background_color?: string
          body_font?: string
          call_to_action?: string | null
          created_at?: string
          created_by?: string | null
          demo_record?: Json | null
          design?: Json
          dna?: Json
          formulas?: Json
          end_card_asset_id?: string | null
          fonts?: Json
          heading_font?: string
          id?: string
          is_archived?: boolean
          is_default?: boolean
          logo_asset_id?: string | null
          name: string
          palette?: Json
          production?: Json
          project_id?: string | null
          reference_asset_ids?: string[]
          source?: Json | null
          tagline?: string | null
          terms?: string[]
          text_color?: string
          title_backing?: string
          updated_at?: string
          uppercase_titles?: boolean
          website?: string | null
        }
        Update: {
          accent_color?: string
          background_color?: string
          body_font?: string
          call_to_action?: string | null
          created_at?: string
          created_by?: string | null
          demo_record?: Json | null
          design?: Json
          dna?: Json
          formulas?: Json
          end_card_asset_id?: string | null
          fonts?: Json
          heading_font?: string
          id?: string
          is_archived?: boolean
          is_default?: boolean
          logo_asset_id?: string | null
          name?: string
          palette?: Json
          production?: Json
          project_id?: string | null
          reference_asset_ids?: string[]
          source?: Json | null
          tagline?: string | null
          terms?: string[]
          text_color?: string
          title_backing?: string
          updated_at?: string
          uppercase_titles?: boolean
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_kits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_kits_end_card_asset_id_fkey"
            columns: ["end_card_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_kits_logo_asset_id_fkey"
            columns: ["logo_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_kits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_voices: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_archived: boolean
          is_default: boolean
          language: string | null
          model: string
          name: string
          project_id: string | null
          pronunciations: Json
          provider: string
          provider_voice_id: string
          sample_asset_id: string | null
          script_guidelines: string | null
          settings: Json
          source: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          is_default?: boolean
          language?: string | null
          model: string
          name: string
          project_id?: string | null
          pronunciations?: Json
          provider: string
          provider_voice_id: string
          sample_asset_id?: string | null
          script_guidelines?: string | null
          settings?: Json
          source?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          is_default?: boolean
          language?: string | null
          model?: string
          name?: string
          project_id?: string | null
          pronunciations?: Json
          provider?: string
          provider_voice_id?: string
          sample_asset_id?: string | null
          script_guidelines?: string | null
          settings?: Json
          source?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_voices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_voices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_voices_sample_asset_id_fkey"
            columns: ["sample_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          brand_voice_id: string | null
          budget_mode: string
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
          brand_voice_id?: string | null
          budget_mode?: string
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
          brand_voice_id?: string | null
          budget_mode?: string
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
            foreignKeyName: "campaigns_brand_voice_id_fkey"
            columns: ["brand_voice_id"]
            isOneToOne: false
            referencedRelation: "brand_voices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      character_images: {
        Row: {
          added_by: string | null
          asset_id: string
          character_id: string
          created_at: string
          id: string
          position: number
          role: string
          view: string
        }
        Insert: {
          added_by?: string | null
          asset_id: string
          character_id: string
          created_at?: string
          id?: string
          position?: number
          role?: string
          view?: string
        }
        Update: {
          added_by?: string | null
          asset_id?: string
          character_id?: string
          created_at?: string
          id?: string
          position?: number
          role?: string
          view?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_images_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_images_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_images_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      character_souls: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          character_id: string
          created_at: string
          created_by: string | null
          id: string
          image_count: number | null
          is_active: boolean
          likeness: Json | null
          model_version: string
          ready_at: string
          reference_id: string
          request_key: string | null
          source: string
          thumbnail_url: string | null
          training_asset_ids: string[]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          character_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_count?: number | null
          is_active?: boolean
          likeness?: Json | null
          model_version: string
          ready_at?: string
          reference_id: string
          request_key?: string | null
          source?: string
          thumbnail_url?: string | null
          training_asset_ids?: string[]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          character_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_count?: number | null
          is_active?: boolean
          likeness?: Json | null
          model_version?: string
          ready_at?: string
          reference_id?: string
          request_key?: string | null
          source?: string
          thumbnail_url?: string | null
          training_asset_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_souls_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_souls_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_souls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          name: string
          soul_checked_at: string | null
          soul_error: string | null
          soul_image_count: number | null
          soul_model_version: string | null
          soul_ready_at: string | null
          soul_reference_id: string | null
          soul_request_key: string | null
          soul_requested_at: string | null
          soul_status: string
          soul_submitted_at: string | null
          soul_training_asset_ids: string[]
          soul_training_id: string | null
          soul_training_version: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name: string
          soul_checked_at?: string | null
          soul_error?: string | null
          soul_image_count?: number | null
          soul_model_version?: string | null
          soul_ready_at?: string | null
          soul_reference_id?: string | null
          soul_request_key?: string | null
          soul_requested_at?: string | null
          soul_status?: string
          soul_submitted_at?: string | null
          soul_training_asset_ids?: string[]
          soul_training_id?: string | null
          soul_training_version?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name?: string
          soul_checked_at?: string | null
          soul_error?: string | null
          soul_image_count?: number | null
          soul_model_version?: string | null
          soul_ready_at?: string | null
          soul_reference_id?: string | null
          soul_request_key?: string | null
          soul_requested_at?: string | null
          soul_status?: string
          soul_submitted_at?: string | null
          soul_training_asset_ids?: string[]
          soul_training_id?: string | null
          soul_training_version?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "characters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      creative_brief_assets: {
        Row: {
          asset_id: string
          brief_id: string
          caption: string | null
          created_at: string
          id: string
          page_number: number | null
          position: number
          source: string
        }
        Insert: {
          asset_id: string
          brief_id: string
          caption?: string | null
          created_at?: string
          id?: string
          page_number?: number | null
          position?: number
          source?: string
        }
        Update: {
          asset_id?: string
          brief_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          page_number?: number | null
          position?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_brief_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_brief_assets_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "creative_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_briefs: {
        Row: {
          analysis: Json
          campaign_id: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          extracted_text: string
          id: string
          is_archived: boolean
          page_count: number | null
          project_id: string | null
          source_bucket: string | null
          source_filename: string | null
          source_mime: string | null
          source_path: string | null
          source_size: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          analysis?: Json
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          extracted_text?: string
          id?: string
          is_archived?: boolean
          page_count?: number | null
          project_id?: string | null
          source_bucket?: string | null
          source_filename?: string | null
          source_mime?: string | null
          source_path?: string | null
          source_size?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          analysis?: Json
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          extracted_text?: string
          id?: string
          is_archived?: boolean
          page_count?: number | null
          project_id?: string | null
          source_bucket?: string | null
          source_filename?: string | null
          source_mime?: string | null
          source_path?: string | null
          source_size?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_briefs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_briefs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_briefs_project_id_fkey"
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
          auto_retries: number
          campaign_id: string | null
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
          retry_after: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["generation_status"]
          submission_started_at: string | null
          submitted_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          actual_cost_usd?: number | null
          auto_retries?: number
          campaign_id?: string | null
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
          retry_after?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["generation_status"]
          submission_started_at?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          actual_cost_usd?: number | null
          auto_retries?: number
          campaign_id?: string | null
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
          retry_after?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["generation_status"]
          submission_started_at?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
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
      higgsfield_connections: {
        Row: {
          access_token: string | null
          account_email: string | null
          account_name: string | null
          account_subject: string | null
          client_id: string | null
          client_secret: string | null
          connected_at: string | null
          connected_by: string | null
          expires_at: string | null
          id: string
          issuer: string | null
          last_error: string | null
          last_refreshed_at: string | null
          refresh_claimed_until: string | null
          refresh_token: string | null
          resource: string | null
          revocation_endpoint: string | null
          scope: string | null
          status: string
          token_auth_method: string
          token_endpoint: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          account_email?: string | null
          account_name?: string | null
          account_subject?: string | null
          client_id?: string | null
          client_secret?: string | null
          connected_at?: string | null
          connected_by?: string | null
          expires_at?: string | null
          id?: string
          issuer?: string | null
          last_error?: string | null
          last_refreshed_at?: string | null
          refresh_claimed_until?: string | null
          refresh_token?: string | null
          resource?: string | null
          revocation_endpoint?: string | null
          scope?: string | null
          status?: string
          token_auth_method?: string
          token_endpoint?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          account_email?: string | null
          account_name?: string | null
          account_subject?: string | null
          client_id?: string | null
          client_secret?: string | null
          connected_at?: string | null
          connected_by?: string | null
          expires_at?: string | null
          id?: string
          issuer?: string | null
          last_error?: string | null
          last_refreshed_at?: string | null
          refresh_claimed_until?: string | null
          refresh_token?: string | null
          resource?: string | null
          revocation_endpoint?: string | null
          scope?: string | null
          status?: string
          token_auth_method?: string
          token_endpoint?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "higgsfield_connections_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      higgsfield_oauth_clients: {
        Row: {
          client_id: string
          client_secret: string | null
          created_at: string
          id: string
          issuer: string
          redirect_uri: string
          token_auth_method: string
        }
        Insert: {
          client_id: string
          client_secret?: string | null
          created_at?: string
          id?: string
          issuer: string
          redirect_uri: string
          token_auth_method?: string
        }
        Update: {
          client_id?: string
          client_secret?: string | null
          created_at?: string
          id?: string
          issuer?: string
          redirect_uri?: string
          token_auth_method?: string
        }
        Relationships: []
      }
      higgsfield_oauth_states: {
        Row: {
          client_id: string
          code_verifier: string
          created_at: string
          created_by: string | null
          expires_at: string
          issuer: string
          redirect_uri: string
          return_origin: string
          state: string
        }
        Insert: {
          client_id: string
          code_verifier: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          issuer: string
          redirect_uri: string
          return_origin: string
          state: string
        }
        Update: {
          client_id?: string
          code_verifier?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          issuer?: string
          redirect_uri?: string
          return_origin?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "higgsfield_oauth_states_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      katana_results: {
        Row: {
          asset_id: string | null
          attempts: number
          claimed_until: string | null
          created_at: string
          error: string | null
          id: string
          media_id: string
          run_id: string
          status: string
          updated_at: string
          url: string | null
        }
        Insert: {
          asset_id?: string | null
          attempts?: number
          claimed_until?: string | null
          created_at?: string
          error?: string | null
          id?: string
          media_id: string
          run_id: string
          status?: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          asset_id?: string | null
          attempts?: number
          claimed_until?: string | null
          created_at?: string
          error?: string | null
          id?: string
          media_id?: string
          run_id?: string
          status?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "katana_results_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "katana_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "katana_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      katana_run_events: {
        Row: {
          body: string
          created_at: string
          data: Json
          id: string
          kind: string
          occurred_at: string
          run_id: string
          source_id: string | null
          title: string
        }
        Insert: {
          body?: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          occurred_at?: string
          run_id: string
          source_id?: string | null
          title?: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          occurred_at?: string
          run_id?: string
          source_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "katana_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "katana_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      katana_runs: {
        Row: {
          agent_version: number | null
          balance_end: number | null
          balance_start: number | null
          boundary_event_ids: string[]
          brief: string
          cancel_requested: boolean
          claude_budget_cents: number
          claude_cost_cents: number
          created_at: string
          created_by: string | null
          credit_limit: number
          credits_reserved: number
          error: string | null
          finished_at: string | null
          id: string
          inputs: Json
          known_media: Json
          last_event_at: string | null
          mode: string
          parent_run_id: string | null
          preset_name: string | null
          preset_slug: string | null
          project_id: string | null
          reference_url: string | null
          resume_line: string | null
          session_id: string | null
          started_at: string | null
          state_checked_at: string | null
          status: string
          status_detail: string | null
          summary: string | null
          sync_lease_owner: string | null
          sync_lease_until: string | null
          synced_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          agent_version?: number | null
          balance_end?: number | null
          balance_start?: number | null
          boundary_event_ids?: string[]
          brief?: string
          cancel_requested?: boolean
          claude_budget_cents: number
          claude_cost_cents?: number
          created_at?: string
          created_by?: string | null
          credit_limit: number
          credits_reserved?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          inputs?: Json
          known_media?: Json
          last_event_at?: string | null
          mode: string
          parent_run_id?: string | null
          preset_name?: string | null
          preset_slug?: string | null
          project_id?: string | null
          reference_url?: string | null
          resume_line?: string | null
          session_id?: string | null
          started_at?: string | null
          state_checked_at?: string | null
          status?: string
          status_detail?: string | null
          summary?: string | null
          sync_lease_owner?: string | null
          sync_lease_until?: string | null
          synced_at?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          agent_version?: number | null
          balance_end?: number | null
          balance_start?: number | null
          boundary_event_ids?: string[]
          brief?: string
          cancel_requested?: boolean
          claude_budget_cents?: number
          claude_cost_cents?: number
          created_at?: string
          created_by?: string | null
          credit_limit?: number
          credits_reserved?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          inputs?: Json
          known_media?: Json
          last_event_at?: string | null
          mode?: string
          parent_run_id?: string | null
          preset_name?: string | null
          preset_slug?: string | null
          project_id?: string | null
          reference_url?: string | null
          resume_line?: string | null
          session_id?: string | null
          started_at?: string | null
          state_checked_at?: string | null
          status?: string
          status_detail?: string | null
          summary?: string | null
          sync_lease_owner?: string | null
          sync_lease_until?: string | null
          synced_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "katana_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "katana_runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "katana_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "katana_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      katana_setup: {
        Row: {
          agent_id: string | null
          agent_version: number | null
          claimed_until: string | null
          config_hash: string | null
          credential_expires_at: string | null
          credential_id: string | null
          credential_synced_at: string | null
          environment_id: string | null
          id: string
          updated_at: string
          vault_id: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_version?: number | null
          claimed_until?: string | null
          config_hash?: string | null
          credential_expires_at?: string | null
          credential_id?: string | null
          credential_synced_at?: string | null
          environment_id?: string | null
          id?: string
          updated_at?: string
          vault_id?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_version?: number | null
          claimed_until?: string | null
          config_hash?: string | null
          credential_expires_at?: string | null
          credential_id?: string | null
          credential_synced_at?: string | null
          environment_id?: string | null
          id?: string
          updated_at?: string
          vault_id?: string | null
        }
        Relationships: []
      }
      katana_spend: {
        Row: {
          credits: number
          decided_at: string
          decision: string
          id: string
          items: Json
          job_ids: string[]
          priced: boolean
          reason: string | null
          result_at: string | null
          run_id: string
          sent_at: string | null
          tool_name: string
          tool_use_id: string
        }
        Insert: {
          credits?: number
          decided_at?: string
          decision: string
          id?: string
          items?: Json
          job_ids?: string[]
          priced?: boolean
          reason?: string | null
          result_at?: string | null
          run_id: string
          sent_at?: string | null
          tool_name: string
          tool_use_id: string
        }
        Update: {
          credits?: number
          decided_at?: string
          decision?: string
          id?: string
          items?: Json
          job_ids?: string[]
          priced?: boolean
          reason?: string | null
          result_at?: string | null
          run_id?: string
          sent_at?: string | null
          tool_name?: string
          tool_use_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "katana_spend_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "katana_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      long_video_clip_takes: {
        Row: {
          attempt: number
          clip_id: string
          created_at: string
          generation_id: string | null
          id: string
          lip_score: number | null
          long_video_id: string
          output_asset_id: string | null
          reason: string
          snapshot: Json
          start_frame_asset_id: string | null
        }
        Insert: {
          attempt: number
          clip_id: string
          created_at?: string
          generation_id?: string | null
          id?: string
          lip_score?: number | null
          long_video_id: string
          output_asset_id?: string | null
          reason?: string
          snapshot?: Json
          start_frame_asset_id?: string | null
        }
        Update: {
          attempt?: number
          clip_id?: string
          created_at?: string
          generation_id?: string | null
          id?: string
          lip_score?: number | null
          long_video_id?: string
          output_asset_id?: string | null
          reason?: string
          snapshot?: Json
          start_frame_asset_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "long_video_clip_takes_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "long_video_clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_clip_takes_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_clip_takes_long_video_id_fkey"
            columns: ["long_video_id"]
            isOneToOne: false
            referencedRelation: "long_videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_clip_takes_output_asset_id_fkey"
            columns: ["output_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_clip_takes_start_frame_asset_id_fkey"
            columns: ["start_frame_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      long_video_clips: {
        Row: {
          attempt: number
          audio_asset_id: string | null
          audio_end_seconds: number | null
          audio_start_seconds: number | null
          beat: string
          check_attempts: number
          check_claimed_at: string | null
          check_claims: number
          check_result: Json | null
          check_status: string
          check_task_id: string | null
          checked_at: string | null
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          duration_seconds: number
          end_frame_asset_id: string | null
          error_code: string | null
          error_message: string | null
          generation_id: string | null
          handoff_asset_id: string | null
          handoff_attempts: number
          handoff_status: string
          handoff_task_id: string | null
          handoff_time_seconds: number | null
          held: boolean
          id: string
          inputs: Json
          lip_attempts: number
          lip_checked_at: string | null
          lip_offset_frames: number | null
          lip_result: Json | null
          lip_score: number | null
          lip_score_at_zero: number | null
          lip_status: string
          lip_task_id: string | null
          long_video_id: string
          model_registry_id: string
          output_asset_id: string | null
          output_duration_seconds: number | null
          output_fps: number | null
          output_height: number | null
          output_width: number | null
          parameters: Json
          position: number
          prompt: string
          start_frame_asset_id: string | null
          start_frame_override_asset_id: string | null
          started_at: string | null
          status: string
          sync_attempts: number
          sync_offset_seconds: number | null
          sync_result: Json | null
          sync_status: string
          sync_task_id: string | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          attempt?: number
          audio_asset_id?: string | null
          audio_end_seconds?: number | null
          audio_start_seconds?: number | null
          beat?: string
          check_attempts?: number
          check_claimed_at?: string | null
          check_claims?: number
          check_result?: Json | null
          check_status?: string
          check_task_id?: string | null
          checked_at?: string | null
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          duration_seconds: number
          end_frame_asset_id?: string | null
          error_code?: string | null
          error_message?: string | null
          generation_id?: string | null
          handoff_asset_id?: string | null
          handoff_attempts?: number
          handoff_status?: string
          handoff_task_id?: string | null
          handoff_time_seconds?: number | null
          held?: boolean
          id?: string
          inputs?: Json
          lip_attempts?: number
          lip_checked_at?: string | null
          lip_offset_frames?: number | null
          lip_result?: Json | null
          lip_score?: number | null
          lip_score_at_zero?: number | null
          lip_status?: string
          lip_task_id?: string | null
          long_video_id: string
          model_registry_id: string
          output_asset_id?: string | null
          output_duration_seconds?: number | null
          output_fps?: number | null
          output_height?: number | null
          output_width?: number | null
          parameters?: Json
          position: number
          prompt?: string
          start_frame_asset_id?: string | null
          start_frame_override_asset_id?: string | null
          started_at?: string | null
          status?: string
          sync_attempts?: number
          sync_offset_seconds?: number | null
          sync_result?: Json | null
          sync_status?: string
          sync_task_id?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          attempt?: number
          audio_asset_id?: string | null
          audio_end_seconds?: number | null
          audio_start_seconds?: number | null
          beat?: string
          check_attempts?: number
          check_claimed_at?: string | null
          check_claims?: number
          check_result?: Json | null
          check_status?: string
          check_task_id?: string | null
          checked_at?: string | null
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number
          end_frame_asset_id?: string | null
          error_code?: string | null
          error_message?: string | null
          generation_id?: string | null
          handoff_asset_id?: string | null
          handoff_attempts?: number
          handoff_status?: string
          handoff_task_id?: string | null
          handoff_time_seconds?: number | null
          held?: boolean
          id?: string
          inputs?: Json
          lip_attempts?: number
          lip_checked_at?: string | null
          lip_offset_frames?: number | null
          lip_result?: Json | null
          lip_score?: number | null
          lip_score_at_zero?: number | null
          lip_status?: string
          lip_task_id?: string | null
          long_video_id?: string
          model_registry_id?: string
          output_asset_id?: string | null
          output_duration_seconds?: number | null
          output_fps?: number | null
          output_height?: number | null
          output_width?: number | null
          parameters?: Json
          position?: number
          prompt?: string
          start_frame_asset_id?: string | null
          start_frame_override_asset_id?: string | null
          started_at?: string | null
          status?: string
          sync_attempts?: number
          sync_offset_seconds?: number | null
          sync_result?: Json | null
          sync_status?: string
          sync_task_id?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "long_video_clips_lip_task_id_fkey"
            columns: ["lip_task_id"]
            isOneToOne: false
            referencedRelation: "media_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_clips_start_frame_override_asset_id_fkey"
            columns: ["start_frame_override_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_clips_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_clips_handoff_asset_id_fkey"
            columns: ["handoff_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_clips_handoff_task_id_fkey"
            columns: ["handoff_task_id"]
            isOneToOne: false
            referencedRelation: "media_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_clips_long_video_id_fkey"
            columns: ["long_video_id"]
            isOneToOne: false
            referencedRelation: "long_videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_clips_model_registry_id_fkey"
            columns: ["model_registry_id"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_clips_output_asset_id_fkey"
            columns: ["output_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_clips_start_frame_asset_id_fkey"
            columns: ["start_frame_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_clips_check_task_id_fkey"
            columns: ["check_task_id"]
            isOneToOne: false
            referencedRelation: "media_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_clips_end_frame_asset_id_fkey"
            columns: ["end_frame_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_clips_audio_asset_id_fkey"
            columns: ["audio_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_clips_sync_task_id_fkey"
            columns: ["sync_task_id"]
            isOneToOne: false
            referencedRelation: "media_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      long_video_keyframes: {
        Row: {
          asset_id: string | null
          attempt: number
          check_attempts: number
          check_claimed_at: string | null
          check_claims: number
          check_result: Json | null
          check_status: string
          checked_at: string | null
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          generation_id: string | null
          id: string
          long_video_id: string
          note: string
          position: number
          prompt: string
          provided: boolean
          raw_asset_id: string | null
          size_attempts: number
          size_task_id: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          attempt?: number
          check_attempts?: number
          check_claimed_at?: string | null
          check_claims?: number
          check_result?: Json | null
          check_status?: string
          checked_at?: string | null
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          generation_id?: string | null
          id?: string
          long_video_id: string
          note?: string
          position: number
          prompt?: string
          provided?: boolean
          raw_asset_id?: string | null
          size_attempts?: number
          size_task_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          attempt?: number
          check_attempts?: number
          check_claimed_at?: string | null
          check_claims?: number
          check_result?: Json | null
          check_status?: string
          checked_at?: string | null
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          generation_id?: string | null
          id?: string
          long_video_id?: string
          note?: string
          position?: number
          prompt?: string
          provided?: boolean
          raw_asset_id?: string | null
          size_attempts?: number
          size_task_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "long_video_keyframes_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_keyframes_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_keyframes_long_video_id_fkey"
            columns: ["long_video_id"]
            isOneToOne: false
            referencedRelation: "long_videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_keyframes_raw_asset_id_fkey"
            columns: ["raw_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_video_keyframes_size_task_id_fkey"
            columns: ["size_task_id"]
            isOneToOne: false
            referencedRelation: "media_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      long_videos: {
        Row: {
          anchor_frame_asset_id: string | null
          brand: Json | null
          campaign_id: string | null
          characters: Json
          client_request_id: string | null
          clip_count: number
          completed_at: string | null
          continuation_model_id: string
          continuity: string
          created_at: string
          created_by: string | null
          cutaway_fills: Json
          error_code: string | null
          error_message: string | null
          estimated_cost_usd: number | null
          first_model_id: string
          id: string
          identity_check: boolean
          keyframe_model_id: string | null
          keyframe_settings: Json
          project_id: string | null
          qc_settings: Json
          references_used: Json
          sequence_id: string | null
          settings: Json
          start_from: string
          status: string
          story: string
          storyboard_approved_at: string | null
          storyboard_review: boolean
          target_seconds: number
          title: string
          updated_at: string
          voiceover: Json | null
          voiceover_preparation_id: string | null
        }
        Insert: {
          anchor_frame_asset_id?: string | null
          brand?: Json | null
          campaign_id?: string | null
          characters?: Json
          client_request_id?: string | null
          clip_count: number
          completed_at?: string | null
          continuation_model_id: string
          continuity?: string
          created_at?: string
          created_by?: string | null
          cutaway_fills?: Json
          error_code?: string | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          first_model_id: string
          id?: string
          identity_check?: boolean
          keyframe_model_id?: string | null
          keyframe_settings?: Json
          project_id?: string | null
          qc_settings?: Json
          references_used?: Json
          sequence_id?: string | null
          settings?: Json
          start_from?: string
          status?: string
          story?: string
          storyboard_approved_at?: string | null
          storyboard_review?: boolean
          target_seconds: number
          title?: string
          updated_at?: string
          voiceover?: Json | null
          voiceover_preparation_id?: string | null
        }
        Update: {
          anchor_frame_asset_id?: string | null
          brand?: Json | null
          campaign_id?: string | null
          characters?: Json
          client_request_id?: string | null
          clip_count?: number
          completed_at?: string | null
          continuation_model_id?: string
          continuity?: string
          created_at?: string
          created_by?: string | null
          cutaway_fills?: Json
          error_code?: string | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          first_model_id?: string
          id?: string
          identity_check?: boolean
          keyframe_model_id?: string | null
          keyframe_settings?: Json
          project_id?: string | null
          qc_settings?: Json
          references_used?: Json
          sequence_id?: string | null
          settings?: Json
          start_from?: string
          status?: string
          story?: string
          storyboard_approved_at?: string | null
          storyboard_review?: boolean
          target_seconds?: number
          title?: string
          updated_at?: string
          voiceover?: Json | null
          voiceover_preparation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "long_videos_anchor_frame_asset_id_fkey"
            columns: ["anchor_frame_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_videos_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_videos_continuation_model_id_fkey"
            columns: ["continuation_model_id"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_videos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_videos_first_model_id_fkey"
            columns: ["first_model_id"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_videos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_videos_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_videos_keyframe_model_id_fkey"
            columns: ["keyframe_model_id"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_videos_voiceover_preparation_id_fkey"
            columns: ["voiceover_preparation_id"]
            isOneToOne: false
            referencedRelation: "audio_preparations"
            referencedColumns: ["id"]
          },
        ]
      }
      media_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          error_code: string | null
          error_message: string | null
          id: string
          input_payload: Json
          operation_id: string | null
          output_payload: Json | null
          project_id: string | null
          result_asset_id: string | null
          source_asset_id: string | null
          status: string
          storage_bucket: string | null
          storage_path: string | null
          submitted_at: string | null
          task_type: string
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          input_payload?: Json
          operation_id?: string | null
          output_payload?: Json | null
          project_id?: string | null
          result_asset_id?: string | null
          source_asset_id?: string | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          submitted_at?: string | null
          task_type: string
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          input_payload?: Json
          operation_id?: string | null
          output_payload?: Json | null
          project_id?: string | null
          result_asset_id?: string | null
          source_asset_id?: string | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          submitted_at?: string | null
          task_type?: string
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_tasks_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_tasks_result_asset_id_fkey"
            columns: ["result_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_tasks_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
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
      music_tracks: {
        Row: {
          artist: string | null
          asset_id: string | null
          attribution: string | null
          bar_features: Json | null
          beats: Json | null
          bpm: number | null
          campaign_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          duration_seconds: number | null
          error_code: string | null
          error_message: string | null
          genres: string[]
          id: string
          instrumental: boolean | null
          is_archived: boolean
          kind: string
          license: string
          license_url: string | null
          license_version: string | null
          model: string | null
          moods: string[]
          parent_track_id: string | null
          project_id: string | null
          prompt: string | null
          provider: string | null
          provider_request_id: string | null
          rights: Json
          source: string
          source_id: string | null
          source_url: string | null
          status: string
          structure: Json | null
          tags: string[]
          title: string
          updated_at: string
          usage_notes: string | null
        }
        Insert: {
          artist?: string | null
          asset_id?: string | null
          attribution?: string | null
          bar_features?: Json | null
          beats?: Json | null
          bpm?: number | null
          campaign_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          duration_seconds?: number | null
          error_code?: string | null
          error_message?: string | null
          genres?: string[]
          id?: string
          instrumental?: boolean | null
          is_archived?: boolean
          kind?: string
          license: string
          license_url?: string | null
          license_version?: string | null
          model?: string | null
          moods?: string[]
          parent_track_id?: string | null
          project_id?: string | null
          prompt?: string | null
          provider?: string | null
          provider_request_id?: string | null
          rights?: Json
          source: string
          source_id?: string | null
          source_url?: string | null
          status?: string
          structure?: Json | null
          tags?: string[]
          title: string
          updated_at?: string
          usage_notes?: string | null
        }
        Update: {
          artist?: string | null
          asset_id?: string | null
          attribution?: string | null
          bar_features?: Json | null
          beats?: Json | null
          bpm?: number | null
          campaign_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          duration_seconds?: number | null
          error_code?: string | null
          error_message?: string | null
          genres?: string[]
          id?: string
          instrumental?: boolean | null
          is_archived?: boolean
          kind?: string
          license?: string
          license_url?: string | null
          license_version?: string | null
          model?: string | null
          moods?: string[]
          parent_track_id?: string | null
          project_id?: string | null
          prompt?: string | null
          provider?: string | null
          provider_request_id?: string | null
          rights?: Json
          source?: string
          source_id?: string | null
          source_url?: string | null
          status?: string
          structure?: Json | null
          tags?: string[]
          title?: string
          updated_at?: string
          usage_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "music_tracks_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "music_tracks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "music_tracks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "music_tracks_parent_track_id_fkey"
            columns: ["parent_track_id"]
            isOneToOne: false
            referencedRelation: "music_tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "music_tracks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      music_uploads: {
        Row: {
          asset_id: string | null
          cleanup_tried_at: string | null
          created_at: string
          file_name: string
          file_size: number | null
          id: string
          mime_type: string
          project_id: string | null
          registered_at: string | null
          storage_bucket: string
          storage_path: string
          user_id: string | null
        }
        Insert: {
          asset_id?: string | null
          cleanup_tried_at?: string | null
          created_at?: string
          file_name: string
          file_size?: number | null
          id?: string
          mime_type: string
          project_id?: string | null
          registered_at?: string | null
          storage_bucket: string
          storage_path: string
          user_id?: string | null
        }
        Update: {
          asset_id?: string | null
          cleanup_tried_at?: string | null
          created_at?: string
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string
          project_id?: string | null
          registered_at?: string | null
          storage_bucket?: string
          storage_path?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "music_uploads_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "music_uploads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "music_uploads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          brand_voice_id: string | null
          budget_mode: string
          budget_usd: number | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_archived: boolean
          name: string
          updated_at: string
        }
        Insert: {
          brand_voice_id?: string | null
          budget_mode?: string
          budget_usd?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          brand_voice_id?: string | null
          budget_mode?: string
          budget_usd?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_brand_voice_id_fkey"
            columns: ["brand_voice_id"]
            isOneToOne: false
            referencedRelation: "brand_voices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_media_uploads: {
        Row: {
          asset_id: string
          mime_type: string
          provider: string
          public_url: string
          storage_bucket: string
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          asset_id: string
          mime_type: string
          provider: string
          public_url: string
          storage_bucket: string
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          asset_id?: string
          mime_type?: string
          provider?: string
          public_url?: string
          storage_bucket?: string
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_media_uploads_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      review_comments: {
        Row: {
          at_seconds: number | null
          body: string
          client_request_id: string | null
          created_at: string
          created_by: string | null
          file_id: string | null
          frame: number | null
          id: string
          shot_id: string | null
          version_id: string
          via: string
          x: number | null
          y: number | null
        }
        Insert: {
          at_seconds?: number | null
          body: string
          client_request_id?: string | null
          created_at?: string
          created_by?: string | null
          file_id?: string | null
          frame?: number | null
          id?: string
          shot_id?: string | null
          version_id: string
          via?: string
          x?: number | null
          y?: number | null
        }
        Update: {
          at_seconds?: number | null
          body?: string
          client_request_id?: string | null
          created_at?: string
          created_by?: string | null
          file_id?: string | null
          frame?: number | null
          id?: string
          shot_id?: string | null
          version_id?: string
          via?: string
          x?: number | null
          y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "review_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "review_version_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "review_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_decisions: {
        Row: {
          client_request_id: string | null
          created_at: string
          decided_by: string | null
          decision: string
          id: string
          note: string | null
          on_behalf_of: string | null
          version_id: string
          via: string
        }
        Insert: {
          client_request_id?: string | null
          created_at?: string
          decided_by?: string | null
          decision: string
          id?: string
          note?: string | null
          on_behalf_of?: string | null
          version_id: string
          via?: string
        }
        Update: {
          client_request_id?: string | null
          created_at?: string
          decided_by?: string | null
          decision?: string
          id?: string
          note?: string | null
          on_behalf_of?: string | null
          version_id?: string
          via?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_decisions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_decisions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "review_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_gates: {
        Row: {
          created_at: string
          created_by: string | null
          held_until_previous: boolean
          id: string
          name: string
          position: number
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          held_until_previous?: boolean
          id?: string
          name: string
          position?: number
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          held_until_previous?: boolean
          id?: string
          name?: string
          position?: number
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_gates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_gates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      review_notes: {
        Row: {
          answered_in_version_id: string | null
          body: string
          created_at: string
          created_by: string | null
          done_at: string | null
          done_by: string | null
          gate_id: string
          given_by: string | null
          id: string
          number: number
          status: string
          targets: Json
          updated_at: string
          version_id: string | null
        }
        Insert: {
          answered_in_version_id?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          done_by?: string | null
          gate_id: string
          given_by?: string | null
          id?: string
          number: number
          status?: string
          targets?: Json
          updated_at?: string
          version_id?: string | null
        }
        Update: {
          answered_in_version_id?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          done_by?: string | null
          gate_id?: string
          given_by?: string | null
          id?: string
          number?: number
          status?: string
          targets?: Json
          updated_at?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_notes_answered_in_version_id_fkey"
            columns: ["answered_in_version_id"]
            isOneToOne: false
            referencedRelation: "review_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_notes_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_notes_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "review_gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_notes_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "review_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_version_files: {
        Row: {
          asset_id: string | null
          created_at: string
          id: string
          position: number
          title: string | null
          version_id: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          id?: string
          position?: number
          title?: string | null
          version_id: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          id?: string
          position?: number
          title?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_version_files_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_version_files_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "review_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_versions: {
        Row: {
          client_request_id: string | null
          created_at: string
          created_by: string | null
          gate_id: string
          id: string
          kind: string
          label: string
          note: string | null
          number: number
          render_id: string | null
          snapshot: Json | null
          storyboard_id: string | null
        }
        Insert: {
          client_request_id?: string | null
          created_at?: string
          created_by?: string | null
          gate_id: string
          id?: string
          kind: string
          label: string
          note?: string | null
          number?: number
          render_id?: string | null
          snapshot?: Json | null
          storyboard_id?: string | null
        }
        Update: {
          client_request_id?: string | null
          created_at?: string
          created_by?: string | null
          gate_id?: string
          id?: string
          kind?: string
          label?: string
          note?: string | null
          number?: number
          render_id?: string | null
          snapshot?: Json | null
          storyboard_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_versions_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "review_gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_versions_render_id_fkey"
            columns: ["render_id"]
            isOneToOne: false
            referencedRelation: "sequence_renders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_versions_storyboard_id_fkey"
            columns: ["storyboard_id"]
            isOneToOne: false
            referencedRelation: "storyboards"
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
      sequence_renders: {
        Row: {
          asset_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          duration_seconds: number | null
          error_code: string | null
          error_message: string | null
          id: string
          media_task_id: string | null
          mix_report: Json | null
          progress: number
          sequence_id: string
          sequence_version: number
          stage: string | null
          status: string
          timeline: Json
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          duration_seconds?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          media_task_id?: string | null
          mix_report?: Json | null
          progress?: number
          sequence_id: string
          sequence_version: number
          stage?: string | null
          status?: string
          timeline: Json
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          duration_seconds?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          media_task_id?: string | null
          mix_report?: Json | null
          progress?: number
          sequence_id?: string
          sequence_version?: number
          stage?: string | null
          status?: string
          timeline?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_renders_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_renders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_renders_media_task_id_fkey"
            columns: ["media_task_id"]
            isOneToOne: false
            referencedRelation: "media_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_renders_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sequences: {
        Row: {
          brief_id: string | null
          campaign_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_archived: boolean
          last_render_id: string | null
          project_id: string | null
          source: Json
          status: string
          storyboard_id: string | null
          timeline: Json
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          brief_id?: string | null
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          last_render_id?: string | null
          project_id?: string | null
          source?: Json
          status?: string
          storyboard_id?: string | null
          timeline?: Json
          title?: string
          updated_at?: string
          version?: number
        }
        Update: {
          brief_id?: string | null
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          last_render_id?: string | null
          project_id?: string | null
          source?: Json
          status?: string
          storyboard_id?: string | null
          timeline?: Json
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sequences_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "creative_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequences_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequences_last_render_id_fkey"
            columns: ["last_render_id"]
            isOneToOne: false
            referencedRelation: "sequence_renders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequences_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequences_storyboard_id_fkey"
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
      soul_id_trainings: {
        Row: {
          asset_ids: string[]
          character_id: string | null
          character_name: string
          error: string | null
          id: string
          image_count: number
          model_version: string
          request_key: string
          requested_at: string
          requested_by: string | null
          sent_at: string | null
          settled_at: string | null
          status: string
          training_id: string | null
          updated_at: string
        }
        Insert: {
          asset_ids?: string[]
          character_id?: string | null
          character_name?: string
          error?: string | null
          id?: string
          image_count?: number
          model_version: string
          request_key: string
          requested_at?: string
          requested_by?: string | null
          sent_at?: string | null
          settled_at?: string | null
          status?: string
          training_id?: string | null
          updated_at?: string
        }
        Update: {
          asset_ids?: string[]
          character_id?: string | null
          character_name?: string
          error?: string | null
          id?: string
          image_count?: number
          model_version?: string
          request_key?: string
          requested_at?: string
          requested_by?: string | null
          sent_at?: string | null
          settled_at?: string | null
          status?: string
          training_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "soul_id_trainings_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soul_id_trainings_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      supercomputer_memories: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          scope: string
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          scope?: string
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          scope?: string
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supercomputer_memories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supercomputer_memories_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "supercomputer_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      supercomputer_messages: {
        Row: {
          attachments: Json
          content: string
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          model: string | null
          payload: Json
          role: string
          status: string
          superseded_at: string | null
          thread_id: string
          updated_at: string
        }
        Insert: {
          attachments?: Json
          content?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          model?: string | null
          payload?: Json
          role: string
          status?: string
          superseded_at?: string | null
          thread_id: string
          updated_at?: string
        }
        Update: {
          attachments?: Json
          content?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          model?: string | null
          payload?: Json
          role?: string
          status?: string
          superseded_at?: string | null
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supercomputer_messages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supercomputer_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "supercomputer_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      supercomputer_threads: {
        Row: {
          brief_id: string | null
          campaign_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_archived: boolean
          last_message_at: string
          pinned: boolean
          project_id: string | null
          settings: Json
          title: string
          updated_at: string
        }
        Insert: {
          brief_id?: string | null
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string
          pinned?: boolean
          project_id?: string | null
          settings?: Json
          title?: string
          updated_at?: string
        }
        Update: {
          brief_id?: string | null
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string
          pinned?: boolean
          project_id?: string | null
          settings?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supercomputer_threads_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "creative_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supercomputer_threads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supercomputer_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supercomputer_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          invited_by: string | null
          last_error: string | null
          last_sent_at: string | null
          revoked_at: string | null
          revoked_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          send_count: number
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          last_error?: string | null
          last_sent_at?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          send_count?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          last_error?: string | null
          last_sent_at?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          send_count?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_user_id_fkey"
            columns: ["user_id"]
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
          user_id: string | null
        }
        Insert: {
          actual_cost_usd?: number | null
          billing_status?: string
          created_at?: string
          estimated_cost_usd?: number | null
          generation_id: string
          id?: string
          model_registry_id: string
          user_id?: string | null
        }
        Update: {
          actual_cost_usd?: number | null
          billing_status?: string
          created_at?: string
          estimated_cost_usd?: number | null
          generation_id?: string
          id?: string
          model_registry_id?: string
          user_id?: string | null
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
      voiceovers: {
        Row: {
          alignment: Json | null
          asset_id: string | null
          campaign_id: string | null
          characters: number | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          duration_seconds: number | null
          error_code: string | null
          error_message: string | null
          id: string
          model: string | null
          project_id: string | null
          provider: string | null
          provider_request_id: string | null
          provider_voice_id: string | null
          script: string
          sequence_id: string | null
          spoken_text: string | null
          status: string
          updated_at: string
          voice_id: string | null
        }
        Insert: {
          alignment?: Json | null
          asset_id?: string | null
          campaign_id?: string | null
          characters?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          duration_seconds?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          model?: string | null
          project_id?: string | null
          provider?: string | null
          provider_request_id?: string | null
          provider_voice_id?: string | null
          script: string
          sequence_id?: string | null
          spoken_text?: string | null
          status?: string
          updated_at?: string
          voice_id?: string | null
        }
        Update: {
          alignment?: Json | null
          asset_id?: string | null
          campaign_id?: string | null
          characters?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          duration_seconds?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          model?: string | null
          project_id?: string | null
          provider?: string | null
          provider_request_id?: string | null
          provider_voice_id?: string | null
          script?: string
          sequence_id?: string | null
          spoken_text?: string | null
          status?: string
          updated_at?: string
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voiceovers_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voiceovers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voiceovers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voiceovers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voiceovers_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voiceovers_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "brand_voices"
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
      approve_long_video_storyboard: {
        Args: { p_by_person: boolean; p_run_id: string }
        Returns: Json
      }
      avatar_get_provider_secret: { Args: { _name: string }; Returns: string }
      avatar_set_provider_secret: {
        Args: { _meta: Json; _name: string; _value: string }
        Returns: undefined
      }
      check_member_spend_allowance: {
        Args: { _amount: number; _user_id: string }
        Returns: Json
      }
      check_spend_allowance: {
        Args: { _amount: number; _campaign_id: string; _project_id: string }
        Returns: Json
      }
      claim_added_voice: {
        Args: { p_attempt: string; p_fresh: string[] }
        Returns: Json
      }
      claim_long_video_clip: {
        Args: { p_claimed_at: string; p_clip_id: string }
        Returns: Json
      }
      claim_long_video_keyframe: {
        Args: {
          p_attempt: number
          p_keyframe_id: string
          p_previous_asset_id: string | null
          p_previous_attempt: number | null
          p_previous_id: string | null
        }
        Returns: Json
      }
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
      close_stalled_renders: {
        Args: { p_sequence_id: string; p_stalled_before: string }
        Returns: number
      }
      fail_sequence_render: {
        Args: {
          p_error_code: string
          p_error_message: string
          p_render_id: string
        }
        Returns: undefined
      }
      higgsfield_api_spend_since: { Args: { p_since: string }; Returns: Json }
      is_active_member: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      katana_recount_credits: {
        Args: { p_run_id: string }
        Returns: number
      }
      katana_release_credits: {
        Args: { p_credits: number; p_reason: string | null; p_run_id: string; p_tool_use_id: string }
        Returns: number
      }
      katana_reserve_credits: {
        Args: {
          p_credits: number
          p_items: Json
          p_priced: boolean
          p_run_id: string
          p_tool_name: string
          p_tool_use_id: string
        }
        Returns: {
          o_allowed: boolean
          o_committed: number
          o_existing: boolean
          o_limit: number
        }[]
      }
      reclaim_sequence_render: {
        Args: { p_render_id: string; p_sequence_id: string }
        Returns: string
      }
      record_added_voice: {
        Args: { p_attempt: string; p_voice: string }
        Returns: boolean
      }
      record_long_video_clip_try: {
        Args: {
          p_opening_attempt: number
          p_quotes: Json
          p_refusal: string | null
          p_run_id: string
        }
        Returns: Json
      }
      redo_long_video_keyframes: {
        Args: {
          p_confirm_uncertain: boolean
          p_keyframe_ids: string[]
          p_note: string
          p_run_id: string
          p_target_id: string
        }
        Returns: Json
      }
      revoke_team_invitation: {
        Args: { p_invitation_id: string; p_revoked_by: string }
        Returns: string
      }
      search_music_tracks: {
        Args: {
          p_after_created_at?: string
          p_after_id?: string
          p_include_archived?: boolean
          p_kind?: string
          p_limit?: number
          p_query?: string
          p_ready_only?: boolean
        }
        Returns: {
          artist: string | null
          asset_id: string | null
          attribution: string | null
          bar_features: Json | null
          beats: Json | null
          bpm: number | null
          campaign_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          duration_seconds: number | null
          error_code: string | null
          error_message: string | null
          genres: string[]
          id: string
          instrumental: boolean | null
          is_archived: boolean
          kind: string
          license: string
          license_url: string | null
          license_version: string | null
          model: string | null
          moods: string[]
          parent_track_id: string | null
          project_id: string | null
          prompt: string | null
          provider: string | null
          provider_request_id: string | null
          rights: Json
          source: string
          source_id: string | null
          source_url: string | null
          status: string
          structure: Json | null
          tags: string[]
          title: string
          updated_at: string
          usage_notes: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "music_tracks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_default_brand_kit: {
        Args: { _kit_id: string }
        Returns: undefined
      }
      set_default_brand_voice: { Args: { p_voice_id: string }; Returns: string }
      settle_team_invitations: { Args: never; Returns: number }
      start_sequence_render: {
        Args: {
          p_dedupe_key: string
          p_render_id: string
          p_sequence_id: string
          p_stalled_before: string
          p_task: Json
          p_task_id: string
          p_timeline: Json
          p_user_id: string
          p_version: number
        }
        Returns: Json
      }
      team_account_for_email: {
        Args: { p_email: string }
        Returns: {
          confirmed: boolean
          has_password: boolean
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
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
