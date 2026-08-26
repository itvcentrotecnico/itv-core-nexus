/**
 * Administração e Governança — GESTÃO ITV CENTRO TÉCNICO.
 * Configuração dos cadastros mestres administrados pelo ADM.
 * A segurança real é garantida por RLS e pelas RPCs `admin_*` (validação server-side).
 */

export type UsuarioStatus = "ativo" | "inativo" | "bloqueado";

export const USUARIO_STATUS_LABEL: Record<UsuarioStatus, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  bloqueado: "Bloqueado",
};

export interface AdminUsuario {
  id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  active: boolean;
  status: UsuarioStatus;
  status_motivo: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmado: boolean;
  roles: string[];
  overrides: number;
  modulos: string[];
}

export interface AdminTecnico {
  user_id: string;
  nome: string;
  email: string | null;
  usuario_status: UsuarioStatus;
  colaborador_id: string | null;
  colaborador_status: string | null;
  especialidade: string | null;
  data_admissao: string | null;
  observacao: string | null;
  servicos: number;
  comissoes: number;
}

export type CampoTipo = "texto" | "numero" | "booleano" | "select";

export interface CampoCadastro {
  nome: string;
  label: string;
  tipo: CampoTipo;
  obrigatorio?: boolean;
  opcoes?: { value: string; label: string }[];
  hint?: string;
  padrao?: string | number | boolean;
  colunaLista?: boolean;
}

export interface CadastroConfig {
  tabela: string;
  titulo: string;
  descricao: string;
  campos: CampoCadastro[];
  ordenar?: string;
}

const CAMPO_ORDEM: CampoCadastro = {
  nome: "ordem",
  label: "Ordem",
  tipo: "numero",
  padrao: 0,
  colunaLista: true,
};
const CAMPO_ATIVO: CampoCadastro = { nome: "ativo", label: "Ativo", tipo: "booleano", padrao: true };

