import React, { useEffect, useState } from 'react';
import { Evento, User } from '../../types';
import { deleteEvento, encerrarEvento, fetchEventos, getApiErrorMessage, isUnauthorized } from '../../api';

interface Props {
  currentUser: User;
  onSelect: (evento: Evento) => void;
  onNovo: () => void;
  onLogout: () => void;
}

const formatDate = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
};

const statusBadge = (encerrado: boolean) =>
  encerrado
    ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
    : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400';

const EventoList: React.FC<Props> = ({ currentUser, onSelect, onNovo, onLogout }) => {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [encerrandoId, setEncerrandoId] = useState<string | null>(null);
  const [deletandoId, setDeletandoId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEventos()
      .then((data) => { if (!cancelled) setEventos(data); })
      .catch((err) => {
        if (isUnauthorized(err)) { onLogout(); return; }
        if (!cancelled) setError(getApiErrorMessage(err));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleDeletar = async (evento: Evento) => {
    if (!confirm(`Excluir permanentemente o evento "${evento.nome}"?\n\nTodos os indicados serão removidos. Esta ação não pode ser desfeita.`)) return;
    setDeletandoId(evento.id);
    try {
      await deleteEvento(evento.id);
      setEventos((prev) => prev.filter((e) => e.id !== evento.id));
    } catch (err) {
      if (isUnauthorized(err)) { onLogout(); return; }
      alert(getApiErrorMessage(err, 'Erro ao excluir evento.'));
    } finally {
      setDeletandoId(null);
    }
  };

  const handleEncerrar = async (evento: Evento) => {
    if (!confirm(`Encerrar o evento "${evento.nome}"? Esta ação não pode ser desfeita.`)) return;
    setEncerrandoId(evento.id);
    try {
      const updated = await encerrarEvento(evento.id);
      setEventos((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (err) {
      if (isUnauthorized(err)) { onLogout(); return; }
      alert(getApiErrorMessage(err, 'Erro ao encerrar evento.'));
    } finally {
      setEncerrandoId(null);
    }
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center justify-between animate-soft-pop">
        <h2 className="text-2xl font-bold">Eventos</h2>
        {(currentUser.role === 'COORDENADOR' || currentUser.role === 'VERIFICADORA') && (
          <button
            onClick={onNovo}
            className="theme-brand-mark text-white text-xs font-black uppercase tracking-widest px-4 py-2 rounded-2xl flex items-center gap-2 shadow-lg active:scale-95 transition-transform"
          >
            <i className="fa-solid fa-plus"></i>
            Novo Evento
          </button>
        )}
      </div>

      {loading && (
        <div className="px-4 py-3 rounded-2xl bg-blue-50 text-blue-700 text-sm font-semibold">
          Carregando eventos...
        </div>
      )}
      {error && (
        <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 text-sm font-semibold">{error}</div>
      )}

      {!loading && eventos.length === 0 && (
        <div className="py-20 text-center opacity-40 flex flex-col items-center gap-3">
          <i className="fa-solid fa-calendar-xmark text-4xl"></i>
          <p className="font-bold text-sm">Nenhum evento cadastrado</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {eventos.map((evento) => (
          <div
            key={evento.id}
            className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm overflow-hidden"
          >
            <div
              onClick={() => onSelect(evento)}
              className="p-4 cursor-pointer hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] transition-all duration-300 ease-out"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h3 className="font-black text-base truncate">{evento.nome}</h3>
                  <p className="text-[10px] opacity-40 font-bold uppercase truncate">
                    {evento.local}
                  </p>
                </div>
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-tighter shrink-0 ${statusBadge(evento.encerrado)}`}
                >
                  {evento.encerrado ? 'Encerrado' : 'Ativo'}
                </span>
              </div>

              <div className="flex items-center gap-1 text-[10px] opacity-60 font-semibold mb-3">
                <i className="fa-solid fa-calendar-day text-blue-500"></i>
                <span>{formatDate(evento.data)} às {evento.hora}</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-2 text-center">
                  <p className="text-lg font-black text-blue-600">{evento.totalIndicados}</p>
                  <p className="text-[8px] font-black uppercase opacity-60">Indicados</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-2 text-center">
                  <p className="text-lg font-black text-green-600">{evento.totalAprovados}</p>
                  <p className="text-[8px] font-black uppercase opacity-60">Aprovados</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-2 text-center">
                  <p className="text-lg font-black text-amber-600">{evento.totalPresentes}</p>
                  <p className="text-[8px] font-black uppercase opacity-60">Presentes</p>
                </div>
              </div>
            </div>

            {(currentUser.role === 'COORDENADOR' || currentUser.role === 'VERIFICADORA') && (
              <div className="px-4 pb-4 flex gap-2">
                <button
                  onClick={() => onSelect(evento)}
                  className="flex-1 min-w-0 min-h-[44px] text-[10px] font-black uppercase tracking-widest bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 py-2 rounded-xl active:scale-95 transition-transform truncate"
                >
                  <i className="fa-solid fa-eye mr-1"></i> Ver
                </button>
                {!evento.encerrado && (
                  <button
                    onClick={() => handleEncerrar(evento)}
                    disabled={encerrandoId === evento.id}
                    className="flex-1 min-w-0 min-h-[44px] text-[10px] font-black uppercase tracking-widest bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50 truncate"
                  >
                    <i className="fa-solid fa-lock mr-1"></i>
                    {encerrandoId === evento.id ? 'Encerrando...' : 'Encerrar'}
                  </button>
                )}
                <button
                  onClick={() => handleDeletar(evento)}
                  disabled={deletandoId === evento.id}
                  className="flex-1 min-w-0 min-h-[44px] text-[10px] font-black uppercase tracking-widest bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50 truncate"
                >
                  <i className="fa-solid fa-trash mr-1"></i>
                  {deletandoId === evento.id ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default EventoList;
