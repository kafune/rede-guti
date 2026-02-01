import React, { useEffect, useMemo, useState } from 'react';
import { createPublicIndication, fetchPublicOptions, getApiErrorMessage } from '../api';

const getIndicatorFromHash = () => {
  const hash = window.location.hash || '';
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return '';
  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  return params.get('indicador') || params.get('indicado') || params.get('ref') || '';
};

const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
};

const PublicSignup: React.FC = () => {
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [churches, setChurches] = useState<string[]>([]);
  const [municipalities, setMunicipalities] = useState<string[]>([]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [churchName, setChurchName] = useState('');
  const [municipalityName, setMunicipalityName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadOptions = async () => {
      setOptionsLoading(true);
      setOptionsError(null);
      try {
        const data = await fetchPublicOptions();
        if (cancelled) return;
        setChurches(data.churches || []);
        setMunicipalities(data.municipalities || []);
      } catch (error) {
        if (!cancelled) {
          setOptionsError(getApiErrorMessage(error, 'Erro ao carregar dados.'));
        }
      } finally {
        if (!cancelled) setOptionsLoading(false);
      }
    };

    loadOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  const refIndicator = useMemo(() => getIndicatorFromHash(), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSuccessMessage('');

    try {
      const payload = {
        name: name.trim(),
        phone: normalizePhone(phone),
        email: email.trim() || undefined,
        churchName: churchName.trim(),
        municipalityName: municipalityName.trim(),
        indicatedBy: refIndicator.trim()
      };

      await createPublicIndication(payload);
      sessionStorage.setItem('guti_public_name', payload.name);
      setSuccessMessage('Cadastro enviado com sucesso. Obrigado por apoiar!');
      setName('');
      setPhone('');
      setEmail('');
      setChurchName('');
      setMunicipalityName('');
      window.location.hash = '#/obrigado';
    } catch (error) {
      setSubmitError(getApiErrorMessage(error, 'Nao foi possivel enviar o cadastro.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-blue-600 to-indigo-900 animate-fade-up">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-8 shadow-2xl animate-soft-pop transition-all duration-700 ease-out">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white text-4xl font-black mx-auto mb-5 shadow-xl shadow-blue-500/30">G</div>
            <h1 className="text-3xl font-black tracking-tight mb-2">Cadastro de Apoiador</h1>
            <p className="text-gray-500 dark:text-gray-400 font-medium">Rede Evangelica do Estado de SP</p>
          </div>

          {optionsError && (
            <div className="mb-4 text-sm text-red-600 font-semibold bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
              {optionsError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-1">Nome Completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="Digite seu nome"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-1">WhatsApp</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="(11) 9 9999-9999"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-1">E-mail (opcional)</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="nome@exemplo.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-1">Municipio</label>
                <input
                  type="text"
                  list="public-municipalities"
                  value={municipalityName}
                  onChange={(e) => setMunicipalityName(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="Digite sua cidade"
                  required
                />
                <datalist id="public-municipalities">
                  {municipalities.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-1">Igreja</label>
                <input
                  type="text"
                  list="public-churches"
                  value={churchName}
                  onChange={(e) => setChurchName(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="Nome da igreja"
                  required
                />
                <datalist id="public-churches">
                  {churches.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-1">Indicacao</label>
              <input
                type="text"
                readOnly
                value={refIndicator || 'Link sem indicador'}
                className="w-full bg-gray-100 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 text-sm font-semibold opacity-80"
              />
              {!refIndicator && (
                <p className="text-[10px] mt-2 text-yellow-700 font-bold">
                  Este link nao contem o nome do indicador. Solicite um novo link.
                </p>
              )}
            </div>

            {submitError && (
              <div className="text-sm text-red-600 font-semibold bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                {submitError}
              </div>
            )}
            {successMessage && (
              <div className="text-sm text-green-700 font-semibold bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
                {successMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !refIndicator}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-blue-500/40 active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-50"
            >
              {submitting ? 'Enviando...' : 'Enviar cadastro'}
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="bg-white/90 dark:bg-gray-800/90 rounded-[2rem] p-6 shadow-xl border border-white/20 transition-all duration-700 ease-out">
            <h2 className="text-lg font-black mb-2">Como funciona</h2>
            <p className="text-sm opacity-70">
              Preencha seus dados e confirme a igreja e o municipio. Sua indicacao ajuda a
              fortalecer a rede de apoio em todo o estado.
            </p>
          </div>
          <div className="bg-blue-600 text-white rounded-[2rem] p-6 shadow-2xl shadow-blue-500/30 transition-all duration-700 ease-out">
            <h2 className="text-lg font-black mb-2">Protecao de dados</h2>
            <p className="text-sm opacity-80">
              Seus dados sao usados apenas para contato e organizacao da rede. Em caso de duvidas,
              procure o responsavel que enviou este link.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicSignup;
