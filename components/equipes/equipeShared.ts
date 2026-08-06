import { EquipePayload } from '../../types';

export const MAX_MEMBROS = 4;

export interface MembroDraft {
  nome: string;
  telefone: string;
  tituloEleitor: string;
  secao: string;
}

export interface EquipeDraft {
  nome: string;
  motoristaNome: string;
  motoristaCnh: string;
  motoristaTelefone: string;
  motoristaTituloEleitor: string;
  motoristaSecao: string;
  carroPlaca: string;
  carroModelo: string;
  carroCor: string;
  membros: MembroDraft[];
}

// Mesmas regras do backend (backend/src/routes/equipes.ts).
export const placaRegex = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;

export const telefoneValido = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13;
};

export const onlyDigits = (value: string) => value.replace(/\D/g, '');

export const tituloEleitorValido = (value: string) => onlyDigits(value).length === 12;
export const secaoValida = (value: string) => {
  const d = onlyDigits(value);
  return d.length >= 1 && d.length <= 5;
};

// Formata título de eleitor como 0000 0000 0000 para leitura.
export const formatTituloEleitor = (value: string) => {
  const d = onlyDigits(value).slice(0, 12);
  return d.replace(/(\d{4})(\d{4})(\d{0,4})/, (_, a, b, c) => (c ? `${a} ${b} ${c}` : b ? `${a} ${b}` : a));
};

export const emptyMembros = (): MembroDraft[] =>
  Array.from({ length: MAX_MEMBROS }, () => ({ nome: '', telefone: '', tituloEleitor: '', secao: '' }));

export const isMembroFilled = (m: MembroDraft) =>
  !!(m.nome.trim() || m.telefone.trim() || m.tituloEleitor.trim() || m.secao.trim());

/**
 * Valida o rascunho da equipe (mesmas regras do backend) e devolve o payload
 * pronto para envio, ou uma mensagem de erro. `filledMembros` são os apoiadores
 * com algum campo preenchido.
 */
export interface ValidateEquipeResult {
  error: string | null;
  payload: EquipePayload | null;
}

const fail = (error: string): ValidateEquipeResult => ({ error, payload: null });

export const validateEquipeDraft = (draft: EquipeDraft): ValidateEquipeResult => {
  const placaNormalizada = draft.carroPlaca.toUpperCase().replace(/[\s-]/g, '');
  const cnhDigits = onlyDigits(draft.motoristaCnh);

  if (draft.nome.trim().length < 2) return fail('Informe o nome da equipe.');
  if (draft.motoristaNome.trim().length < 2)
    return fail('Informe o nome completo do motorista.');
  if (cnhDigits.length !== 11) return fail('CNH inválida: deve ter 11 dígitos.');
  if (!telefoneValido(draft.motoristaTelefone))
    return fail('Telefone do motorista inválido (use DDD + número).');
  if (!tituloEleitorValido(draft.motoristaTituloEleitor))
    return fail('Título de eleitor do motorista deve ter 12 dígitos.');
  if (!secaoValida(draft.motoristaSecao))
    return fail('Seção do motorista inválida (use apenas números).');
  if (!placaRegex.test(placaNormalizada))
    return fail('Placa inválida. Use o padrão antigo (ABC-1234) ou Mercosul (ABC1D23).');
  if (!draft.carroModelo.trim()) return fail('Informe o modelo do carro.');
  if (!draft.carroCor.trim()) return fail('Informe a cor do carro.');

  const filledMembros = draft.membros.filter(isMembroFilled);
  for (const [i, membro] of filledMembros.entries()) {
    const rotulo = membro.nome.trim() || `${i + 1}`;
    if (membro.nome.trim().length < 2)
      return fail(`Informe o nome completo do apoiador ${i + 1}.`);
    if (!telefoneValido(membro.telefone))
      return fail(`Telefone do apoiador "${rotulo}" inválido (use DDD + número).`);
    if (!tituloEleitorValido(membro.tituloEleitor))
      return fail(`Título de eleitor do apoiador "${rotulo}" deve ter 12 dígitos.`);
    if (!secaoValida(membro.secao))
      return fail(`Seção do apoiador "${rotulo}" inválida (use apenas números).`);
  }

  return {
    error: null,
    payload: {
      nome: draft.nome.trim(),
      motoristaNome: draft.motoristaNome.trim(),
      motoristaCnh: cnhDigits,
      motoristaTelefone: draft.motoristaTelefone.trim(),
      motoristaTituloEleitor: onlyDigits(draft.motoristaTituloEleitor),
      motoristaSecao: onlyDigits(draft.motoristaSecao),
      carroPlaca: placaNormalizada,
      carroModelo: draft.carroModelo.trim(),
      carroCor: draft.carroCor.trim(),
      membros: filledMembros.map((m) => ({
        nome: m.nome.trim(),
        telefone: m.telefone.trim(),
        tituloEleitor: onlyDigits(m.tituloEleitor),
        secao: onlyDigits(m.secao)
      }))
    }
  };
};
