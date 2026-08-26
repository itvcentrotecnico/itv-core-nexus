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
      cargos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
          setor_id: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          setor_id?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          setor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cargos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_financeiras: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
          tipo: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          tipo?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          tipo?: string
        }
        Relationships: []
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
      centros_custo: {
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
      colaborador_adiantamentos: {
        Row: {
          colaborador_id: string
          competencia_desconto: string
          created_at: string
          created_by: string | null
          data: string
          id: string
          motivo: string
          status: Database["public"]["Enums"]["adiantamento_status"]
          valor: number
        }
        Insert: {
          colaborador_id: string
          competencia_desconto: string
          created_at?: string
          created_by?: string | null
          data: string
          id?: string
          motivo: string
          status?: Database["public"]["Enums"]["adiantamento_status"]
          valor: number
        }
        Update: {
          colaborador_id?: string
          competencia_desconto?: string
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          motivo?: string
          status?: Database["public"]["Enums"]["adiantamento_status"]
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "colaborador_adiantamentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaborador_adiantamentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaborador_adiantamentos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      colaborador_beneficios: {
        Row: {
          ativo: boolean
          colaborador_id: string
          created_at: string
          descricao: string | null
          fim_vigencia: string | null
          id: string
          inicio_vigencia: string
          tipo: string
          valor: number
        }
        Insert: {
          ativo?: boolean
          colaborador_id: string
          created_at?: string
          descricao?: string | null
          fim_vigencia?: string | null
          id?: string
          inicio_vigencia: string
          tipo: string
          valor: number
        }
        Update: {
          ativo?: boolean
          colaborador_id?: string
          created_at?: string
          descricao?: string | null
          fim_vigencia?: string | null
          id?: string
          inicio_vigencia?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "colaborador_beneficios_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaborador_beneficios_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_view"
            referencedColumns: ["id"]
          },
        ]
      }
      colaborador_salarios: {
        Row: {
          colaborador_id: string
          created_at: string
          created_by: string | null
          fim_vigencia: string | null
          id: string
          inicio_vigencia: string
          motivo: string | null
          valor: number
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          created_by?: string | null
          fim_vigencia?: string | null
          id?: string
          inicio_vigencia: string
          motivo?: string | null
          valor: number
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          created_by?: string | null
          fim_vigencia?: string | null
          id?: string
          inicio_vigencia?: string
          motivo?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "colaborador_salarios_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaborador_salarios_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaborador_salarios_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      colaboradores: {
        Row: {
          cargo_id: string | null
          created_at: string
          created_by: string | null
          data_admissao: string | null
          desligado_em: string | null
          email: string | null
          id: string
          motivo_desligamento: string | null
          nome: string
          nome_exibicao: string | null
          observacao: string | null
          setor_id: string | null
          status: Database["public"]["Enums"]["colaborador_status"]
          telefone: string | null
          tipo_vinculo: string | null
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          cargo_id?: string | null
          created_at?: string
          created_by?: string | null
          data_admissao?: string | null
          desligado_em?: string | null
          email?: string | null
          id?: string
          motivo_desligamento?: string | null
          nome: string
          nome_exibicao?: string | null
          observacao?: string | null
          setor_id?: string | null
          status?: Database["public"]["Enums"]["colaborador_status"]
          telefone?: string | null
          tipo_vinculo?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          cargo_id?: string | null
          created_at?: string
          created_by?: string | null
          data_admissao?: string | null
          desligado_em?: string | null
          email?: string | null
          id?: string
          motivo_desligamento?: string | null
          nome?: string
          nome_exibicao?: string | null
          observacao?: string | null
          setor_id?: string | null
          status?: Database["public"]["Enums"]["colaborador_status"]
          telefone?: string | null
          tipo_vinculo?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comissao_ajustes: {
        Row: {
          comissao_id: string
          created_at: string
          created_by: string | null
          id: string
          motivo: string
          tipo: Database["public"]["Enums"]["comissao_ajuste_tipo"]
          valor: number
        }
        Insert: {
          comissao_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          motivo: string
          tipo: Database["public"]["Enums"]["comissao_ajuste_tipo"]
          valor: number
        }
        Update: {
          comissao_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          motivo?: string
          tipo?: Database["public"]["Enums"]["comissao_ajuste_tipo"]
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "comissao_ajustes_comissao_id_fkey"
            columns: ["comissao_id"]
            isOneToOne: false
            referencedRelation: "comissoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissao_ajustes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comissao_pagamento_itens: {
        Row: {
          comissao_id: string
          created_at: string
          id: string
          pagamento_id: string
          valor: number
        }
        Insert: {
          comissao_id: string
          created_at?: string
          id?: string
          pagamento_id: string
          valor: number
        }
        Update: {
          comissao_id?: string
          created_at?: string
          id?: string
          pagamento_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "comissao_pagamento_itens_comissao_id_fkey"
            columns: ["comissao_id"]
            isOneToOne: true
            referencedRelation: "comissoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissao_pagamento_itens_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "comissao_pagamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      comissao_pagamentos: {
        Row: {
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          forma_pagamento_id: string | null
          id: string
          observacao: string | null
          pago_em: string
          responsavel_id: string
          tecnico_id: string
          valor_total: number
        }
        Insert: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          forma_pagamento_id?: string | null
          id?: string
          observacao?: string | null
          pago_em?: string
          responsavel_id: string
          tecnico_id: string
          valor_total: number
        }
        Update: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          forma_pagamento_id?: string | null
          id?: string
          observacao?: string | null
          pago_em?: string
          responsavel_id?: string
          tecnico_id?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "comissao_pagamentos_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissao_pagamentos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissao_pagamentos_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes: {
        Row: {
          ajuste_total: number
          aprovada_em: string | null
          aprovada_por: string | null
          base_calculo: number | null
          caixa_lancamento_id: string | null
          cancelada_em: string | null
          cancelada_por: string | null
          conferida_em: string | null
          conferida_por: string | null
          created_at: string
          created_by: string | null
          custos_diretos: number
          data_referencia: string
          id: string
          mao_obra_em: string | null
          mao_obra_justificativa: string | null
          mao_obra_manual: number | null
          mao_obra_por: string | null
          motivo_cancelamento: string | null
          observacao: string | null
          os: string
          percentual: number | null
          receita_liquida: number
          regra_comissao_id: string | null
          status: Database["public"]["Enums"]["comissao_status"]
          tecnico_id: string
          tipo_regra: Database["public"]["Enums"]["comissao_tipo_regra"] | null
          updated_at: string
          updated_by: string | null
          valor_aprovado: number | null
          valor_calculado: number | null
          valor_final: number | null
        }
        Insert: {
          ajuste_total?: number
          aprovada_em?: string | null
          aprovada_por?: string | null
          base_calculo?: number | null
          caixa_lancamento_id?: string | null
          cancelada_em?: string | null
          cancelada_por?: string | null
          conferida_em?: string | null
          conferida_por?: string | null
          created_at?: string
          created_by?: string | null
          custos_diretos?: number
          data_referencia: string
          id?: string
          mao_obra_em?: string | null
          mao_obra_justificativa?: string | null
          mao_obra_manual?: number | null
          mao_obra_por?: string | null
          motivo_cancelamento?: string | null
          observacao?: string | null
          os: string
          percentual?: number | null
          receita_liquida?: number
          regra_comissao_id?: string | null
          status?: Database["public"]["Enums"]["comissao_status"]
          tecnico_id: string
          tipo_regra?: Database["public"]["Enums"]["comissao_tipo_regra"] | null
          updated_at?: string
          updated_by?: string | null
          valor_aprovado?: number | null
          valor_calculado?: number | null
          valor_final?: number | null
        }
        Update: {
          ajuste_total?: number
          aprovada_em?: string | null
          aprovada_por?: string | null
          base_calculo?: number | null
          caixa_lancamento_id?: string | null
          cancelada_em?: string | null
          cancelada_por?: string | null
          conferida_em?: string | null
          conferida_por?: string | null
          created_at?: string
          created_by?: string | null
          custos_diretos?: number
          data_referencia?: string
          id?: string
          mao_obra_em?: string | null
          mao_obra_justificativa?: string | null
          mao_obra_manual?: number | null
          mao_obra_por?: string | null
          motivo_cancelamento?: string | null
          observacao?: string | null
          os?: string
          percentual?: number | null
          receita_liquida?: number
          regra_comissao_id?: string | null
          status?: Database["public"]["Enums"]["comissao_status"]
          tecnico_id?: string
          tipo_regra?: Database["public"]["Enums"]["comissao_tipo_regra"] | null
          updated_at?: string
          updated_by?: string | null
          valor_aprovado?: number | null
          valor_calculado?: number | null
          valor_final?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_aprovada_por_fkey"
            columns: ["aprovada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_caixa_lancamento_id_fkey"
            columns: ["caixa_lancamento_id"]
            isOneToOne: false
            referencedRelation: "caixa_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_cancelada_por_fkey"
            columns: ["cancelada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_conferida_por_fkey"
            columns: ["conferida_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_mao_obra_por_fkey"
            columns: ["mao_obra_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_regra_comissao_id_fkey"
            columns: ["regra_comissao_id"]
            isOneToOne: false
            referencedRelation: "regras_comissao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_pagar: {
        Row: {
          cancelado_em: string | null
          cancelado_por: string | null
          categoria_id: string | null
          centro_custo_id: string | null
          competencia: string | null
          created_at: string
          created_by: string | null
          data_emissao: string
          descricao: string
          despesa_id: string | null
          forma_pagamento_id: string | null
          fornecedor_id: string | null
          grupo_parcela: string | null
          id: string
          motivo_cancelamento: string | null
          observacao: string | null
          parcela_atual: number | null
          parcela_total: number | null
          recorrente: boolean
          responsavel_id: string
          status: Database["public"]["Enums"]["conta_pagar_status"]
          subcategoria_id: string | null
          updated_at: string
          updated_by: string | null
          valor_original: number
          vencimento: string
        }
        Insert: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          categoria_id?: string | null
          centro_custo_id?: string | null
          competencia?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao: string
          descricao: string
          despesa_id?: string | null
          forma_pagamento_id?: string | null
          fornecedor_id?: string | null
          grupo_parcela?: string | null
          id?: string
          motivo_cancelamento?: string | null
          observacao?: string | null
          parcela_atual?: number | null
          parcela_total?: number | null
          recorrente?: boolean
          responsavel_id: string
          status?: Database["public"]["Enums"]["conta_pagar_status"]
          subcategoria_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valor_original: number
          vencimento: string
        }
        Update: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          categoria_id?: string | null
          centro_custo_id?: string | null
          competencia?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string
          descricao?: string
          despesa_id?: string | null
          forma_pagamento_id?: string | null
          fornecedor_id?: string | null
          grupo_parcela?: string | null
          id?: string
          motivo_cancelamento?: string | null
          observacao?: string | null
          parcela_atual?: number | null
          parcela_total?: number | null
          recorrente?: boolean
          responsavel_id?: string
          status?: Database["public"]["Enums"]["conta_pagar_status"]
          subcategoria_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valor_original?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_cancelado_por_fkey"
            columns: ["cancelado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_despesa_id_fkey"
            columns: ["despesa_id"]
            isOneToOne: false
            referencedRelation: "despesas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "subcategorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_pagar_pagamentos: {
        Row: {
          comprovante_path: string | null
          conta_pagar_id: string
          created_at: string
          data_pagamento: string
          estorno_de_id: string | null
          forma_pagamento_id: string | null
          id: string
          motivo_estorno: string | null
          observacao: string | null
          pago_por: string
          valor: number
        }
        Insert: {
          comprovante_path?: string | null
          conta_pagar_id: string
          created_at?: string
          data_pagamento: string
          estorno_de_id?: string | null
          forma_pagamento_id?: string | null
          id?: string
          motivo_estorno?: string | null
          observacao?: string | null
          pago_por: string
          valor: number
        }
        Update: {
          comprovante_path?: string | null
          conta_pagar_id?: string
          created_at?: string
          data_pagamento?: string
          estorno_de_id?: string | null
          forma_pagamento_id?: string | null
          id?: string
          motivo_estorno?: string | null
          observacao?: string | null
          pago_por?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_pagamentos_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_pagamentos_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_saldos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_pagamentos_estorno_de_id_fkey"
            columns: ["estorno_de_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_pagamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_pagamentos_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_pagamentos_pago_por_fkey"
            columns: ["pago_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_receber: {
        Row: {
          cancelado_em: string | null
          cancelado_por: string | null
          cliente: string
          competencia: string | null
          created_at: string
          created_by: string | null
          data_emissao: string
          descricao: string
          grupo_parcela: string | null
          id: string
          motivo_cancelamento: string | null
          observacao: string | null
          origem: string | null
          os: string | null
          parcela_atual: number | null
          parcela_total: number | null
          responsavel_id: string
          status: Database["public"]["Enums"]["conta_receber_status"]
          updated_at: string
          updated_by: string | null
          valor_original: number
          vencimento: string
        }
        Insert: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          cliente: string
          competencia?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao: string
          descricao: string
          grupo_parcela?: string | null
          id?: string
          motivo_cancelamento?: string | null
          observacao?: string | null
          origem?: string | null
          os?: string | null
          parcela_atual?: number | null
          parcela_total?: number | null
          responsavel_id: string
          status?: Database["public"]["Enums"]["conta_receber_status"]
          updated_at?: string
          updated_by?: string | null
          valor_original: number
          vencimento: string
        }
        Update: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          cliente?: string
          competencia?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string
          descricao?: string
          grupo_parcela?: string | null
          id?: string
          motivo_cancelamento?: string | null
          observacao?: string | null
          origem?: string | null
          os?: string | null
          parcela_atual?: number | null
          parcela_total?: number | null
          responsavel_id?: string
          status?: Database["public"]["Enums"]["conta_receber_status"]
          updated_at?: string
          updated_by?: string | null
          valor_original?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_receber_cancelado_por_fkey"
            columns: ["cancelado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_receber_recebimentos: {
        Row: {
          caixa_lancamento_id: string | null
          conta_receber_id: string
          created_at: string
          data_recebimento: string
          estorno_de_id: string | null
          forma_pagamento_id: string | null
          id: string
          motivo_estorno: string | null
          observacao: string | null
          recebido_por: string
          referencia: string | null
          valor: number
        }
        Insert: {
          caixa_lancamento_id?: string | null
          conta_receber_id: string
          created_at?: string
          data_recebimento: string
          estorno_de_id?: string | null
          forma_pagamento_id?: string | null
          id?: string
          motivo_estorno?: string | null
          observacao?: string | null
          recebido_por: string
          referencia?: string | null
          valor: number
        }
        Update: {
          caixa_lancamento_id?: string | null
          conta_receber_id?: string
          created_at?: string
          data_recebimento?: string
          estorno_de_id?: string | null
          forma_pagamento_id?: string | null
          id?: string
          motivo_estorno?: string | null
          observacao?: string | null
          recebido_por?: string
          referencia?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "contas_receber_recebimentos_caixa_lancamento_id_fkey"
            columns: ["caixa_lancamento_id"]
            isOneToOne: false
            referencedRelation: "caixa_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_recebimentos_conta_receber_id_fkey"
            columns: ["conta_receber_id"]
            isOneToOne: false
            referencedRelation: "contas_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_recebimentos_conta_receber_id_fkey"
            columns: ["conta_receber_id"]
            isOneToOne: false
            referencedRelation: "contas_receber_saldos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_recebimentos_estorno_de_id_fkey"
            columns: ["estorno_de_id"]
            isOneToOne: false
            referencedRelation: "contas_receber_recebimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_recebimentos_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_recebimentos_recebido_por_fkey"
            columns: ["recebido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      despesas: {
        Row: {
          cancelado_em: string | null
          cancelado_por: string | null
          categoria_id: string | null
          centro_custo_id: string | null
          competencia: string
          comprovante_path: string | null
          conta_pagar_id: string | null
          created_at: string
          created_by: string | null
          data_lancamento: string
          descricao: string
          fornecedor_id: string | null
          id: string
          motivo_cancelamento: string | null
          observacao: string | null
          recorrente: boolean
          responsavel_id: string
          status: Database["public"]["Enums"]["despesa_status"]
          subcategoria_id: string | null
          updated_at: string
          updated_by: string | null
          valor: number
          vencimento: string | null
        }
        Insert: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          categoria_id?: string | null
          centro_custo_id?: string | null
          competencia: string
          comprovante_path?: string | null
          conta_pagar_id?: string | null
          created_at?: string
          created_by?: string | null
          data_lancamento: string
          descricao: string
          fornecedor_id?: string | null
          id?: string
          motivo_cancelamento?: string | null
          observacao?: string | null
          recorrente?: boolean
          responsavel_id: string
          status?: Database["public"]["Enums"]["despesa_status"]
          subcategoria_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valor: number
          vencimento?: string | null
        }
        Update: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          categoria_id?: string | null
          centro_custo_id?: string | null
          competencia?: string
          comprovante_path?: string | null
          conta_pagar_id?: string | null
          created_at?: string
          created_by?: string | null
          data_lancamento?: string
          descricao?: string
          fornecedor_id?: string | null
          id?: string
          motivo_cancelamento?: string | null
          observacao?: string | null
          recorrente?: boolean
          responsavel_id?: string
          status?: Database["public"]["Enums"]["despesa_status"]
          subcategoria_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valor?: number
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "despesas_cancelado_por_fkey"
            columns: ["cancelado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_saldos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "subcategorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      folha_colaboradores: {
        Row: {
          colaborador_id: string
          competencia_id: string
          conferida_em: string | null
          conferida_por: string | null
          created_at: string
          id: string
          status: Database["public"]["Enums"]["folha_item_status"]
        }
        Insert: {
          colaborador_id: string
          competencia_id: string
          conferida_em?: string | null
          conferida_por?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["folha_item_status"]
        }
        Update: {
          colaborador_id?: string
          competencia_id?: string
          conferida_em?: string | null
          conferida_por?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["folha_item_status"]
        }
        Relationships: [
          {
            foreignKeyName: "folha_colaboradores_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_colaboradores_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_colaboradores_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "folha_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_colaboradores_conferida_por_fkey"
            columns: ["conferida_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      folha_competencias: {
        Row: {
          aprovada_em: string | null
          aprovada_por: string | null
          competencia: string
          created_at: string
          created_by: string | null
          fechada_em: string | null
          fechada_por: string | null
          id: string
          motivo_reabertura: string | null
          observacao: string | null
          reaberta_em: string | null
          reaberta_por: string | null
          status: Database["public"]["Enums"]["folha_competencia_status"]
          updated_at: string
        }
        Insert: {
          aprovada_em?: string | null
          aprovada_por?: string | null
          competencia: string
          created_at?: string
          created_by?: string | null
          fechada_em?: string | null
          fechada_por?: string | null
          id?: string
          motivo_reabertura?: string | null
          observacao?: string | null
          reaberta_em?: string | null
          reaberta_por?: string | null
          status?: Database["public"]["Enums"]["folha_competencia_status"]
          updated_at?: string
        }
        Update: {
          aprovada_em?: string | null
          aprovada_por?: string | null
          competencia?: string
          created_at?: string
          created_by?: string | null
          fechada_em?: string | null
          fechada_por?: string | null
          id?: string
          motivo_reabertura?: string | null
          observacao?: string | null
          reaberta_em?: string | null
          reaberta_por?: string | null
          status?: Database["public"]["Enums"]["folha_competencia_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "folha_competencias_aprovada_por_fkey"
            columns: ["aprovada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_competencias_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_competencias_fechada_por_fkey"
            columns: ["fechada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_competencias_reaberta_por_fkey"
            columns: ["reaberta_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      folha_lancamentos: {
        Row: {
          cancelado_em: string | null
          cancelado_por: string | null
          colaborador_id: string
          competencia_id: string
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          motivo_cancelamento: string | null
          natureza: Database["public"]["Enums"]["folha_natureza"]
          observacao: string | null
          origem: string
          referencia_id: string | null
          tipo_lancamento_id: string
          updated_at: string
          valor: number
        }
        Insert: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          colaborador_id: string
          competencia_id: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          motivo_cancelamento?: string | null
          natureza: Database["public"]["Enums"]["folha_natureza"]
          observacao?: string | null
          origem?: string
          referencia_id?: string | null
          tipo_lancamento_id: string
          updated_at?: string
          valor: number
        }
        Update: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          colaborador_id?: string
          competencia_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          motivo_cancelamento?: string | null
          natureza?: Database["public"]["Enums"]["folha_natureza"]
          observacao?: string | null
          origem?: string
          referencia_id?: string | null
          tipo_lancamento_id?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "folha_lancamentos_cancelado_por_fkey"
            columns: ["cancelado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_lancamentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_lancamentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_lancamentos_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "folha_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_lancamentos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_lancamentos_tipo_lancamento_id_fkey"
            columns: ["tipo_lancamento_id"]
            isOneToOne: false
            referencedRelation: "folha_tipos_lancamento"
            referencedColumns: ["id"]
          },
        ]
      }
      folha_pagamentos: {
        Row: {
          colaborador_id: string
          competencia_id: string
          comprovante_path: string | null
          created_at: string
          created_by: string | null
          data_pagamento: string
          estorno_de_id: string | null
          forma_pagamento_id: string | null
          id: string
          motivo_estorno: string | null
          observacao: string | null
          valor: number
        }
        Insert: {
          colaborador_id: string
          competencia_id: string
          comprovante_path?: string | null
          created_at?: string
          created_by?: string | null
          data_pagamento: string
          estorno_de_id?: string | null
          forma_pagamento_id?: string | null
          id?: string
          motivo_estorno?: string | null
          observacao?: string | null
          valor: number
        }
        Update: {
          colaborador_id?: string
          competencia_id?: string
          comprovante_path?: string | null
          created_at?: string
          created_by?: string | null
          data_pagamento?: string
          estorno_de_id?: string | null
          forma_pagamento_id?: string | null
          id?: string
          motivo_estorno?: string | null
          observacao?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "folha_pagamentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_pagamentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_pagamentos_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "folha_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_pagamentos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_pagamentos_estorno_de_id_fkey"
            columns: ["estorno_de_id"]
            isOneToOne: false
            referencedRelation: "folha_pagamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_pagamentos_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
        ]
      }
      folha_tipos_lancamento: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          natureza: Database["public"]["Enums"]["folha_natureza"]
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          natureza: Database["public"]["Enums"]["folha_natureza"]
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          natureza?: Database["public"]["Enums"]["folha_natureza"]
          nome?: string
          ordem?: number
        }
        Relationships: []
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
      regras_comissao: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          fim_vigencia: string | null
          id: string
          inicio_vigencia: string
          observacao: string | null
          percentual: number | null
          servico_descricao: string | null
          tecnico_id: string
          tipo_regra: Database["public"]["Enums"]["comissao_tipo_regra"]
          updated_at: string
          updated_by: string | null
          valor_fixo: number | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          fim_vigencia?: string | null
          id?: string
          inicio_vigencia: string
          observacao?: string | null
          percentual?: number | null
          servico_descricao?: string | null
          tecnico_id: string
          tipo_regra: Database["public"]["Enums"]["comissao_tipo_regra"]
          updated_at?: string
          updated_by?: string | null
          valor_fixo?: number | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          fim_vigencia?: string | null
          id?: string
          inicio_vigencia?: string
          observacao?: string | null
          percentual?: number | null
          servico_descricao?: string | null
          tecnico_id?: string
          tipo_regra?: Database["public"]["Enums"]["comissao_tipo_regra"]
          updated_at?: string
          updated_by?: string | null
          valor_fixo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "regras_comissao_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_comissao_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_comissao_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      setores: {
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
      subcategorias_financeiras: {
        Row: {
          ativo: boolean
          categoria_id: string
          created_at: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          categoria_id: string
          created_at?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          categoria_id?: string
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "subcategorias_financeiras_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
        ]
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
      colaboradores_view: {
        Row: {
          cargo_id: string | null
          cargo_nome: string | null
          created_at: string | null
          created_by: string | null
          data_admissao: string | null
          desligado_em: string | null
          email: string | null
          id: string | null
          motivo_desligamento: string | null
          nome: string | null
          nome_exibicao: string | null
          observacao: string | null
          salario_atual: number | null
          setor_id: string | null
          setor_nome: string | null
          status: Database["public"]["Enums"]["colaborador_status"] | null
          telefone: string | null
          tipo_vinculo: string | null
          updated_at: string | null
          updated_by: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_pagar_saldos: {
        Row: {
          cancelado_em: string | null
          categoria_id: string | null
          centro_custo_id: string | null
          competencia: string | null
          created_at: string | null
          data_emissao: string | null
          descricao: string | null
          despesa_id: string | null
          dias_atraso: number | null
          forma_pagamento_id: string | null
          fornecedor_id: string | null
          fornecedor_nome: string | null
          grupo_parcela: string | null
          id: string | null
          motivo_cancelamento: string | null
          observacao: string | null
          parcela_atual: number | null
          parcela_total: number | null
          recorrente: boolean | null
          responsavel_id: string | null
          responsavel_nome: string | null
          saldo: number | null
          status: Database["public"]["Enums"]["conta_pagar_status"] | null
          subcategoria_id: string | null
          valor_original: number | null
          valor_pago: number | null
          vencido: boolean | null
          vencimento: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_despesa_id_fkey"
            columns: ["despesa_id"]
            isOneToOne: false
            referencedRelation: "despesas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "subcategorias_financeiras"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_receber_saldos: {
        Row: {
          cancelado_em: string | null
          cliente: string | null
          competencia: string | null
          created_at: string | null
          data_emissao: string | null
          descricao: string | null
          dias_atraso: number | null
          grupo_parcela: string | null
          id: string | null
          motivo_cancelamento: string | null
          observacao: string | null
          origem: string | null
          os: string | null
          parcela_atual: number | null
          parcela_total: number | null
          responsavel_id: string | null
          responsavel_nome: string | null
          saldo: number | null
          status: Database["public"]["Enums"]["conta_receber_status"] | null
          valor_original: number | null
          valor_recebido: number | null
          vencido: boolean | null
          vencimento: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_receber_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      folha_resumo_colaborador: {
        Row: {
          cargo_nome: string | null
          colaborador_id: string | null
          colaborador_nome: string | null
          competencia: string | null
          competencia_id: string | null
          competencia_status:
            | Database["public"]["Enums"]["folha_competencia_status"]
            | null
          descontos: number | null
          folha_colaborador_id: string | null
          pago: number | null
          proventos: number | null
          setor_nome: string | null
          status: Database["public"]["Enums"]["folha_item_status"] | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "folha_colaboradores_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_colaboradores_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_colaboradores_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "folha_competencias"
            referencedColumns: ["id"]
          },
        ]
      }
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
      colaboradores_alterar_salario: {
        Args: {
          p_colaborador_id: string
          p_inicio_vigencia: string
          p_motivo: string
          p_valor: number
        }
        Returns: Json
      }
      colaboradores_alterar_status: {
        Args: {
          p_id: string
          p_motivo: string
          p_status: Database["public"]["Enums"]["colaborador_status"]
        }
        Returns: Json
      }
      colaboradores_atualizar: {
        Args: {
          p_cargo_id: string
          p_data_admissao: string
          p_email: string
          p_id: string
          p_nome: string
          p_nome_exibicao: string
          p_observacao: string
          p_setor_id: string
          p_telefone: string
          p_tipo_vinculo: string
        }
        Returns: Json
      }
      colaboradores_desligar: {
        Args: { p_data_desligamento: string; p_id: string; p_motivo: string }
        Returns: Json
      }
      colaboradores_registrar: {
        Args: {
          p_cargo_id: string
          p_data_admissao: string
          p_email: string
          p_nome: string
          p_nome_exibicao: string
          p_observacao: string
          p_salario_base: number
          p_setor_id: string
          p_telefone: string
          p_tipo_vinculo: string
        }
        Returns: Json
      }
      comissoes_ajustar: {
        Args: {
          p_id: string
          p_motivo: string
          p_tipo: Database["public"]["Enums"]["comissao_ajuste_tipo"]
          p_valor: number
        }
        Returns: Json
      }
      comissoes_aprovar: { Args: { p_id: string }; Returns: Json }
      comissoes_cancelar: {
        Args: { p_id: string; p_motivo: string }
        Returns: Json
      }
      comissoes_conferir: { Args: { p_id: string }; Returns: Json }
      comissoes_definir_mao_obra: {
        Args: { p_id: string; p_justificativa: string; p_valor: number }
        Returns: Json
      }
      comissoes_gerar: { Args: { p_from: string; p_to: string }; Returns: Json }
      comissoes_indicadores: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      comissoes_pagar: {
        Args: {
          p_comissao_ids: string[]
          p_data?: string
          p_forma_pagamento_id?: string
          p_observacao?: string
          p_tecnico_id: string
        }
        Returns: Json
      }
      comissoes_por_tecnico: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      comissoes_recalcular: {
        Args: { p_id: string; p_motivo: string }
        Returns: Json
      }
      comissoes_simular_recalculo: { Args: { p_id: string }; Returns: Json }
      contas_pagar_atualizar: {
        Args: {
          p_categoria_id?: string
          p_centro_custo_id?: string
          p_competencia?: string
          p_descricao?: string
          p_forma_pagamento_id?: string
          p_fornecedor_id?: string
          p_id: string
          p_justificativa?: string
          p_observacao?: string
          p_subcategoria_id?: string
          p_valor_original?: number
          p_vencimento?: string
        }
        Returns: Json
      }
      contas_pagar_cancelar: {
        Args: { p_id: string; p_motivo: string }
        Returns: Json
      }
      contas_pagar_estornar_pagamento: {
        Args: { p_motivo: string; p_pagamento_id: string }
        Returns: Json
      }
      contas_pagar_pagar: {
        Args: {
          p_comprovante_path?: string
          p_conta_id: string
          p_data_pagamento?: string
          p_forma_pagamento_id?: string
          p_observacao?: string
          p_valor?: number
        }
        Returns: Json
      }
      contas_pagar_registrar: {
        Args: {
          p_categoria_id?: string
          p_centro_custo_id?: string
          p_competencia?: string
          p_data_emissao?: string
          p_descricao: string
          p_forma_pagamento_id?: string
          p_fornecedor_id?: string
          p_intervalo_dias?: number
          p_observacao?: string
          p_parcelas?: number
          p_recorrente?: boolean
          p_subcategoria_id?: string
          p_valor?: number
          p_vencimento?: string
        }
        Returns: Json
      }
      contas_receber_atualizar: {
        Args: {
          p_cliente?: string
          p_competencia?: string
          p_descricao?: string
          p_id: string
          p_justificativa?: string
          p_observacao?: string
          p_origem?: string
          p_os?: string
          p_valor_original?: number
          p_vencimento?: string
        }
        Returns: Json
      }
      contas_receber_cancelar: {
        Args: { p_id: string; p_motivo: string }
        Returns: Json
      }
      contas_receber_estornar_recebimento: {
        Args: { p_motivo: string; p_recebimento_id: string }
        Returns: Json
      }
      contas_receber_receber: {
        Args: {
          p_conta_id: string
          p_data_recebimento?: string
          p_forma_pagamento_id?: string
          p_observacao?: string
          p_referencia?: string
          p_valor?: number
        }
        Returns: Json
      }
      contas_receber_registrar: {
        Args: {
          p_cliente: string
          p_competencia?: string
          p_data_emissao?: string
          p_descricao: string
          p_intervalo_dias?: number
          p_observacao?: string
          p_origem?: string
          p_os?: string
          p_parcelas?: number
          p_valor?: number
          p_vencimento?: string
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
      despesas_atualizar: {
        Args: {
          p_categoria_id?: string
          p_centro_custo_id?: string
          p_competencia?: string
          p_descricao?: string
          p_fornecedor_id?: string
          p_id: string
          p_justificativa?: string
          p_observacao?: string
          p_recorrente?: boolean
          p_subcategoria_id?: string
          p_valor?: number
          p_vencimento?: string
        }
        Returns: Json
      }
      despesas_cancelar: {
        Args: { p_id: string; p_motivo: string }
        Returns: Json
      }
      despesas_registrar: {
        Args: {
          p_categoria_id?: string
          p_centro_custo_id?: string
          p_competencia?: string
          p_comprovante_path?: string
          p_data_lancamento?: string
          p_data_pagamento?: string
          p_descricao: string
          p_forma_pagamento_id?: string
          p_fornecedor_id?: string
          p_observacao?: string
          p_paga?: boolean
          p_recorrente?: boolean
          p_subcategoria_id?: string
          p_valor?: number
          p_vencimento?: string
        }
        Returns: Json
      }
      financeiro_fluxo: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      financeiro_indicadores: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      folha_abrir_competencia: {
        Args: { p_competencia: string; p_observacao: string }
        Returns: Json
      }
      folha_aprovar: { Args: { p_competencia_id: string }; Returns: Json }
      folha_cancelar_lancamento: {
        Args: { p_id: string; p_motivo: string }
        Returns: Json
      }
      folha_competencia_total: {
        Args: { p_competencia_id: string }
        Returns: number
      }
      folha_conferir_item: {
        Args: { p_colaborador_id: string; p_competencia_id: string }
        Returns: Json
      }
      folha_estornar_pagamento: {
        Args: { p_motivo: string; p_pagamento_id: string }
        Returns: Json
      }
      folha_fechar: { Args: { p_competencia_id: string }; Returns: Json }
      folha_historico_colaborador: {
        Args: { p_colaborador_id: string }
        Returns: Json
      }
      folha_importar_automaticos: {
        Args: { p_competencia_id: string }
        Returns: Json
      }
      folha_item_total: {
        Args: { p_colaborador_id: string; p_competencia_id: string }
        Returns: number
      }
      folha_lancar: {
        Args: {
          p_colaborador_id: string
          p_competencia_id: string
          p_descricao: string
          p_observacao: string
          p_tipo_lancamento_id: string
          p_valor: number
        }
        Returns: Json
      }
      folha_pagar_lote: {
        Args: {
          p_colaborador_ids: string[]
          p_competencia_id: string
          p_data_pagamento: string
          p_forma_pagamento_id: string
          p_observacao: string
        }
        Returns: Json
      }
      folha_reabrir: {
        Args: { p_competencia_id: string; p_motivo: string }
        Returns: Json
      }
      folha_registrar_pagamento: {
        Args: {
          p_colaborador_id: string
          p_competencia_id: string
          p_comprovante_path: string
          p_data_pagamento: string
          p_forma_pagamento_id: string
          p_observacao: string
          p_valor: number
        }
        Returns: Json
      }
      folha_reimportar: { Args: { p_competencia_id: string }; Returns: Json }
      folha_resumo: { Args: { p_competencia_id: string }; Returns: Json }
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
      adiantamento_status: "pendente" | "descontado" | "cancelado"
      app_role: "administrador" | "gerente" | "vendas" | "tecnico"
      caixa_fechamento_status: "fechado" | "reaberto"
      caixa_lancamento_status: "ativo" | "cancelado" | "estornado"
      colaborador_status: "ativo" | "ferias" | "afastado" | "desligado"
      comissao_ajuste_tipo:
        | "bonus"
        | "acrescimo"
        | "desconto"
        | "correcao"
        | "compensacao"
      comissao_status:
        | "gerada"
        | "pendente_conferencia"
        | "conferida"
        | "aprovada"
        | "paga"
        | "cancelada"
        | "pendente_configuracao"
      comissao_tipo_regra:
        | "percentual_mao_obra"
        | "percentual_receita"
        | "fixo_os"
        | "fixo_servico"
        | "personalizada"
      conta_pagar_status:
        | "pendente"
        | "parcialmente_pago"
        | "pago"
        | "cancelado"
      conta_receber_status:
        | "pendente"
        | "parcialmente_recebido"
        | "recebido"
        | "cancelado"
      custo_os_status: "registrado" | "confirmado" | "cancelado" | "estornado"
      despesa_status: "pendente" | "paga" | "cancelada"
      folha_competencia_status:
        | "aberta"
        | "em_conferencia"
        | "aprovada"
        | "paga"
        | "fechada"
      folha_item_status:
        | "pendente"
        | "conferido"
        | "aprovado"
        | "parcialmente_pago"
        | "pago"
      folha_natureza: "provento" | "desconto"
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
        | "receber"
        | "configurar"
        | "desativar"
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
      adiantamento_status: ["pendente", "descontado", "cancelado"],
      app_role: ["administrador", "gerente", "vendas", "tecnico"],
      caixa_fechamento_status: ["fechado", "reaberto"],
      caixa_lancamento_status: ["ativo", "cancelado", "estornado"],
      colaborador_status: ["ativo", "ferias", "afastado", "desligado"],
      comissao_ajuste_tipo: [
        "bonus",
        "acrescimo",
        "desconto",
        "correcao",
        "compensacao",
      ],
      comissao_status: [
        "gerada",
        "pendente_conferencia",
        "conferida",
        "aprovada",
        "paga",
        "cancelada",
        "pendente_configuracao",
      ],
      comissao_tipo_regra: [
        "percentual_mao_obra",
        "percentual_receita",
        "fixo_os",
        "fixo_servico",
        "personalizada",
      ],
      conta_pagar_status: [
        "pendente",
        "parcialmente_pago",
        "pago",
        "cancelado",
      ],
      conta_receber_status: [
        "pendente",
        "parcialmente_recebido",
        "recebido",
        "cancelado",
      ],
      custo_os_status: ["registrado", "confirmado", "cancelado", "estornado"],
      despesa_status: ["pendente", "paga", "cancelada"],
      folha_competencia_status: [
        "aberta",
        "em_conferencia",
        "aprovada",
        "paga",
        "fechada",
      ],
      folha_item_status: [
        "pendente",
        "conferido",
        "aprovado",
        "parcialmente_pago",
        "pago",
      ],
      folha_natureza: ["provento", "desconto"],
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
        "receber",
        "configurar",
        "desativar",
      ],
    },
  },
} as const
