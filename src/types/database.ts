export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      user_sessions: {
        Row: {
          id: string
          user_id: string | null
          session_name: string | null
          context: Json | null
          created_at: string | null
          updated_at: string | null
          is_active: boolean | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          session_name?: string | null
          context?: Json | null
          created_at?: string | null
          updated_at?: string | null
          is_active?: boolean | null
        }
        Update: {
          id?: string
          user_id?: string | null
          session_name?: string | null
          context?: Json | null
          created_at?: string | null
          updated_at?: string | null
          is_active?: boolean | null
        }
      }
      research_tasks: {
        Row: {
          id: string
          user_id: string | null
          session_id: string | null
          query: string
          query_embedding: string | null
          status: string | null
          results: Json | null
          total_cost: number | null
          duration_seconds: number | null
          created_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          session_id?: string | null
          query: string
          query_embedding?: string | null
          status?: string | null
          results?: Json | null
          total_cost?: number | null
          duration_seconds?: number | null
          created_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          session_id?: string | null
          query?: string
          query_embedding?: string | null
          status?: string | null
          results?: Json | null
          total_cost?: number | null
          duration_seconds?: number | null
          created_at?: string | null
          completed_at?: string | null
        }
      }
      research_results: {
        Row: {
          id: string
          task_id: string | null
          type: string
          content: Json
          metadata: Json | null
          embedding: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          task_id?: string | null
          type: string
          content: Json
          metadata?: Json | null
          embedding?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          task_id?: string | null
          type?: string
          content?: Json
          metadata?: Json | null
          embedding?: string | null
          created_at?: string | null
        }
      }
      sandbox_executions: {
        Row: {
          id: string
          task_id: string | null
          sandbox_id: string
          commands: Json | null
          output: string | null
          duration: number
          cost: number
          started_at: string
          ended_at: string
          success: boolean | null
        }
        Insert: {
          id?: string
          task_id?: string | null
          sandbox_id: string
          commands?: Json | null
          output?: string | null
          duration: number
          cost: number
          started_at: string
          ended_at: string
          success?: boolean | null
        }
        Update: {
          id?: string
          task_id?: string | null
          sandbox_id?: string
          commands?: Json | null
          output?: string | null
          duration?: number
          cost?: number
          started_at?: string
          ended_at?: string
          success?: boolean | null
        }
      }
      messages: {
        Row: {
          id: string
          session_id: string | null
          task_id: string | null
          role: string
          content: string
          metadata: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          session_id?: string | null
          task_id?: string | null
          role: string
          content: string
          metadata?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          session_id?: string | null
          task_id?: string | null
          role?: string
          content?: string
          metadata?: Json | null
          created_at?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      similarity_search: {
        Args: {
          query_embedding: string
          match_threshold: number
          match_count: number
        }
        Returns: {
          id: string
          content: Json
          similarity: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}