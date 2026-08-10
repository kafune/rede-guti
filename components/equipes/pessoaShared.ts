import { PessoaTipo } from '../../types';

// Monta a URL wa.me a partir de um telefone brasileiro livre. Mesma regra de
// normalização do backend (backend/src/whatsapp/domain/phone.ts): considera o
// DDI 55 só quando o número tem 12/13 dígitos e começa com 55; caso contrário
// assume que faltou o DDI. Devolve null para telefones inválidos (a UI então
// não mostra o link em vez de gerar um wa.me quebrado).
export const buildWhatsappUrl = (telefone: string, text?: string): string | null => {
  const digits = (telefone || '').replace(/\D/g, '');
  const hasCountryCode = (digits.length === 12 || digits.length === 13) && digits.startsWith('55');
  const national = hasCountryCode ? digits.slice(2) : digits;
  if (national.length !== 10 && national.length !== 11) return null;
  const full = `55${national}`;
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${full}${query}`;
};

// Identificador estável da pessoa no link público: 'motorista' ou 'a{ordem}'
// para cada apoiador (posição 0..3). Não usamos o id do EquipeMembro porque a
// edição da equipe o recria.
export const pessoaParam = (tipo: PessoaTipo, ordem?: number | null): string =>
  tipo === 'MOTORISTA' ? 'motorista' : `a${ordem ?? 0}`;

export const pessoaTipoLabel = (tipo: PessoaTipo): string =>
  tipo === 'MOTORISTA' ? 'Motorista' : 'Apoiador';

// Link público de autocadastro individual da pessoa (sem login).
export const buildPessoaCadastroLink = (equipeId: string, pessoa: string): string => {
  const base = window.location.origin + window.location.pathname;
  return `${base}#/pessoa/cadastro?equipe=${encodeURIComponent(equipeId)}&p=${encodeURIComponent(
    pessoa
  )}`;
};

// Lê equipe + pessoa do hash "#/pessoa/cadastro?equipe=xyz&p=motorista".
export const parsePessoaCadastroHash = (
  hash: string
): { equipeId: string; pessoa: string } => {
  const [, query] = hash.split('?');
  const params = new URLSearchParams(query ?? '');
  return {
    equipeId: params.get('equipe') ?? '',
    pessoa: params.get('p') ?? ''
  };
};

// Mensagem-padrão para enviar o link de autocadastro pelo WhatsApp.
export const cadastroWhatsappMessage = (
  nome: string,
  equipeNome: string,
  link: string
): string =>
  `Olá ${nome}! 🙏\n\n` +
  `Para concluir seu cadastro na equipe "${equipeNome}", preencha seus dados pessoais, aceite ` +
  `o termo de participação e envie as fotos dos seus documentos neste link:\n\n${link}`;
