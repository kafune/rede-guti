
import React, { useState, useRef } from 'react';
import { Church, Municipality, Supporter } from '../types';

interface Props {
  supporters: Supporter[];
  churches: Church[];
  municipalities: Municipality[];
  onSave: (data: {
    name: string;
    whatsapp: string;
    churchName: string;
    municipalityName: string;
    indicatedBy?: string;
  }) => Promise<boolean>;
  onCancel: () => void;
}

const SupporterForm: React.FC<Props> = ({ supporters, churches, municipalities, onSave, onCancel }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: '',
    whatsapp: '',
    church: '',
    municipality: '',
    indicatedBy: '',
    photo: '',
  });

  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500000) { // Limite de 500KB para não estourar o localStorage rápido
        alert("Foto muito pesada! Escolha uma imagem menor.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, photo: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.whatsapp || !formData.municipality || !formData.church) {
      alert('Por favor, preencha o Nome, WhatsApp, Cidade e Igreja.');
      return;
    }

    setSaving(true);
    try {
      const success = await onSave({
        name: formData.name,
        whatsapp: formData.whatsapp,
        churchName: formData.church,
        municipalityName: formData.municipality,
        indicatedBy: formData.indicatedBy || undefined
      });

      if (success) setSubmitted(true);
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center px-6 animate-fade-up">
        <div className="w-24 h-24 bg-blue-600 rounded-[2.5rem] flex items-center justify-center text-white text-4xl shadow-2xl shadow-blue-500/40 mb-8 animate-bounce">
          <i className="fa-solid fa-check"></i>
        </div>
        <h2 className="text-3xl font-black mb-2">Cadastrado!</h2>
        <p className="opacity-50 mb-10">Liderança salva com sucesso na Rede SP.</p>
        <button onClick={() => setSubmitted(false)} className="w-full max-w-xs py-5 bg-blue-600 text-white rounded-3xl font-black text-lg mb-4 transition-all duration-300 ease-out hover:-translate-y-0.5">Novo Cadastro</button>
        <button onClick={onCancel} className="w-full max-w-xs py-5 bg-gray-100 dark:bg-gray-800 rounded-3xl font-black text-lg transition-all duration-300 ease-out hover:-translate-y-0.5">Dashboard</button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto animate-fade-up">
      <div className="flex items-center gap-4 mb-8 animate-soft-pop">
        <button onClick={onCancel} className="p-2"><i className="fa-solid fa-arrow-left text-xl"></i></button>
        <h2 className="text-3xl font-black">Novo Cadastro</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border dark:border-gray-700 space-y-5 animate-soft-pop transition-all duration-500 ease-out">
          
          {/* Foto Upload */}
          <div className="flex flex-col items-center pb-4">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-24 h-24 bg-gray-100 dark:bg-gray-900 rounded-3xl border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center overflow-hidden cursor-pointer relative group transition-all duration-300 ease-out hover:-translate-y-0.5"
            >
              {formData.photo ? (
                <img src={formData.photo} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center">
                  <i className="fa-solid fa-camera opacity-30 text-2xl"></i>
                  <p className="text-[8px] font-black uppercase opacity-30 mt-1">Foto</p>
                </div>
              )}
              <div className="absolute inset-0 bg-blue-600/20 opacity-0 group-active:opacity-100 transition-opacity flex items-center justify-center text-white">
                <i className="fa-solid fa-plus text-xl"></i>
              </div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handlePhotoUpload}
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-2">Nome Completo</label>
            <input 
              type="text" 
              placeholder="Ex: Pr. João Silva"
              className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-2">WhatsApp</label>
              <input 
                type="tel" 
                placeholder="119..."
                className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: e.target.value})}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-2">Município</label>
              <input
                type="text"
                list="municipalities-list"
                placeholder="Ex: São Paulo"
                className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.municipality}
                onChange={e => setFormData({...formData, municipality: e.target.value})}
              />
              <datalist id="municipalities-list">
                {municipalities.map(m => (
                  <option key={m.id} value={m.name} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-2">Igreja / Denominação</label>
            <input 
              type="text" 
              list="churches-list"
              placeholder="Ex: Igreja Batista Viva"
              className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.church} onChange={e => setFormData({...formData, church: e.target.value})}
            />
            <datalist id="churches-list">
              {churches.map(c => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </div>

          <div className="pt-4 border-t dark:border-gray-700">
            <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-2">Indicado por:</label>
            <input
              type="text"
              list="indicators-list"
              placeholder="Ex: Pr. João Silva"
              className="w-full bg-blue-50 dark:bg-blue-900/20 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none text-blue-700 dark:text-blue-300 font-bold"
              value={formData.indicatedBy}
              onChange={e => setFormData({...formData, indicatedBy: e.target.value})}
            />
            <datalist id="indicators-list">
              {supporters.map(s => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </div>
        </div>

        <button 
          type="submit" 
          disabled={saving}
          className="w-full py-6 bg-blue-600 text-white rounded-3xl font-black text-xl shadow-2xl shadow-blue-500/30 active:scale-[0.98] transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-60"
        >
          {saving ? 'SALVANDO...' : 'CONFIRMAR CADASTRO'}
        </button>
      </form>
    </div>
  );
};

export default SupporterForm;

