import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { MetaCidade, Municipality } from '../../types';
import {
  createMeta,
  deleteMeta,
  fetchMetas,
  getApiErrorMessage,
  updateMeta
} from '../../api';

interface Props {
  municipalities: Municipality[];
}

type NumericField = 'eleitores' | 'votosValidos' | 'meta';

// Sugestões de região (texto livre — a coordenação pode digitar qualquer valor).
const REGIAO_SUGGESTIONS = [
  'Capital',
  'RMSP',
  'Baixada Santista',
  'Litoral Norte',
  'Vale do Ribeira',
  'Vale do Paraíba',
  'Campinas/RMC',
  'Sorocaba',
  'Ribeirão Preto',
  'São José do Rio Preto',
  'Bauru/Marília',
  'Presidente Prudente',
  'Interior (outros)'
];

const fmt = (value: number) => value.toLocaleString('pt-BR');

const pct = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—';

const todayLabel = () =>
  new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

const MetasPanel: React.FC<Props> = ({ municipalities }) => {
  const [metas, setMetas] = useState<MetaCidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState('Todas');
  const [newCity, setNewCity] = useState('');
  const [adding, setAdding] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Guarda o último estado confirmado pelo servidor, para detectar alterações
  // e reverter em caso de erro.
  const savedRef = useRef<Map<string, MetaCidade>>(new Map());

  const syncSaved = (list: MetaCidade[]) => {
    savedRef.current = new Map(list.map((m) => [m.id, m]));
  };

  useEffect(() => {
    let active = true;
    fetchMetas()
      .then((list) => {
        if (!active) return;
        setMetas(list);
        syncSaved(list);
      })
      .catch((err) => active && setError(getApiErrorMessage(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const availableMunicipalities = useMemo(() => {
    const used = new Set(metas.map((m) => m.municipalityId));
    return municipalities
      .filter((m) => !used.has(m.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [municipalities, metas]);

  const regionsPresent = useMemo(() => {
    const set = new Set<string>();
    metas.forEach((m) => {
      const r = (m.regiao || '').trim();
      if (r) set.add(r);
    });
    return ['Todas', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [metas]);

  const filtered = useMemo(() => {
    if (regionFilter === 'Todas') return metas;
    return metas.filter((m) => (m.regiao || '').trim() === regionFilter);
  }, [metas, regionFilter]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, m) => {
        acc.eleitores += m.eleitores;
        acc.votosValidos += m.votosValidos;
        acc.meta += m.meta;
        acc.apoiadores += m.apoiadoresCadastrados;
        return acc;
      },
      { eleitores: 0, votosValidos: 0, meta: 0, apoiadores: 0 }
    );
  }, [filtered]);

  const applyServer = (updated: MetaCidade) => {
    setMetas((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    savedRef.current.set(updated.id, updated);
  };

  const setLocalField = (id: string, field: NumericField | 'regiao', value: number | string) => {
    setMetas((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const commitField = async (id: string, field: NumericField | 'regiao') => {
    const current = metas.find((m) => m.id === id);
    const saved = savedRef.current.get(id);
    if (!current || !saved) return;

    const nextValue = field === 'regiao' ? (current.regiao || '').trim() : current[field];
    const prevValue = field === 'regiao' ? (saved.regiao || '').trim() : saved[field];
    if (nextValue === prevValue) return;

    setSavingId(id);
    try {
      const payload =
        field === 'regiao'
          ? { regiao: (current.regiao || '').trim() || null }
          : { [field]: current[field] };
      const updated = await updateMeta(id, payload);
      applyServer(updated);
    } catch (err) {
      // Reverte o campo ao valor salvo.
      setLocalField(id, field, field === 'regiao' ? saved.regiao || '' : saved[field]);
      setError(getApiErrorMessage(err, 'Não foi possível salvar a alteração.'));
    } finally {
      setSavingId(null);
    }
  };

  const handleAddCity = async () => {
    const name = newCity.trim();
    if (!name) return;
    const municipality = municipalities.find(
      (m) => m.name.toLowerCase() === name.toLowerCase()
    );
    if (!municipality) {
      setError('Cidade não encontrada na lista de municípios.');
      return;
    }
    if (metas.some((m) => m.municipalityId === municipality.id)) {
      setError('Essa cidade já está no planejamento.');
      return;
    }

    setAdding(true);
    setError(null);
    try {
      const created = await createMeta({
        municipalityId: municipality.id,
        regiao: regionFilter !== 'Todas' ? regionFilter : undefined
      });
      setMetas((prev) => [created, ...prev]);
      savedRef.current.set(created.id, created);
      setNewCity('');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível adicionar a cidade.'));
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string, cidade: string) => {
    if (!confirm(`Remover ${cidade} do planejamento?`)) return;
    try {
      await deleteMeta(id);
      setMetas((prev) => prev.filter((m) => m.id !== id));
      savedRef.current.delete(id);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível remover a cidade.'));
    }
  };

  const handleExport = () => {
    const rows = filtered.map((m) => ({
      Cidade: m.cidade,
      Região: m.regiao || '',
      Eleitores: m.eleitores,
      'Votos válidos': m.votosValidos,
      'Meta de votos': m.meta,
      '% dos válidos': m.votosValidos > 0 ? +((m.meta / m.votosValidos) * 100).toFixed(1) : 0,
      'Apoiadores cadastrados': m.apoiadoresCadastrados,
      '% da meta atingido': m.meta > 0 ? +((m.apoiadoresCadastrados / m.meta) * 100).toFixed(1) : 0
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 26 }, { wch: 18 }, { wch: 12 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 18 }
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Metas');
    XLSX.writeFile(
      workbook,
      `metas_por_cidade_${regionFilter.toLowerCase().replace(/\s+/g, '_')}_${new Date()
        .toISOString()
        .split('T')[0]}.xlsx`
    );
  };

  const numberInputClass =
    'w-24 bg-transparent text-right tabular-nums font-semibold rounded-lg px-2 py-1 focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-blue-500 outline-none print:ring-0 print:bg-transparent';

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Cabeçalho + ações (ocultos na impressão) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-2xl font-bold">Metas por Cidade</h2>
          <p className="text-sm opacity-60">
            Planejamento eleitoral: eleitores, votos válidos e a meta de votos por cidade.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="min-h-[44px] py-3 px-5 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl font-bold active:scale-95 transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
          >
            <i className="fa-solid fa-file-excel mr-2 text-emerald-600"></i>
            Exportar
          </button>
          <button
            onClick={() => window.print()}
            disabled={filtered.length === 0}
            className="min-h-[44px] py-3 px-6 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
          >
            <i className="fa-solid fa-print mr-2"></i>
            Imprimir
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 text-sm font-semibold flex items-center justify-between print:hidden">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      {/* Adicionar cidade */}
      <div className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-[2rem] border dark:border-gray-700 shadow-sm print:hidden">
        <h3 className="text-sm font-black mb-3 flex items-center gap-2">
          <i className="fa-solid fa-plus text-blue-500"></i>
          Adicionar cidade ao planejamento
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <i className="fa-solid fa-location-dot absolute left-4 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none"></i>
            <input
              list="meta-municipality-list"
              type="text"
              placeholder="Buscar cidade..."
              className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl pl-11 pr-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none"
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCity()}
            />
            <datalist id="meta-municipality-list">
              {availableMunicipalities.map((m) => (
                <option key={m.id} value={m.name} />
              ))}
            </datalist>
          </div>
          <button
            onClick={handleAddCity}
            disabled={adding || !newCity.trim()}
            className="px-5 py-3 rounded-2xl font-bold bg-blue-600 text-white active:scale-95 transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {adding ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
      </div>

      {/* Filtro por região */}
      {regionsPresent.length > 1 && (
        <div className="flex flex-wrap gap-2 print:hidden">
          {regionsPresent.map((region) => (
            <button
              key={region}
              onClick={() => setRegionFilter(region)}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
                regionFilter === region
                  ? 'bg-[#2c5070] text-white shadow'
                  : 'bg-white dark:bg-gray-800 border dark:border-gray-700 opacity-70 hover:opacity-100'
              }`}
            >
              {region}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <p className="text-sm opacity-60 print:hidden">Carregando planejamento...</p>
      )}

      {!loading && metas.length === 0 && (
        <div className="py-16 text-center opacity-50 flex flex-col items-center gap-3 print:hidden">
          <i className="fa-solid fa-table-list text-4xl"></i>
          <p className="font-bold text-sm">
            Nenhuma cidade no planejamento ainda. Adicione a primeira acima.
          </p>
        </div>
      )}

      {/* Resumo (cards) */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Eleitores</p>
            <p className="text-2xl font-black text-gray-700 dark:text-gray-300">{fmt(totals.eleitores)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Votos válidos</p>
            <p className="text-2xl font-black text-gray-700 dark:text-gray-300">{fmt(totals.votosValidos)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Meta de votos</p>
            <p className="text-2xl font-black text-blue-700 dark:text-blue-400">{fmt(totals.meta)}</p>
            <p className="text-[10px] font-bold opacity-50 mt-0.5">
              {pct(totals.meta, totals.votosValidos)} dos válidos
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Apoiadores</p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{fmt(totals.apoiadores)}</p>
            <p className="text-[10px] font-bold opacity-50 mt-0.5">
              {pct(totals.apoiadores, totals.meta)} da meta
            </p>
          </div>
        </div>
      )}

      {/* Tabela / relatório */}
      {filtered.length > 0 && (
        <div
          id="metas-report"
          className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-x-auto print:shadow-none print:border-0 print:rounded-none"
        >
          <div className="hidden print:block text-center pb-4 mb-2 border-b-2 border-[#2c5070] p-6">
            <h1 className="text-2xl font-bold text-[#2c5070] tracking-wide">REDE GUTI</h1>
            <p className="text-base font-semibold mt-0.5">Planejamento de Metas por Cidade</p>
            <p className="text-xs text-gray-500 mt-1">
              Base: {regionFilter === 'Todas' ? 'Geral – SP' : regionFilter} &nbsp;|&nbsp; Data:{' '}
              {todayLabel()}
            </p>
          </div>

          <table className="w-full text-sm border-collapse min-w-[820px]">
            <thead>
              <tr className="bg-[#2c5070] text-white text-left">
                <th className="py-3 px-3 font-semibold">Cidade</th>
                <th className="py-3 px-3 font-semibold">Região</th>
                <th className="py-3 px-3 font-semibold text-right">Eleitores</th>
                <th className="py-3 px-3 font-semibold text-right">Votos válidos</th>
                <th className="py-3 px-3 font-semibold text-right">Meta de votos</th>
                <th className="py-3 px-3 font-semibold text-right">% dos válidos</th>
                <th className="py-3 px-3 font-semibold text-right">Apoiadores</th>
                <th className="py-3 px-3 font-semibold text-right">% da meta</th>
                <th className="py-3 px-3 font-semibold text-right print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-b border-gray-200 dark:border-gray-700">
                  <td className="py-2 px-3 font-bold whitespace-nowrap">{m.cidade}</td>
                  <td className="py-2 px-3">
                    <input
                      list="meta-regiao-list"
                      type="text"
                      value={m.regiao || ''}
                      placeholder="—"
                      onChange={(e) => setLocalField(m.id, 'regiao', e.target.value)}
                      onBlur={() => commitField(m.id, 'regiao')}
                      className="w-36 bg-transparent rounded-lg px-2 py-1 focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-blue-500 outline-none print:ring-0"
                    />
                  </td>
                  {(['eleitores', 'votosValidos', 'meta'] as NumericField[]).map((field) => (
                    <td key={field} className="py-2 px-3 text-right">
                      <input
                        type="number"
                        min={0}
                        value={m[field]}
                        onChange={(e) =>
                          setLocalField(
                            m.id,
                            field,
                            e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0)
                          )
                        }
                        onBlur={() => commitField(m.id, field)}
                        className={`${numberInputClass} ${field === 'meta' ? 'text-blue-700 dark:text-blue-400' : ''}`}
                      />
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-semibold tabular-nums text-gray-600 dark:text-gray-300">
                    {pct(m.meta, m.votosValidos)}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {fmt(m.apoiadoresCadastrados)}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold tabular-nums">
                    {pct(m.apoiadoresCadastrados, m.meta)}
                  </td>
                  <td className="py-2 px-3 text-right print:hidden">
                    <button
                      onClick={() => handleDelete(m.id, m.cidade)}
                      className="opacity-40 hover:opacity-100 hover:text-red-500 transition-all"
                      title="Remover cidade"
                    >
                      <i className="fa-solid fa-trash-can"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 dark:bg-gray-900/60 font-bold">
                <td className="py-3 px-3 uppercase text-xs tracking-widest" colSpan={2}>
                  Total {regionFilter !== 'Todas' ? `(${regionFilter})` : ''}
                </td>
                <td className="py-3 px-3 text-right tabular-nums">{fmt(totals.eleitores)}</td>
                <td className="py-3 px-3 text-right tabular-nums">{fmt(totals.votosValidos)}</td>
                <td className="py-3 px-3 text-right tabular-nums text-blue-700 dark:text-blue-400">{fmt(totals.meta)}</td>
                <td className="py-3 px-3 text-right tabular-nums">{pct(totals.meta, totals.votosValidos)}</td>
                <td className="py-3 px-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(totals.apoiadores)}</td>
                <td className="py-3 px-3 text-right tabular-nums">{pct(totals.apoiadores, totals.meta)}</td>
                <td className="py-3 px-3 print:hidden"></td>
              </tr>
            </tfoot>
          </table>

          {savingId && (
            <p className="text-xs font-bold text-blue-600 px-3 py-2 print:hidden">Salvando...</p>
          )}
        </div>
      )}

      <datalist id="meta-regiao-list">
        {REGIAO_SUGGESTIONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
    </div>
  );
};

export default MetasPanel;
