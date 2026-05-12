import React, { useEffect, useRef, useState } from 'react';
import { Atividade, AtividadePublicLider } from '../types';
import {
  createPublicAtividade,
  fetchPublicAtividadesByLider,
  fetchPublicLider,
  getApiErrorMessage
} from '../api';

const parseHashParams = (): { liderId: string } => {
  const hash = window.location.hash; // "#/atividades/cadastro?lider=xyz"
  const [, hashQuery] = hash.split('?');
  const liderId = new URLSearchParams(hashQuery ?? '').get('lider') ?? '';
  return { liderId };
};

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const PublicAtividadeCadastro: React.FC = () => {
  const { liderId } = parseHashParams();

  const [lider, setLider] = useState<AtividadePublicLider | null>(null);
  const [loadingLider, setLoadingLider] = useState(true);
  const [liderError, setLiderError] = useState<string | null>(null);

  const [titulo, setTitulo] = useState('');
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [local, setLocal] = useState('');
  const [descricao, setDescricao] = useState('');
  const [qtd, setQtd] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [atividades, setAtividades] = useState<Atividade[]>([]);

  const tituloRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!liderId) {
      setLiderError('Link inválido. Solicite um novo link à coordenação.');
      setLoadingLider(false);
      return;
    }

    Promise.all([
      fetchPublicLider(liderId),
      fetchPublicAtividadesByLider(liderId).catch(() => [] as Atividade[])
    ])
      .then(([l, ats]) => {
        setLider(l);
        setAtividades(ats);
      })
      .catch((err) => setLiderError(getApiErrorMessage(err, 'Liderança não encontrada.')))
      .finally(() => setLoadingLider(false));
  }, [liderId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lider) return;
    if (!titulo.trim() || !data || !hora) {
      setSubmitError('Preencha título, data e hora.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const dataHora = new Date(`${data}T${hora}:00`).toISOString();
      const nova = await createPublicAtividade({
        liderId: lider.id,
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        dataHora,
        local: local.trim() || undefined,
        qtdEnvolvidos: qtd
      });
      setAtividades((prev) => [nova, ...prev]);
      setTitulo('');
      setData('');
      setHora('');
      setLocal('');
      setDescricao('');
      setQtd(0);
      tituloRef.current?.focus();
    } catch (err) {
      setSubmitError(getApiErrorMessage(err, 'Erro ao registrar atividade.'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loadingLider) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl opacity-30"></i>
      </div>
    );
  }

  // ── Erro ───────────────────────────────────────────────────────────────────
  if (liderError || !lider) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-6 text-center gap-4">
        <i className="fa-solid fa-link-slash text-5xl opacity-20"></i>
        <p className="font-black text-lg opacity-60">{liderError ?? 'Liderança não encontrada.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 pb-8 pt-[calc(env(safe-area-inset-top,0px)+2rem)] flex flex-col items-center">
      <div className="w-full max-w-md space-y-5">
        {/* Cabeçalho */}
        <div className="text-center mb-6">
          <img src="/logo.jpeg" alt="Logo" className="w-14 h-14 rounded-3xl mx-auto mb-3 object-cover shadow-lg" />
          <h1 className="font-black text-xl">Rede SP · Guti 2026</h1>
          <p className="text-xs opacity-40 font-bold uppercase tracking-widest">Registro de atividade</p>
        </div>

        {/* Saudação */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-5">
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <i className="fa-solid fa-user-tie"></i>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Liderança</span>
          </div>
          <h2 className="font-black text-lg leading-tight">Olá, {lider.nome}! 👋</h2>
          <p className="text-sm opacity-60 font-semibold mt-1">
            Cadastre abaixo a atividade que você realizou.
          </p>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-5 space-y-4">
          <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Nova atividade</p>

          {submitError && (
            <div className="px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-semibold">
              {submitError}
            </div>
          )}

          <div>
            <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">
              O que foi feito *
            </label>
            <input
              ref={tituloRef}
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Reunião de jovens"
              className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">
                Data *
              </label>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-3 py-3 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                required
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">
                Hora *
              </label>
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-3 py-3 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">
              Local (opcional)
            </label>
            <input
              type="text"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="Onde aconteceu"
              className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">
              Pessoas envolvidas
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQtd((v) => Math.max(0, v - 1))}
                className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-700 text-lg font-black active:scale-95 transition-transform"
              >
                −
              </button>
              <input
                type="number"
                value={qtd}
                onChange={(e) => setQtd(Math.max(0, parseInt(e.target.value, 10) || 0))}
                min="0"
                className="flex-1 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none text-center text-xl font-black"
              />
              <button
                type="button"
                onClick={() => setQtd((v) => v + 1)}
                className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-700 text-lg font-black active:scale-95 transition-transform"
              >
                +
              </button>
            </div>
            <p className="text-[10px] opacity-40 mt-1 ml-1">
              Quantidade total de pessoas alcançadas
            </p>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">
              Descrição (opcional)
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes sobre a atividade"
              rows={3}
              className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none text-sm resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !titulo.trim() || !data || !hora}
            className="w-full bg-emerald-600 text-white font-black uppercase tracking-widest text-sm py-4 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-50"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <i className="fa-solid fa-circle-notch fa-spin"></i> Enviando...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <i className="fa-solid fa-check"></i> Registrar atividade
              </span>
            )}
          </button>
        </form>

        {/* Atividades já registradas */}
        {atividades.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase opacity-40 tracking-widest px-1">
              Suas atividades ({atividades.length})
            </p>
            {atividades.map((a) => (
              <div
                key={a.id}
                className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 shadow-sm p-3 animate-soft-pop"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-black text-sm flex-1">{a.titulo}</p>
                  <span className="text-[9px] bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 px-2 py-0.5 rounded-md font-black uppercase tracking-tighter shrink-0">
                    <i className="fa-solid fa-users mr-1"></i>{a.qtdEnvolvidos}
                  </span>
                </div>
                <p className="text-[10px] opacity-60 font-bold">
                  <i className="fa-solid fa-calendar mr-1"></i>{formatDateTime(a.dataHora)}
                </p>
                {a.local && (
                  <p className="text-[10px] opacity-40 font-semibold mt-0.5">
                    <i className="fa-solid fa-location-dot mr-1"></i>{a.local}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-[10px] opacity-20 font-bold pb-4">
          Rede SP · Guti 2026
        </p>
      </div>
    </div>
  );
};

export default PublicAtividadeCadastro;
