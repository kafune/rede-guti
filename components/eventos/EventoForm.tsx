import React, { useState } from 'react';
import { Evento } from '../../types';
import { createEvento, getApiErrorMessage, isUnauthorized } from '../../api';

interface Props {
  onSave: (evento: Evento) => void;
  onCancel: () => void;
  onLogout: () => void;
}

const EventoForm: React.FC<Props> = ({ onSave, onCancel, onLogout }) => {
  const [nome, setNome] = useState('');
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [local, setLocal] = useState('');
  const [limitePorLider, setLimitePorLider] = useState('0');
  const [observacao, setObservacao] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !data || !hora || !local.trim()) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const evento = await createEvento({
        nome: nome.trim(),
        data,
        hora,
        local: local.trim(),
        limitePorLider: parseInt(limitePorLider, 10) || 0,
        observacao: observacao.trim() || undefined
      });
      onSave(evento);
    } catch (err) {
      if (isUnauthorized(err)) { onLogout(); return; }
      setError(getApiErrorMessage(err, 'Erro ao criar evento.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center gap-3 animate-soft-pop">
        <button
          onClick={onCancel}
          className="p-2 rounded-2xl opacity-40 hover:opacity-80 transition-opacity"
        >
          <i className="fa-solid fa-arrow-left text-xl"></i>
        </button>
        <h2 className="text-2xl font-bold">Novo Evento</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 text-sm font-semibold">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-5 space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">
              Nome do evento *
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Encontro de Líderes Guti 2026"
              className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div>
              <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">
                Data *
              </label>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-3 sm:px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
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
                className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-3 sm:px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">
              Local *
            </label>
            <input
              type="text"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="Endereço ou nome do local"
              className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
              required
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">
              Limite de indicações por liderança
            </label>
            <input
              type="number"
              value={limitePorLider}
              onChange={(e) => setLimitePorLider(e.target.value)}
              min="0"
              placeholder="0 = sem limite"
              className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
            />
            <p className="text-[10px] opacity-40 mt-1 ml-1">0 = sem limite</p>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">
              Observação interna
            </label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Informações internas sobre o evento..."
              rows={3}
              className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm resize-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full theme-brand-mark text-white font-black uppercase tracking-widest py-4 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-50 text-sm"
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <i className="fa-solid fa-circle-notch fa-spin"></i> Criando...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <i className="fa-solid fa-calendar-plus"></i> Criar Evento
            </span>
          )}
        </button>
      </form>
    </div>
  );
};

export default EventoForm;
