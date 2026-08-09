import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ElectoralZone, Team, TerritoryChurch } from '../../territoryTypes';
import {
  assignChurches,
  ChurchInput,
  createTerritoryChurch,
  fetchTerritoryChurches,
  importChurches,
} from '../../territoryApi';
import { getApiErrorMessage } from '../../api';
import ChurchMap from './ChurchMap';

interface Props {
  zones: ElectoralZone[];
  teams: Team[];
  canEdit: boolean;
  onOpenChurch: (id: string) => void;
  onDataChanged: () => void;
}

const inputCls = 'rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm';

// Mapeia cabeçalhos comuns de planilha → campos do importador.
const COLUMN_MAP: Record<string, keyof ChurchInput> = {
  nome: 'name', igreja: 'name', name: 'name',
  denominacao: 'denomination', denominação: 'denomination',
  pastor: 'pastorName', lider: 'pastorName', 'pastor/lider': 'pastorName',
  telefone: 'phone', fone: 'phone', celular: 'whatsapp', whatsapp: 'whatsapp',
  email: 'email', 'e-mail': 'email',
  rua: 'street', logradouro: 'street', endereco: 'street', endereço: 'street',
  numero: 'number', número: 'number', num: 'number',
  complemento: 'complement', bairro: 'district', cidade: 'city',
  cep: 'postalCode', lat: 'latitude', latitude: 'latitude', lng: 'longitude', longitude: 'longitude', lon: 'longitude',
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const ChurchesView: React.FC<Props> = ({ zones, teams, canEdit, onOpenChurch, onDataChanged }) => {
  const [churches, setChurches] = useState<TerritoryChurch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [zone, setZone] = useState('');
  const [assigned, setAssigned] = useState('');
  const [needsReview, setNeedsReview] = useState(false);
  const [mode, setMode] = useState<'lista' | 'mapa'>('lista');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTeam, setAssignTeam] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<ChurchInput>({ name: '' });
  const [importReport, setImportReport] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTerritoryChurches({
        q: q || undefined,
        zone: zone || undefined,
        assigned: (assigned as any) || undefined,
        needsReview: needsReview ? 'true' : undefined,
      });
      setChurches(data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, zone, assigned, needsReview]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const doAssign = async (teamId: string | null) => {
    if (selected.size === 0) return;
    try {
      await assignChurches([...selected], teamId);
      setSelected(new Set());
      await load();
      onDataChanged();
    } catch (e) {
      alert(getApiErrorMessage(e));
    }
  };

  const doCreate = async () => {
    if (!createForm.name || createForm.name.length < 2) return;
    try {
      const res = await createTerritoryChurch(createForm);
      setShowCreate(false);
      setCreateForm({ name: '' });
      await load();
      onDataChanged();
      if (res.zoneResolution?.requiresReview) {
        alert(`Igreja criada. ${res.zoneResolution.reason}`);
      }
    } catch (e) {
      alert(getApiErrorMessage(e));
    }
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportReport('Lendo planilha…');
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
      const parsed: ChurchInput[] = [];
      for (const row of rows) {
        const church: any = {};
        for (const [header, value] of Object.entries(row)) {
          const field = COLUMN_MAP[norm(String(header))];
          if (!field || value === '' || value == null) continue;
          if (field === 'latitude' || field === 'longitude') church[field] = Number(String(value).replace(',', '.'));
          else church[field] = String(value).trim();
        }
        if (church.name) parsed.push(church);
      }
      if (parsed.length === 0) {
        setImportReport('Nenhuma linha válida (verifique a coluna "nome").');
        return;
      }
      setImportReport(`Importando ${parsed.length} igrejas…`);
      const res = await importChurches(parsed);
      setImportReport(`✓ ${res.created} criadas, ${res.skipped} já existiam${res.errors.length ? `, ${res.errors.length} erros` : ''}.`);
      await load();
      onDataChanged();
    } catch (err) {
      setImportReport(getApiErrorMessage(err, 'Falha ao importar.'));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const filteredForMap = useMemo(() => churches, [churches]);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 opacity-40 text-sm"></i>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nome, bairro, pastor…" className={`${inputCls} w-full pl-9`} />
        </div>
        <select value={zone} onChange={(e) => setZone(e.target.value)} className={inputCls}>
          <option value="">Todas as zonas</option>
          {zones.map((z) => <option key={z.id} value={z.number}>Zona {z.number}</option>)}
        </select>
        <select value={assigned} onChange={(e) => setAssigned(e.target.value)} className={inputCls}>
          <option value="">Atribuição</option>
          <option value="true">Com equipe</option>
          <option value="false">Sem equipe</option>
        </select>
        <button onClick={() => setNeedsReview((v) => !v)} className={`${inputCls} font-bold ${needsReview ? 'bg-amber-500/20 text-amber-600 border-amber-500/40' : ''}`}>
          <i className="fa-solid fa-triangle-exclamation mr-1"></i>Revisão
        </button>
        <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
          <button onClick={() => setMode('lista')} className={`px-3 py-2 text-sm font-bold ${mode === 'lista' ? 'bg-blue-600 text-white' : ''}`}><i className="fa-solid fa-list"></i></button>
          <button onClick={() => setMode('mapa')} className={`px-3 py-2 text-sm font-bold ${mode === 'mapa' ? 'bg-blue-600 text-white' : ''}`}><i className="fa-solid fa-map-location-dot"></i></button>
        </div>
        {canEdit && (
          <>
            <button onClick={() => setShowCreate(true)} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold"><i className="fa-solid fa-plus mr-1"></i>Nova</button>
            <button onClick={() => fileRef.current?.click()} className={`${inputCls} font-bold`}><i className="fa-solid fa-file-import mr-1"></i>Importar</button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onImportFile} />
          </>
        )}
      </div>

      {importReport && <div className="text-sm px-3 py-2 rounded-xl bg-blue-500/10 text-blue-600">{importReport}</div>}
      {error && <div className="text-sm px-3 py-2 rounded-xl bg-red-500/10 text-red-600">{error}</div>}

      {/* Barra de atribuição */}
      {canEdit && selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 bg-gray-900 text-white rounded-2xl px-4 py-3 shadow-lg">
          <span className="font-black">{selected.size} selecionadas</span>
          <select value={assignTeam} onChange={(e) => setAssignTeam(e.target.value)} className="rounded-xl bg-white/10 border border-white/20 px-2 py-1.5 text-sm">
            <option value="">Escolher equipe…</option>
            {teams.map((t) => <option key={t.id} value={t.id} className="text-black">{t.name}</option>)}
          </select>
          <button disabled={!assignTeam} onClick={() => doAssign(assignTeam)} className="px-3 py-1.5 rounded-xl bg-blue-600 font-bold text-sm disabled:opacity-40">Atribuir</button>
          <button onClick={() => doAssign(null)} className="px-3 py-1.5 rounded-xl bg-white/10 font-bold text-sm">Remover equipe</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-sm opacity-70">Limpar</button>
        </div>
      )}

      {loading ? (
        <div className="opacity-60 p-6">Carregando…</div>
      ) : mode === 'mapa' ? (
        <ChurchMap
          churches={filteredForMap}
          zones={zones}
          onSelect={(c) => onOpenChurch(c.id)}
          selectedIds={canEdit ? selected : undefined}
          onToggleSelect={canEdit ? toggle : undefined}
          activeZone={zone || null}
          onZoneClick={(z) => setZone(z ?? '')}
        />
      ) : (
        <div className="grid gap-2">
          <div className="text-xs opacity-50 px-1">{churches.length} igrejas</div>
          {churches.map((c) => (
            <div key={c.id} className={`bg-white dark:bg-gray-900 rounded-2xl border p-3 flex items-center gap-3 ${selected.has(c.id) ? 'border-blue-500' : 'border-gray-100 dark:border-gray-800'}`}>
              {canEdit && (
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="w-4 h-4 accent-blue-600" />
              )}
              <button onClick={() => onOpenChurch(c.id)} className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.zoneColor ?? '#94a3b8' }} />
                  <span className="font-bold truncate">{c.name}</span>
                  {c.zoneRequiresReview && <i className="fa-solid fa-triangle-exclamation text-amber-500 text-xs" title="Requer validação"></i>}
                </div>
                <div className="text-xs opacity-50 truncate">
                  {c.zoneNumber ? `Zona ${c.zoneNumber}` : 'sem zona'} · {c.district ?? 'sem bairro'}
                  {c.currentTeamName ? ` · ${c.currentTeamName}` : ''}
                </div>
              </button>
              {c.latitude == null && <i className="fa-solid fa-location-dot opacity-20 text-xs" title="Sem coordenada"></i>}
            </div>
          ))}
        </div>
      )}

      {/* Modal criar */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-black text-lg mb-3">Nova igreja</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {([
                ['name', 'Nome *'], ['denomination', 'Denominação'], ['pastorName', 'Pastor/líder'], ['phone', 'Telefone'],
                ['street', 'Rua'], ['number', 'Número'], ['district', 'Bairro'], ['city', 'Cidade'], ['postalCode', 'CEP'],
              ] as [keyof ChurchInput, string][]).map(([key, label]) => (
                <label key={key} className="text-sm">
                  <span className="opacity-50 text-xs">{label}</span>
                  <input className={`${inputCls} w-full`} value={(createForm[key] as string) ?? ''} onChange={(e) => setCreateForm((f) => ({ ...f, [key]: e.target.value }))} />
                </label>
              ))}
            </div>
            <p className="text-xs opacity-50 mt-2">A zona é resolvida automaticamente pelo bairro.</p>
            <div className="flex gap-2 mt-4">
              <button onClick={doCreate} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm">Criar</button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 font-bold text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChurchesView;
