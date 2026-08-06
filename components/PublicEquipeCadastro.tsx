import React, { useEffect, useState } from 'react';
import { BRAND } from '../branding';
import { AtividadePublicLider, EquipePublicResumo } from '../types';
import {
  createPublicEquipe,
  fetchPublicEquipesByLider,
  fetchPublicLider,
  getApiErrorMessage
} from '../api';
import {
  EquipeDraft,
  MembroDraft,
  MAX_MEMBROS,
  emptyMembros,
  formatTituloEleitor,
  isMembroFilled,
  onlyDigits,
  validateEquipeDraft
} from './equipes/equipeShared';

const parseHashParams = (): { liderId: string } => {
  const hash = window.location.hash; // "#/equipes/cadastro?lider=xyz"
  const [, hashQuery] = hash.split('?');
  const liderId = new URLSearchParams(hashQuery ?? '').get('lider') ?? '';
  return { liderId };
};

const inputClass =
  'w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm';
const labelClass = 'block text-[10px] font-black uppercase tracking-widest opacity-40 mb-1';

const emptyDraft = (): EquipeDraft => ({
  nome: '',
  motoristaNome: '',
  motoristaCnh: '',
  motoristaTelefone: '',
  motoristaTituloEleitor: '',
  motoristaSecao: '',
  carroPlaca: '',
  carroModelo: '',
  carroCor: '',
  membros: emptyMembros()
});

