import React, { useMemo, useState } from 'react';
import { SupportStatus, Supporter, User, UserRole } from '../types';
import { canCreateRegistrations } from '../roleUtils';

interface Props {
  supporters: Supporter[];
  currentUser: User;
  onViewList: () => void;
  onViewSupporter: (s: Supporter) => void;
}

const Dashboard: React.FC<Props> = ({ supporters, currentUser, onViewList, onViewSupporter }) => {
  const [copyLabel, setCopyLabel] = useState('Copiar link');
  const baseUrl = `${window.location.origin}${window.location.pathname}#/cadastro`;
  const indicatorName = currentUser?.name?.trim();
  const indicatorId = currentUser?.id;
  const isRegionalViewer = currentUser.role === UserRole.LIDER_REGIONAL;
  const isVerifier = currentUser.role === UserRole.VERIFICADORA;
  const canShareRegistrationLink = canCreateRegistrations(currentUser.role);
  const networkLabel =
    currentUser.role === UserRole.COORDENADOR
      ? 'Total da Rede SP'
      : isVerifier
        ? 'Base completa de apoiadores'
        : 'Total da Sua Rede Regional';
  const shareUrl = indicatorName
    ? `${baseUrl}?indicador=${encodeURIComponent(indicatorName)}${
        indicatorId ? `&indicadorId=${encodeURIComponent(indicatorId)}` : ''
      }`
    : baseUrl;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyLabel('Link copiado!');
      window.setTimeout(() => setCopyLabel('Copiar link'), 1500);
    } catch {
      setCopyLabel('Nao foi possivel copiar');
      window.setTimeout(() => setCopyLabel('Copiar link'), 1800);
    }
  };

  const stats = useMemo(() => {
    const indicatorCounts = supporters.reduce((acc, supporter) => {
      const indicator = (supporter.indicatedBy || '').trim();
      if (!indicator || indicator.toLowerCase() === 'cadastro direto') {
        return acc;
      }
      acc[indicator] = (acc[indicator] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topInfluencers = Object.entries(indicatorCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    const cityCounts = supporters.reduce((acc, supporter) => {
      const city = supporter.notes || 'Nao informado';
      acc[city] = (acc[city] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topCities = Object.entries(cityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const indicatedCount = supporters.filter((supporter) => {
      const indicator = (supporter.indicatedBy || '').trim().toLowerCase();
      return indicator && indicator !== 'cadastro direto';
    }).length;

    const last7Days = supporters.filter((supporter) => {
      const createdAt = new Date(supporter.createdAt);
      if (Number.isNaN(createdAt.getTime())) {
        return false;
      }
      return Date.now() - createdAt.getTime() <= 7 * 24 * 60 * 60 * 1000;
    }).length;

    const activeCities = new Set(
      supporters
        .filter((supporter) => supporter.status === SupportStatus.ACTIVE)
        .map((supporter) => supporter.notes || 'Nao informado')
    ).size;

    return {
      topInfluencers,
      topCities,
      total: supporters.length,
      indicatedCount,
      last7Days,
      activeCities
    };
  }, [supporters]);

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-[2rem] text-white shadow-xl shadow-blue-500/20 animate-soft-pop transition-all duration-500 ease-out">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest opacity-60 mb-1">
              {networkLabel}
            </p>
            <h2 className="text-5xl font-black mb-4">
              {stats.total} <span className="text-lg opacity-40 font-normal">apoiadores</span>
            </h2>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 transition-all duration-500 ease-out">
            <p className="text-[10px] font-bold opacity-60">Municipios ativos</p>
            <p className="font-black">{stats.activeCities}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 transition-all duration-500 ease-out">
            <p className="text-[10px] font-bold opacity-60">Taxa de indicacao</p>
            <p className="font-black">
              {((stats.indicatedCount / Math.max(1, stats.total)) * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {isRegionalViewer && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] border dark:border-gray-700 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">
              Apoiadores na rede
            </p>
            <p className="text-3xl font-black text-blue-700 dark:text-blue-400">{stats.total}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] border dark:border-gray-700 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">
              Ultimos 7 dias
            </p>
            <p className="text-3xl font-black text-blue-700 dark:text-blue-400">
              {stats.last7Days}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] border dark:border-gray-700 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">
              Municipios ativos
            </p>
            <p className="text-3xl font-black text-blue-700 dark:text-blue-400">
              {stats.activeCities}
            </p>
          </div>
        </div>
      )}

      {canShareRegistrationLink && (
        <div className="theme-panel bg-white dark:bg-gray-800 p-6 rounded-[2rem] border dark:border-gray-700 shadow-sm transition-all duration-500 ease-out">
          <h3 className="text-lg font-black mb-2 flex items-center gap-2">
            <i className="fa-solid fa-link text-blue-500"></i>
            Link de Cadastro
          </h3>
          <p className="text-sm opacity-60 mb-4">
            Envie este link para que novos apoiadores se cadastrem sozinhos.
          </p>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-4 py-3 text-xs font-semibold truncate"
            />
            <button
              onClick={handleCopy}
              className="theme-accent-button px-5 py-3 rounded-2xl font-bold active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5"
            >
              {copyLabel}
            </button>
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="theme-outline-button px-5 py-3 rounded-2xl font-bold text-sm text-center transition-all duration-300 ease-out hover:-translate-y-0.5"
            >
              Abrir
            </a>
          </div>
          {indicatorName && (
            <p className="text-[10px] uppercase tracking-widest opacity-40 font-black mt-3">
              Indicacao vinculada a {indicatorName}
            </p>
          )}
        </div>
      )}

      {isRegionalViewer && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-[2rem] border dark:border-gray-700 shadow-sm transition-all duration-500 ease-out">
          <h3 className="text-lg font-black mb-2">Visibilidade da sua rede</h3>
          <p className="text-sm opacity-60">
            Seu perfil exibe apenas totais agregados dos apoiadores vinculados ao seu
            link de indicacao.
          </p>
        </div>
      )}

      {isVerifier && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-[2rem] border dark:border-gray-700 shadow-sm transition-all duration-500 ease-out">
          <h3 className="text-lg font-black mb-2">Perfil de verificacao</h3>
          <p className="text-sm opacity-60">
            Este perfil visualiza todos os apoiadores e pode somente alternar o status entre ativo e inativo.
          </p>
        </div>
      )}

      {!isRegionalViewer && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-[2rem] border dark:border-gray-700 shadow-sm transition-all duration-500 ease-out">
          <h3 className="text-lg font-black mb-4 flex items-center gap-2">
            <i className="fa-solid fa-share-nodes text-blue-500"></i>
            Top Indicadores
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {stats.topInfluencers.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-4 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl border dark:border-gray-700 transition-transform duration-300 ease-out hover:-translate-y-0.5"
              >
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 font-black">
                  {idx + 1}o
                </div>
                <div className="flex-1">
                  <p className="font-black text-sm">{item.name}</p>
                  <p className="text-[10px] opacity-40 uppercase font-bold">Indicador</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-blue-600">{item.count}</p>
                  <p className="text-[9px] font-bold opacity-40 uppercase">Indicacoes</p>
                </div>
              </div>
            ))}
            {stats.topInfluencers.length === 0 && (
              <p className="text-center py-4 opacity-40 text-xs">
                A rede de indicacoes ainda esta comecando.
              </p>
            )}
          </div>
        </div>
      )}

      {!isRegionalViewer && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-[2rem] border dark:border-gray-700 shadow-sm transition-all duration-500 ease-out">
          <h3 className="text-lg font-black mb-4 flex items-center gap-2">
            <i className="fa-solid fa-city text-indigo-500"></i>
            Cidades com mais Apoio
          </h3>
          <div className="space-y-4">
            {stats.topCities.map(([city, count]) => (
              <div key={city}>
                <div className="flex justify-between text-xs font-bold mb-1.5 uppercase tracking-wide">
                  <span>{city}</span>
                  <span className="text-blue-600">{count} lideres</span>
                </div>
                <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                    style={{ width: `${(count / stats.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isRegionalViewer && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-[2rem] border dark:border-gray-700 shadow-sm transition-all duration-500 ease-out">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-black">Ultimos cadastros</h3>
            <button
              onClick={onViewList}
              className="text-[10px] font-black uppercase text-blue-600"
            >
              Ver Todos
            </button>
          </div>
          <div className="space-y-3">
            {supporters.slice(0, 3).map((supporter) => (
              <div
                key={supporter.id}
                onClick={() => onViewSupporter(supporter)}
                className="flex items-center gap-3 p-3 rounded-2xl active:bg-gray-50 dark:active:bg-gray-700 cursor-pointer transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-gray-50/70 dark:hover:bg-gray-700/60"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center font-bold">
                  {supporter.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{supporter.name}</p>
                  <p className="text-[10px] opacity-40 truncate">
                    {supporter.notes} - {supporter.church}
                  </p>
                </div>
                <i className="fa-solid fa-chevron-right text-[10px] opacity-20"></i>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
