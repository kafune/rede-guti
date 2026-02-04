
import React, { useState, useMemo } from 'react';
import { Supporter, User, UserRole, SupporterType } from '../types';

interface Props {
  supporter: Supporter;
  allSupporters: Supporter[];
  user: User;
  onUpdate: (s: Supporter) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
}

const SupporterDetail: React.FC<Props> = ({ supporter, allSupporters, user, onDelete, onBack }) => {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const referrer = useMemo(() => 
    allSupporters.find(s => s.id === supporter.referredBy), 
    [allSupporters, supporter.referredBy]
  );

  const referrals = useMemo(() => 
    allSupporters.filter(s => s.referredBy === supporter.id),
    [allSupporters, supporter.id]
  );

  const canDelete = useMemo(() => {
    return user.role === UserRole.ADMIN || (user.role === UserRole.OPERATOR && supporter.createdBy === user.id);
  }, [user, supporter]);

  const isPastor = supporter.type === SupporterType.PASTOR;

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-24">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 active:scale-90 transition-transform bg-white dark:bg-gray-800 rounded-xl shadow-sm">
          <i className="fa-solid fa-arrow-left text-xl"></i>
        </button>
        <h2 className="text-2xl font-black flex-1">Dados Ministerial</h2>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl overflow-hidden border dark:border-gray-700">
        {/* Header Profile */}
        <div className={`${isPastor ? 'bg-gradient-to-br from-indigo-700 to-indigo-900' : 'bg-gradient-to-br from-blue-600 to-blue-800'} p-10 text-center text-white relative`}>
          <div className="w-28 h-28 bg-white/20 rounded-[2rem] flex items-center justify-center mx-auto mb-5 border-2 border-white/30 overflow-hidden shadow-2xl backdrop-blur-sm">
            {supporter.photo ? (
              <img src={supporter.photo} alt={supporter.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-5xl font-black">{supporter.name.charAt(0)}</span>
            )}
          </div>
          <h3 className="text-2xl font-black mb-1">{supporter.name}</h3>
          <div className="flex items-center justify-center gap-2 opacity-80 mb-4">
             <i className="fa-solid fa-church text-xs"></i>
             <p className="text-sm font-bold uppercase tracking-wide">{supporter.church}</p>
          </div>
          
          <div className="absolute top-6 right-6 flex flex-col items-end gap-2">
             <span className={`text-[9px] px-3 py-1.5 rounded-full font-black uppercase tracking-widest shadow-lg ${
                supporter.status === 'Ativo' ? 'bg-green-400 text-green-950' : 'bg-yellow-400 text-yellow-950'
              }`}>
                {supporter.status}
              </span>
              {isPastor && (
                <span className="bg-white text-indigo-700 text-[8px] px-2.5 py-1 rounded-lg font-black uppercase shadow-lg">
                  PASTOR â˜…
                </span>
              )}
          </div>
        </div>

        {/* Content Tabs-like sections */}
        <div className="p-8 space-y-8">
          
          {/* Card: Igreja Mapeada */}
          <div className="space-y-4">
             <h4 className="text-[10px] font-black uppercase text-indigo-600 tracking-[0.2em] mb-4">Mapeamento da Igreja</h4>
             <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-900 p-5 rounded-3xl border dark:border-gray-700">
                  <p className="text-[10px] font-black opacity-30 uppercase tracking-tighter mb-1">DenominaÃ§Ã£o</p>
                  <p className="font-bold text-sm">{supporter.churchDenomination || 'Livre / Independente'}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 p-5 rounded-3xl border dark:border-gray-700">
                  <p className="text-[10px] font-black opacity-30 uppercase tracking-tighter mb-1">Tipo Unidade</p>
                  <p className="font-bold text-sm">{supporter.isMainBranch ? 'Sede / Campo' : 'CongregaÃ§Ã£o'}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 p-5 rounded-3xl border dark:border-gray-700">
                  <p className="text-[10px] font-black opacity-30 uppercase tracking-tighter mb-1">Membros</p>
                  <p className="font-bold text-sm">{supporter.churchMembersCount || '-'}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 p-5 rounded-3xl border dark:border-gray-700">
                  <p className="text-[10px] font-black opacity-30 uppercase tracking-tighter mb-1">Cidade</p>
                  <p className="font-bold text-sm truncate">{supporter.notes || supporter.region}</p>
                </div>
             </div>

             {supporter.churchAddress && (
               <div className="bg-gray-50 dark:bg-gray-900 p-5 rounded-3xl border dark:border-gray-700">
                  <p className="text-[10px] font-black opacity-30 uppercase tracking-tighter mb-1">EndereÃ§o Ministerial</p>
                  <div className="flex items-start gap-2">
                    <i className="fa-solid fa-location-dot text-indigo-600 mt-1"></i>
                    <p className="font-bold text-xs leading-relaxed">{supporter.churchAddress}</p>
                  </div>
               </div>
             )}
          </div>

          {/* Social Impact */}
          {isPastor && supporter.hasSocialProjects && (
             <div className="bg-green-50 dark:bg-green-900/10 p-6 rounded-3xl border border-green-100 dark:border-green-800/30">
                <div className="flex items-center gap-2 mb-3">
                   <i className="fa-solid fa-hand-holding-heart text-green-600"></i>
                   <h4 className="text-xs font-black uppercase text-green-700 dark:text-green-400 tracking-wider">Impacto Social</h4>
                </div>
                <p className="text-xs font-medium leading-relaxed opacity-70 italic">
                  "{supporter.socialProjectsDescription}"
                </p>
             </div>
          )}

          {/* Online Presence */}
          {supporter.churchSocialMedia && (
            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-5 rounded-3xl border border-indigo-100 dark:border-indigo-800">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <i className="fa-brands fa-instagram text-2xl text-pink-500"></i>
                    <div>
                       <p className="text-[10px] font-black opacity-40 uppercase tracking-widest leading-none mb-1">Redes Sociais</p>
                       <p className="font-bold text-sm text-indigo-700 dark:text-indigo-300">{supporter.churchSocialMedia}</p>
                    </div>
                  </div>
                  <button onClick={() => window.open(`https://instagram.com/${supporter.churchSocialMedia.replace('@', '')}`, '_blank')} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black shadow-sm">VER PERFIL</button>
               </div>
            </div>
          )}

          {/* Connections Network */}
          <div className="border-t dark:border-gray-700 pt-8">
            <h4 className="text-[10px] font-black uppercase text-blue-600 tracking-[0.2em] mb-6">Rede de ConexÃµes</h4>
            
            <div className="space-y-6">
              <div>
                <p className="text-[9px] font-black opacity-30 uppercase tracking-widest mb-3">Indicado Por:</p>
                {referrer ? (
                  <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border dark:border-gray-700">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-xl flex items-center justify-center text-blue-600 font-bold overflow-hidden shadow-inner">
                      {referrer.photo ? <img src={referrer.photo} className="w-full h-full object-cover" /> : referrer.name.charAt(0)}
                    </div>
                    <div>
                      <span className="text-sm font-black block">{referrer.name}</span>
                      <span className="text-[9px] font-bold opacity-40 uppercase">{referrer.church}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs font-bold text-gray-400 italic">
                    {supporter.indicatedBy || 'LideranÃ§a Direta (Rede Guti)'}
                  </p>
                )}
              </div>

              <div>
                <p className="text-[9px] font-black opacity-30 uppercase tracking-widest mb-3">Indicados por ele ({referrals.length}):</p>
                <div className="flex flex-wrap gap-2">
                  {referrals.length > 0 ? referrals.map(r => (
                    <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-[9px] font-black border border-blue-100 dark:border-blue-800">
                      <div className="w-5 h-5 rounded-lg bg-blue-500 overflow-hidden flex items-center justify-center text-[8px] text-white">
                        {r.photo ? <img src={r.photo} className="w-full h-full object-cover" /> : r.name.charAt(0)}
                      </div>
                      {r.name}
                    </div>
                  )) : (
                    <p className="text-xs font-bold text-gray-400 italic">Ainda nÃ£o possui indicaÃ§Ãµes cadastradas</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3 pt-6 border-t dark:border-gray-700">
            <button 
              onClick={() => window.open(`https://wa.me/${supporter.whatsapp}`, '_blank')}
              className="w-full py-5 bg-green-500 text-white rounded-[1.75rem] font-black flex items-center justify-center gap-3 shadow-xl shadow-green-500/30 active:scale-95 transition-all"
            >
              <i className="fa-brands fa-whatsapp text-2xl"></i> FALAR NO WHATSAPP
            </button>

            {canDelete && (
              <button 
                onClick={() => setIsConfirmingDelete(true)}
                className="w-full py-5 text-red-500 font-black text-xs uppercase tracking-[0.2em] transition-all"
              >
                Remover da Base de Dados
              </button>
            )}

            {isConfirmingDelete && (
              <div className="fixed inset-0 z-[100] flex items-end p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="w-full bg-white dark:bg-gray-800 rounded-[2.5rem] p-8 shadow-2xl animate-in slide-in-from-bottom-10">
                  <h5 className="text-xl font-black text-center mb-2">Excluir Registro?</h5>
                  <p className="text-sm text-center opacity-50 mb-8 font-medium">Esta aÃ§Ã£o nÃ£o pode ser desfeita. O pastor e suas referÃªncias serÃ£o afetados.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setIsConfirmingDelete(false)} className="flex-1 py-4 bg-gray-100 dark:bg-gray-700 rounded-2xl font-black text-sm">CANCELAR</button>
                    <button onClick={() => onDelete(supporter.id)} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black text-sm">SIM, EXCLUIR</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupporterDetail;

