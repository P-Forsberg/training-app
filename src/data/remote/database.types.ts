export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ai_usage: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          input_tokens: number
          month: string
          output_tokens: number
          owner: string
          requests: number
          server_updated_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          input_tokens?: number
          month: string
          output_tokens?: number
          owner: string
          requests?: number
          server_updated_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          input_tokens?: number
          month?: string
          output_tokens?: number
          owner?: string
          requests?: number
          server_updated_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      exercises: {
        Row: {
          aliases: string[]
          canonical_name: string
          category: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_barbell: boolean
          movement_pattern: string | null
          notes: string | null
          owner: string | null
          server_updated_at: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          canonical_name: string
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_barbell?: boolean
          movement_pattern?: string | null
          notes?: string | null
          owner?: string | null
          server_updated_at?: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          canonical_name?: string
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_barbell?: boolean
          movement_pattern?: string | null
          notes?: string | null
          owner?: string | null
          server_updated_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      import_profiles: {
        Row: {
          adapter: string
          created_at: string
          deleted_at: string | null
          id: string
          mapping: Json
          name: string
          owner: string
          server_updated_at: string
          updated_at: string
        }
        Insert: {
          adapter: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          mapping: Json
          name: string
          owner: string
          server_updated_at?: string
          updated_at?: string
        }
        Update: {
          adapter?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          mapping?: Json
          name?: string
          owner?: string
          server_updated_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      logged_runs: {
        Row: {
          cooldown_km: number | null
          created_at: string
          deleted_at: string | null
          distance_km: number | null
          distance_manual: boolean
          duration_sec: number | null
          elevation_m: number | null
          id: string
          intervals_done: number[]
          is_night: boolean
          logged_session_id: string
          main_km: number | null
          owner: string
          server_updated_at: string
          shoe_id: string | null
          surface: string | null
          updated_at: string
          warmup_km: number | null
        }
        Insert: {
          cooldown_km?: number | null
          created_at?: string
          deleted_at?: string | null
          distance_km?: number | null
          distance_manual?: boolean
          duration_sec?: number | null
          elevation_m?: number | null
          id?: string
          intervals_done?: number[]
          is_night?: boolean
          logged_session_id: string
          main_km?: number | null
          owner: string
          server_updated_at?: string
          shoe_id?: string | null
          surface?: string | null
          updated_at?: string
          warmup_km?: number | null
        }
        Update: {
          cooldown_km?: number | null
          created_at?: string
          deleted_at?: string | null
          distance_km?: number | null
          distance_manual?: boolean
          duration_sec?: number | null
          elevation_m?: number | null
          id?: string
          intervals_done?: number[]
          is_night?: boolean
          logged_session_id?: string
          main_km?: number | null
          owner?: string
          server_updated_at?: string
          shoe_id?: string | null
          surface?: string | null
          updated_at?: string
          warmup_km?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "logged_runs_logged_session_id_fkey"
            columns: ["logged_session_id"]
            isOneToOne: true
            referencedRelation: "logged_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logged_runs_shoe_id_fkey"
            columns: ["shoe_id"]
            isOneToOne: false
            referencedRelation: "shoe_mileage"
            referencedColumns: ["shoe_id"]
          },
          {
            foreignKeyName: "logged_runs_shoe_id_fkey"
            columns: ["shoe_id"]
            isOneToOne: false
            referencedRelation: "shoes"
            referencedColumns: ["id"]
          },
        ]
      }
      logged_sessions: {
        Row: {
          comment: string | null
          created_at: string
          date: string
          deleted_at: string | null
          feel: number | null
          id: string
          moved_from: string | null
          owner: string
          planned_session_id: string | null
          rpe: number | null
          server_updated_at: string
          status: string
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          date: string
          deleted_at?: string | null
          feel?: number | null
          id?: string
          moved_from?: string | null
          owner: string
          planned_session_id?: string | null
          rpe?: number | null
          server_updated_at?: string
          status: string
          title?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          date?: string
          deleted_at?: string | null
          feel?: number | null
          id?: string
          moved_from?: string | null
          owner?: string
          planned_session_id?: string | null
          rpe?: number | null
          server_updated_at?: string
          status?: string
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "logged_sessions_planned_session_id_fkey"
            columns: ["planned_session_id"]
            isOneToOne: false
            referencedRelation: "planned_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      logged_sets: {
        Row: {
          created_at: string
          deleted_at: string | null
          duration_sec: number | null
          exercise_id: string | null
          id: string
          is_warmup: boolean
          logged_session_id: string
          owner: string
          planned_item_id: string | null
          reps: number | null
          rpe: number | null
          server_updated_at: string
          set_no: number
          skipped: boolean
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          duration_sec?: number | null
          exercise_id?: string | null
          id?: string
          is_warmup?: boolean
          logged_session_id: string
          owner: string
          planned_item_id?: string | null
          reps?: number | null
          rpe?: number | null
          server_updated_at?: string
          set_no: number
          skipped?: boolean
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          duration_sec?: number | null
          exercise_id?: string | null
          id?: string
          is_warmup?: boolean
          logged_session_id?: string
          owner?: string
          planned_item_id?: string | null
          reps?: number | null
          rpe?: number | null
          server_updated_at?: string
          set_no?: number
          skipped?: boolean
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "logged_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logged_sets_logged_session_id_fkey"
            columns: ["logged_session_id"]
            isOneToOne: false
            referencedRelation: "logged_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logged_sets_planned_item_id_fkey"
            columns: ["planned_item_id"]
            isOneToOne: false
            referencedRelation: "planned_items"
            referencedColumns: ["id"]
          },
        ]
      }
      mutations: {
        Row: {
          after: Json | null
          batch_id: string
          before: Json | null
          created_at: string
          deleted_at: string | null
          entity: string
          entity_id: string
          id: string
          owner: string
          proposal_id: string | null
          seq: number
          server_updated_at: string
          undone_at: string | null
          updated_at: string
        }
        Insert: {
          after?: Json | null
          batch_id: string
          before?: Json | null
          created_at?: string
          deleted_at?: string | null
          entity: string
          entity_id: string
          id?: string
          owner: string
          proposal_id?: string | null
          seq?: number
          server_updated_at?: string
          undone_at?: string | null
          updated_at?: string
        }
        Update: {
          after?: Json | null
          batch_id?: string
          before?: Json | null
          created_at?: string
          deleted_at?: string | null
          entity?: string
          entity_id?: string
          id?: string
          owner?: string
          proposal_id?: string | null
          seq?: number
          server_updated_at?: string
          undone_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mutations_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_items: {
        Row: {
          created_at: string
          deleted_at: string | null
          distance_km: number | null
          duration_sec: number | null
          exercise_id: string | null
          id: string
          kind: string
          load: number | null
          load_unit: string | null
          owner: string
          parse_confidence: number
          per_side: boolean
          planned_session_id: string
          program_id: string
          raw_text: string | null
          rep_scheme: string | null
          reps: number | null
          reps_max: number | null
          server_updated_at: string
          sets: number | null
          sort: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          distance_km?: number | null
          duration_sec?: number | null
          exercise_id?: string | null
          id?: string
          kind: string
          load?: number | null
          load_unit?: string | null
          owner: string
          parse_confidence?: number
          per_side?: boolean
          planned_session_id: string
          program_id: string
          raw_text?: string | null
          rep_scheme?: string | null
          reps?: number | null
          reps_max?: number | null
          server_updated_at?: string
          sets?: number | null
          sort?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          distance_km?: number | null
          duration_sec?: number | null
          exercise_id?: string | null
          id?: string
          kind?: string
          load?: number | null
          load_unit?: string | null
          owner?: string
          parse_confidence?: number
          per_side?: boolean
          planned_session_id?: string
          program_id?: string
          raw_text?: string | null
          rep_scheme?: string | null
          reps?: number | null
          reps_max?: number | null
          server_updated_at?: string
          sets?: number | null
          sort?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_items_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_items_planned_session_id_fkey"
            columns: ["planned_session_id"]
            isOneToOne: false
            referencedRelation: "planned_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_items_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_sessions: {
        Row: {
          created_at: string
          date: string
          day_of_week: number
          deleted_at: string | null
          id: string
          notes: string | null
          owner: string
          program_id: string
          program_week_id: string | null
          server_updated_at: string
          sort: number
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          day_of_week: number
          deleted_at?: string | null
          id?: string
          notes?: string | null
          owner: string
          program_id: string
          program_week_id?: string | null
          server_updated_at?: string
          sort?: number
          title?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          day_of_week?: number
          deleted_at?: string | null
          id?: string
          notes?: string | null
          owner?: string
          program_id?: string
          program_week_id?: string | null
          server_updated_at?: string
          sort?: number
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_sessions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_sessions_program_week_id_fkey"
            columns: ["program_week_id"]
            isOneToOne: false
            referencedRelation: "program_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          display_name: string | null
          goal: string | null
          id: string
          injury_notes: string | null
          locale: string
          owner: string
          race_date: string | null
          server_updated_at: string
          theme: string
          units: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          goal?: string | null
          id: string
          injury_notes?: string | null
          locale?: string
          owner: string
          race_date?: string | null
          server_updated_at?: string
          theme?: string
          units?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          goal?: string | null
          id?: string
          injury_notes?: string | null
          locale?: string
          owner?: string
          race_date?: string | null
          server_updated_at?: string
          theme?: string
          units?: string
          updated_at?: string
        }
        Relationships: []
      }
      program_notes: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          key: string
          owner: string
          program_id: string
          section: string
          server_updated_at: string
          sort: number
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          key: string
          owner: string
          program_id: string
          section: string
          server_updated_at?: string
          sort?: number
          updated_at?: string
          value?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          key?: string
          owner?: string
          program_id?: string
          section?: string
          server_updated_at?: string
          sort?: number
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_notes_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_shares: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          owner: string
          program_id: string
          role: string
          server_updated_at: string
          shared_with: string
          shared_with_email: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          owner: string
          program_id: string
          role?: string
          server_updated_at?: string
          shared_with: string
          shared_with_email?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          owner?: string
          program_id?: string
          role?: string
          server_updated_at?: string
          shared_with?: string
          shared_with_email?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_shares_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_weeks: {
        Row: {
          created_at: string
          deleted_at: string | null
          focus_text: string | null
          id: string
          meta: Json
          owner: string
          phase: string | null
          program_id: string
          server_updated_at: string
          start_date: string
          updated_at: string
          week_no: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          focus_text?: string | null
          id?: string
          meta?: Json
          owner: string
          phase?: string | null
          program_id: string
          server_updated_at?: string
          start_date: string
          updated_at?: string
          week_no: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          focus_text?: string | null
          id?: string
          meta?: Json
          owner?: string
          phase?: string | null
          program_id?: string
          server_updated_at?: string
          start_date?: string
          updated_at?: string
          week_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_weeks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          created_at: string
          deleted_at: string | null
          discipline: string | null
          id: string
          is_active: boolean
          is_template: boolean
          name: string
          owner: string
          race_date: string | null
          schema_version: number
          server_updated_at: string
          source: string
          source_meta: Json
          start_date: string
          updated_at: string
          weeks: number | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          discipline?: string | null
          id?: string
          is_active?: boolean
          is_template?: boolean
          name: string
          owner: string
          race_date?: string | null
          schema_version?: number
          server_updated_at?: string
          source: string
          source_meta?: Json
          start_date: string
          updated_at?: string
          weeks?: number | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          discipline?: string | null
          id?: string
          is_active?: boolean
          is_template?: boolean
          name?: string
          owner?: string
          race_date?: string | null
          schema_version?: number
          server_updated_at?: string
          source?: string
          source_meta?: Json
          start_date?: string
          updated_at?: string
          weeks?: number | null
        }
        Relationships: []
      }
      proposals: {
        Row: {
          applied_at: string | null
          created_at: string
          deleted_at: string | null
          diff: Json
          id: string
          owner: string
          program_id: string | null
          prompt: string | null
          rationale: string | null
          server_updated_at: string
          status: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          deleted_at?: string | null
          diff: Json
          id?: string
          owner: string
          program_id?: string | null
          prompt?: string | null
          rationale?: string | null
          server_updated_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          deleted_at?: string | null
          diff?: Json
          id?: string
          owner?: string
          program_id?: string | null
          prompt?: string | null
          rationale?: string | null
          server_updated_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      shoes: {
        Row: {
          brand: string | null
          created_at: string
          deleted_at: string | null
          id: string
          model: string | null
          name: string
          owner: string
          purchased_on: string | null
          retire_km: number
          retired_on: string | null
          server_updated_at: string
          start_km: number
          surface_type: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          model?: string | null
          name: string
          owner: string
          purchased_on?: string | null
          retire_km?: number
          retired_on?: string | null
          server_updated_at?: string
          start_km?: number
          surface_type?: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          model?: string | null
          name?: string
          owner?: string
          purchased_on?: string | null
          retire_km?: number
          retired_on?: string | null
          server_updated_at?: string
          start_km?: number
          surface_type?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      shoe_mileage: {
        Row: {
          owner: string | null
          shoe_id: string | null
          total_km: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      attach_row_triggers: { Args: { tbl: unknown }; Returns: undefined }
      can_read_program: { Args: { pid: string }; Returns: boolean }
      share_program: {
        Args: { p_email: string; p_program_id: string }
        Returns: string
      }
      shares_with_me: { Args: { owner_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

