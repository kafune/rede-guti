import React, { useEffect, useState } from 'react';
import { BRAND } from '../branding';
import { EquipePublicInfo, IgrejaFormData } from '../types';
import { createPublicIgreja, fetchPublicEquipeInfo, getApiErrorMessage } from '../api';
import ChurchForm from './igrejas/ChurchForm';

const parseHashParams = (): { equipeId: string } => {
  const hash = window.location.hash; // "#/igrejas/cadastro?equipe=xyz"
  const [, hashQuery] = hash.split('?');
  const equipeId = new URLSearchParams(hashQuery ?? '').get('equipe') ?? '';
  return { equipeId };
};

const PublicIgrejaCadastro: React.FC = () => {
  const { equipeId } = parseHashParams();

  const [equipe, setEquipe] = useState<EquipePublicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cadastradas, setCadastradas] = useState<string[]>([]);

  useEffect(() => {
    if (!equipeId) {
      setLoadError('Link inválido. Solicite um novo link à equipe/coordenação.');
      setLoading(false);
      return;
    }
    fetchPublicEquipeInfo(equipeId)
      .then(setEquipe)
      .catch((err) => setLoadError(getApiErrorMessage(err, 'Equipe não encontrada.')))
      .finally(() => setLoading(false));
  }, [equipeId]);

  const handleSubmit = async (data: IgrejaFormData) => {
    if (!equipe) return;
    const nova = await createPublicIgreja({ ...data, equipeId: equipe.id });
    setCadastradas((prev) => [nova.nome, ...prev]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl opacity-30"></i>
      </div>
    );
  }

  if (loadError || !equipe) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-6 text-center gap-4">
        <i className="fa-solid fa-link-slash text-5xl opacity-20"></i>
        <p className="font-black text-lg opacity-60">{loadError ?? 'Equipe não encontrada.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 pb-8 pt-[calc(env(safe-area-inset-top,0px)+2rem)] flex flex-col items-center">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center mb-2">
          <img src="/logo.jpeg" alt="Logo" className="w-14 h-14 rounded-3xl mx-auto mb-3 object-cover shadow-lg" />
          <h1 className="font-black text-xl">{BRAND.publicHeader}</h1>
          <p className="text-xs opacity-40 font-bold uppercase tracking-widest">Cadastro de igreja</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-5">
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <i className="fa-solid fa-car-side"></i>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Equipe</span>
          </div>
          <h2 className="font-black text-lg leading-tight">{equipe.nome}</h2>
          <p className="text-sm opacity-60 font-semibold mt-1">
            Liderança: {equipe.liderNome}. As igrejas cadastradas aqui ficam vinculadas a esta equipe.
          </p>
        </div>

        {cadastradas.length > 0 && (
          <div className="px-4 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm font-bold space-y-1">
            <p><i className="fa-solid fa-circle-check mr-1"></i> {cadastradas.length} igreja(s) cadastrada(s):</p>
            <ul className="text-xs font-semibold opacity-80 list-disc list-inside">
              {cadastradas.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        <ChurchForm
          onSubmit={handleSubmit}
          accent="emerald"
          submitLabel="Cadastrar igreja"
        />

        <p className="text-center text-[10px] opacity-20 font-bold pb-4">{BRAND.publicHeader}</p>
      </div>
    </div>
  );
};

export default PublicIgrejaCadastro;
