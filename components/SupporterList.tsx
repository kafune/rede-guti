
import React, { useState, useMemo } from 'react';
import { Municipality, Supporter, User, UserRole } from '../types';

interface Props {
  supporters: Supporter[];
  user: User;
  municipalities: Municipality[];
  onSelect: (s: Supporter) => void;
}

const SupporterList: React.FC<Props> = ({ supporters, user, municipalities, onSelect }) => {
  const [search, setSearch] = useState('');
  const [municipalityFilter, setMunicipalityFilter] = useState('');

  const municipalityNames = useMemo(() => {
    return Array.from(new Set(municipalities.map(m => m.name)))
      .sort((a, b) => a.localeCompare(b));
  }, [municipalities]);
  
  const filtered = useMemo(() => {
    let result = supporters;
    
    if (user.role === UserRole.OPERATOR) {
      result = result.filter(s => s.createdBy === user.id);
    }

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
      result = result.filter(s => (s.notes || '').toLowerCase() === target);
    }

    return result;
  }, [supporters, search, municipalityFilter, user]);

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center justify-between animate-soft-pop">
        <h2 className="text-2xl font-bold">Lideranças SP</h2>
        <span className="text-[10px] bg-blue-600 text-white px-3 py-1 rounded-full font-black uppercase tracking-wider">
          {filtered.length} Ativos
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
        
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <button 
            onClick={() => setMunicipalityFilter('')}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300 ease-out hover:-translate-y-0.5 ${
              municipalityFilter === '' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white dark:bg-gray-800 opacity-60'
            }`}
          >
            Todos
          </button>
          {municipalityNames.map(name => (
            <button 
              key={name}
              onClick={() => setMunicipalityFilter(name)}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300 ease-out hover:-translate-y-0.5 ${
                municipalityFilter === name 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white dark:bg-gray-800 opacity-60'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
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
                <div className="flex items-center gap-2">
                  <span className="text-[9px] bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-md font-black uppercase tracking-tighter">
                    {s.notes || s.region}
                  </span>
                  <span className={`text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-tighter ${
                    s.status === 'Ativo' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-yellow-50 text-yellow-700'
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

