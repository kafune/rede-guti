import React, { useEffect, useState } from 'react';
import { EventoIndicadoStatus } from '../types';
import { confirmarPublicEventoIndicado, fetchPublicEventoIndicado, getApiErrorMessage } from '../api';

const parseHashParams = (): { eventoId: string; indicadoId: string } => {
  const hash = window.location.hash;
  const [hashPath, hashQuery] = hash.split('?');
  const parts = hashPath.replace('#/', '').split('/');
  const eventoId = parts[1] ?? '';
  const indicadoId = new URLSearchParams(hashQuery ?? '').get('ind') ?? '';
  return { eventoId, indicadoId };
};

const formatDate = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split('-');
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};

type PageState = 'loading' | 'error' | 'aguardando' | 'confirmando' | 'confirmado' | 'ja_confirmado' | 'nao_aprovado';

const PublicEventoConfirmacao: React.FC = () => {
  const { eventoId, indicadoId } = parseHashParams();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [evento, setEvento] = useState<{
    nome: string; data: string; hora: string; local: string; encerrado: boolean;
  } | null>(null);

  useEffect(() => {
    if (!eventoId || !indicadoId) {
      setErrorMsg('Link inválido.');
      setPageState('error');
      return;
    }

    fetchPublicEventoIndicado(eventoId, indicadoId)
      .then(({ indicado, evento: ev }) => {
        setNome(indicado.nome);
        setEvento(ev);
        const s: EventoIndicadoStatus = indicado.status;
        if (s === 'CONFIRMADO' || s === 'PRESENTE') {
          setPageState('ja_confirmado');
        } else if (s === 'APROVADO') {
          setPageState('aguardando');
        } else {
          setPageState('nao_aprovado');
        }
      })
      .catch((err) => {
        setErrorMsg(getApiErrorMessage(err, 'Convite não encontrado.'));
        setPageState('error');
      });
  }, [eventoId, indicadoId]);

  const handleConfirmar = async () => {
    setPageState('confirmando');
    try {
      await confirmarPublicEventoIndicado(eventoId, indicadoId);
      setPageState('confirmado');
    } catch (err) {
      setErrorMsg(getApiErrorMessage(err, 'Erro ao confirmar presença.'));
      setPageState('aguardando');
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl opacity-30"></i>
      </div>
    );
  }

  // ── Erro ──────────────────────────────────────────────────────────────────
  if (pageState === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-6 text-center gap-4">
        <i className="fa-solid fa-link-slash text-5xl opacity-20"></i>
        <p className="font-black text-lg opacity-60">{errorMsg ?? 'Link inválido.'}</p>
      </div>
    );
  }

  // ── Confirmado agora ou já estava confirmado ──────────────────────────────
  if (pageState === 'confirmado' || pageState === 'ja_confirmado') {
    const freshlyConfirmed = pageState === 'confirmado';
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-8 flex flex-col items-center">
        <div className="w-full max-w-md space-y-5">
          <div className="text-center mb-6">
            <div className="theme-brand-mark w-14 h-14 rounded-3xl flex items-center justify-center text-white font-black text-2xl mx-auto mb-3 shadow-lg">
              G
            </div>
            <h1 className="font-black text-xl">Rede SP · Guti 2026</h1>
          </div>

          <div className={`bg-green-50 dark:bg-green-900/20 rounded-3xl p-8 text-center space-y-3 ${freshlyConfirmed ? 'animate-soft-pop' : ''}`}>
            <i className="fa-solid fa-circle-check text-6xl text-green-500"></i>
            <p className="font-black text-2xl text-green-700 dark:text-green-400">
              {freshlyConfirmed ? 'Presença confirmada!' : 'Já confirmado!'}
            </p>
            <p className="text-base font-bold text-green-800 dark:text-green-300">{nome}</p>
            {freshlyConfirmed && (
              <p className="text-xs text-green-700 dark:text-green-400 opacity-70 font-semibold">
                Obrigado! Te esperamos no evento. 🙏
              </p>
            )}
          </div>

          {evento && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-5 space-y-2">
              <h2 className="font-black text-base">{evento.nome}</h2>
              <p className="text-sm opacity-60 font-semibold">
                <i className="fa-solid fa-clock mr-2 opacity-60"></i>
                {formatDate(evento.data)} às {evento.hora}
              </p>
              <p className="text-sm opacity-60 font-semibold">
                <i className="fa-solid fa-location-dot mr-2 opacity-60"></i>
                {evento.local}
              </p>
            </div>
          )}

          <p className="text-center text-[10px] opacity-20 font-bold pb-4">Rede SP · Guti 2026</p>
        </div>
      </div>
    );
  }

  // ── Não aprovado ──────────────────────────────────────────────────────────
  if (pageState === 'nao_aprovado') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-6 text-center gap-4">
        <i className="fa-solid fa-hourglass-half text-5xl opacity-20"></i>
        <p className="font-black text-lg opacity-60">Convite ainda não disponível</p>
        <p className="text-sm opacity-40">
          {nome ? `Olá ${nome}, ` : ''}seu convite ainda não foi liberado. Entre em contato com sua liderança.
        </p>
      </div>
    );
  }

  // ── Aguardando confirmação ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-8 flex flex-col items-center">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center mb-6">
          <div className="theme-brand-mark w-14 h-14 rounded-3xl flex items-center justify-center text-white font-black text-2xl mx-auto mb-3 shadow-lg">
            G
          </div>
          <h1 className="font-black text-xl">Rede SP · Guti 2026</h1>
          <p className="text-xs opacity-40 font-bold uppercase tracking-widest">Confirmação de presença</p>
        </div>

        {evento && (
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
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-5 space-y-4">
          <p className="text-sm font-semibold opacity-60">
            Olá <span className="font-black opacity-100">{nome}</span>! Você foi convidado(a) para este evento.
            Clique abaixo para confirmar sua presença.
          </p>

          {errorMsg && (
            <div className="px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          <button
            onClick={handleConfirmar}
            disabled={pageState === 'confirmando'}
            className="w-full theme-brand-mark text-white font-black uppercase tracking-widest text-sm py-4 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-50"
          >
            {pageState === 'confirmando' ? (
              <span className="flex items-center justify-center gap-2">
                <i className="fa-solid fa-circle-notch fa-spin"></i> Confirmando...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <i className="fa-solid fa-circle-check"></i> Confirmar minha presença
              </span>
            )}
          </button>
        </div>

        <p className="text-center text-[10px] opacity-20 font-bold pb-4">Rede SP · Guti 2026</p>
      </div>
    </div>
  );
};

export default PublicEventoConfirmacao;
