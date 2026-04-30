import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Evento,
  EventoIndicado,
  EventoIndicadoStatus,
  User,
  AdminUser
} from '../../types';
import {
  checkinEventoIndicado,
  fetchEvento,
  fetchEventoIndicados,
  fetchUsers,
  getApiErrorMessage,
  isUnauthorized,
  updateEvento,
  updateEventoIndicadoStatus
} from '../../api';

interface Props {
  eventoId: string;
  currentUser: User;
  onBack: () => void;
  onLogout: () => void;
}

type Tab = 'resumo' | 'indicados' | 'convites' | 'checkin';

const formatDate = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
};

const statusLabel: Record<EventoIndicadoStatus, string> = {
  INDICADO: 'Indicado',
  APROVADO: 'Aprovado',
  RECUSADO: 'Recusado',
  CONFIRMADO: 'Confirmado',
  PRESENTE: 'Presente'
};

const statusClass: Record<EventoIndicadoStatus, string> = {
  INDICADO: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  APROVADO: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  RECUSADO: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
  CONFIRMADO: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  PRESENTE: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
};

const EventoDetail: React.FC<Props> = ({ eventoId, currentUser, onBack, onLogout }) => {
  const [evento, setEvento] = useState<Evento | null>(null);
  const [indicados, setIndicados] = useState<EventoIndicado[]>([]);
  const [lideres, setLideres] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('resumo');

  // Filtros da aba Indicados
  const [searchIndicados, setSearchIndicados] = useState('');
  const [filterStatus, setFilterStatus] = useState<EventoIndicadoStatus | ''>('');
  const [filterLiderId, setFilterLiderId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Check-in
  const [checkinQuery, setCheckinQuery] = useState('');
  const [checkinResult, setCheckinResult] = useState<EventoIndicado | null>(null);
  const [checkinError, setCheckinError] = useState<string | null>(null);
  const [checkinLoading, setCheckinLoading] = useState<string | null>(null);

  // Link de indicação (aba Resumo - coord)
  const [selectedLiderId, setSelectedLiderId] = useState('');
  const [copied, setCopied] = useState(false);

  // Edição do evento
  const [editMode, setEditMode] = useState(false);
  const [editNome, setEditNome] = useState('');
  const [editData, setEditData] = useState('');
  const [editHora, setEditHora] = useState('');
  const [editLocal, setEditLocal] = useState('');
  const [editLimite, setEditLimite] = useState('0');
  const [editObs, setEditObs] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const isCoord = currentUser.role === 'COORDENADOR';
  const isVerif = currentUser.role === 'VERIFICADORA';
  const isLider = currentUser.role === 'LIDER_REGIONAL';
  const canValidate = isCoord || isVerif;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ev, indList] = await Promise.all([
        fetchEvento(eventoId),
        fetchEventoIndicados(eventoId)
      ]);
      setEvento(ev);
      setIndicados(indList);

      if (isCoord) {
        const users = await fetchUsers();
        setLideres(users.filter((u) => u.role === 'LIDER_REGIONAL' || u.role === 'COORDENADOR'));
      }
    } catch (err) {
      if (isUnauthorized(err)) { onLogout(); return; }
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [eventoId, isCoord]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Indicados filtrados ───────────────────────────────────────────────────
  const filteredIndicados = useMemo(() => {
    let list = indicados;
    if (isLider) list = list.filter((i) => i.liderId === currentUser.id);
    if (filterStatus) list = list.filter((i) => i.status === filterStatus);
    if (filterLiderId) list = list.filter((i) => i.liderId === filterLiderId);
    if (searchIndicados) {
      const q = searchIndicados.toLowerCase();
      list = list.filter(
        (i) =>
          i.nome.toLowerCase().includes(q) || i.telefone.includes(q)
      );
    }
    return list;
  }, [indicados, filterStatus, filterLiderId, searchIndicados, isLider, currentUser.id]);

  const approvedForLider = useMemo(
    () => indicados.filter((i) => i.liderId === currentUser.id && (i.status === 'APROVADO' || i.status === 'CONFIRMADO')),
    [indicados, currentUser.id]
  );

  const allApproved = useMemo(
    () => indicados.filter((i) => i.status === 'APROVADO' || i.status === 'CONFIRMADO'),
    [indicados]
  );

  // Indicadores por liderança (para COORDENADOR na aba Resumo)
  const statsByLider = useMemo(() => {
    const map = new Map<string, { nome: string; indicados: number; aprovados: number; presentes: number }>();
    for (const ind of indicados) {
      const entry = map.get(ind.liderId) ?? { nome: ind.liderNome, indicados: 0, aprovados: 0, presentes: 0 };
      entry.indicados++;
      if (ind.status === 'APROVADO') entry.aprovados++;
      if (ind.status === 'PRESENTE') entry.presentes++;
      map.set(ind.liderId, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.indicados - a.indicados);
  }, [indicados]);

  const checkinMatches = useMemo(() => {
    const q = checkinQuery.trim();
    if (!q) return [];
    const digits = q.replace(/\D/g, '');
    const lower = q.toLowerCase();
    return indicados.filter((i) => {
      if (i.status !== 'APROVADO' && i.status !== 'CONFIRMADO') return false;
      if (digits.length >= 4) return i.telefone.includes(digits);
      return i.nome.toLowerCase().includes(lower);
    });
  }, [indicados, checkinQuery]);

  // ── Ações de validação ────────────────────────────────────────────────────
  const updateStatus = async (id: string, status: EventoIndicadoStatus) => {
    setActionLoading(id);
    try {
      const updated = await updateEventoIndicadoStatus(eventoId, id, status);
      setIndicados((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setSelectedIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    } catch (err) {
      if (isUnauthorized(err)) { onLogout(); return; }
      alert(getApiErrorMessage(err, 'Erro ao atualizar status.'));
    } finally {
      setActionLoading(null);
    }
  };

  const approveSelected = async () => {
    for (const id of selectedIds) {
      await updateStatus(id, 'APROVADO');
    }
    setSelectedIds(new Set());
  };

  // ── Check-in ──────────────────────────────────────────────────────────────
  const handleCheckinById = async (ind: EventoIndicado) => {
    setCheckinLoading(ind.id);
    setCheckinResult(null);
    setCheckinError(null);
    try {
      const updated = await checkinEventoIndicado(eventoId, { indicadoId: ind.id });
      setIndicados((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setCheckinResult(updated);
      setCheckinQuery('');
    } catch (err) {
      if (isUnauthorized(err)) { onLogout(); return; }
      setCheckinError(getApiErrorMessage(err, 'Erro ao confirmar presença.'));
    } finally {
      setCheckinLoading(null);
    }
  };

  // ── Link de indicação ─────────────────────────────────────────────────────
  const getIndicacaoLink = (liderId: string) => {
    const base = window.location.origin + window.location.pathname;
    return `${base}#/eventos/${eventoId}/indicacao?lider=${liderId}`;
  };

  const handleCopyLink = async (liderId: string) => {
    await navigator.clipboard.writeText(getIndicacaoLink(liderId));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getConfirmacaoLink = (ind: EventoIndicado) => {
    const base = window.location.origin + window.location.pathname;
    return `${base}#/eventos/${eventoId}/confirmacao?ind=${ind.id}`;
  };

  const openWhatsApp = (ind: EventoIndicado) => {
    if (!evento) return;
    const phone = ind.telefone.replace(/\D/g, '');
    const phoneWithCode = phone.startsWith('55') ? phone : `55${phone}`;
    const link = getConfirmacaoLink(ind);
    const msg =
      `Olá ${ind.nome}! 🙏\n\n` +
      `Você foi convidado(a) para um evento especial com o Guti!\n\n` +
      `📅 *${evento.nome}*\n` +
      `🗓 Data: ${formatDate(evento.data)}\n` +
      `⏰ Hora: ${evento.hora}\n` +
      `📍 Local: ${evento.local}\n\n` +
      `Para confirmar sua presença, acesse o link abaixo:\n${link}`;
    window.open(`https://wa.me/${phoneWithCode}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // ── Edição do evento ──────────────────────────────────────────────────────
  const openEdit = () => {
    if (!evento) return;
    setEditNome(evento.nome);
    setEditData(evento.data.slice(0, 10));
    setEditHora(evento.hora);
    setEditLocal(evento.local);
    setEditLimite(String(evento.limitePorLider));
    setEditObs(evento.observacao ?? '');
    setEditError(null);
    setEditMode(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editNome.trim() || !editData || !editHora || !editLocal.trim()) {
      setEditError('Preencha todos os campos obrigatórios.');
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const updated = await updateEvento(eventoId, {
        nome: editNome.trim(),
        data: editData,
        hora: editHora,
        local: editLocal.trim(),
        limitePorLider: parseInt(editLimite, 10) || 0,
        observacao: editObs.trim() || undefined
      });
      setEvento(updated);
      setEditMode(false);
    } catch (err) {
      if (isUnauthorized(err)) { onLogout(); return; }
      setEditError(getApiErrorMessage(err, 'Erro ao salvar evento.'));
    } finally {
      setEditSaving(false);
    }
  };

  // ── Tabs disponíveis ──────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: string; visible: boolean }[] = [
    { id: 'resumo', label: 'Resumo', icon: 'fa-chart-pie', visible: true },
    { id: 'indicados', label: 'Validação', icon: 'fa-user-check', visible: canValidate },
    { id: 'convites', label: 'Convites', icon: 'fa-envelope', visible: true },
    { id: 'checkin', label: 'Check-in', icon: 'fa-qrcode', visible: canValidate }
  ].filter((t) => t.visible);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 opacity-40">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl"></i>
      </div>
    );
  }

  if (error || !evento) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold opacity-60 hover:opacity-100">
          <i className="fa-solid fa-arrow-left"></i> Voltar
        </button>
        <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 text-sm font-semibold">
          {error ?? 'Evento não encontrado.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Header */}
      <div className="flex items-start gap-3 animate-soft-pop">
        <button onClick={onBack} className="p-2 rounded-2xl opacity-40 hover:opacity-80 transition-opacity mt-0.5">
          <i className="fa-solid fa-arrow-left text-xl"></i>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-black truncate">{evento.nome}</h2>
          <p className="text-[10px] opacity-40 font-bold uppercase">
            {formatDate(evento.data)} às {evento.hora} · {evento.local}
          </p>
          {evento.encerrado && (
            <span className="text-[9px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded-md font-black uppercase tracking-tighter">
              Encerrado
            </span>
          )}
        </div>
        {(isCoord || isVerif) && !evento.encerrado && (
          <button
            onClick={openEdit}
            className="p-2 rounded-2xl opacity-40 hover:opacity-80 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all mt-0.5"
            title="Editar evento"
          >
            <i className="fa-solid fa-pen text-blue-500 text-base"></i>
          </button>
        )}
      </div>

      {/* Painel de edição inline */}
      {editMode && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-5 animate-fade-up">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Editar evento</p>
            <button
              onClick={() => setEditMode(false)}
              className="text-xs opacity-40 hover:opacity-80 transition-opacity"
            >
              <i className="fa-solid fa-xmark text-base"></i>
            </button>
          </div>
          <form onSubmit={handleEditSave} className="space-y-4">
            {editError && (
              <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 text-sm font-semibold">{editError}</div>
            )}
            <div>
              <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">Nome *</label>
              <input
                type="text"
                value={editNome}
                onChange={(e) => setEditNome(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">Data *</label>
                <input
                  type="date"
                  value={editData}
                  onChange={(e) => setEditData(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">Hora *</label>
                <input
                  type="time"
                  value={editHora}
                  onChange={(e) => setEditHora(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">Local *</label>
              <input
                type="text"
                value={editLocal}
                onChange={(e) => setEditLocal(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                required
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">
                Limite por liderança
              </label>
              <input
                type="number"
                value={editLimite}
                onChange={(e) => setEditLimite(e.target.value)}
                min="0"
                className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
              <p className="text-[10px] opacity-40 mt-1 ml-1">0 = sem limite</p>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1">
                Observação interna
              </label>
              <textarea
                value={editObs}
                onChange={(e) => setEditObs(e.target.value)}
                rows={2}
                className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="flex-1 text-xs font-black uppercase tracking-widest bg-gray-100 dark:bg-gray-700 py-3 rounded-2xl active:scale-95 transition-transform"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="flex-1 text-xs font-black uppercase tracking-widest theme-brand-mark text-white py-3 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-50"
              >
                {editSaving ? (
                  <span className="flex items-center justify-center gap-2">
                    <i className="fa-solid fa-circle-notch fa-spin"></i> Salvando...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <i className="fa-solid fa-floppy-disk"></i> Salvar
                  </span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center py-2 px-1 rounded-xl text-[9px] font-black uppercase tracking-tight transition-all ${
              tab === t.id
                ? 'bg-white dark:bg-gray-700 shadow text-blue-600'
                : 'opacity-40'
            }`}
          >
            <i className={`fa-solid ${t.icon} text-sm mb-0.5`}></i>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── RESUMO ── */}
      {tab === 'resumo' && (
        <div className="space-y-4">
          {/* Stats cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Indicados', value: evento.totalIndicados, color: 'blue', icon: 'fa-user-plus' },
              { label: 'Aprovados', value: evento.totalAprovados, color: 'green', icon: 'fa-user-check' },
              { label: 'Presentes', value: evento.totalPresentes, color: 'amber', icon: 'fa-circle-check' }
            ].map(({ label, value, color, icon }) => (
              <div key={label} className={`bg-${color}-50 dark:bg-${color}-900/20 rounded-2xl p-3 text-center`}>
                <i className={`fa-solid ${icon} text-${color}-500 text-lg mb-1`}></i>
                <p className={`text-2xl font-black text-${color}-600`}>{value}</p>
                <p className="text-[9px] font-black uppercase opacity-60">{label}</p>
              </div>
            ))}
          </div>

          {/* Link de indicação */}
          {(isCoord || isVerif) && !evento.encerrado && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-4 space-y-3">
              <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">
                Link de indicação por liderança
              </p>
              <div className="relative">
                <i className="fa-solid fa-user-tie absolute left-4 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none"></i>
                <select
                  value={selectedLiderId}
                  onChange={(e) => setSelectedLiderId(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl pl-11 pr-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm appearance-none"
                >
                  <option value="">Selecionar liderança...</option>
                  {lideres.map((l) => (
                    <option key={l.id} value={l.id}>{l.name ?? l.email}</option>
                  ))}
                </select>
              </div>
              {selectedLiderId && (
                <div className="space-y-2">
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl px-4 py-3 text-xs font-mono opacity-60 break-all">
                    {getIndicacaoLink(selectedLiderId)}
                  </div>
                  <button
                    onClick={() => handleCopyLink(selectedLiderId)}
                    className={`w-full font-black uppercase tracking-widest text-xs py-3 rounded-2xl transition-all active:scale-95 ${
                      copied
                        ? 'bg-green-50 text-green-700 dark:bg-green-900/20'
                        : 'bg-blue-600 text-white shadow-lg'
                    }`}
                  >
                    <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} mr-2`}></i>
                    {copied ? 'Link copiado!' : 'Copiar link'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Link do próprio lider */}
          {isLider && !evento.encerrado && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-4 space-y-3">
              <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">
                Seu link de indicação
              </p>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl px-4 py-3 text-xs font-mono opacity-60 break-all">
                {getIndicacaoLink(currentUser.id)}
              </div>
              <button
                onClick={() => handleCopyLink(currentUser.id)}
                className={`w-full font-black uppercase tracking-widest text-xs py-3 rounded-2xl transition-all active:scale-95 ${
                  copied
                    ? 'bg-green-50 text-green-700 dark:bg-green-900/20'
                    : 'bg-blue-600 text-white shadow-lg'
                }`}
              >
                <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} mr-2`}></i>
                {copied ? 'Link copiado!' : 'Copiar meu link'}
              </button>
            </div>
          )}

          {/* Tabela por liderança */}
          {(isCoord || isVerif) && statsByLider.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-4 space-y-3">
              <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">
                Por liderança
              </p>
              <div className="space-y-2">
                {statsByLider.map((row) => (
                  <div key={row.nome} className="flex items-center justify-between py-2 border-b dark:border-gray-700 last:border-0">
                    <span className="text-sm font-bold truncate max-w-[40%]">{row.nome}</span>
                    <div className="flex gap-3 text-xs font-black">
                      <span className="text-blue-500">{row.indicados} ind.</span>
                      <span className="text-green-500">{row.aprovados} apr.</span>
                      <span className="text-amber-500">{row.presentes} pres.</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── VALIDAÇÃO ── */}
      {tab === 'indicados' && canValidate && (
        <div className="space-y-3">
          {/* Busca e filtros */}
          <div className="relative">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 opacity-40"></i>
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={searchIndicados}
              onChange={(e) => setSearchIndicados(e.target.value)}
              className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl pl-11 pr-4 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm text-sm"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as EventoIndicadoStatus | '')}
              className="flex-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl px-3 py-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Todos os status</option>
              <option value="INDICADO">Indicado</option>
              <option value="APROVADO">Aprovado</option>
              <option value="RECUSADO">Recusado</option>
              <option value="CONFIRMADO">Confirmado</option>
              <option value="PRESENTE">Presente</option>
            </select>
            {isCoord && (
              <select
                value={filterLiderId}
                onChange={(e) => setFilterLiderId(e.target.value)}
                className="flex-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl px-3 py-3 text-xs font-bold focus:ring-2 focus:ring-amber-400 outline-none"
              >
                <option value="">Todas as lideranças</option>
                {lideres.map((l) => (
                  <option key={l.id} value={l.id}>{l.name ?? l.email}</option>
                ))}
              </select>
            )}
          </div>

          {/* Ação em lote */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 rounded-2xl px-4 py-3">
              <span className="text-xs font-black text-blue-700">
                {selectedIds.size} selecionado(s)
              </span>
              <button
                onClick={approveSelected}
                className="text-xs font-black uppercase tracking-widest bg-green-600 text-white px-4 py-2 rounded-xl active:scale-95 transition-transform"
              >
                <i className="fa-solid fa-check mr-1"></i> Aprovar todos
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-[10px] bg-blue-600 text-white px-3 py-1 rounded-full font-black uppercase tracking-wider">
              {filteredIndicados.length} registros
            </span>
          </div>

          <div className="space-y-2">
            {filteredIndicados.length === 0 ? (
              <div className="py-16 text-center opacity-40 flex flex-col items-center gap-3">
                <i className="fa-solid fa-user-slash text-3xl"></i>
                <p className="font-bold text-sm">Nenhum indicado</p>
              </div>
            ) : (
              filteredIndicados.map((ind) => (
                <div
                  key={ind.id}
                  className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 shadow-sm p-3"
                >
                  <div className="flex items-start gap-2">
                    {ind.status === 'INDICADO' && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(ind.id)}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const s = new Set(prev);
                            e.target.checked ? s.add(ind.id) : s.delete(ind.id);
                            return s;
                          });
                        }}
                        className="mt-1 w-4 h-4 accent-blue-600 shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="font-black text-sm truncate">{ind.nome}</span>
                        <span className={`text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-tighter shrink-0 ${statusClass[ind.status]}`}>
                          {statusLabel[ind.status]}
                        </span>
                      </div>
                      <p className="text-[10px] opacity-40 font-semibold">{ind.telefone}</p>
                      <p className="text-[10px] opacity-60 font-bold">
                        <i className="fa-solid fa-user-tie mr-1"></i>{ind.liderNome}
                      </p>
                    </div>
                  </div>

                  {ind.status === 'INDICADO' && canValidate && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => updateStatus(ind.id, 'APROVADO')}
                        disabled={actionLoading === ind.id}
                        className="flex-1 text-[10px] font-black uppercase tracking-widest bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                      >
                        <i className="fa-solid fa-check mr-1"></i> Aprovar
                      </button>
                      <button
                        onClick={() => updateStatus(ind.id, 'RECUSADO')}
                        disabled={actionLoading === ind.id}
                        className="flex-1 text-[10px] font-black uppercase tracking-widest bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                      >
                        <i className="fa-solid fa-xmark mr-1"></i> Recusar
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── CONVITES ── */}
      {tab === 'convites' && (
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">
            {isCoord ? 'Aprovados por liderança' : 'Seus aprovados — envie o convite'}
          </p>

          {(isLider ? approvedForLider : allApproved).length === 0 ? (
            <div className="py-16 text-center opacity-40 flex flex-col items-center gap-3">
              <i className="fa-solid fa-envelope-open text-3xl"></i>
              <p className="font-bold text-sm">Nenhum aprovado ainda</p>
            </div>
          ) : (
            (isLider ? approvedForLider : allApproved).map((ind) => (
              <div
                key={ind.id}
                className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 shadow-sm p-4 flex items-center gap-3"
              >
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-base shrink-0 ${
                  ind.status === 'CONFIRMADO'
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600'
                    : 'bg-green-100 dark:bg-green-900/30 text-green-600'
                }`}>
                  {ind.nome.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-black text-sm truncate">{ind.nome}</p>
                    {ind.status === 'CONFIRMADO' && (
                      <span className="text-[9px] bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 px-2 py-0.5 rounded-md font-black uppercase tracking-tighter shrink-0">
                        Confirmado
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] opacity-40 font-semibold">{ind.telefone}</p>
                  {isCoord && (
                    <p className="text-[10px] opacity-60 font-bold">
                      <i className="fa-solid fa-user-tie mr-1"></i>{ind.liderNome}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => openWhatsApp(ind)}
                  className={`shrink-0 text-[9px] font-black uppercase tracking-tight px-3 py-2 rounded-xl active:scale-95 transition-transform ${
                    ind.status === 'CONFIRMADO'
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      : 'bg-green-600 text-white'
                  }`}
                  title={ind.status === 'CONFIRMADO' ? 'Reenviar convite' : 'Enviar convite pelo WhatsApp'}
                >
                  <i className="fa-brands fa-whatsapp mr-1"></i>
                  {ind.status === 'CONFIRMADO' ? 'Reenviar' : 'Convidar'}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── CHECK-IN ── */}
      {tab === 'checkin' && canValidate && (
        <div className="space-y-4">
          {/* Contador */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-3 text-center">
              <p className="text-2xl font-black text-green-600">
                {indicados.filter((i) => i.status === 'APROVADO' || i.status === 'CONFIRMADO').length}
              </p>
              <p className="text-[9px] font-black uppercase opacity-60">Aguardando</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-3 text-center">
              <p className="text-2xl font-black text-blue-600">
                {indicados.filter((i) => i.status === 'PRESENTE').length}
              </p>
              <p className="text-[9px] font-black uppercase opacity-60">Presentes</p>
            </div>
          </div>

          {/* Flash de sucesso */}
          {checkinResult && (
            <div className="px-4 py-4 rounded-2xl bg-green-50 dark:bg-green-900/20 flex items-center gap-3 animate-soft-pop">
              <i className="fa-solid fa-circle-check text-2xl text-green-500 shrink-0"></i>
              <div>
                <p className="font-black text-sm text-green-700 dark:text-green-400">Presença confirmada!</p>
                <p className="text-xs font-bold text-green-800 dark:text-green-300">{checkinResult.nome}</p>
                <p className="text-[10px] opacity-60 font-semibold">
                  <i className="fa-solid fa-user-tie mr-1"></i>{checkinResult.liderNome}
                </p>
              </div>
            </div>
          )}

          {checkinError && (
            <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 text-sm font-semibold">
              <i className="fa-solid fa-triangle-exclamation mr-2"></i>{checkinError}
            </div>
          )}

          {/* Campo de busca */}
          <div className="relative">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none"></i>
            <input
              type="text"
              value={checkinQuery}
              onChange={(e) => { setCheckinQuery(e.target.value); setCheckinResult(null); setCheckinError(null); }}
              placeholder="Digite nome ou telefone..."
              className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl pl-11 pr-4 py-4 focus:ring-2 focus:ring-blue-500 outline-none text-sm shadow-sm"
              autoFocus
            />
            {checkinQuery && (
              <button
                onClick={() => { setCheckinQuery(''); setCheckinResult(null); setCheckinError(null); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-80"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            )}
          </div>

          {/* Lista de resultados */}
          {checkinQuery.trim() && (
            <div className="space-y-2">
              {checkinMatches.length === 0 ? (
                <div className="py-8 text-center opacity-40 flex flex-col items-center gap-2">
                  <i className="fa-solid fa-user-slash text-2xl"></i>
                  <p className="text-sm font-bold">Nenhum resultado</p>
                  <p className="text-xs">Apenas aprovados e confirmados aparecem aqui</p>
                </div>
              ) : (
                <>
                  <p className="text-[10px] font-black uppercase opacity-40 tracking-widest px-1">
                    {checkinMatches.length} resultado{checkinMatches.length !== 1 ? 's' : ''}
                  </p>
                  {checkinMatches.map((ind) => (
                    <div
                      key={ind.id}
                      className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 shadow-sm p-3 flex items-center gap-3"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-base shrink-0 ${
                        ind.status === 'CONFIRMADO'
                          ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600'
                          : 'bg-green-100 dark:bg-green-900/30 text-green-600'
                      }`}>
                        {ind.nome.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-sm truncate">{ind.nome}</p>
                        <p className="text-[10px] opacity-40 font-semibold">{ind.telefone}</p>
                        <p className="text-[10px] opacity-60 font-bold">
                          <i className="fa-solid fa-user-tie mr-1"></i>{ind.liderNome}
                          {ind.status === 'CONFIRMADO' && (
                            <span className="ml-2 text-purple-600 dark:text-purple-400">· Confirmado</span>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => handleCheckinById(ind)}
                        disabled={checkinLoading === ind.id}
                        className="shrink-0 text-[9px] font-black uppercase tracking-tight bg-blue-600 text-white px-3 py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                      >
                        {checkinLoading === ind.id ? (
                          <i className="fa-solid fa-circle-notch fa-spin"></i>
                        ) : (
                          <><i className="fa-solid fa-circle-check mr-1"></i>Check-in</>
                        )}
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Estado inicial - listas completas */}
          {!checkinQuery.trim() && (() => {
            const pendentes = indicados.filter((i) => i.status === 'APROVADO' || i.status === 'CONFIRMADO');
            const presentes = indicados.filter((i) => i.status === 'PRESENTE');
            return (
              <div className="space-y-4">
                {/* Aguardando check-in */}
                {pendentes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase opacity-40 tracking-widest px-1">
                      Aguardando check-in ({pendentes.length})
                    </p>
                    {pendentes.map((ind) => (
                      <div
                        key={ind.id}
                        className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 shadow-sm p-3 flex items-center gap-3"
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-base shrink-0 ${
                          ind.status === 'CONFIRMADO'
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600'
                            : 'bg-green-100 dark:bg-green-900/30 text-green-600'
                        }`}>
                          {ind.nome.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-sm truncate">{ind.nome}</p>
                          <p className="text-[10px] opacity-40 font-semibold">{ind.liderNome}</p>
                          {ind.status === 'CONFIRMADO' && (
                            <p className="text-[9px] font-black text-purple-600 dark:text-purple-400">Confirmado</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleCheckinById(ind)}
                          disabled={checkinLoading === ind.id}
                          className="shrink-0 text-[9px] font-black uppercase tracking-tight bg-blue-600 text-white px-3 py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                        >
                          {checkinLoading === ind.id
                            ? <i className="fa-solid fa-circle-notch fa-spin"></i>
                            : <><i className="fa-solid fa-circle-check mr-1"></i>Check-in</>
                          }
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {pendentes.length === 0 && presentes.length === 0 && (
                  <div className="py-12 text-center opacity-40 flex flex-col items-center gap-2">
                    <i className="fa-solid fa-users text-3xl"></i>
                    <p className="text-sm font-bold">Nenhum aprovado ainda</p>
                  </div>
                )}

                {/* Já presentes */}
                {presentes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase opacity-40 tracking-widest px-1">
                      Já fizeram check-in ({presentes.length})
                    </p>
                    {presentes.map((ind) => (
                      <div
                        key={ind.id}
                        className="bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30 p-3 flex items-center gap-3"
                      >
                        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-black text-sm shrink-0">
                          {ind.nome.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-sm truncate">{ind.nome}</p>
                          <p className="text-[10px] opacity-40 font-semibold">{ind.liderNome}</p>
                        </div>
                        <i className="fa-solid fa-circle-check text-blue-500 shrink-0"></i>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default EventoDetail;
