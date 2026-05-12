import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AdminUser, Atividade, User } from '../../types';
import {
  deleteAtividade,
  fetchAtividades,
  fetchUsers,
  getApiErrorMessage,
  isUnauthorized
} from '../../api';

interface Props {
  currentUser: User;
  onLogout: () => void;
}

type Periodo = 'hoje' | 'semana' | 'mes' | 'todos';

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const startOfWeek = (d: Date) => {
  const x = startOfDay(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  return x;
};
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

const AtividadesList: React.FC<Props> = ({ currentUser, onLogout }) => {
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [lideres, setLideres] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [periodo, setPeriodo] = useState<Periodo>('semana');
  const [filterLiderId, setFilterLiderId] = useState('');
  const [search, setSearch] = useState('');
  const [selectedLinkLiderId, setSelectedLinkLiderId] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const isCoord = currentUser.role === 'COORDENADOR';
  const isVerif = currentUser.role === 'VERIFICADORA';
  const isLider = currentUser.role === 'LIDER_REGIONAL';
  const canSeeAll = isCoord || isVerif;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ats, users] = await Promise.all([
        fetchAtividades(),
        canSeeAll ? fetchUsers() : Promise.resolve([] as AdminUser[])
      ]);
      setAtividades(ats);
      setLideres(users.filter((u) => u.role === 'LIDER_REGIONAL' || u.role === 'COORDENADOR'));
    } catch (err) {
      if (isUnauthorized(err)) { onLogout(); return; }
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [canSeeAll]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filtros aplicados ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const now = new Date();
    let cutoff: Date | null = null;
    if (periodo === 'hoje') cutoff = startOfDay(now);
    else if (periodo === 'semana') cutoff = startOfWeek(now);
    else if (periodo === 'mes') cutoff = startOfMonth(now);

    let list = atividades;

    if (cutoff) {
      const cut = cutoff.getTime();
      list = list.filter((a) => new Date(a.dataHora).getTime() >= cut);
    }

    if (filterLiderId) list = list.filter((a) => a.liderId === filterLiderId);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.titulo.toLowerCase().includes(q) ||
          (a.local ?? '').toLowerCase().includes(q) ||
          (a.descricao ?? '').toLowerCase().includes(q) ||
          a.liderNome.toLowerCase().includes(q)
      );
    }

    return list;
  }, [atividades, periodo, filterLiderId, search]);

  // ── Agrupado por líder ────────────────────────────────────────────────────
  const grupos = useMemo(() => {
    const map = new Map<string, { nome: string; itens: Atividade[]; totalEnvolvidos: number }>();
    for (const a of filtered) {
      const entry = map.get(a.liderId) ?? { nome: a.liderNome, itens: [], totalEnvolvidos: 0 };
      entry.itens.push(a);
      entry.totalEnvolvidos += a.qtdEnvolvidos;
      map.set(a.liderId, entry);
    }
    return Array.from(map.entries())
      .map(([liderId, v]) => ({ liderId, ...v }))
      .sort((a, b) => b.itens.length - a.itens.length);
  }, [filtered]);

  // ── Totais gerais ─────────────────────────────────────────────────────────
  const totalAtividades = filtered.length;
  const totalEnvolvidos = filtered.reduce((sum, a) => sum + a.qtdEnvolvidos, 0);

  // ── Link de cadastro ──────────────────────────────────────────────────────
  const getCadastroLink = (liderId: string) => {
    const base = window.location.origin + window.location.pathname;
    return `${base}#/atividades/cadastro?lider=${liderId}`;
  };

  const handleCopy = async (liderId: string) => {
    await navigator.clipboard.writeText(getCadastroLink(liderId));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta atividade? Esta ação não pode ser desfeita.')) return;
    setDeleting(id);
    try {
      await deleteAtividade(id);
      setAtividades((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      if (isUnauthorized(err)) { onLogout(); return; }
      alert(getApiErrorMessage(err, 'Erro ao excluir atividade.'));
    } finally {
      setDeleting(null);
    }
  };

  // ── Exportação XLSX ───────────────────────────────────────────────────────
  const exportXLSX = () => {
    if (filtered.length === 0) return;
    const wb = XLSX.utils.book_new();
    const enc = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });

    const S = {
      header: {
        font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid' as const, fgColor: { rgb: '065F46' } },
        alignment: { horizontal: 'center' as const }
      },
      tableHeader: {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid' as const, fgColor: { rgb: '10B981' } },
        alignment: { horizontal: 'center' as const }
      }
    };

    // Sheet por líder
    const resumoData = [
      ['Atividades — Resumo', '', '', ''],
      [`Período: ${periodo} · ${totalAtividades} atividades · ${totalEnvolvidos} envolvidos`, '', '', ''],
      [''],
      ['Liderança', 'Atividades', 'Total envolvidos', ''],
      ...grupos.map((g) => [g.nome, g.itens.length, g.totalEnvolvidos, ''])
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(resumoData);
    ws1['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 18 }, { wch: 8 }];
    ws1['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }
    ];
    ['A1', 'B1', 'C1', 'D1'].forEach((a) => { if (ws1[a]) ws1[a].s = S.header; });
    ['A4', 'B4', 'C4'].forEach((a) => { if (ws1[a]) ws1[a].s = S.tableHeader; });
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumo');

    // Sheet lista completa
    const listaData = [
      ['Lista de Atividades', '', '', '', '', ''],
      [''],
      ['Liderança', 'Atividade', 'Data/Hora', 'Local', 'Envolvidos', 'Descrição'],
      ...filtered.map((a) => [
        a.liderNome,
        a.titulo,
        new Date(a.dataHora).toLocaleString('pt-BR'),
        a.local ?? '',
        a.qtdEnvolvidos,
        a.descricao ?? ''
      ])
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(listaData);
    ws2['!cols'] = [{ wch: 28 }, { wch: 32 }, { wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 40 }];
    ws2['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
    ['A1', 'B1', 'C1', 'D1', 'E1', 'F1'].forEach((a) => { if (ws2[a]) ws2[a].s = S.header; });
    ['A3', 'B3', 'C3', 'D3', 'E3', 'F3'].forEach((a) => { if (ws2[a]) ws2[a].s = S.tableHeader; });
    XLSX.utils.book_append_sheet(wb, ws2, 'Atividades');

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `atividades_${periodo}_${dateStr}.xlsx`, { cellStyles: true });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 opacity-40">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl"></i>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 text-sm font-semibold">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center justify-between gap-3 animate-soft-pop">
        <h2 className="text-xl font-black">Atividades das lideranças</h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-3 text-center">
          <i className="fa-solid fa-clipboard-list text-emerald-500 text-lg mb-1"></i>
          <p className="text-2xl font-black text-emerald-600">{totalAtividades}</p>
          <p className="text-[9px] font-black uppercase opacity-60">Atividades</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-3 text-center">
          <i className="fa-solid fa-users text-blue-500 text-lg mb-1"></i>
          <p className="text-2xl font-black text-blue-600">{totalEnvolvidos}</p>
          <p className="text-[9px] font-black uppercase opacity-60">Envolvidos</p>
        </div>
      </div>

      {/* Filtros de período */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1">
        {([
          { id: 'hoje', label: 'Hoje' },
          { id: 'semana', label: 'Semana' },
          { id: 'mes', label: 'Mês' },
          { id: 'todos', label: 'Todos' }
        ] as { id: Periodo; label: string }[]).map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriodo(p.id)}
            className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all ${
              periodo === p.id ? 'bg-white dark:bg-gray-700 shadow text-emerald-600' : 'opacity-40'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Busca */}
      <div className="relative">
        <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none"></i>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título, local, liderança..."
          className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl pl-11 pr-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none text-sm shadow-sm"
        />
      </div>

      {/* Filtro por líder */}
      {canSeeAll && lideres.length > 0 && (
        <select
          value={filterLiderId}
          onChange={(e) => setFilterLiderId(e.target.value)}
          className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
        >
          <option value="">Todas as lideranças</option>
          {lideres.map((l) => (
            <option key={l.id} value={l.id}>{l.name ?? l.email}</option>
          ))}
        </select>
      )}

      {/* Exportar */}
      <button
        onClick={exportXLSX}
        disabled={filtered.length === 0}
        className="w-full flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest bg-emerald-600 text-white py-3 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-40"
      >
        <i className="fa-solid fa-file-excel text-sm"></i>
        Exportar planilha
      </button>

      {/* Link de cadastro por liderança */}
      {canSeeAll && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-4 space-y-3">
          <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">
            Link de cadastro por liderança
          </p>
          <select
            value={selectedLinkLiderId}
            onChange={(e) => setSelectedLinkLiderId(e.target.value)}
            className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
          >
            <option value="">Selecionar liderança...</option>
            {lideres.map((l) => (
              <option key={l.id} value={l.id}>{l.name ?? l.email}</option>
            ))}
          </select>
          {selectedLinkLiderId && (
            <div className="space-y-2">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl px-4 py-3 text-xs font-mono opacity-60 break-all">
                {getCadastroLink(selectedLinkLiderId)}
              </div>
              <button
                onClick={() => handleCopy(selectedLinkLiderId)}
                className={`w-full font-black uppercase tracking-widest text-xs py-3 rounded-2xl transition-all active:scale-95 ${
                  copied ? 'bg-green-50 text-green-700 dark:bg-green-900/20' : 'bg-emerald-600 text-white shadow-lg'
                }`}
              >
                <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} mr-2`}></i>
                {copied ? 'Link copiado!' : 'Copiar link'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Link para o próprio líder */}
      {isLider && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-4 space-y-3">
          <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">
            Seu link de cadastro
          </p>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl px-4 py-3 text-xs font-mono opacity-60 break-all">
            {getCadastroLink(currentUser.id)}
          </div>
          <button
            onClick={() => handleCopy(currentUser.id)}
            className={`w-full font-black uppercase tracking-widest text-xs py-3 rounded-2xl transition-all active:scale-95 ${
              copied ? 'bg-green-50 text-green-700 dark:bg-green-900/20' : 'bg-emerald-600 text-white shadow-lg'
            }`}
          >
            <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} mr-2`}></i>
            {copied ? 'Link copiado!' : 'Copiar meu link'}
          </button>
        </div>
      )}

      {/* Lista agrupada por liderança */}
      {grupos.length === 0 ? (
        <div className="py-16 text-center opacity-40 flex flex-col items-center gap-3">
          <i className="fa-solid fa-clipboard text-3xl"></i>
          <p className="font-bold text-sm">Nenhuma atividade no período</p>
        </div>
      ) : (
        grupos.map((g) => (
          <div key={g.liderId} className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-900/40 px-4 py-3 border-b dark:border-gray-700">
              <div className="flex items-center justify-between gap-2">
                <p className="font-black text-sm truncate">
                  <i className="fa-solid fa-user-tie mr-2 opacity-60"></i>{g.nome}
                </p>
                <div className="flex gap-2 text-[10px] font-black">
                  <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md">
                    {g.itens.length} ativ.
                  </span>
                  <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-md">
                    {g.totalEnvolvidos} envolv.
                  </span>
                </div>
              </div>
            </div>
            <div className="divide-y dark:divide-gray-700">
              {g.itens.map((a) => {
                const expanded = expandedId === a.id;
                return (
                  <div key={a.id} className="p-3">
                    <button
                      onClick={() => setExpandedId(expanded ? null : a.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <p className="font-black text-sm flex-1 truncate">{a.titulo}</p>
                        <span className="text-[9px] bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 px-2 py-0.5 rounded-md font-black uppercase tracking-tighter shrink-0">
                          <i className="fa-solid fa-users mr-1"></i>{a.qtdEnvolvidos}
                        </span>
                      </div>
                      <p className="text-[10px] opacity-60 font-bold">
                        <i className="fa-solid fa-calendar mr-1"></i>{formatDateTime(a.dataHora)}
                        {a.local && (
                          <span className="ml-2">
                            <i className="fa-solid fa-location-dot mr-1"></i>{a.local}
                          </span>
                        )}
                      </p>
                    </button>

                    {expanded && (
                      <div className="mt-3 pt-3 border-t dark:border-gray-700 space-y-2">
                        {a.descricao && (
                          <div>
                            <p className="text-[9px] font-black uppercase opacity-40 tracking-widest mb-1">
                              Descrição
                            </p>
                            <p className="text-xs opacity-70 whitespace-pre-wrap">{a.descricao}</p>
                          </div>
                        )}
                        {(isCoord || (isLider && a.liderId === currentUser.id)) && (
                          <button
                            onClick={() => handleDelete(a.id)}
                            disabled={deleting === a.id}
                            className="min-h-[36px] text-[10px] font-black uppercase tracking-widest bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 px-3 py-1.5 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                          >
                            <i className="fa-solid fa-trash mr-1"></i>
                            {deleting === a.id ? 'Excluindo...' : 'Excluir'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default AtividadesList;
