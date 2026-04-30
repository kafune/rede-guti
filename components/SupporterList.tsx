
import React, { useState, useMemo } from 'react';
import { Municipality, Supporter, User } from '../types';
import { canViewAllSupporters } from '../roleUtils';

interface Props {
  supporters: Supporter[];
  user: User;
  municipalities: Municipality[];
  onSelect: (s: Supporter) => void;
}

const SupporterList: React.FC<Props> = ({ supporters, user, municipalities, onSelect }) => {
  const [search, setSearch] = useState('');
  const [municipalityFilter, setMunicipalityFilter] = useState('');
  const [leaderFilter, setLeaderFilter] = useState('');

  const municipalityNames = useMemo(() => {
    return Array.from<string>(new Set(municipalities.map((municipality) => municipality.name)))
      .sort((a, b) => a.localeCompare(b));
  }, [municipalities]);

  const visibleSupporters = useMemo(() => {
    if (!canViewAllSupporters(user.role)) {
      return supporters.filter(
        (s) => s.createdBy === user.id || s.indicatedByUserId === user.id
      );
    }
    return supporters;
  }, [supporters, user]);

  const leaderNames = useMemo(() => {
    const names = visibleSupporters
      .map((s) => s.createdByName)
      .filter((n): n is string => Boolean(n));
    return Array.from<string>(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [visibleSupporters]);

  const filtered = useMemo(() => {
    let result = visibleSupporters;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.church.toLowerCase().includes(q) ||
        s.whatsapp.includes(q) ||
        (s.indicatedBy || '').toLowerCase().includes(q)
      );
    }

    if (municipalityFilter) {
      const target = municipalityFilter.toLowerCase();
      result = result.filter(s => (s.notes || '').toLowerCase().includes(target));
    }

    if (leaderFilter) {
      const lq = leaderFilter.toLowerCase();
      result = result.filter(s => (s.createdByName || '').toLowerCase().includes(lq));
    }

    return result;
  }, [visibleSupporters, search, municipalityFilter, leaderFilter]);

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center justify-between animate-soft-pop">
        <h2 className="text-2xl font-bold">Apoiadores</h2>
        <span className="text-[10px] bg-blue-600 text-white px-3 py-1 rounded-full font-black uppercase tracking-wider">
          {filtered.length} Registros
        </span>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 opacity-40"></i>
          <input 
            type="text" 
            placeholder="Buscar por nome, igreja..."
            className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl pl-11 pr-4 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="relative">
          <i className="fa-solid fa-location-dot absolute left-4 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none"></i>
          <input
            list="municipality-list"
            type="text"
            placeholder="Filtrar por cidade..."
            className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl pl-11 pr-10 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
            value={municipalityFilter}
            onChange={(e) => setMunicipalityFilter(e.target.value)}
          />
          <datalist id="municipality-list">
            {municipalityNames.map(name => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {municipalityFilter && (
            <button
              onClick={() => setMunicipalityFilter('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-80 transition-opacity"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          )}
        </div>

        {leaderNames.length > 1 && (
          <div className="relative">
            <i className="fa-solid fa-user-tie absolute left-4 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none"></i>
            <input
              list="leader-list"
              type="text"
              placeholder="Filtrar por liderança que cadastrou..."
              className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl pl-11 pr-10 py-4 focus:ring-2 focus:ring-amber-400 outline-none transition-all shadow-sm"
              value={leaderFilter}
              onChange={(e) => setLeaderFilter(e.target.value)}
            />
            <datalist id="leader-list">
              {leaderNames.map(name => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {leaderFilter && (
              <button
                onClick={() => setLeaderFilter('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-80 transition-opacity"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3">
        {filtered.length > 0 ? (
          filtered.map(s => (
            <div 
              key={s.id} 
              onClick={() => onSelect(s)}
              className="bg-white dark:bg-gray-800 p-4 rounded-3xl border dark:border-gray-700 shadow-sm active:scale-[0.98] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md cursor-pointer flex items-center gap-4"
            >
              <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-blue-600 text-xl font-bold shrink-0 overflow-hidden border dark:border-gray-600">
                {s.photo ? (
                  <img src={s.photo} alt={s.name} className="w-full h-full object-cover" />
                ) : (
                  s.name.charAt(0)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between items-start mb-0.5">
                  <h3 className="font-black truncate text-sm">{s.name}</h3>
                </div>
                <p className="text-[10px] opacity-40 font-bold uppercase truncate mb-2">{s.church}</p>
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <span className="text-[9px] bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-md font-black uppercase tracking-tighter max-w-full truncate">
                    {s.notes || s.region}
                  </span>
                  <span className={`text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-tighter whitespace-nowrap ${
                    s.status === 'Ativo'
                      ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                      : s.status === 'Inativo'
                        ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        : 'bg-yellow-50 text-yellow-700'
                  }`}>
                    {s.status}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-blue-600 opacity-20">
                <i className="fa-solid fa-chevron-right"></i>
              </div>
            </div>
          ))
        ) : (
          <div className="py-20 text-center opacity-40 flex flex-col items-center gap-3">
            <i className="fa-solid fa-users-slash text-4xl"></i>
            <p className="font-bold text-sm">Nenhum apoiador nesta lista</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupporterList;

