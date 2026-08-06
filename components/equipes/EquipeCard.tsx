import React, { useState } from 'react';
import { Equipe, EquipeVisita } from '../../types';
import {
  deleteEquipeVisita,
  fetchEquipeVisitas,
  getApiErrorMessage,
  updateEquipeValor
} from '../../api';
import { formatTituloEleitor } from './equipeShared';
import ShareLinkQrCode from '../ShareLinkQrCode';

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

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' · ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
};

const getVisitaLink = (equipeId: string) => {
  const base = window.location.origin + window.location.pathname;
  return `${base}#/equipes/visita?equipe=${equipeId}`;
};

const eleitoralLabel = (titulo?: string | null, secao?: string | null) => {
  const parts: string[] = [];
  if (titulo) parts.push(`Título ${formatTituloEleitor(titulo)}`);
  if (secao) parts.push(`Seção ${secao}`);
  return parts.join(' · ');
};

const EquipeCard: React.FC<Props> = ({ equipe, canEditValores, onEdit, onDelete, onValorSaved }) => {
  const [valorDraft, setValorDraft] = useState(equipe.valor ?? '');
  const [obsDraft, setObsDraft] = useState(equipe.valorObservacoes ?? '');
  const [savingValor, setSavingValor] = useState(false);

  const [showVisitas, setShowVisitas] = useState(false);
  const [visitas, setVisitas] = useState<EquipeVisita[] | null>(null);
  const [loadingVisitas, setLoadingVisitas] = useState(false);
  const [visitasError, setVisitasError] = useState<string | null>(null);
  const [showLink, setShowLink] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const toggleVisitas = async () => {
    const next = !showVisitas;
    setShowVisitas(next);
    if (next && visitas === null && !loadingVisitas) {
      setLoadingVisitas(true);
      setVisitasError(null);
      try {
        setVisitas(await fetchEquipeVisitas(equipe.id));
      } catch (err) {
        setVisitasError(getApiErrorMessage(err, 'Não foi possível carregar as visitas.'));
      } finally {
        setLoadingVisitas(false);
      }
    }
  };

  const handleDeleteVisita = async (visitaId: string) => {
    if (!confirm('Excluir este registro de visita?')) return;
    try {
      await deleteEquipeVisita(visitaId);
      setVisitas((prev) => (prev ? prev.filter((v) => v.id !== visitaId) : prev));
    } catch (err) {
      alert(getApiErrorMessage(err, 'Não foi possível excluir a visita.'));
    }
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(getVisitaLink(equipe.id));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border dark:border-gray-700 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-black text-base truncate">{equipe.nome}</h4>
          <p className="text-xs opacity-50 font-semibold flex flex-wrap items-center gap-1">
            {totalPessoas}/5 pessoas
            {equipe.origem === 'AUTOCADASTRO' && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 text-[10px] font-black uppercase">
                Autocadastro
              </span>
            )}
            {equipe.status === 'INATIVA' && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-900 text-gray-500 text-[10px] font-black uppercase">
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
          {eleitoralLabel(equipe.motoristaTituloEleitor, equipe.motoristaSecao) && (
            <p className="text-[11px] opacity-50 font-semibold mt-0.5">
              <i className="fa-solid fa-check-to-slot mr-1"></i>
              {eleitoralLabel(equipe.motoristaTituloEleitor, equipe.motoristaSecao)}
            </p>
          )}
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
          <div className="space-y-1.5">
            {equipe.membros.map((m) => (
              <div
                key={m.id ?? `${m.nome}-${m.telefone}`}
                className="rounded-xl bg-blue-50/70 dark:bg-blue-900/20 px-3 py-2"
              >
                <p className="text-xs font-bold text-blue-800 dark:text-blue-200">
                  {m.nome} <span className="opacity-60 font-semibold">· {m.telefone}</span>
                </p>
                {eleitoralLabel(m.tituloEleitor, m.secao) && (
                  <p className="text-[10px] opacity-60 font-semibold text-blue-700 dark:text-blue-300">
                    {eleitoralLabel(m.tituloEleitor, m.secao)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Prestação de contas: visitas */}
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/20 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            <i className="fa-solid fa-route mr-1"></i> Prestação de contas
          </p>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
            {equipe.visitasCount} {equipe.visitasCount === 1 ? 'visita' : 'visitas'}
          </span>
        </div>
        {equipe.ultimaVisitaEm && (
          <p className="text-[11px] opacity-60 font-semibold -mt-1">
            Última visita: {formatDateTime(equipe.ultimaVisitaEm)}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={toggleVisitas}
            className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border dark:border-gray-700 active:scale-95 transition-transform"
          >
            <i className={`fa-solid ${showVisitas ? 'fa-chevron-up' : 'fa-list-check'} mr-1`}></i>
            {showVisitas ? 'Ocultar visitas' : 'Ver visitas'}
          </button>
          <button
            onClick={() => setShowLink((v) => !v)}
            className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl bg-emerald-600 text-white active:scale-95 transition-transform"
          >
            <i className="fa-solid fa-qrcode mr-1"></i>
            Link da equipe
          </button>
        </div>

        {showLink && (
          <div className="space-y-2 pt-1">
            <p className="text-[10px] opacity-60 font-semibold">
              Compartilhe este link/QR com a equipe. No campo, qualquer integrante registra as
              visitas pelo celular (sem login).
            </p>
            <div className="bg-white dark:bg-gray-900 rounded-xl px-3 py-2 text-[10px] font-mono opacity-60 break-all">
              {getVisitaLink(equipe.id)}
            </div>
            <button
              onClick={handleCopyLink}
              className={`w-full text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl transition-all active:scale-95 ${
                copied
                  ? 'bg-green-50 text-green-700 dark:bg-green-900/20'
                  : 'bg-gray-100 dark:bg-gray-900'
              }`}
            >
              <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} mr-1`}></i>
              {copied ? 'Link copiado!' : 'Copiar link'}
            </button>
            <ShareLinkQrCode url={getVisitaLink(equipe.id)} ownerName={`equipe-${equipe.nome}`} />
          </div>
        )}

        {showVisitas && (
          <div className="pt-1 space-y-2">
            {loadingVisitas && (
              <p className="text-xs opacity-50 font-semibold">
                <i className="fa-solid fa-circle-notch fa-spin mr-1"></i> Carregando...
              </p>
            )}
            {visitasError && <p className="text-xs text-red-500 font-semibold">{visitasError}</p>}
            {!loadingVisitas && !visitasError && visitas && visitas.length === 0 && (
              <p className="text-xs opacity-50 font-semibold">
                Nenhuma visita registrada ainda.
              </p>
            )}
            {visitas?.map((v) => (
              <div
                key={v.id}
                className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-3 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-black truncate">
                      <i className="fa-solid fa-location-dot mr-1 text-emerald-500"></i>
                      {v.local}
                    </p>
                    <p className="text-[10px] opacity-60 font-semibold">
                      {formatDateTime(v.dataHora)}
                      {v.registradoPor && <span> · por {v.registradoPor}</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteVisita(v.id)}
                    className="w-7 h-7 rounded-lg opacity-40 hover:opacity-100 hover:text-red-500 transition-all shrink-0"
                    title="Excluir visita"
                  >
                    <i className="fa-solid fa-trash-can text-xs"></i>
                  </button>
                </div>
                {v.observacoes && (
                  <p className="text-[11px] opacity-70 whitespace-pre-wrap">{v.observacoes}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {v.fotoUrl && (
                    <a href={v.fotoUrl} target="_blank" rel="noreferrer">
                      <img
                        src={v.fotoUrl}
                        alt="Comprovação da visita"
                        className="w-16 h-16 rounded-lg object-cover border dark:border-gray-700"
                      />
                    </a>
                  )}
                  {v.latitude != null && v.longitude != null && (
                    <a
                      href={`https://www.google.com/maps?q=${v.latitude},${v.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] font-black uppercase tracking-widest px-2 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300"
                    >
                      <i className="fa-solid fa-map-location-dot mr-1"></i> Ver no mapa
                    </a>
                  )}
                </div>
              </div>
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