export const CADASTROS: Record<string, CadastroConfig> = {
  tipos_servico_tecnico: {
    tabela: "tipos_servico_tecnico",
    titulo: "Tipos de Serviço",
    descricao: "Opções utilizadas pela Produção Técnica (Troca de LED, Placa Main, Fonte, BGA…).",
    campos: [
      { nome: "nome", label: "Nome", tipo: "texto", obrigatorio: true, colunaLista: true },
      { nome: "categoria", label: "Categoria", tipo: "texto", colunaLista: true, hint: "Ex.: Hardware, Software, Display" },
      CAMPO_ORDEM,
      CAMPO_ATIVO,
    ],
  },
  tipos_receita: {
    tabela: "tipos_receita",
    titulo: "Tipos de Receita",
    descricao: "Origens de receita disponíveis no Caixa Diário.",
    campos: [
      { nome: "nome", label: "Nome", tipo: "texto", obrigatorio: true, colunaLista: true },
      CAMPO_ORDEM,
      CAMPO_ATIVO,
    ],
  },
  formas_pagamento: {
    tabela: "formas_pagamento",
    titulo: "Formas de Pagamento",
    descricao: "Meios de recebimento e pagamento. A taxa é apenas sugestão: o valor do lançamento prevalece.",
    campos: [
      { nome: "nome", label: "Nome", tipo: "texto", obrigatorio: true, colunaLista: true },
      {
        nome: "tipo",
        label: "Tipo",
        tipo: "select",
        padrao: "outros",
        colunaLista: true,
        opcoes: [
          { value: "dinheiro", label: "Dinheiro" },
          { value: "pix", label: "PIX" },
          { value: "debito", label: "Débito" },
          { value: "credito", label: "Crédito" },
          { value: "boleto", label: "Boleto" },
          { value: "cheque", label: "Cheque" },
          { value: "outros", label: "Outros" },
        ],
      },
      { nome: "eh_dinheiro", label: "Conta como dinheiro em espécie", tipo: "booleano", padrao: false },
      {
        nome: "taxa_padrao_percentual",
        label: "Taxa padrão (%)",
        tipo: "numero",
        padrao: 0,
        colunaLista: true,
        hint: "Sugestão aplicada ao lançamento; pode ser ajustada pelo operador autorizado.",
      },
      { nome: "permite_parcelamento", label: "Permite parcelamento", tipo: "booleano", padrao: false },
      { nome: "max_parcelas", label: "Máximo de parcelas", tipo: "numero", padrao: 1 },
      CAMPO_ORDEM,
      CAMPO_ATIVO,
    ],
  },
  fornecedores: {
    tabela: "fornecedores",
    titulo: "Fornecedores",
    descricao: "Cadastro único usado por Peças e Custos e pelo Financeiro.",
    ordenar: "nome",
    campos: [
      { nome: "nome", label: "Razão / Nome", tipo: "texto", obrigatorio: true, colunaLista: true },
      { nome: "nome_fantasia", label: "Nome fantasia", tipo: "texto", colunaLista: true },
      { nome: "telefone", label: "Telefone", tipo: "texto", colunaLista: true },
      { nome: "email", label: "E-mail", tipo: "texto" },
      { nome: "categoria", label: "Categoria", tipo: "texto", colunaLista: true },
      { nome: "observacao", label: "Observação", tipo: "texto" },
      CAMPO_ATIVO,
    ],
  },
  categorias_pecas: {
    tabela: "categorias_pecas",
    titulo: "Categorias de Peças",
    descricao: "Classificação das peças utilizadas nos custos por OS.",
    campos: [
      { nome: "nome", label: "Nome", tipo: "texto", obrigatorio: true, colunaLista: true },
      CAMPO_ORDEM,
      CAMPO_ATIVO,
    ],
  },
  tipos_custo: {
    tabela: "tipos_custo",
    titulo: "Tipos de Custo",
    descricao: "Naturezas de custo direto por OS.",
    campos: [
      { nome: "nome", label: "Nome", tipo: "texto", obrigatorio: true, colunaLista: true },
      { nome: "eh_peca", label: "É peça", tipo: "booleano", padrao: true },
      CAMPO_ORDEM,
      CAMPO_ATIVO,
    ],
  },
  categorias_financeiras: {
    tabela: "categorias_financeiras",
    titulo: "Categorias Financeiras",
    descricao: "Categorias de despesas e contas (fixas, variáveis, pessoal, impostos).",
    campos: [
      { nome: "nome", label: "Nome", tipo: "texto", obrigatorio: true, colunaLista: true },
      {
        nome: "tipo",
        label: "Tipo",
        tipo: "select",
        padrao: "despesa",
        colunaLista: true,
        opcoes: [
          { value: "despesa", label: "Despesa" },
          { value: "receita", label: "Receita" },
        ],
      },
      CAMPO_ORDEM,
      CAMPO_ATIVO,
    ],
  },
  centros_custo: {
    tabela: "centros_custo",
    titulo: "Centros de Custo",
    descricao: "Organização gerencial das saídas (Administrativo, Laboratório, Comercial…).",
    campos: [
      { nome: "nome", label: "Nome", tipo: "texto", obrigatorio: true, colunaLista: true },
      CAMPO_ORDEM,
      CAMPO_ATIVO,
    ],
  },
  setores: {
    tabela: "setores",
    titulo: "Setores",
    descricao: "Setores usados no cadastro de colaboradores.",
    campos: [
      { nome: "nome", label: "Nome", tipo: "texto", obrigatorio: true, colunaLista: true },
      CAMPO_ORDEM,
      CAMPO_ATIVO,
    ],
  },
  cargos: {
    tabela: "cargos",
    titulo: "Cargos",
    descricao: "Cargos utilizados na folha gerencial.",
    campos: [
      { nome: "nome", label: "Nome", tipo: "texto", obrigatorio: true, colunaLista: true },
      CAMPO_ORDEM,
      CAMPO_ATIVO,
    ],
  },
  folha_tipos_lancamento: {
    tabela: "folha_tipos_lancamento",
    titulo: "Tipos de Lançamento da Folha",
    descricao: "Proventos e descontos disponíveis na folha gerencial.",
    campos: [
      { nome: "nome", label: "Nome", tipo: "texto", obrigatorio: true, colunaLista: true },
      {
        nome: "natureza",
        label: "Natureza",
        tipo: "select",
        padrao: "provento",
        colunaLista: true,
        opcoes: [
          { value: "provento", label: "Provento" },
          { value: "desconto", label: "Desconto" },
        ],
      },
      CAMPO_ORDEM,
      CAMPO_ATIVO,
    ],
  },
};

export const DATASETS_EXPORTACAO: { value: string; label: string; porPeriodo: boolean }[] = [
  { value: "caixa", label: "Caixa — lançamentos", porPeriodo: true },
  { value: "custos", label: "Peças e custos por OS", porPeriodo: true },
  { value: "comissoes", label: "Comissões técnicas", porPeriodo: true },
  { value: "despesas", label: "Despesas", porPeriodo: true },
  { value: "contas_pagar", label: "Contas a pagar", porPeriodo: true },
  { value: "contas_receber", label: "Contas a receber", porPeriodo: true },
  { value: "producao", label: "Produção técnica", porPeriodo: true },
  { value: "colaboradores", label: "Colaboradores (posição atual)", porPeriodo: false },
  { value: "auditoria", label: "Auditoria", porPeriodo: true },
];

export const ADMIN_TABS = [
  { value: "usuarios", label: "Usuários" },
  { value: "perfis", label: "Perfis e Permissões" },
  { value: "tecnicos", label: "Técnicos" },
  { value: "cadastros", label: "Cadastros" },
  { value: "comissoes", label: "Regras de Comissão" },
  { value: "comissao-entrega", label: "Comissão de Entrega" },
  { value: "parametros", label: "Parâmetros" },
  { value: "modo-tv", label: "Modo TV" },
  { value: "fechamentos", label: "Fechamentos" },
  { value: "auditoria", label: "Auditoria" },
  { value: "geral", label: "Configurações Gerais" },
  { value: "backup", label: "Segurança e Backup" },
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number]["value"];

export function isAdminTab(v: unknown): v is AdminTab {
  return typeof v === "string" && ADMIN_TABS.some((t) => t.value === v);
}
