
import React, { useState, useRef } from 'react';
import { Region, Supporter, SupporterType } from '../types';
import { REGIONS, SP_MUNICIPALITIES } from '../constants';

interface Props {
  supporters: Supporter[];
  onSave: (data: Partial<Supporter>) => boolean;
  onCancel: () => void;
}

const PastorForm: React.FC<Props> = ({ supporters, onSave, onCancel }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    whatsapp: '',
    cpf: '',
    birthDate: '',
    church: '',
    churchDenomination: '',
    isMainBranch: true,
    ministryRole: 'Pastor Titular',
    region: '' as Region | '',
    municipality: '',
    churchAddress: '',
    churchCNPJ: '',
    churchSocialMedia: '',
    churchMembersCount: 'Até 100',
    hasSocialProjects: false,
    socialProjectsDescription: '',
    referredBy: '',
    photo: '',
  });

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500000) { alert("Foto muito pesada!"); return; }
      const reader = new FileReader();
      reader.onloadend = () => setFormData({ ...formData, photo: reader.result as string });
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.whatsapp || !formData.church) {
      alert('Dados essenciais faltando.');
      return;
    }

    onSave({
      ...formData,
      type: SupporterType.PASTOR,
      region: formData.region as Region,
      notes: formData.municipality,
      whatsapp: formData.whatsapp.replace(/\D/g, '').startsWith('55') ? formData.whatsapp.replace(/\D/g, '') : '55' + formData.whatsapp.replace(/\D/g, '')
    });
  };

  const denominations = [
    "Assembleia de Deus", "Batista", "Quadrangular", "Presbiteriana", 
    "Metodista", "Congregação Cristã", "Universal", "Mundial", 
    "Adventista", "Comunidade Evangélica", "Igreja Local Independente", "Outra"
  ];

  return (
    <div className="max-w-xl mx-auto pb-20">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onCancel} className="p-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm"><i className="fa-solid fa-arrow-left text-xl"></i></button>
        <div>
           <h2 className="text-3xl font-black tracking-tight">Mapeamento Pastoral</h2>
           <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">Rede Conexão SP • Guti 2026</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="flex gap-2 mb-8 px-2">
         {[1, 2, 3, 4].map((s) => (
           <div key={s} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${step >= s ? 'bg-indigo-600 shadow-[0_0_10px_rgba(79,70,229,0.4)]' : 'bg-gray-200 dark:bg-gray-800'}`}></div>
         ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-xl border dark:border-gray-700">
          
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center text-indigo-600"><i className="fa-solid fa-user"></i></div>
                <h3 className="text-xl font-black">Dados Pessoais</h3>
              </div>
              
              <div className="flex flex-col items-center pb-4">
                <div onClick={() => fileInputRef.current?.click()} className="w-28 h-28 bg-gray-50 dark:bg-gray-900 rounded-[2rem] border-2 border-dashed border-indigo-200 dark:border-indigo-900 flex items-center justify-center overflow-hidden cursor-pointer relative group transition-all hover:border-indigo-400">
                  {formData.photo ? <img src={formData.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-camera opacity-30 text-3xl"></i>}
                  <div className="absolute inset-0 bg-indigo-600/10 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white"><i className="fa-solid fa-plus text-2xl"></i></div>
                </div>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                <p className="text-[9px] font-black uppercase opacity-40 mt-3 tracking-widest">Foto oficial ministerial</p>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 block mb-2 tracking-widest">Nome do Pastor</label>
                <input type="text" placeholder="Pr. Nome Completo" className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-inner" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase opacity-40 ml-2 block mb-2 tracking-widest">WhatsApp</label>
                  <input type="tel" placeholder="119..." className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500 outline-none shadow-inner" value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase opacity-40 ml-2 block mb-2 tracking-widest">Data Nasc.</label>
                  <input type="date" className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500 outline-none shadow-inner" value={formData.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} />
                </div>
              </div>

              <button type="button" onClick={() => setStep(2)} className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black text-lg shadow-lg shadow-indigo-500/20 mt-4 active:scale-95 transition-all">Continuar</button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center text-indigo-600"><i className="fa-solid fa-church"></i></div>
                <h3 className="text-xl font-black">Estrutura da Igreja</h3>
              </div>
              
              <div>
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 block mb-2 tracking-widest">Nome da Igreja</label>
                <input type="text" placeholder="Ex: Assembleia de Deus Central" className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500 outline-none shadow-inner" value={formData.church} onChange={e => setFormData({...formData, church: e.target.value})} />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 block mb-2 tracking-widest">Denominação / Convenção</label>
                <select className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none shadow-inner font-bold" value={formData.churchDenomination} onChange={e => setFormData({...formData, churchDenomination: e.target.value})}>
                  <option value="">Selecione...</option>
                  {denominations.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 p-5 rounded-3xl flex items-center justify-between border dark:border-gray-700">
                <div>
                   <p className="font-black text-sm">Esta é a Igreja Sede?</p>
                   <p className="text-[10px] opacity-50 uppercase font-bold tracking-tighter">Campo ou Matriz Principal</p>
                </div>
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, isMainBranch: !formData.isMainBranch})}
                  className={`w-14 h-8 rounded-full transition-all relative ${formData.isMainBranch ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                >
                  <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${formData.isMainBranch ? 'left-7' : 'left-1 shadow-sm'}`}></div>
                </button>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 block mb-2 tracking-widest">CNPJ (Opcional)</label>
                <input type="text" placeholder="00.000.000/0000-00" className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500 outline-none shadow-inner" value={formData.churchCNPJ} onChange={e => setFormData({...formData, churchCNPJ: e.target.value})} />
              </div>

              <div className="flex gap-2">
                 <button type="button" onClick={() => setStep(1)} className="px-6 py-5 bg-gray-100 dark:bg-gray-700 rounded-3xl font-black text-gray-500">Voltar</button>
                 <button type="button" onClick={() => setStep(3)} className="flex-1 py-5 bg-indigo-600 text-white rounded-3xl font-black text-lg shadow-xl shadow-indigo-500/20">Continuar</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center text-indigo-600"><i className="fa-solid fa-map-location-dot"></i></div>
                <h3 className="text-xl font-black">Localização e Impacto</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase opacity-40 ml-2 block mb-2 tracking-widest">Região SP</label>
                  <select className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none shadow-inner font-bold" value={formData.region} onChange={e => setFormData({...formData, region: e.target.value as Region})}>
                    <option value="">Região...</option>
                    {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase opacity-40 ml-2 block mb-2 tracking-widest">Cidade</label>
                  <select className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none shadow-inner font-bold" value={formData.municipality} onChange={e => setFormData({...formData, municipality: e.target.value})}>
                    <option value="">Cidade...</option>
                    {SP_MUNICIPALITIES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 block mb-2 tracking-widest">Endereço Completo</label>
                <input type="text" placeholder="Rua, Número, Bairro" className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500 outline-none shadow-inner" value={formData.churchAddress} onChange={e => setFormData({...formData, churchAddress: e.target.value})} />
              </div>

              <div className="bg-indigo-50 dark:bg-indigo-900/10 p-5 rounded-3xl border border-indigo-100 dark:border-indigo-800">
                <div className="flex items-center justify-between mb-3">
                   <p className="font-black text-sm">Projetos Sociais?</p>
                   <button 
                     type="button"
                     onClick={() => setFormData({...formData, hasSocialProjects: !formData.hasSocialProjects})}
                     className={`w-12 h-6 rounded-full transition-all relative ${formData.hasSocialProjects ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                   >
                     <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${formData.hasSocialProjects ? 'left-6.5' : 'left-0.5'}`}></div>
                   </button>
                </div>
                {formData.hasSocialProjects && (
                  <textarea 
                    placeholder="Quais projetos a igreja realiza na comunidade? (Ex: Sopão, Cestas Básicas, Reforço escolar)"
                    className="w-full bg-white dark:bg-gray-900 border-none rounded-2xl px-4 py-3 text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    rows={3}
                    value={formData.socialProjectsDescription}
                    onChange={e => setFormData({...formData, socialProjectsDescription: e.target.value})}
                  />
                )}
              </div>

              <div className="flex gap-2">
                 <button type="button" onClick={() => setStep(2)} className="px-6 py-5 bg-gray-100 dark:bg-gray-700 rounded-3xl font-black text-gray-500">Voltar</button>
                 <button type="button" onClick={() => setStep(4)} className="flex-1 py-5 bg-indigo-600 text-white rounded-3xl font-black text-lg shadow-xl shadow-indigo-500/20">Continuar</button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center text-indigo-600"><i className="fa-solid fa-share-nodes"></i></div>
                <h3 className="text-xl font-black">Redes e Conexões</h3>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 block mb-2 tracking-widest">Instagram / Redes Sociais da Igreja</label>
                <div className="relative">
                   <i className="fa-brands fa-instagram absolute left-6 top-1/2 -translate-y-1/2 text-gray-400"></i>
                   <input type="text" placeholder="@igreja_exemplo" className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl pl-12 pr-6 py-4 focus:ring-2 focus:ring-indigo-500 outline-none shadow-inner" value={formData.churchSocialMedia} onChange={e => setFormData({...formData, churchSocialMedia: e.target.value})} />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 block mb-2 tracking-widest">Nº Estimado de Membros</label>
                <select className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none shadow-inner font-bold" value={formData.churchMembersCount} onChange={e => setFormData({...formData, churchMembersCount: e.target.value})}>
                  <option value="Até 50">Até 50</option>
                  <option value="50 a 200">50 a 200</option>
                  <option value="200 a 500">200 a 500</option>
                  <option value="500 a 1000">500 a 1000</option>
                  <option value="Mais de 1000">Mais de 1000</option>
                </select>
              </div>

              <div className="pt-4">
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 block mb-2 tracking-widest">Pastor Indicado por:</label>
                <select className="w-full bg-blue-50 dark:bg-blue-900/20 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none font-bold text-blue-700 dark:text-blue-300" value={formData.referredBy} onChange={e => setFormData({...formData, referredBy: e.target.value})}>
                  <option value="">Direto (Rede Guti)</option>
                  {supporters.map(s => <option key={s.id} value={s.id}>{s.name} ({s.church})</option>)}
                </select>
              </div>

              <div className="flex gap-2">
                 <button type="button" onClick={() => setStep(3)} className="px-6 py-5 bg-gray-100 dark:bg-gray-700 rounded-3xl font-black text-gray-500">Voltar</button>
                 <button type="submit" className="flex-1 py-5 bg-indigo-600 text-white rounded-3xl font-black text-lg shadow-2xl shadow-indigo-500/40 active:scale-95 transition-all">FINALIZAR MAPEAMENTO</button>
              </div>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};

export default PastorForm;