const PublicEquipeCadastro: React.FC = () => {
  const { liderId } = parseHashParams();

  const [lider, setLider] = useState<AtividadePublicLider | null>(null);
  const [loadingLider, setLoadingLider] = useState(true);
  const [liderError, setLiderError] = useState<string | null>(null);

  const [draft, setDraft] = useState<EquipeDraft>(emptyDraft());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [equipes, setEquipes] = useState<EquipePublicResumo[]>([]);

  useEffect(() => {
    if (!liderId) {
      setLiderError('Link inválido. Solicite um novo link à coordenação.');
      setLoadingLider(false);
      return;
    }
    Promise.all([
      fetchPublicLider(liderId),
      fetchPublicEquipesByLider(liderId).catch(() => [] as EquipePublicResumo[])
    ])
      .then(([l, eqs]) => {
        setLider(l);
        setEquipes(eqs);
      })
      .catch((err) => setLiderError(getApiErrorMessage(err, 'Liderança não encontrada.')))
      .finally(() => setLoadingLider(false));
  }, [liderId]);

  const setField = <K extends keyof EquipeDraft>(field: K, value: EquipeDraft[K]) =>
    setDraft((prev) => ({ ...prev, [field]: value }));

  const setMembro = (index: number, field: keyof MembroDraft, value: string) =>
    setDraft((prev) => ({
      ...prev,
      membros: prev.membros.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lider) return;

    const result = validateEquipeDraft(draft);
    if (!result.payload) {
      setSubmitError(result.error ?? 'Dados inválidos.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const nova = await createPublicEquipe({ ...result.payload, liderId: lider.id });
      setEquipes((prev) => [
        {
          id: nova.id,
          nome: nova.nome,
          status: nova.status,
          totalApoiadores: nova.membros.length,
          visitasCount: 0,
          createdAt: nova.createdAt
        },
        ...prev
      ]);
      setDraft(emptyDraft());
      setSucesso(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(getApiErrorMessage(err, 'Erro ao cadastrar a equipe.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingLider) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl opacity-30"></i>
      </div>
    );
  }

  if (liderError || !lider) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-6 text-center gap-4">
        <i className="fa-solid fa-link-slash text-5xl opacity-20"></i>
        <p className="font-black text-lg opacity-60">{liderError ?? 'Liderança não encontrada.'}</p>
      </div>
    );
  }

  const filledMembros = draft.membros.filter(isMembroFilled).length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 pb-8 pt-[calc(env(safe-area-inset-top,0px)+2rem)] flex flex-col items-center">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center mb-2">
          <img src="/logo.jpeg" alt="Logo" className="w-14 h-14 rounded-3xl mx-auto mb-3 object-cover shadow-lg" />
          <h1 className="font-black text-xl">{BRAND.publicHeader}</h1>
          <p className="text-xs opacity-40 font-bold uppercase tracking-widest">Cadastro de equipe de rua</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-5">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <i className="fa-solid fa-user-tie"></i>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Liderança</span>
          </div>
          <h2 className="font-black text-lg leading-tight">{lider.nome}</h2>
          <p className="text-sm opacity-60 font-semibold mt-1">
            Cadastre abaixo uma equipe (1 motorista + até 4 apoiadores). Ela ficará vinculada a esta
            liderança.
          </p>
        </div>

        {sucesso && (
          <div className="px-4 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm font-bold flex items-center gap-2">
            <i className="fa-solid fa-circle-check"></i> Equipe cadastrada com sucesso!
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-5 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Nova equipe</p>
            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
              {filledMembros}/{MAX_MEMBROS} apoiadores
            </span>
          </div>

          {submitError && (
            <div className="px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-semibold">
              {submitError}
            </div>
          )}

          <div>
            <label className={labelClass}>Nome da equipe</label>
            <input
              type="text"
              className={inputClass}
              placeholder="Ex.: Equipe Zona Norte 1"
              value={draft.nome}
              onChange={(e) => setField('nome', e.target.value)}
            />
          </div>

          {/* Motorista */}
          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest opacity-60">
              <i className="fa-solid fa-id-card text-blue-500 mr-1"></i> Motorista
            </p>
            <div>
              <label className={labelClass}>Nome completo</label>
              <input
                type="text"
                className={inputClass}
                value={draft.motoristaNome}
                onChange={(e) => setField('motoristaNome', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>CNH (11 dígitos)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={11}
                  className={inputClass}
                  value={draft.motoristaCnh}
                  onChange={(e) => setField('motoristaCnh', onlyDigits(e.target.value).slice(0, 11))}
                />
              </div>
              <div>
                <label className={labelClass}>Telefone</label>
                <input
                  type="tel"
                  className={inputClass}
                  placeholder="(11) 99999-9999"
                  value={draft.motoristaTelefone}
                  onChange={(e) => setField('motoristaTelefone', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Título de eleitor</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className={inputClass}
                  placeholder="0000 0000 0000"
                  value={formatTituloEleitor(draft.motoristaTituloEleitor)}
                  onChange={(e) =>
                    setField('motoristaTituloEleitor', onlyDigits(e.target.value).slice(0, 12))
                  }
                />
              </div>
              <div>
                <label className={labelClass}>Seção</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  className={inputClass}
                  placeholder="Ex.: 0123"
                  value={draft.motoristaSecao}
                  onChange={(e) => setField('motoristaSecao', onlyDigits(e.target.value).slice(0, 5))}
                />
              </div>
            </div>
          </div>

          {/* Carro */}
          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest opacity-60">
              <i className="fa-solid fa-car text-blue-500 mr-1"></i> Carro
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelClass}>Placa</label>
                <input
                  type="text"
                  maxLength={8}
                  className={`${inputClass} uppercase`}
                  placeholder="ABC1D23"
                  value={draft.carroPlaca}
                  onChange={(e) => setField('carroPlaca', e.target.value.toUpperCase())}
                />
              </div>
              <div>
                <label className={labelClass}>Modelo</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Fiat Argo"
                  value={draft.carroModelo}
                  onChange={(e) => setField('carroModelo', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Cor</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Prata"
                  value={draft.carroCor}
                  onChange={(e) => setField('carroCor', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Apoiadores */}
          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest opacity-60">
              <i className="fa-solid fa-people-group text-blue-500 mr-1"></i> Apoiadores (até {MAX_MEMBROS})
            </p>
            {draft.membros.map((membro, index) => (
              <div key={index} className="rounded-2xl border dark:border-gray-700 p-3 space-y-2 bg-gray-50/60 dark:bg-gray-900/40">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40">
                  Apoiador {index + 1}
                </p>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Nome completo"
                  value={membro.nome}
                  onChange={(e) => setMembro(index, 'nome', e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="tel"
                    className={inputClass}
                    placeholder="Telefone"
                    value={membro.telefone}
                    onChange={(e) => setMembro(index, 'telefone', e.target.value)}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    className={inputClass}
                    placeholder="Seção"
                    value={membro.secao}
                    onChange={(e) => setMembro(index, 'secao', onlyDigits(e.target.value).slice(0, 5))}
                  />
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  className={inputClass}
                  placeholder="Título de eleitor (0000 0000 0000)"
                  value={formatTituloEleitor(membro.tituloEleitor)}
                  onChange={(e) =>
                    setMembro(index, 'tituloEleitor', onlyDigits(e.target.value).slice(0, 12))
                  }
                />
              </div>
            ))}
            <p className="text-[10px] opacity-40 ml-1">
              Deixe em branco os apoiadores que ainda não tiver. Você pode completar depois.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white font-black uppercase tracking-widest text-sm py-4 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-50"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <i className="fa-solid fa-circle-notch fa-spin"></i> Enviando...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <i className="fa-solid fa-check"></i> Cadastrar equipe
              </span>
            )}
          </button>
        </form>

        {equipes.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase opacity-40 tracking-widest px-1">
              Equipes desta liderança ({equipes.length})
            </p>
            {equipes.map((e) => (
              <div
                key={e.id}
                className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 shadow-sm p-3 flex items-center justify-between gap-2 animate-soft-pop"
              >
                <p className="font-black text-sm truncate">
                  <i className="fa-solid fa-car-side mr-2 opacity-50"></i>
                  {e.nome}
                </p>
                <span className="text-[9px] bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 px-2 py-0.5 rounded-md font-black uppercase tracking-tighter shrink-0">
                  {e.totalApoiadores} apoiador(es)
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-[10px] opacity-20 font-bold pb-4">{BRAND.publicHeader}</p>
      </div>
    </div>
  );
};

export default PublicEquipeCadastro;
