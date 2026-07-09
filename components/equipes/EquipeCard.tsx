import React, { useState } from 'react';
import { Equipe } from '../../types';
import { getApiErrorMessage, updateEquipeValor } from '../../api';

interface Props {
  equipe: Equipe;
  canEditValores: boolean;
  onEdit: (equipe: Equipe) => void;
  onDelete: (equipe: Equipe) => void;
  onValorSaved: (equipe: Equipe) => void;
}

const formatPlaca = (placa: string) =>
  placa.length === 7 && /^[A-Z]{3}\d{4}$/.test(placa)
    ? `${placa.slice(0, 3)}-${placa.slice(3)}`
    : placa;

const formatBRL = (valor: string | null | undefined) => {
  if (valor === null || valor === undefined || valor === '') return null;
  const parsed = Number(valor);
  if (Number.isNaN(parsed)) return null;
  return parsed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const EquipeCard: React.FC<Props> = ({ equipe, canEditValores, onEdit, onDelete, onValorSaved }) => {
  const [valorDraft, setValorDraft] = useState(equipe.valor ?? '');
  const [obsDraft, setObsDraft] = useState(equipe.valorObservacoes ?? '');
  const [savingValor, setSavingValor] = useState(false);

  const totalPessoas = 1 + equipe.membros.length;

  const commitValores = async () => {
    const draft = valorDraft.trim();
    const savedValor = equipe.valor ?? '';
    const savedObs = equipe.valorObservacoes ?? '';
    if (draft === savedValor && obsDraft.trim() === savedObs) return;

    const parsed = draft === '' ? null : Number(draft.replace(',', '.'));
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      alert('Valor inválido.');
      setValorDraft(savedValor);
      return;
    }

    setSavingValor(true);
    try {
      const updated = await updateEquipeValor(equipe.id, {
        valor: parsed,
        valorObservacoes: obsDraft.trim() || null
      });
      setValorDraft(updated.valor ?? '');
      setObsDraft(updated.valorObservacoes ?? '');
      onValorSaved(updated);
    } catch (err) {
      setValorDraft(savedValor);
      setObsDraft(savedObs);
      alert(getApiErrorMessage(err, 'Não foi possível salvar o valor.'));
    } finally {
      setSavingValor(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border dark:border-gray-700 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-black text-base truncate">{equipe.nome}</h4>
          <p className="text-xs opacity-50 font-semibold">
            {totalPessoas}/5 pessoas
            {equipe.status === 'INATIVA' && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-900 text-gray-500 text-[10px] font-black uppercase">
                Inativa
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onEdit(equipe)}
            className="w-9 h-9 rounded-xl opacity-40 hover:opacity-100 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 transition-all"
            title="Editar equipe"
          >
            <i className="fa-solid fa-pen"></i>
          </button>
          <button
            onClick={() => onDelete(equipe)}
            className="w-9 h-9 rounded-xl opacity-40 hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 transition-all"
            title="Excluir equipe"
          >
            <i className="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>

      {/* Motorista + carro */}
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-3">
          <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">
            <i className="fa-solid fa-id-card mr-1"></i> Motorista
          </p>
          <p className="font-bold truncate">{equipe.motoristaNome}</p>
          <p className="text-xs opacity-60 font-semibold">
            CNH {equipe.motoristaCnh} · {equipe.motoristaTelefone}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-3">
          <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">
            <i className="fa-solid fa-car mr-1"></i> Carro
          </p>
          <p className="font-bold truncate">
            {formatPlaca(equipe.carroPlaca)} · {equipe.carroModelo}
          </p>
          <p className="text-xs opacity-60 font-semibold">Cor: {equipe.carroCor}</p>
        </div>
      </div>

      {/* Apoiadores */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">
          <i className="fa-solid fa-people-group mr-1"></i> Apoiadores ({equipe.membros.length}/4)
        </p>
        {equipe.membros.length === 0 ? (
          <p className="text-xs opacity-50 font-semibold">Nenhum apoiador cadastrado ainda.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {equipe.membros.map((m) => (
              <span
                key={m.id ?? `${m.nome}-${m.telefone}`}
                className="px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold"
              >
                {m.nome} <span className="opacity-60 font-semibold">· {m.telefone}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Valores — só o coordenador recebe/edita estes campos */}
      {canEditValores && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
            <i className="fa-solid fa-lock mr-1"></i> Restrito à coordenação
            {savingValor && <span className="ml-2 normal-case tracking-normal">Salvando...</span>}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="sm:w-44">
              <label className="block text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">
                Valor (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={valorDraft}
                onChange={(e) => setValorDraft(e.target.value)}
                onBlur={commitValores}
                className="w-full bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 text-sm font-bold tabular-nums focus:ring-2 focus:ring-amber-500 outline-none"
              />
              {formatBRL(equipe.valor) && (
                <p className="text-[10px] font-bold opacity-50 mt-1">{formatBRL(equipe.valor)}</p>
              )}
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">
                Observações
              </label>
              <input
                type="text"
                placeholder="Ex.: diária combinada, forma de pagamento..."
                value={obsDraft}
                onChange={(e) => setObsDraft(e.target.value)}
                onBlur={commitValores}
                className="w-full bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EquipeCard;
