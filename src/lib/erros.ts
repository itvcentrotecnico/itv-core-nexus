/**
 * Tratamento de erros voltado ao usuário.
 *
 * Regra: mensagens de negócio (geradas pelas nossas próprias regras no banco)
 * podem ser exibidas. Erros técnicos (banco, rede, permissão bruta) NUNCA são
 * exibidos — vão apenas para o console/log e o usuário vê um texto genérico.
 */

/** Erro previsto pelas regras do sistema — seguro para exibir ao usuário. */
export class ErroNegocio extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroNegocio";
  }
}

export const MENSAGEM_GENERICA = "Não foi possível concluir a operação. Tente novamente.";

/** Retorna uma mensagem segura para exibir e registra o detalhe técnico no log. */
export function mensagemErro(erro: unknown, fallback: string = MENSAGEM_GENERICA): string {
  if (erro instanceof ErroNegocio) return erro.message;
  if (erro !== undefined && erro !== null) {
    console.error("[erro]", erro);
  }
  return fallback;
}
