
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Supporter, SupporterType } from '../types';

interface Props {
  supporters: Supporter[];
  onSave: (data: Partial<Supporter>) => boolean;
  onCancel: () => void;
}

const MUNICIPALITIES_API = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados/SP/municipios';
const CEP_API_BASE = 'https://viacep.com.br/ws';

const PastorForm: React.FC<Props> = ({ supporters, onSave, onCancel }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastCepRef = useRef<string | null>(null);
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
    municipality: '',
    churchSocialMedia: '',
    churchMembersCount: 'Até 100',
    referredBy: '',
    photo: '',
  });
  const [cep, setCep] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressNumber, setAddressNumber] = useState('');
  const [addressNeighborhood, setAddressNeighborhood] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [municipalities, setMunicipalities] = useState<string[]>([]);
  const [municipalitiesLoading, setMunicipalitiesLoading] = useState(false);
  const [municipalitiesError, setMunicipalitiesError] = useState<string | null>(null);
  const [municipalitiesOpen, setMunicipalitiesOpen] = useState(false);
  const [debouncedMunicipality, setDebouncedMunicipality] = useState('');
  const [debouncedCep, setDebouncedCep] = useState('');

  const loadMunicipalities = async () => {
    if (municipalitiesLoading || municipalities.length) return;
    setMunicipalitiesLoading(true);
    setMunicipalitiesError(null);
    try {
      const response = await fetch(MUNICIPALITIES_API);
      if (!response.ok) {
        throw new Error('Falha ao carregar cidades.');
      }
      const data = (await response.json()) as Array<{ nome?: string }>;
      const names = data
        .map((item) => (item?.nome ?? '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      setMunicipalities(names);
    } catch {
      setMunicipalitiesError('Nao foi possivel carregar cidades.');
    } finally {
      setMunicipalitiesLoading(false);
    }
  };

  const normalizeCep = (value: string) => value.replace(/\D/g, '').slice(0, 8);

  const formatCep = (digits: string) => {
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  };

  const handleCepChange = (value: string) => {
    const digits = normalizeCep(value);
    setCep(formatCep(digits));
    setCepError(null);
  };

  const lookupCep = async (digits: string) => {
    if (cepLoading || digits.length !== 8) return;
    if (lastCepRef.current === digits) return;
    lastCepRef.current = digits;
    setCepLoading(true);
    setCepError(null);
    try {
      const response = await fetch(`${CEP_API_BASE}/${digits}/json/`);
      if (!response.ok) {
        throw new Error('Falha ao consultar CEP.');
      }
      const data = (await response.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
      };
      if (data.erro) {
        setCepError('CEP não encontrado.');
        return;
      }
      setAddressStreet(data.logradouro ?? '');
      setAddressNeighborhood(data.bairro ?? '');
      if (data.localidade) {
        setFormData((prev) => ({
          ...prev,
          municipality: data.localidade ?? prev.municipality
        }));
      }
    } catch {
      setCepError('Não foi possível consultar o CEP.');
    } finally {
      setCepLoading(false);
    }
  };

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedMunicipality(formData.municipality);
    }, 150);
    return () => window.clearTimeout(handle);
  }, [formData.municipality]);

  useEffect(() => {
    const digits = normalizeCep(cep);
    if (!digits) {
      setDebouncedCep('');
      return;
    }
    const handle = window.setTimeout(() => {
      setDebouncedCep(digits);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [cep]);

  useEffect(() => {
    if (debouncedCep.length === 8) {
      void lookupCep(debouncedCep);
    }
  }, [debouncedCep]);

  const filteredMunicipalities = useMemo(() => {
    if (!municipalities.length) return [];
    const query = debouncedMunicipality.trim().toLowerCase();
    const list = query
      ? municipalities.filter((name) => name.toLowerCase().includes(query))
      : municipalities;
    return list;
  }, [municipalities, debouncedMunicipality]);


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
    if (!formData.name || !formData.whatsapp || !formData.church || !formData.municipality.trim()) {
      alert('Preencha nome, WhatsApp, igreja e cidade.');
      return;
    }

    const cepDigits = normalizeCep(cep);
    const formattedCep = cepDigits ? formatCep(cepDigits) : '';
    const baseAddress = [addressStreet, addressNumber].filter(Boolean).join(', ');
    const withNeighborhood = addressNeighborhood
      ? `${baseAddress}${baseAddress ? ' - ' : ''}${addressNeighborhood}`
      : baseAddress;
    const fullAddress = formattedCep
      ? `${withNeighborhood}${withNeighborhood ? ' ' : ''}(CEP ${formattedCep})`
      : withNeighborhood;

    onSave({
      ...formData,
      type: SupporterType.PASTOR,
      notes: formData.municipality,
      churchAddress: fullAddress || undefined,
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
           <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">Rede Conexão SP â€¢ Guti 2026</p>
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
                   <p className="font-black text-sm">Esta ? a Igreja Sede?</p>
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

              <div>
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 block mb-2 tracking-widest">Cidade</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Digite para buscar..."
                    className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500 outline-none shadow-inner"
                    value={formData.municipality}
                    onChange={e => setFormData({ ...formData, municipality: e.target.value })}
                    onFocus={() => {
                      setMunicipalitiesOpen(true);
                      void loadMunicipalities();
                    }}
                    onBlur={() => {
                      window.setTimeout(() => setMunicipalitiesOpen(false), 150);
                    }}
                  />
                  {municipalitiesOpen && (
                    <div className="absolute z-20 mt-2 w-full max-h-60 overflow-auto bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl p-2 space-y-1">
                      {municipalitiesLoading && (
                        <p className="text-xs font-bold opacity-60 px-3 py-2">Carregando cidades...</p>
                      )}
                      {!municipalitiesLoading && municipalitiesError && (
                        <p className="text-xs font-bold text-red-500 px-3 py-2">{municipalitiesError}</p>
                      )}
                      {!municipalitiesLoading && !municipalitiesError && filteredMunicipalities.length === 0 && (
                        <p className="text-xs font-bold opacity-50 px-3 py-2">Nenhuma cidade encontrada.</p>
                      )}
                      {!municipalitiesLoading && !municipalitiesError && filteredMunicipalities.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setFormData({ ...formData, municipality: name });
                            setMunicipalitiesOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase opacity-40 ml-2 block mb-2 tracking-widest">CEP</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="00000-000"
                      className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500 outline-none shadow-inner"
                      value={cep}
                      onChange={(e) => handleCepChange(e.target.value)}
                    />
                    {cepLoading && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold opacity-60">
                        Buscando...
                      </span>
                    )}
                  </div>
                  {cepError && <p className="text-[10px] text-red-500 font-bold mt-2 ml-2">{cepError}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-black uppercase opacity-40 ml-2 block mb-2 tracking-widest">Rua</label>
                    <input
                      type="text"
                      placeholder="Rua, Avenida..."
                      className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500 outline-none shadow-inner"
                      value={addressStreet}
                      onChange={(e) => setAddressStreet(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase opacity-40 ml-2 block mb-2 tracking-widest">Número</label>
                    <input
                      type="text"
                      placeholder="Nº"
                      className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500 outline-none shadow-inner"
                      value={addressNumber}
                      onChange={(e) => setAddressNumber(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase opacity-40 ml-2 block mb-2 tracking-widest">Bairro</label>
                  <input
                    type="text"
                    placeholder="Bairro"
                    className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500 outline-none shadow-inner"
                    value={addressNeighborhood}
                    onChange={(e) => setAddressNeighborhood(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                 <button type="button" onClick={() => setStep(2)} className="px-6 py-5 bg-gray-100 dark:bg-gray-700 rounded-3xl font-black text-gray-500">Voltar</button>
                 <button
                   type="button"
                   onClick={() => {
                     if (!formData.municipality.trim()) {
                       alert('Informe a cidade.');
                       return;
                     }
                     setStep(4);
                   }}
                   className="flex-1 py-5 bg-indigo-600 text-white rounded-3xl font-black text-lg shadow-xl shadow-indigo-500/20"
                 >
                   Continuar
                 </button>
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
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 block mb-2 tracking-widest">N? Estimado de Membros</label>
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


