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

  // Relatório por liderança
  const [relatorioLiderId, setRelatorioLiderId] = useState('');
  const [relatorioSemana, setRelatorioSemana] = useState<'atual' | 'anterior'>('atual');

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

  // ── Relatório por liderança ───────────────────────────────────────────────
  const gerarRelatorioLider = () => {
    if (!relatorioLiderId) return;
    const lider = lideres.find((l) => l.id === relatorioLiderId);
    if (!lider) return;

    const now = new Date();
    const inicio = startOfWeek(now);
    if (relatorioSemana === 'anterior') inicio.setDate(inicio.getDate() - 7);
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + 7);

    const periodoLabel = `${inicio.toLocaleDateString('pt-BR')} a ${new Date(fim.getTime() - 1).toLocaleDateString('pt-BR')}`;

    const ats = atividades
      .filter((a) => a.liderId === relatorioLiderId)
      .filter((a) => {
        const t = new Date(a.dataHora).getTime();
        return t >= inicio.getTime() && t < fim.getTime();
      })
      .sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime());

    if (ats.length === 0) {
      alert(`Nenhuma atividade encontrada para ${lider.name ?? lider.email} no período de ${periodoLabel}.`);
      return;
    }

    const totalAtiv = ats.length;
    const totalEnv = ats.reduce((s, a) => s + a.qtdEnvolvidos, 0);
    const media = totalAtiv > 0 ? (totalEnv / totalAtiv).toFixed(1) : '0';
    const maior = ats.reduce<Atividade | null>((max, a) => (!max || a.qtdEnvolvidos > max.qtdEnvolvidos ? a : max), null);

    // Distribuição por dia da semana
    const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const porDia: Record<string, { qtd: number; env: number }> = {};
    for (const d of diasSemana) porDia[d] = { qtd: 0, env: 0 };
    for (const a of ats) {
      const dia = diasSemana[new Date(a.dataHora).getDay()];
      porDia[dia].qtd++;
      porDia[dia].env += a.qtdEnvolvidos;
    }

    const wb = XLSX.utils.book_new();
    const enc = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });

    const S = {
      title: {
        font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid' as const, fgColor: { rgb: '065F46' } },
        alignment: { horizontal: 'center' as const, vertical: 'center' as const }
      },
      subtitle: {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid' as const, fgColor: { rgb: '10B981' } },
        alignment: { horizontal: 'center' as const }
      },
      section: {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid' as const, fgColor: { rgb: '047857' } },
        alignment: { horizontal: 'center' as const }
      },
      kpiLabel: {
        font: { bold: true, sz: 10 },
        fill: { patternType: 'solid' as const, fgColor: { rgb: 'D1FAE5' } },
        alignment: { horizontal: 'center' as const }
      },
      kpiValue: {
        font: { bold: true, sz: 20, color: { rgb: '065F46' } },
        alignment: { horizontal: 'center' as const, vertical: 'center' as const }
      },
      colHeader: {
        font: { bold: true },
        fill: { patternType: 'solid' as const, fgColor: { rgb: 'EFF6FF' } },
        alignment: { horizontal: 'center' as const }
      },
      cellCenter: { alignment: { horizontal: 'center' as const } }
    };

    const rowAlt = (i: number) => ({
      fill: { patternType: 'solid' as const, fgColor: { rgb: i % 2 === 0 ? 'FFFFFF' : 'F8FAFC' } }
    });

    // ── Sheet 1: Relatório ────────────────────────────────────────────────
    const data: (string | number)[][] = [
      [`Relatório de Atividades — ${lider.name ?? lider.email}`, '', '', ''],
      [`Período: ${periodoLabel}`, '', '', ''],
      [''],
      ['RESUMO DA SEMANA', '', '', ''],
      ['Atividades', 'Pessoas alcançadas', 'Média por atividade', 'Maior alcance'],
      [totalAtiv, totalEnv, media, maior ? maior.qtdEnvolvidos : 0],
      [''],
      ['DISTRIBUIÇÃO POR DIA DA SEMANA', '', '', ''],
      ['Dia', 'Atividades', 'Pessoas', ''],
      ...diasSemana.map((d) => [d, porDia[d].qtd, porDia[d].env, '']),
      [''],
      ['ATIVIDADES DETALHADAS', '', '', ''],
      ['Data/Hora', 'Atividade', 'Local', 'Envolvidos']
    ];

    // Linhas das atividades
    const startActRow = data.length;
    for (const a of ats) {
      data.push([
        new Date(a.dataHora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
        a.titulo,
        a.local ?? '',
        a.qtdEnvolvidos
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 20 }, { wch: 36 }, { wch: 24 }, { wch: 18 }];
    ws['!rows'] = [{ hpt: 32 }, { hpt: 22 }];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },
      { s: { r: 7, c: 0 }, e: { r: 7, c: 3 } },
      { s: { r: 18, c: 0 }, e: { r: 18, c: 3 } } // "ATIVIDADES DETALHADAS"
    ];

    // Estilos
    ['A1', 'B1', 'C1', 'D1'].forEach((a) => { if (ws[a]) ws[a].s = S.title; });
    ['A2', 'B2', 'C2', 'D2'].forEach((a) => { if (ws[a]) ws[a].s = S.subtitle; });
    ['A4', 'B4', 'C4', 'D4'].forEach((a) => { if (ws[a]) ws[a].s = S.section; });
    ['A5', 'B5', 'C5', 'D5'].forEach((a) => { if (ws[a]) ws[a].s = S.kpiLabel; });
    ['A6', 'B6', 'C6', 'D6'].forEach((a) => { if (ws[a]) ws[a].s = S.kpiValue; });
    ['A8', 'B8', 'C8', 'D8'].forEach((a) => { if (ws[a]) ws[a].s = S.section; });
    ['A9', 'B9', 'C9'].forEach((a) => { if (ws[a]) ws[a].s = S.colHeader; });

    diasSemana.forEach((_, i) => {
      const r = 9 + i;
      const rs = rowAlt(i);
      const a0 = ws[enc(r, 0)]; if (a0) a0.s = { ...rs, font: { bold: true } };
      const a1 = ws[enc(r, 1)]; if (a1) a1.s = { ...rs, ...S.cellCenter };
      const a2 = ws[enc(r, 2)]; if (a2) a2.s = { ...rs, ...S.cellCenter, font: { color: { rgb: '2563EB' }, bold: true } };
    });

    ['A19', 'B19', 'C19', 'D19'].forEach((a) => { if (ws[a]) ws[a].s = S.section; });
    ['A20', 'B20', 'C20', 'D20'].forEach((a) => { if (ws[a]) ws[a].s = S.colHeader; });

    ats.forEach((_, i) => {
      const r = startActRow + i;
      const rs = rowAlt(i);
      const c0 = ws[enc(r, 0)]; if (c0) c0.s = { ...rs, ...S.cellCenter };
      const c1 = ws[enc(r, 1)]; if (c1) c1.s = rs;
      const c2 = ws[enc(r, 2)]; if (c2) c2.s = rs;
      const c3 = ws[enc(r, 3)]; if (c3) c3.s = { ...rs, ...S.cellCenter, font: { bold: true, color: { rgb: '10B981' } } };
    });

    XLSX.utils.book_append_sheet(wb, ws, 'Relatório');

    // ── Sheet 2: Detalhes com descrição ─────────────────────────────────
    const detData: (string | number)[][] = [
      [`Detalhes — ${lider.name ?? lider.email}`, '', '', '', ''],
      [`Período: ${periodoLabel}`, '', '', '', ''],
      [''],
      ['Data/Hora', 'Atividade', 'Local', 'Envolvidos', 'Descrição'],
      ...ats.map((a) => [
        new Date(a.dataHora).toLocaleString('pt-BR'),
        a.titulo,
        a.local ?? '',
        a.qtdEnvolvidos,
        a.descricao ?? ''
      ])
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(detData);
    ws2['!cols'] = [{ wch: 20 }, { wch: 32 }, { wch: 22 }, { wch: 12 }, { wch: 50 }];
    ws2['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }
    ];
    ['A1', 'B1', 'C1', 'D1', 'E1'].forEach((a) => { if (ws2[a]) ws2[a].s = S.title; });
    ['A2', 'B2', 'C2', 'D2', 'E2'].forEach((a) => { if (ws2[a]) ws2[a].s = S.subtitle; });
    ['A4', 'B4', 'C4', 'D4', 'E4'].forEach((a) => { if (ws2[a]) ws2[a].s = S.colHeader; });

    ats.forEach((_, i) => {
      const r = 4 + i;
      const rs = rowAlt(i);
      const c0 = ws2[enc(r, 0)]; if (c0) c0.s = { ...rs, ...S.cellCenter };
      const c1 = ws2[enc(r, 1)]; if (c1) c1.s = { ...rs, font: { bold: true } };
      const c2 = ws2[enc(r, 2)]; if (c2) c2.s = rs;
      const c3 = ws2[enc(r, 3)]; if (c3) c3.s = { ...rs, ...S.cellCenter, font: { bold: true, color: { rgb: '10B981' } } };
      const c4 = ws2[enc(r, 4)]; if (c4) c4.s = rs;
    });

    XLSX.utils.book_append_sheet(wb, ws2, 'Detalhes');

    const nomeArquivo = (lider.name ?? lider.email).replace(/[^\w\sÀ-ú-]/g, '').replace(/\s+/g, '_').slice(0, 30);
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `relatorio_${nomeArquivo}_${dateStr}.xlsx`, { cellStyles: true });
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

      {/* Relatório por liderança (coord/verif) */}
      {canSeeAll && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-file-lines text-emerald-500"></i>
            <p className="text-[10px] font-black uppercase opacity-60 tracking-widest">
              Relatório por liderança
            </p>
          </div>
          <p className="text-[10px] opacity-50 font-semibold -mt-1">
            Selecione a liderança e o período para gerar um relatório detalhado em Excel.
          </p>

          <select
            value={relatorioLiderId}
            onChange={(e) => setRelatorioLiderId(e.target.value)}
            className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
          >
            <option value="">Selecionar liderança...</option>
            {lideres.map((l) => (
              <option key={l.id} value={l.id}>{l.name ?? l.email}</option>
            ))}
          </select>

          <div className="flex gap-1 bg-gray-100 dark:bg-gray-900 rounded-2xl p-1">
            {([
              { id: 'atual', label: 'Esta semana' },
              { id: 'anterior', label: 'Semana passada' }
            ] as { id: 'atual' | 'anterior'; label: string }[]).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setRelatorioSemana(opt.id)}
                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all ${
                  relatorioSemana === opt.id
                    ? 'bg-white dark:bg-gray-700 shadow text-emerald-600'
                    : 'opacity-40'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            onClick={gerarRelatorioLider}
            disabled={!relatorioLiderId}
            className="w-full flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest bg-emerald-700 text-white py-3 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <i className="fa-solid fa-file-arrow-down text-sm"></i>
            Emitir relatório
          </button>
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
