import React, { useState } from 'react';
import { Equipe, EquipePayload } from '../../types';
import { createEquipe, getApiErrorMessage, updateEquipe } from '../../api';

interface Props {
  equipe?: Equipe | null;
  onSave: (equipe: Equipe) => void;
  onCancel: () => void;
}

interface MembroDraft {
  nome: string;
  telefone: string;
}

const MAX_MEMBROS = 4;

// Mesmas regras do backend (backend/src/routes/equipes.ts).
const placaRegex = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;
const telefoneValido = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13;
};

const emptyMembros = (): MembroDraft[] =>
  Array.from({ length: MAX_MEMBROS }, () => ({ nome: '', telefone: '' }));

const membrosFromEquipe = (equipe: Equipe): MembroDraft[] => {
  const membros = emptyMembros();
  equipe.membros.forEach((m, i) => {
    if (i < MAX_MEMBROS) membros[i] = { nome: m.nome, telefone: m.telefone };
  });
  return membros;
};

const inputClass =
  'w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none';

const labelClass = 'block text-[10px] font-black uppercase tracking-widest opacity-40 mb-1.5';

const EquipeForm: React.FC<Props> = ({ equipe, onSave, onCancel }) => {
  const [nome, setNome] = useState(equipe?.nome ?? '');
  const [motoristaNome, setMotoristaNome] = useState(equipe?.motoristaNome ?? '');
  const [motoristaCnh, setMotoristaCnh] = useState(equipe?.motoristaCnh ?? '');
  const [motoristaTelefone, setMotoristaTelefone] = useState(equipe?.motoristaTelefone ?? '');
  const [carroPlaca, setCarroPlaca] = useState(equipe?.carroPlaca ?? '');
  const [carroModelo, setCarroModelo] = useState(equipe?.carroModelo ?? '');
  const [carroCor, setCarroCor] = useState(equipe?.carroCor ?? '');
  const [membros, setMembros] = useState<MembroDraft[]>(
    equipe ? membrosFromEquipe(equipe) : emptyMembros()
  );
  const [saving, setSaving] = useState(false);

  const setMembro = (index: number, field: keyof MembroDraft, value: string) => {
    setMembros((prev) => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  };

  const filledMembros = membros.filter((m) => m.nome.trim() || m.telefone.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const placaNormalizada = carroPlaca.toUpperCase().replace(/[\s-]/g, '');
    const cnhDigits = motoristaCnh.replace(/\D/g, '');

    if (nome.trim().length < 2) return alert('Informe o nome da equipe.');
    if (motoristaNome.trim().length < 2) return alert('Informe o nome completo do motorista.');
    if (cnhDigits.length !== 11) return alert('CNH inválida: deve ter 11 dígitos.');
    if (!telefoneValido(motoristaTelefone))
      return alert('Telefone do motorista inválido (use DDD + número).');
    if (!placaRegex.test(placaNormalizada))
      return alert('Placa inválida. Use o padrão antigo (ABC-1234) ou Mercosul (ABC1D23).');
    if (!carroModelo.trim()) return alert('Informe o modelo do carro.');
    if (!carroCor.trim()) return alert('Informe a cor do carro.');

    for (const [i, membro] of filledMembros.entries()) {
      if (membro.nome.trim().length < 2)
        return alert(`Informe o nome completo do apoiador ${i + 1}.`);
      if (!telefoneValido(membro.telefone))
        return alert(`Telefone do apoiador "${membro.nome.trim() || i + 1}" inválido (use DDD + número).`);
    }

    const payload: EquipePayload = {
      nome: nome.trim(),
      motoristaNome: motoristaNome.trim(),
      motoristaCnh: cnhDigits,
      motoristaTelefone: motoristaTelefone.trim(),
      carroPlaca: placaNormalizada,
      carroModelo: carroModelo.trim(),
      carroCor: carroCor.trim(),
      membros: filledMembros.map((m) => ({ nome: m.nome.trim(), telefone: m.telefone.trim() }))
    };

    setSaving(true);
    try {
      const saved = equipe ? await updateEquipe(equipe.id, payload) : await createEquipe(payload);
      onSave(saved);
    } catch (err) {
      alert(getApiErrorMessage(err, 'Não foi possível salvar a equipe.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-gray-800 p-5 sm:p-6 rounded-[2rem] border dark:border-gray-700 shadow-sm space-y-6"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-black flex items-center gap-2">
          <i className="fa-solid fa-car-side text-blue-500"></i>
          {equipe ? 'Editar equipe' : 'Nova equipe'}
        </h3>
        {filledMembros.length < MAX_MEMBROS && (
          <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
            Equipe incompleta ({filledMembros.length}/{MAX_MEMBROS} apoiadores)
          </span>
        )}
      </div>

      <div>
        <label className={labelClass}>Nome da equipe</label>
        <input
          type="text"
          className={inputClass}
          placeholder="Ex.: Equipe Zona Norte 1"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
      </div>

      {/* Motorista */}
      <div className="space-y-3">
        <p className="text-xs font-black uppercase tracking-widest opacity-60 flex items-center gap-2">
          <i className="fa-solid fa-id-card text-blue-500"></i> Motorista
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={labelClass}>Nome completo</label>
            <input
              type="text"
              className={inputClass}
              value={motoristaNome}
              onChange={(e) => setMotoristaNome(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>CNH (11 dígitos)</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={11}
              className={inputClass}
              value={motoristaCnh}
              onChange={(e) => setMotoristaCnh(e.target.value.replace(/\D/g, '').slice(0, 11))}
            />
          </div>
          <div>
            <label className={labelClass}>Telefone</label>
            <input
              type="tel"
              className={inputClass}
              placeholder="(11) 99999-9999"
              value={motoristaTelefone}
              onChange={(e) => setMotoristaTelefone(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Carro */}
      <div className="space-y-3">
        <p className="text-xs font-black uppercase tracking-widest opacity-60 flex items-center gap-2">
          <i className="fa-solid fa-car text-blue-500"></i> Carro (fornecido pelo motorista)
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Placa</label>
            <input
              type="text"
              maxLength={8}
              className={`${inputClass} uppercase`}
              placeholder="ABC1D23"
              value={carroPlaca}
              onChange={(e) => setCarroPlaca(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className={labelClass}>Modelo</label>
            <input
              type="text"
              className={inputClass}
              placeholder="Ex.: Fiat Argo"
              value={carroModelo}
              onChange={(e) => setCarroModelo(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Cor</label>
            <input
              type="text"
              className={inputClass}
              placeholder="Ex.: Prata"
              value={carroCor}
              onChange={(e) => setCarroCor(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Apoiadores */}
      <div className="space-y-3">
        <p className="text-xs font-black uppercase tracking-widest opacity-60 flex items-center gap-2">
          <i className="fa-solid fa-people-group text-blue-500"></i> Apoiadores (até {MAX_MEMBROS})
        </p>
        {membros.map((membro, index) => (
          <div key={index} className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Apoiador {index + 1} — nome completo</label>
              <input
                type="text"
                className={inputClass}
                value={membro.nome}
                onChange={(e) => setMembro(index, 'nome', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Telefone</label>
              <input
                type="tel"
                className={inputClass}
                placeholder="(11) 99999-9999"
                value={membro.telefone}
                onChange={(e) => setMembro(index, 'telefone', e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-3 px-6 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Salvando...' : equipe ? 'Salvar alterações' : 'Cadastrar equipe'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="py-3 px-6 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl font-bold active:scale-95 transition-all"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
};

export default EquipeForm;
