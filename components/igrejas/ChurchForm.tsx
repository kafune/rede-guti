import React, { useMemo, useState } from 'react';
import { Igreja, IgrejaFormData } from '../../types';
import {
  DUPLICATE_RADIUS_METERS,
  emptyIgrejaForm,
  igrejaToForm,
  isPossibleDuplicate,
  validateIgrejaForm
} from './churchUtils';

interface Props {
  igreja?: Igreja | null;
  // Base para detecção de duplicatas (só no modo admin/logado). Ausente = sem checagem.
  existing?: Igreja[];
  onSubmit: (data: IgrejaFormData) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  accent?: 'blue' | 'emerald';
}

const parseFloatOrNull = (v: string): number | null => {
  const t = v.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
};
const parseIntOrNull = (v: string): number | null => {
  const digits = v.replace(/\D/g, '');
  return digits === '' ? null : parseInt(digits, 10);
};

const ChurchForm: React.FC<Props> = ({
  igreja,
  existing,
  onSubmit,
  onCancel,
  submitLabel,
  accent = 'blue'
}) => {
  const [form, setForm] = useState<IgrejaFormData>(igreja ? igrejaToForm(igreja) : emptyIgrejaForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedNotDup, setConfirmedNotDup] = useState(false);

  const ring = accent === 'emerald' ? 'focus:ring-emerald-500' : 'focus:ring-blue-500';
  const primaryBtn = accent === 'emerald' ? 'bg-emerald-600' : 'bg-blue-600';
  const inputClass = `w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 ${ring} focus:ring-2 outline-none text-sm`;
  const labelClass = 'block text-[10px] font-black uppercase tracking-widest opacity-40 mb-1';

  const set = <K extends keyof IgrejaFormData>(field: K, value: IgrejaFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setConfirmedNotDup(false); // qualquer mudança reabre a checagem
  };

  // Duplicatas em tempo real (só quando a base foi fornecida = modo admin).
  const duplicates = useMemo(() => {
    if (!existing) return [];
    return isPossibleDuplicate(form, existing, igreja?.id);
  }, [existing, form, igreja?.id]);

  const blockedByDup = duplicates.length > 0 && !confirmedNotDup;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateIgrejaForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (blockedByDup) {
      setError('Há igreja(s) semelhante(s) por perto. Confirme que não é duplicada para continuar.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        ...form,
        nome: form.nome.trim(),
        email: form.email.trim()
      });
    } catch (err: any) {
      setError(err?.message ?? 'Não foi possível salvar a igreja.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-gray-800 p-5 sm:p-6 rounded-[2rem] border dark:border-gray-700 shadow-sm space-y-5"
    >
      <h3 className="text-lg font-black flex items-center gap-2">
        <i className={`fa-solid fa-church ${accent === 'emerald' ? 'text-emerald-500' : 'text-blue-500'}`}></i>
        {igreja ? 'Editar igreja' : 'Cadastrar igreja'}
      </h3>

      {error && (
        <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 text-sm font-semibold">{error}</div>
      )}

      {/* Alerta de duplicata (tempo real, só admin) */}
      {duplicates.length > 0 && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
            <i className="fa-solid fa-triangle-exclamation mr-1"></i>
            Possível duplicata (a menos de {DUPLICATE_RADIUS_METERS} m)
          </p>
          <ul className="text-xs opacity-80 space-y-1">
            {duplicates.map((d) => (
              <li key={d.id}>
                <i className="fa-solid fa-location-dot mr-1 opacity-50"></i>
                <span className="font-bold">{d.nome}</span>
                {d.endereco && <span className="opacity-60"> · {d.endereco}</span>}
                {d.bairro && <span className="opacity-60"> · {d.bairro}</span>}
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmedNotDup}
              onChange={(e) => setConfirmedNotDup(e.target.checked)}
              className="w-4 h-4 accent-amber-600"
            />
            Confirmo que NÃO é uma duplicata e quero cadastrar mesmo assim.
          </label>
        </div>
      )}

      <div>
        <label className={labelClass}>Nome da igreja *</label>
        <input
          type="text"
          className={inputClass}
          placeholder="Ex.: Assembleia de Deus — Central"
          value={form.nome}
          onChange={(e) => set('nome', e.target.value)}
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Denominação</label>
          <input type="text" className={inputClass} value={form.denominacao} onChange={(e) => set('denominacao', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Pastor responsável</label>
          <input type="text" className={inputClass} value={form.pastor} onChange={(e) => set('pastor', e.target.value)} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Endereço</label>
        <input type="text" className={inputClass} value={form.endereco} onChange={(e) => set('endereco', e.target.value)} />
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Bairro</label>
          <input type="text" className={inputClass} value={form.bairro} onChange={(e) => set('bairro', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Cidade</label>
          <input type="text" className={inputClass} value={form.cidade} onChange={(e) => set('cidade', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Estado</label>
          <input type="text" maxLength={2} className={`${inputClass} uppercase`} value={form.estado} onChange={(e) => set('estado', e.target.value.toUpperCase())} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Telefone</label>
          <input type="tel" className={inputClass} placeholder="(11) 99999-9999" value={form.telefone} onChange={(e) => set('telefone', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>E-mail</label>
          <input type="email" className={inputClass} placeholder="contato@igreja.org" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Latitude</label>
          <input type="text" inputMode="decimal" className={inputClass} placeholder="-23.4628" value={form.latitude ?? ''} onChange={(e) => set('latitude', parseFloatOrNull(e.target.value))} />
        </div>
        <div>
          <label className={labelClass}>Longitude</label>
          <input type="text" inputMode="decimal" className={inputClass} placeholder="-46.5333" value={form.longitude ?? ''} onChange={(e) => set('longitude', parseFloatOrNull(e.target.value))} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Membros estimados</label>
          <input type="text" inputMode="numeric" className={inputClass} placeholder="Ex.: 250" value={form.membrosEstimados ?? ''} onChange={(e) => set('membrosEstimados', parseIntOrNull(e.target.value))} />
        </div>
        <div>
          <label className={labelClass}>Zona eleitoral</label>
          <input type="text" inputMode="numeric" className={inputClass} placeholder="Ex.: 247" value={form.zonaEleitoral ?? ''} onChange={(e) => set('zonaEleitoral', parseIntOrNull(e.target.value))} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Observações</label>
        <textarea rows={3} className={`${inputClass} resize-none`} value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 pt-1">
        <button
          type="submit"
          disabled={saving || blockedByDup}
          className={`flex-1 py-3 px-6 ${primaryBtn} text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {saving ? 'Salvando...' : submitLabel ?? (igreja ? 'Salvar alterações' : 'Cadastrar igreja')}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="py-3 px-6 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl font-bold active:scale-95 transition-all"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
};

export default ChurchForm;
