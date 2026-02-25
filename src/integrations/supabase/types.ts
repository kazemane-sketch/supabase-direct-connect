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
      bank_accounts: {
        Row: {
          account_name: string | null
          bank_name: string | null
          company_id: string
          currency: string
          current_balance: number
          iban: string | null
          id: string
        }
        Insert: {
          account_name?: string | null
          bank_name?: string | null
          company_id: string
          currency?: string
          current_balance?: number
          iban?: string | null
          id?: string
        }
        Update: {
          account_name?: string | null
          bank_name?: string | null
          company_id?: string
          currency?: string
          current_balance?: number
          iban?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          branch: string | null
          cbi_flow_id: string | null
          commission: number | null
          company_id: string
          counterpart_iban: string | null
          counterpart_name: string | null
          description: string | null
          hash: string | null
          id: string
          import_batch_id: string | null
          raw_text: string | null
          reconciliation_status: string
          reference: string | null
          transaction_date: string
          value_date: string | null
        }
        Insert: {
          amount: number
          bank_account_id: string
          branch?: string | null
          cbi_flow_id?: string | null
          commission?: number | null
          company_id: string
          counterpart_iban?: string | null
          counterpart_name?: string | null
          description?: string | null
          hash?: string | null
          id?: string
          import_batch_id?: string | null
          raw_text?: string | null
          reconciliation_status?: string
          reference?: string | null
          transaction_date: string
          value_date?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string
          branch?: string | null
          cbi_flow_id?: string | null
          commission?: number | null
          company_id?: string
          counterpart_iban?: string | null
          counterpart_name?: string | null
          description?: string | null
          hash?: string | null
          id?: string
          import_batch_id?: string | null
          raw_text?: string | null
          reconciliation_status?: string
          reference?: string | null
          transaction_date?: string
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          code: string | null
          company_id: string
          id: string
          name: string | null
          parent_id: string | null
          type: string | null
        }
        Insert: {
          code?: string | null
          company_id: string
          id?: string
          name?: string | null
          parent_id?: string | null
          type?: string | null
        }
        Update: {
          code?: string | null
          company_id?: string
          id?: string
          name?: string | null
          parent_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          fiscal_code: string | null
          id: string
          name: string
          pec: string | null
          province: string | null
          sdi_code: string | null
          vat_number: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          fiscal_code?: string | null
          id?: string
          name: string
          pec?: string | null
          province?: string | null
          sdi_code?: string | null
          vat_number?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          fiscal_code?: string | null
          id?: string
          name?: string
          pec?: string | null
          province?: string | null
          sdi_code?: string | null
          vat_number?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      counterparties: {
        Row: {
          address: string | null
          approved_at: string | null
          approved_by: string | null
          auto_created: boolean
          cap: string | null
          city: string | null
          company_id: string
          country: string | null
          created_at: string
          email: string | null
          entity_type: string | null
          fiscal_code: string | null
          iban: string | null
          id: string
          is_approved: boolean
          name: string
          notes: string | null
          payment_method: string | null
          payment_terms_days: number | null
          pec: string | null
          phone: string | null
          province: string | null
          sdi_code: string | null
          type: string
          vat_number: string | null
          vies_name: string | null
        }
        Insert: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auto_created?: boolean
          cap?: string | null
          city?: string | null
          company_id: string
          country?: string | null
          created_at?: string
          email?: string | null
          entity_type?: string | null
          fiscal_code?: string | null
          iban?: string | null
          id?: string
          is_approved?: boolean
          name: string
          notes?: string | null
          payment_method?: string | null
          payment_terms_days?: number | null
          pec?: string | null
          phone?: string | null
          province?: string | null
          sdi_code?: string | null
          type?: string
          vat_number?: string | null
          vies_name?: string | null
        }
        Update: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auto_created?: boolean
          cap?: string | null
          city?: string | null
          company_id?: string
          country?: string | null
          created_at?: string
          email?: string | null
          entity_type?: string | null
          fiscal_code?: string | null
          iban?: string | null
          id?: string
          is_approved?: boolean
          name?: string
          notes?: string | null
          payment_method?: string | null
          payment_terms_days?: number | null
          pec?: string | null
          phone?: string | null
          province?: string | null
          sdi_code?: string | null
          type?: string
          vat_number?: string | null
          vies_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "counterparties_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          bank_account_id: string | null
          company_id: string
          file_name: string | null
          id: string
          import_type: string | null
          records_duplicated: number | null
          records_imported: number | null
          status: string | null
        }
        Insert: {
          bank_account_id?: string | null
          company_id: string
          file_name?: string | null
          id?: string
          import_type?: string | null
          records_duplicated?: number | null
          records_imported?: number | null
          status?: string | null
        }
        Update: {
          bank_account_id?: string | null
          company_id?: string
          file_name?: string | null
          id?: string
          import_type?: string | null
          records_duplicated?: number | null
          records_imported?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_import_files: {
        Row: {
          batch_id: string | null
          company_id: string
          created_at: string
          error_code: string | null
          error_message: string | null
          filename: string
          had_replacement_chars: boolean
          id: string
          invoice_id: string | null
          meta: Json | null
          source_type: string
          status: string
          storage_path: string
        }
        Insert: {
          batch_id?: string | null
          company_id: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          filename: string
          had_replacement_chars?: boolean
          id?: string
          invoice_id?: string | null
          meta?: Json | null
          source_type: string
          status?: string
          storage_path: string
        }
        Update: {
          batch_id?: string | null
          company_id?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          filename?: string
          had_replacement_chars?: boolean
          id?: string
          invoice_id?: string | null
          meta?: Json | null
          source_type?: string
          status?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_import_files_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_projects: {
        Row: {
          company_id: string | null
          id: string
          invoice_line_id: string
          notes: string | null
          percentage: number
          project_id: string
        }
        Insert: {
          company_id?: string | null
          id?: string
          invoice_line_id: string
          notes?: string | null
          percentage?: number
          project_id: string
        }
        Update: {
          company_id?: string | null
          id?: string
          invoice_line_id?: string
          notes?: string | null
          percentage?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_projects_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "invoice_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          company_id: string | null
          description: string
          id: string
          invoice_id: string
          product_id: string | null
          quantity: number
          quantity_tons: number | null
          sort_order: number
          total: number
          unit_of_measure: string | null
          unit_price: number
          vat_rate: number | null
        }
        Insert: {
          company_id?: string | null
          description: string
          id?: string
          invoice_id: string
          product_id?: string | null
          quantity?: number
          quantity_tons?: number | null
          sort_order?: number
          total?: number
          unit_of_measure?: string | null
          unit_price?: number
          vat_rate?: number | null
        }
        Update: {
          company_id?: string | null
          description?: string
          id?: string
          invoice_id?: string
          product_id?: string | null
          quantity?: number
          quantity_tons?: number | null
          sort_order?: number
          total?: number
          unit_of_measure?: string | null
          unit_price?: number
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          company_id: string
          counterpart_id: string | null
          counterpart_name: string
          counterpart_vat: string | null
          direction: string
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string | null
          original_filename: string | null
          paid_amount: number
          payment_method: string | null
          payment_status: string
          pdf_storage_path: string | null
          raw_xml: string | null
          reconciliation_status: string
          source: string
          subtotal: number | null
          total_amount: number
          vat_amount: number | null
        }
        Insert: {
          company_id: string
          counterpart_id?: string | null
          counterpart_name: string
          counterpart_vat?: string | null
          direction: string
          due_date?: string | null
          id?: string
          invoice_date: string
          invoice_number?: string | null
          original_filename?: string | null
          paid_amount?: number
          payment_method?: string | null
          payment_status?: string
          pdf_storage_path?: string | null
          raw_xml?: string | null
          reconciliation_status?: string
          source?: string
          subtotal?: number | null
          total_amount: number
          vat_amount?: number | null
        }
        Update: {
          company_id?: string
          counterpart_id?: string | null
          counterpart_name?: string
          counterpart_vat?: string | null
          direction?: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          original_filename?: string | null
          paid_amount?: number
          payment_method?: string | null
          payment_status?: string
          pdf_storage_path?: string | null
          raw_xml?: string | null
          reconciliation_status?: string
          source?: string
          subtotal?: number | null
          total_amount?: number
          vat_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_counterpart_id_fkey"
            columns: ["counterpart_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          company_id: string
          id: string
          is_active: boolean
          name: string
          price_per_unit: number | null
          unit: string
        }
        Insert: {
          category?: string
          company_id: string
          id?: string
          is_active?: boolean
          name: string
          price_per_unit?: number | null
          unit?: string
        }
        Update: {
          category?: string
          company_id?: string
          id?: string
          is_active?: boolean
          name?: string
          price_per_unit?: number | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget: number | null
          code: string | null
          company_id: string
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: string
        }
        Insert: {
          budget?: number | null
          code?: string | null
          company_id: string
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: string
        }
        Update: {
          budget?: number | null
          code?: string | null
          company_id?: string
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_rules: {
        Row: {
          amount_max: number | null
          amount_min: number | null
          chart_of_accounts_id: string | null
          company_id: string
          counterpart_name_pattern: string | null
          description_pattern: string | null
          id: string
          is_active: boolean
          project_id: string | null
          usage_count: number
        }
        Insert: {
          amount_max?: number | null
          amount_min?: number | null
          chart_of_accounts_id?: string | null
          company_id: string
          counterpart_name_pattern?: string | null
          description_pattern?: string | null
          id?: string
          is_active?: boolean
          project_id?: string | null
          usage_count?: number
        }
        Update: {
          amount_max?: number | null
          amount_min?: number | null
          chart_of_accounts_id?: string | null
          company_id?: string
          counterpart_name_pattern?: string | null
          description_pattern?: string | null
          id?: string
          is_active?: boolean
          project_id?: string | null
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_rules_chart_of_accounts_id_fkey"
            columns: ["chart_of_accounts_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_rules_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliations: {
        Row: {
          ai_confidence: number | null
          ai_reasoning: string | null
          ai_suggested: boolean
          bank_transaction_id: string
          chart_of_accounts_id: string | null
          company_id: string
          id: string
          invoice_id: string | null
          notes: string | null
          project_id: string | null
          reconciled_amount: number
          status: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_reasoning?: string | null
          ai_suggested?: boolean
          bank_transaction_id: string
          chart_of_accounts_id?: string | null
          company_id: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          project_id?: string | null
          reconciled_amount: number
          status?: string
        }
        Update: {
          ai_confidence?: number | null
          ai_reasoning?: string | null
          ai_suggested?: boolean
          bank_transaction_id?: string
          chart_of_accounts_id?: string | null
          company_id?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          project_id?: string | null
          reconciled_amount?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliations_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_chart_of_accounts_id_fkey"
            columns: ["chart_of_accounts_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_company_row: { Args: { cid: string }; Returns: boolean }
      company_role: { Args: { cid: string }; Returns: string }
      is_company_member: { Args: { cid: string }; Returns: boolean }
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
