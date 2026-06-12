import React, { useEffect, useState } from 'react';
import {
  ApiEngagementStats,
  ApiWeeklyLeaderboardItem,
  fetchEngagementMe,
  fetchWeeklyLeaderboard
} from '../api';

const WEEKLY_GOAL = 5;

const formatRelative = (iso: string | null): string => {
  if (!iso) return 'Sem atividade ainda';
  const date = new Date(iso);
  const ms = Date.now() - date.getTime();
  if (Number.isNaN(ms)) return 'Sem atividade ainda';

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;

  return date.toLocaleDateString('pt-BR');
};

const StatCell: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({
  label,
  value,
  tone = 'text-blue-700 dark:text-blue-400',
}) => (
  <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700 transition-all duration-300 ease-out">
    <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">
      {label}
    </p>
    <p className={`text-2xl font-black ${tone}`}>{value}</p>
  </div>
);

const Skeleton: React.FC = () => (
  <div className="bg-white dark:bg-gray-800 p-6 rounded-[2rem] border dark:border-gray-700 shadow-sm animate-pulse">
    <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
    <div className="h-10 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-6" />
    <div className="grid grid-cols-2 gap-3">
      <div className="h-16 bg-gray-100 dark:bg-gray-700 rounded-2xl" />
      <div className="h-16 bg-gray-100 dark:bg-gray-700 rounded-2xl" />
      <div className="h-16 bg-gray-100 dark:bg-gray-700 rounded-2xl" />
      <div className="h-16 bg-gray-100 dark:bg-gray-700 rounded-2xl" />
    </div>
  </div>
);

interface Props {
  currentUserId?: string;
}

const medalForPosition = (position: number) => {
  if (position === 1) return '🥇';
  if (position === 2) return '🥈';
  if (position === 3) return '🥉';
  return `${position}º`;
};

const LeaderImpactPanel: React.FC<Props> = ({ currentUserId }) => {
  const [stats, setStats] = useState<ApiEngagementStats | null>(null);
  const [weeklyTop, setWeeklyTop] = useState<ApiWeeklyLeaderboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetchEngagementMe()
      .then((data) => active && setStats(data))
      .catch(() => active && setFailed(true))
      .finally(() => active && setLoading(false));
    fetchWeeklyLeaderboard()
      .then((items) => active && setWeeklyTop(items))
      .catch(() => undefined); // placar é não-crítico, falha silenciosa
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <Skeleton />;
  if (failed || !stats) return null; // engajamento é não-crítico, falha silenciosa

  const weeklyProgress = Math.min(100, (stats.weeklyIndications / WEEKLY_GOAL) * 100);
  const goalReached = stats.weeklyIndications >= WEEKLY_GOAL;
  const remaining = Math.max(0, WEEKLY_GOAL - stats.weeklyIndications);
  const rankingLabel =
    stats.rankingPosition !== null && stats.rankingPosition > 0
      ? `${stats.rankingPosition}o`
      : '—';

  return (
    <div className="space-y-4">
      {/* Hero — pontuação + posição no ranking */}
      <div className="bg-gradient-to-br from-violet-600 to-indigo-700 p-5 sm:p-6 rounded-[2rem] text-white shadow-xl shadow-violet-500/20 animate-soft-pop">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">
              <i className="fa-solid fa-bolt mr-1.5"></i>
              Seu impacto
            </p>
            <p className="text-5xl sm:text-6xl font-black leading-none">
              {stats.score}
              <span className="text-base sm:text-lg opacity-50 font-normal ml-2">pontos</span>
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 self-start sm:self-auto">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-0.5">
              Ranking
            </p>
            <p className="text-2xl font-black">{rankingLabel}</p>
          </div>
        </div>
      </div>

      {/* Stats em grade — 2 colunas no mobile, 4 no desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCell label="Total indicações" value={stats.totalIndications} />
        <StatCell
          label="Esta semana"
          value={stats.weeklyIndications}
          tone="text-violet-600 dark:text-violet-400"
        />
        <StatCell
          label="Este mês"
          value={stats.monthlyIndications}
          tone="text-indigo-600 dark:text-indigo-400"
        />
        <StatCell
          label="Última atividade"
          value={
            <span className="text-sm sm:text-base font-bold">
              {formatRelative(stats.lastActivityAt)}
            </span>
          }
          tone="text-gray-700 dark:text-gray-300"
        />
      </div>

      {/* Barra de progresso da meta semanal */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] border dark:border-gray-700 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-0.5">
              Meta semanal
            </p>
            <p className="text-sm font-bold">
              {goalReached ? (
                <>
                  <i className="fa-solid fa-circle-check text-emerald-500 mr-1.5"></i>
                  Meta batida! Continue assim 💪
                </>
              ) : (
                <>
                  Faltam <span className="text-violet-600">{remaining}</span> indicação
                  {remaining === 1 ? '' : 'ões'} para chegar em {WEEKLY_GOAL}
                </>
              )}
            </p>
          </div>
          <p className="text-lg font-black text-gray-800 dark:text-gray-200 shrink-0 ml-3">
            {stats.weeklyIndications}
            <span className="text-xs opacity-40 font-normal">/{WEEKLY_GOAL}</span>
          </p>
        </div>
        <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-out ${
              goalReached
                ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                : 'bg-gradient-to-r from-violet-500 to-indigo-600'
            }`}
            style={{ width: `${weeklyProgress}%` }}
          />
        </div>
      </div>

      {/* Placar da semana — top 10 visível para todas as lideranças */}
      {weeklyTop.length > 0 && (
        <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] border dark:border-gray-700 shadow-sm">
          <h3 className="text-sm font-black mb-1 flex items-center gap-2">
            <i className="fa-solid fa-trophy text-amber-500"></i>
            Placar da semana
          </h3>
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-4">
            Pontos dos últimos 7 dias
          </p>
          <div className="space-y-2">
            {weeklyTop.map((item) => {
              const isMe = currentUserId && item.userId === currentUserId;
              return (
                <div
                  key={item.userId}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors ${
                    isMe
                      ? 'bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800'
                      : 'bg-gray-50 dark:bg-gray-900/50'
                  }`}
                >
                  <span className="w-8 text-center font-black text-sm shrink-0">
                    {medalForPosition(item.rankingPosition ?? 0)}
                  </span>
                  <span className="flex-1 min-w-0 font-bold text-sm truncate">
                    {item.user.name || 'Liderança'}
                    {isMe && (
                      <span className="ml-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-violet-600 text-white">
                        Você
                      </span>
                    )}
                  </span>
                  <span className="font-black text-sm text-violet-600 dark:text-violet-400 shrink-0">
                    {item.weeklyPoints}
                    <span className="text-[10px] opacity-50 font-normal ml-1">pts</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaderImpactPanel;
