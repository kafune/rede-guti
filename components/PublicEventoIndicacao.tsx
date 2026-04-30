import React, { useEffect, useRef, useState } from 'react';
import { EventoIndicado, EventoPublicInfo } from '../types';
import { fetchPublicEvento, getApiErrorMessage, submitPublicEventoIndicacao } from '../api';

const parseHashParams = (): { eventoId: string; liderId: string } => {
  const hash = window.location.hash; // e.g. "#/eventos/abc/indicacao?lider=xyz"
  const [hashPath, hashQuery] = hash.split('?');
  const parts = hashPath.replace('#/', '').split('/');
  const eventoId = parts[1] ?? '';
  const liderId = new URLSearchParams(hashQuery ?? '').get('lider') ?? '';
  return { eventoId, liderId };
};

const formatDate = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};

const normalizeTelefone = (v: string) => v.replace(/\D/g, '');

const PublicEventoIndicacao: React.FC = () => {
  const { eventoId, liderId } = parseHashParams();

  const [evento, setEvento] = useState<EventoPublicInfo | null>(null);
  const [loadingEvento, setLoadingEvento] = useState(true);
  const [eventoError, setEventoError] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [indicados, setIndicados] = useState<EventoIndicado[]>([]);

  const nomeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!eventoId) {
      setEventoError('Link inválido.');
      setLoadingEvento(false);
      return;
    }
    fetchPublicEvento(eventoId, liderId || undefined)
      .then((ev) => setEvento(ev))
      .catch((err) => setEventoError(getApiErrorMessage(err, 'Evento não encontrado.')))
      .finally(() => setLoadingEvento(false));
  }, [eventoId, liderId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !telefone.trim()) return;
    if (!evento?.lider) { setSubmitError('Liderança não identificada. Verifique o link.'); return; }

    const digits = normalizeTelefone(telefone);
    if (digits.length < 10) { setSubmitError('WhatsApp inválido. Informe com DDD.'); return; }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const ind = await submitPublicEventoIndicacao(eventoId, {
        nome: nome.trim(),
        telefone: digits,
        liderId: evento.lider.id
      });
      setIndicados((prev) => [ind, ...prev]);
      setNome('');
      setTelefone('');
      nomeRef.current?.focus();
    } catch (err) {
      setSubmitError(getApiErrorMessage(err, 'Erro ao enviar indicação.'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loadingEvento) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl opacity-30"></i>
      </div>
    );
  }

  // ── Erro ao carregar ──────────────────────────────────────────────────────
  if (eventoError || !evento) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-6 text-center gap-4">
        <i className="fa-solid fa-calendar-xmark text-5xl opacity-20"></i>
        <p className="font-black text-lg opacity-60">{eventoError ?? 'Evento não encontrado.'}</p>
      </div>
    );
  }

  // ── Evento encerrado ──────────────────────────────────────────────────────
  if (evento.encerrado) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-6 text-center gap-4">
        <i className="fa-solid fa-lock text-5xl opacity-20"></i>
        <p className="font-black text-xl opacity-60">Indicações encerradas</p>
        <p className="text-sm opacity-40">Este evento não está mais aceitando novas indicações.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-8 flex flex-col items-center">
      <div className="w-full max-w-md space-y-5">

        {/* Logo / Cabeçalho */}
        <div className="text-center mb-6">
          <img src="/logo.jpeg" alt="Logo" className="w-14 h-14 rounded-3xl mx-auto mb-3 object-cover shadow-lg" />
          <h1 className="font-black text-xl">Rede SP · Guti 2026</h1>
          <p className="text-xs opacity-40 font-bold uppercase tracking-widest">Indicação para evento</p>
        </div>

        {/* Card do Evento */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-5 space-y-2">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <i className="fa-solid fa-calendar-day"></i>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Evento</span>
          </div>
          <h2 className="font-black text-lg leading-tight">{evento.nome}</h2>
          <p className="text-sm opacity-60 font-semibold">
            <i className="fa-solid fa-clock mr-2 opacity-60"></i>
            {formatDate(evento.data)} às {evento.hora}
          </p>
          <p className="text-sm opacity-60 font-semibold">
            <i className="fa-solid fa-location-dot mr-2 opacity-60"></i>
            {evento.local}
          </p>
          {evento.lider && (
            <p className="text-sm opacity-60 font-semibold">
              <i className="fa-solid fa-user-tie mr-2 opacity-60"></i>
              Liderança: <span className="font-black opacity-80">{evento.lider.nome}</span>
            </p>
          )}
        </div>

        {/* Limite atingido */}
        {evento.limiteAtingido && (
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl px-4 py-3 text-amber-700 dark:text-amber-400 text-sm font-semibold text-center">
            <i className="fa-solid fa-triangle-exclamation mr-2"></i>
            Limite de indicações desta liderança atingido.
          </div>
        )}

        {/* Sem liderança */}
        {!evento.lider && (
          <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl px-4 py-3 text-red-600 dark:text-red-400 text-sm font-semibold text-center">
            <i className="fa-solid fa-link-slash mr-2"></i>
            Link sem liderança vinculada. Solicite um novo link.
          </div>
        )}

        {/* Formulário */}
        {evento.lider && !evento.limiteAtingido && (
          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-5 space-y-4">
            <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">
              Adicionar indicação
            </p>

            {submitError && (
              <div className="px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-semibold">
                {submitError}
              </div>
            )}

            <div>
              <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">
                Nome completo *
              </label>
              <input
                ref={nomeRef}
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome da pessoa"
                className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                required
                autoComplete="name"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">
                WhatsApp *
              </label>
              <input
                type="tel"
                inputMode="numeric"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                required
                autoComplete="tel"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !nome.trim() || !telefone.trim()}
              className="w-full theme-brand-mark text-white font-black uppercase tracking-widest text-sm py-4 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-50"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <i className="fa-solid fa-circle-notch fa-spin"></i> Enviando...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <i className="fa-solid fa-user-plus"></i> Adicionar
                </span>
              )}
            </button>
          </form>
        )}

        {/* Lista de indicados da sessão */}
        {indicados.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase opacity-40 tracking-widest px-1">
              Adicionados nesta sessão ({indicados.length})
            </p>
            {indicados.map((ind) => (
              <div
                key={ind.id}
                className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 shadow-sm p-3 flex items-center gap-3 animate-soft-pop"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-black shrink-0">
                  {ind.nome.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm truncate">{ind.nome}</p>
                  <p className="text-[10px] opacity-40 font-semibold">{ind.telefone}</p>
                </div>
                <span className="text-[9px] bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400 px-2 py-0.5 rounded-md font-black uppercase tracking-tighter shrink-0">
                  Indicado
                </span>
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

export default PublicEventoIndicacao;
