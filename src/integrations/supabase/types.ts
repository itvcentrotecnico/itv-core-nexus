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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          module_key: string | null
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          module_key?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          module_key?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      caixa_estornos: {
        Row: {
          created_at: string
          forma_estorno: string | null
          id: string
          lancamento_id: string
          motivo: string
          observacao: string | null
          responsavel_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          forma_estorno?: string | null
          id?: string
          lancamento_id: string
          motivo: string
          observacao?: string | null
          responsavel_id: string
          valor: number
        }
        Update: {
          created_at?: string
          forma_estorno?: string | null
          id?: string
          lancamento_id?: string
          motivo?: string
          observacao?: string | null
          responsavel_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "caixa_estornos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "caixa_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_estornos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_fechamentos: {
        Row: {
          data_referencia: string
          diferenca: number | null
          dinheiro_esperado: number
          dinheiro_informado: number
          faturamento_total: number
          fechado_em: string
          id: string
          motivo_reabertura: string | null
          observacao: string | null
          reaberto_em: string | null
          reaberto_por: string | null
          receita_liquida: number
          responsavel_id: string
          resumo_pagamentos: Json
          status: Database["public"]["Enums"]["caixa_fechamento_status"]
          taxas_total: number
        }
        Insert: {
          data_referencia: string
          diferenca?: number | null
          dinheiro_esperado?: number
          dinheiro_informado?: number
          faturamento_total?: number
          fechado_em?: string
          id?: string
          motivo_reabertura?: string | null
          observacao?: string | null
          reaberto_em?: string | null
          reaberto_por?: string | null
          receita_liquida?: number
          responsavel_id: string
          resumo_pagamentos?: Json
          status?: Database["public"]["Enums"]["caixa_fechamento_status"]
          taxas_total?: number
        }
        Update: {
          data_referencia?: string
          diferenca?: number | null
          dinheiro_esperado?: number
          dinheiro_informado?: number
          faturamento_total?: number
          fechado_em?: string
          id?: string
          motivo_reabertura?: string | null
          observacao?: string | null
          reaberto_em?: string | null
          reaberto_por?: string | null
          receita_liquida?: number
          responsavel_id?: string
          resumo_pagamentos?: Json
          status?: Database["public"]["Enums"]["caixa_fechamento_status"]
          taxas_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "caixa_fechamentos_reaberto_por_fkey"
            columns: ["reaberto_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_fechamentos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_lancamentos: {
        Row: {
          alerta_duplicidade: boolean
          cancelado_em: string | null
          cancelado_por: string | null
          cliente: string | null
          created_at: string
          created_by: string | null
          data_lancamento: string
          desconto: number
          descricao: string | null
          id: string
          motivo_cancelamento: string | null
          observacao: string | null
          os: string | null
          receita_liquida: number
          responsavel_id: string
          status: Database["public"]["Enums"]["caixa_lancamento_status"]
          taxas_total: number
          tecnico_id: string | null
          tipo_receita_id: string
          updated_at: string
          updated_by: string | null
          valor_bruto: number
          valor_final: number | null
        }
        Insert: {
          alerta_duplicidade?: boolean
          cancelado_em?: string | null
          cancelado_por?: string | null
          cliente?: string | null
          created_at?: string
          created_by?: string | null
          data_lancamento?: string
          desconto?: number
          descricao?: string | null
          id?: string
          motivo_cancelamento?: string | null
          observacao?: string | null
          os?: string | null
          receita_liquida?: number
          responsavel_id: string
          status?: Database["public"]["Enums"]["caixa_lancamento_status"]
          taxas_total?: number
          tecnico_id?: string | null
          tipo_receita_id: string
          updated_at?: string
          updated_by?: string | null
          valor_bruto: number
          valor_final?: number | null
        }
        Update: {
          alerta_duplicidade?: boolean
          cancelado_em?: string | null
          cancelado_por?: string | null
          cliente?: string | null
          created_at?: string
          created_by?: string | null
          data_lancamento?: string
          desconto?: number
          descricao?: string | null
          id?: string
          motivo_cancelamento?: string | null
          observacao?: string | null
          os?: string | null
          receita_liquida?: number
          responsavel_id?: string
          status?: Database["public"]["Enums"]["caixa_lancamento_status"]
          taxas_total?: number
          tecnico_id?: string | null
          tipo_receita_id?: string
          updated_at?: string
          updated_by?: string | null
          valor_bruto?: number
          valor_final?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "caixa_lancamentos_cancelado_por_fkey"
            columns: ["cancelado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_lancamentos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_lancamentos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_lancamentos_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_lancamentos_tipo_receita_id_fkey"
            columns: ["tipo_receita_id"]
            isOneToOne: false
            referencedRelation: "tipos_receita"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_lancamentos_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_pagamentos: {
        Row: {
          created_at: string
          forma_pagamento_id: string
          id: string
          lancamento_id: string
          parcelas: number
          taxa_percentual: number
          taxa_valor: number
          valor: number
          valor_liquido: number | null
        }
        Insert: {
          created_at?: string
          forma_pagamento_id: string
          id?: string
          lancamento_id: string
          parcelas?: number
          taxa_percentual?: number
          taxa_valor?: number
          valor: number
          valor_liquido?: number | null
        }
        Update: {
          created_at?: string
          forma_pagamento_id?: string
          id?: string
          lancamento_id?: string
          parcelas?: number
          taxa_percentual?: number
          taxa_valor?: number
          valor?: number
          valor_liquido?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "caixa_pagamentos_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_pagamentos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "caixa_lancamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_pecas: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      custos_estornos: {
        Row: {
          created_at: string
          created_by: string | null
          custo_os_id: string
          id: string
          motivo: string
          quantidade: number
          valor: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custo_os_id: string
          id?: string
          motivo: string
          quantidade: number
          valor: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custo_os_id?: string
          id?: string
          motivo?: string
          quantidade?: number
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "custos_estornos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custos_estornos_custo_os_id_fkey"
            columns: ["custo_os_id"]
            isOneToOne: false
            referencedRelation: "custos_os"
            referencedColumns: ["id"]
          },
        ]
      }
      custos_os: {
        Row: {
          cancelado_em: string | null
          cancelado_por: string | null
          categoria_id: string | null
          compatibilidade: string | null
          created_at: string
          created_by: string | null
          custo_total: number
          custo_unitario: number
          data_lancamento: string
          descricao: string
          devolvido_total: number
          fornecedor_id: string | null
          id: string
          marca: string | null
          modelo: string | null
          motivo_cancelamento: string | null
          observacao: string | null
          os: string
          quantidade: number
          status: Database["public"]["Enums"]["custo_os_status"]
          tecnico_id: string | null
          tipo_custo_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          categoria_id?: string | null
          compatibilidade?: string | null
          created_at?: string
          created_by?: string | null
          custo_total: number
          custo_unitario: number
          data_lancamento?: string
          descricao: string
          devolvido_total?: number
          fornecedor_id?: string | null
          id?: string
          marca?: string | null
          modelo?: string | null
          motivo_cancelamento?: string | null
          observacao?: string | null
          os: string
          quantidade?: number
          status?: Database["public"]["Enums"]["custo_os_status"]
          tecnico_id?: string | null
          tipo_custo_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          categoria_id?: string | null
          compatibilidade?: string | null
          created_at?: string
          created_by?: string | null
          custo_total?: number
          custo_unitario?: number
          data_lancamento?: string
          descricao?: string
          devolvido_total?: number
          fornecedor_id?: string | null
          id?: string
          marca?: string | null
          modelo?: string | null
          motivo_cancelamento?: string | null
          observacao?: string | null
          os?: string
          quantidade?: number
          status?: Database["public"]["Enums"]["custo_os_status"]
          tecnico_id?: string | null
          tipo_custo_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custos_os_cancelado_por_fkey"
            columns: ["cancelado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custos_os_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_pecas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custos_os_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custos_os_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custos_os_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custos_os_tipo_custo_id_fkey"
            columns: ["tipo_custo_id"]
            isOneToOne: false
            referencedRelation: "tipos_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custos_os_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      formas_pagamento: {
        Row: {
          ativo: boolean
          created_at: string
          eh_dinheiro: boolean
          id: string
          nome: string
          ordem: number
          taxa_padrao_percentual: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          eh_dinheiro?: boolean
          id?: string
          nome: string
          ordem?: number
          taxa_padrao_percentual?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          eh_dinheiro?: boolean
          id?: string
          nome?: string
          ordem?: number
          taxa_padrao_percentual?: number
        }
        Relationships: []
      }
      fornecedores: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          observacao: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          observacao?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          observacao?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      modules: {
        Row: {
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          action: Database["public"]["Enums"]["permission_action"]
          id: string
          module_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          action: Database["public"]["Enums"]["permission_action"]
          id?: string
          module_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          action?: Database["public"]["Enums"]["permission_action"]
          id?: string
          module_key?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      tipos_custo: {
        Row: {
          ativo: boolean
          created_at: string
          eh_peca: boolean
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          eh_peca?: boolean
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          eh_peca?: boolean
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      tipos_receita: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          action: Database["public"]["Enums"]["permission_action"]
          allowed: boolean
          created_at: string
          id: string
          module_key: string
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["permission_action"]
          allowed?: boolean
          created_at?: string
          id?: string
          module_key: string
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["permission_action"]
          allowed?: boolean
          created_at?: string
          id?: string
          module_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      caixa_atualizar_lancamento: {
        Args: {
          p_cliente?: string
          p_confirmar_duplicidade?: boolean
          p_data: string
          p_desconto?: number
          p_descricao?: string
          p_id: string
          p_observacao?: string
          p_os?: string
          p_pagamentos?: Json
          p_tecnico_id?: string
          p_tipo_receita_id?: string
          p_valor_bruto?: number
        }
        Returns: Json
      }
      caixa_cancelar_lancamento: {
        Args: { p_id: string; p_motivo: string }
        Returns: Json
      }
      caixa_estornar_lancamento: {
        Args: {
          p_forma_estorno?: string
          p_id: string
          p_motivo: string
          p_observacao?: string
        }
        Returns: Json
      }
      caixa_fechar: {
        Args: {
          p_data_referencia: string
          p_dinheiro_informado: number
          p_observacao?: string
        }
        Returns: Json
      }
      caixa_indicadores: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      caixa_periodo_fechado: { Args: { p_data: string }; Returns: boolean }
      caixa_reabrir: {
        Args: { p_fechamento_id: string; p_motivo: string }
        Returns: Json
      }
      caixa_registrar_lancamento: {
        Args: {
          p_cliente?: string
          p_confirmar_duplicidade?: boolean
          p_data: string
          p_desconto?: number
          p_descricao?: string
          p_observacao?: string
          p_os?: string
          p_pagamentos?: Json
          p_tecnico_id?: string
          p_tipo_receita_id?: string
          p_valor_bruto?: number
        }
        Returns: Json
      }
      custos_atualizar: {
        Args: {
          p_categoria_id?: string
          p_compatibilidade?: string
          p_custo_unitario?: number
          p_data: string
          p_descricao: string
          p_fornecedor_id?: string
          p_id: string
          p_marca?: string
          p_modelo?: string
          p_observacao?: string
          p_os: string
          p_quantidade?: number
          p_tecnico_id?: string
          p_tipo_custo_id: string
        }
        Returns: Json
      }
      custos_cancelar: {
        Args: { p_id: string; p_motivo: string }
        Returns: Json
      }
      custos_confirmar: { Args: { p_id: string }; Returns: Json }
      custos_devolver: {
        Args: {
          p_id: string
          p_motivo: string
          p_quantidade: number
          p_valor: number
        }
        Returns: Json
      }
      custos_indicadores: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      custos_por_os: { Args: { p_from: string; p_to: string }; Returns: Json }
      custos_registrar: {
        Args: {
          p_categoria_id?: string
          p_compatibilidade?: string
          p_custo_unitario?: number
          p_data: string
          p_descricao: string
          p_fornecedor_id?: string
          p_marca?: string
          p_modelo?: string
          p_observacao?: string
          p_os: string
          p_quantidade?: number
          p_tecnico_id?: string
          p_tipo_custo_id: string
        }
        Returns: Json
      }
      has_permission: {
        Args: {
          _action: Database["public"]["Enums"]["permission_action"]
          _module: string
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      registrar_auditoria: {
        Args: { p_action: string; p_module: string; p_new?: Json; p_old?: Json }
        Returns: undefined
      }
      usuarios_basicos: {
        Args: never
        Returns: {
          email: string
          full_name: string
          id: string
          roles: string[]
        }[]
      }
    }
    Enums: {
      app_role: "administrador" | "gerente" | "vendas" | "tecnico"
      caixa_fechamento_status: "fechado" | "reaberto"
      caixa_lancamento_status: "ativo" | "cancelado" | "estornado"
      custo_os_status: "registrado" | "confirmado" | "cancelado" | "estornado"
      permission_action:
        | "visualizar"
        | "criar"
        | "editar"
        | "aprovar"
        | "pagar"
        | "cancelar"
        | "exportar"
        | "administrar"
        | "estornar"
        | "fechar"
        | "reabrir"
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
      app_role: ["administrador", "gerente", "vendas", "tecnico"],
      caixa_fechamento_status: ["fechado", "reaberto"],
      caixa_lancamento_status: ["ativo", "cancelado", "estornado"],
      custo_os_status: ["registrado", "confirmado", "cancelado", "estornado"],
      permission_action: [
        "visualizar",
        "criar",
        "editar",
        "aprovar",
        "pagar",
        "cancelar",
        "exportar",
        "administrar",
        "estornar",
        "fechar",
        "reabrir",
      ],
    },
  },
} as const
