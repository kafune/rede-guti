
import React, { useState } from 'react';
import { Supporter, User, UserRole } from '../types';

interface Props {
  supporter: Supporter;
  user: User;
  onDelete: (id: string) => void;
  onBack: () => void;
}

const SupporterDetail: React.FC<Props> = ({ supporter, user, onDelete, onBack }) => {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const canDelete = user.role === UserRole.ADMIN || (user.role === UserRole.OPERATOR && supporter.createdBy === user.id);
  const indicatorName = (supporter.indicatedBy || '').trim();
  const hasIndicator = indicatorName && indicatorName.toLowerCase() !== 'cadastro direto';

  const handleDelete = () => {
    onDelete(supporter.id);
    onBack();
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-12 animate-fade-up">
      <div className="flex items-center gap-4 animate-soft-pop">
        <button onClick={onBack} className="p-2 active:scale-90 transition-transform">
          <i className="fa-solid fa-arrow-left text-xl"></i>
        </button>
        <h2 className="text-2xl font-black flex-1">Perfil da Liderança</h2>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-xl overflow-hidden border dark:border-gray-700 transition-all duration-500 ease-out">
        <div className="bg-blue-600 p-8 text-center text-white relative">
          <div className="w-24 h-24 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-white/30 overflow-hidden shadow-lg">
            {supporter.photo ? (
              <img src={supporter.photo} alt={supporter.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl font-black">{supporter.name.charAt(0)}</span>
            )}
          </div>
          <h3 className="text-xl font-black">{supporter.name}</h3>
          <p className="opacity-70 text-sm">{supporter.church}</p>
          
          <div className="absolute top-4 right-4">
             <span className={`text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-wider ${
                supporter.status === 'Ativo' ? 'bg-green-400 text-green-950' : 'bg-yellow-400 text-yellow-950'
              }`}>
                {supporter.status}
              </span>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-2xl transition-all duration-300 ease-out">
              <p className="text-[10px] font-black opacity-30 uppercase">WhatsApp</p>
              <p className="font-bold text-sm">{supporter.whatsapp}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-2xl transition-all duration-300 ease-out">
              <p className="text-[10px] font-black opacity-30 uppercase">Município</p>
              <p className="font-bold text-sm truncate">{supporter.notes || supporter.region}</p>
            </div>
          </div>

          <div className="border-t dark:border-gray-700 pt-6">
            <h4 className="text-xs font-black uppercase opacity-40 mb-4 tracking-widest text-blue-600">Rede de Apoio</h4>
            
            <div className="mb-4">
              <p className="text-[10px] opacity-50 mb-1 font-bold uppercase">Indicado por:</p>
              {hasIndicator ? (
                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                  <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-xs text-white font-bold overflow-hidden">
                    {indicatorName.charAt(0)}
                  </div>
                  <span className="text-sm font-bold text-blue-700 dark:text-blue-400">{indicatorName}</span>
                </div>
              ) : (
                <p className="text-sm font-medium italic opacity-40">Cadastro direto</p>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t dark:border-gray-700">
            <button 
              onClick={() => window.open(`https://wa.me/${supporter.whatsapp}`, '_blank')}
              className="w-full py-4 bg-green-500 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-green-500/20 active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5"
            >
              <i className="fa-brands fa-whatsapp text-xl"></i> ENVIAR WHATSAPP
            </button>

            {canDelete && !isConfirmingDelete && (
              <button 
                onClick={() => setIsConfirmingDelete(true)}
                className="w-full py-4 text-red-500 font-bold text-sm hover:bg-red-50 dark:hover:bg-red-900/10 rounded-2xl transition-all duration-300 ease-out"
              >
                <i className="fa-solid fa-trash-can mr-2"></i> Excluir Registro
              </button>
            )}

            {isConfirmingDelete && (
              <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-2xl border border-red-200 dark:border-red-900/40">
                <p className="text-red-600 dark:text-red-400 text-[10px] font-black text-center mb-3 uppercase tracking-tighter">Confirmar exclusão permanente?</p>
                <div className="flex gap-2">
                  <button 
                    onClick={handleDelete}
                    className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg shadow-red-500/20"
                  >
                    Sim, Excluir
                  </button>
                  <button 
                    onClick={() => setIsConfirmingDelete(false)}
                    className="flex-1 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-black text-[10px] uppercase"
                  >
                    Voltar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="text-center space-y-1">
        <p className="text-[9px] opacity-30 font-bold uppercase tracking-widest">
          ID: {supporter.id} • Criado por {supporter.createdBy}
        </p>
        <p className="text-[9px] opacity-30 font-bold uppercase tracking-widest">
          Registrado em {new Date(supporter.createdAt).toLocaleString('pt-BR')}
        </p>
      </div>
    </div>
  );
};

export default SupporterDetail;

