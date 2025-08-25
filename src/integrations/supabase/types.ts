export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      analytics_performance_trends: {
        Row: {
          avg_score: number
          avg_time_seconds: number | null
          created_at: string | null
          id: string
          month: string
          total_questions: number
          year: number
        }
        Insert: {
          avg_score: number
          avg_time_seconds?: number | null
          created_at?: string | null
          id?: string
          month: string
          total_questions?: number
          year: number
        }
        Update: {
          avg_score?: number
          avg_time_seconds?: number | null
          created_at?: string | null
          id?: string
          month?: string
          total_questions?: number
          year?: number
        }
        Relationships: []
      }
      analytics_predictions: {
        Row: {
          confidence_score: number
          created_at: string | null
          id: string
          month: string
          predicted_score: number
          priority: string | null
          recommendation: string | null
          year: number
        }
        Insert: {
          confidence_score: number
          created_at?: string | null
          id?: string
          month: string
          predicted_score: number
          priority?: string | null
          recommendation?: string | null
          year: number
        }
        Update: {
          confidence_score?: number
          created_at?: string | null
          id?: string
          month?: string
          predicted_score?: number
          priority?: string | null
          recommendation?: string | null
          year?: number
        }
        Relationships: []
      }
      analytics_question_performance: {
        Row: {
          avg_time_seconds: number | null
          correct_count: number
          created_at: string | null
          id: string
          incorrect_count: number
          question_id: string | null
          updated_at: string | null
        }
        Insert: {
          avg_time_seconds?: number | null
          correct_count?: number
          created_at?: string | null
          id?: string
          incorrect_count?: number
          question_id?: string | null
          updated_at?: string | null
        }
        Update: {
          avg_time_seconds?: number | null
          correct_count?: number
          created_at?: string | null
          id?: string
          incorrect_count?: number
          question_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_question_performance_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_quiz_performance: {
        Row: {
          average_count: number
          avg_score: number
          completion_rate: number
          created_at: string | null
          excellent_count: number
          good_count: number
          id: string
          poor_count: number
          quiz_id: string | null
          updated_at: string | null
        }
        Insert: {
          average_count?: number
          avg_score: number
          completion_rate: number
          created_at?: string | null
          excellent_count?: number
          good_count?: number
          id?: string
          poor_count?: number
          quiz_id?: string | null
          updated_at?: string | null
        }
        Update: {
          average_count?: number
          avg_score?: number
          completion_rate?: number
          created_at?: string | null
          excellent_count?: number
          good_count?: number
          id?: string
          poor_count?: number
          quiz_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_quiz_performance_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_student_performance: {
        Row: {
          completion_time_seconds: number | null
          created_at: string | null
          id: string
          quiz_id: string | null
          score: number
          student_id: string | null
        }
        Insert: {
          completion_time_seconds?: number | null
          created_at?: string | null
          id?: string
          quiz_id?: string | null
          score: number
          student_id?: string | null
        }
        Update: {
          completion_time_seconds?: number | null
          created_at?: string | null
          id?: string
          quiz_id?: string | null
          score?: number
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_student_performance_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          role: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quiz_questions: {
        Row: {
          correct_answer: Json | null
          created_at: string
          id: string
          options: Json | null
          order_position: number
          quiz_id: string
          text: string
          type: string
        }
        Insert: {
          correct_answer?: Json | null
          created_at?: string
          id?: string
          options?: Json | null
          order_position: number
          quiz_id: string
          text: string
          type: string
        }
        Update: {
          correct_answer?: Json | null
          created_at?: string
          id?: string
          options?: Json | null
          order_position?: number
          quiz_id?: string
          text?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          invitation_code: string | null
          published: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          invitation_code?: string | null
          published?: boolean
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          invitation_code?: string | null
          published?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      populate_demo_analytics: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
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
    Enums: {},
  },
} as const
