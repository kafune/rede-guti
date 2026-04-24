import React, { useEffect, useMemo, useState } from 'react';
import { createPublicIndication, fetchPublicOptions, getApiErrorMessage } from '../api';

const getIndicatorFromHash = () => {
  const hash = window.location.hash || '';
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return '';
  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  return params.get('indicador') || params.get('indicado') || params.get('ref') || '';
};

const getIndicatorIdFromHash = () => {
  const hash = window.location.hash || '';
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return '';
  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  return params.get('indicadorId') || params.get('indicatorId') || params.get('refId') || '';
};

const collapseWhitespace = (value: string) => value.trim().replace(/\s+/g, ' ');

const stripDiacritics = (value: string) =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '');

const normalizeLookupKey = (value: string) => {
  const sanitized = stripDiacritics(collapseWhitespace(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();

  return sanitized.replace(/\bsp\b$/u, '').trim();
};

const buildCanonicalLookup = (values: string[]) =>
  new Map(values.map((value) => [normalizeLookupKey(value), collapseWhitespace(value)]));

const findCanonicalMunicipalityName = (value: string, lookup: Map<string, string>) => {
  const lookupKey = normalizeLookupKey(value);
  if (!lookupKey) return null;
  return lookup.get(lookupKey) ?? null;
};

const validateWhatsapp = (value: string) => {
  const digitsOnly = value.replace(/\D/g, '');
  if (!digitsOnly) {
    return { error: 'Informe um WhatsApp com DDD.' } as const;
  }

  const nationalDigits =
    digitsOnly.startsWith('55') && digitsOnly.length > 11 ? digitsOnly.slice(2) : digitsOnly;

  if (nationalDigits.length !== 11) {
    return { error: 'Informe um WhatsApp valido com DDD.' } as const;
  }

  const areaCode = nationalDigits.slice(0, 2);
  const subscriberNumber = nationalDigits.slice(2);

  if (!/^[1-9]{2}$/.test(areaCode) || subscriberNumber[0] !== '9') {
    return { error: 'Informe um WhatsApp valido com DDD.' } as const;
  }

  return { normalized: `55${nationalDigits}` } as const;
};

const formatWhatsappForDisplay = (value: string) => {
  const digitsOnly = value.replace(/\D/g, '');
  const nationalDigits =
    digitsOnly.startsWith('55') && digitsOnly.length > 11 ? digitsOnly.slice(2) : digitsOnly;

  if (nationalDigits.length !== 11) {
    return value;
  }

  return `(${nationalDigits.slice(0, 2)}) ${nationalDigits.slice(2, 7)}-${nationalDigits.slice(7)}`;
};

const PublicSignup: React.FC = () => {
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [churches, setChurches] = useState<string[]>([]);
  const [municipalities, setMunicipalities] = useState<string[]>([]);
  const [whatsappGroupLink, setWhatsappGroupLink] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [churchName, setChurchName] = useState('');
  const [municipalityName, setMunicipalityName] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [municipalityError, setMunicipalityError] = useState<string | null>(null);
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
        setWhatsappGroupLink(data.whatsappGroupLink?.trim() || '');
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
  const refIndicatorId = useMemo(() => getIndicatorIdFromHash(), []);
  const municipalityLookup = useMemo(() => buildCanonicalLookup(municipalities), [municipalities]);

  const normalizeMunicipalityInput = () => {
    const normalizedMunicipality = findCanonicalMunicipalityName(
      municipalityName,
      municipalityLookup
    );

    if (!municipalityName.trim()) {
      setMunicipalityError(null);
      return null;
    }

    if (!normalizedMunicipality) {
      setMunicipalityError('Selecione um municipio valido da lista oficial.');
      return null;
    }

    setMunicipalityName(normalizedMunicipality);
    setMunicipalityError(null);
    return normalizedMunicipality;
  };

  const normalizePhoneInput = () => {
    const validation = validateWhatsapp(phone);

    if (!phone.trim()) {
      setPhoneError(null);
      return null;
    }

    if ('error' in validation) {
      setPhoneError(validation.error);
      return null;
    }

    setPhoneError(null);
    setPhone(formatWhatsappForDisplay(validation.normalized));
    return validation.normalized;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSuccessMessage('');

    if (optionsLoading) {
      setSubmitError('Aguarde o carregamento da lista oficial de municipios.');
      return;
    }

    const normalizedPhone = normalizePhoneInput();
    const normalizedMunicipality = normalizeMunicipalityInput();

    if (!normalizedPhone || !normalizedMunicipality) {
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        phone: normalizedPhone,
        email: email.trim(),
        churchName: churchName.trim(),
        municipalityName: normalizedMunicipality,
        indicatedBy: refIndicator.trim(),
        indicatedByUserId: refIndicatorId.trim() || undefined
      };

      await createPublicIndication(payload);
      sessionStorage.setItem('guti_public_name', payload.name);
      if (whatsappGroupLink.trim()) {
        sessionStorage.setItem('guti_public_group_link', whatsappGroupLink.trim());
      } else {
        sessionStorage.removeItem('guti_public_group_link');
      }
      setSuccessMessage('Cadastro enviado com sucesso. Obrigado por apoiar!');
      setName('');
      setPhone('');
      setEmail('');
      setChurchName('');
      setMunicipalityName('');
      setPhoneError(null);
      setMunicipalityError(null);
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
        <div className="theme-panel bg-white dark:bg-gray-800 rounded-[2.5rem] p-8 shadow-2xl animate-soft-pop transition-all duration-700 ease-out">
          <div className="text-center mb-8">
            <div className="theme-brand-mark w-20 h-20 rounded-3xl flex items-center justify-center text-white text-4xl font-black mx-auto mb-5">G</div>
            <h1 className="text-3xl font-black tracking-tight mb-2">Cadastro de Apoiador</h1>
            <p className="text-gray-500 dark:text-gray-400 font-medium">Rede de Apoiadores do Estado de SP</p>
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
                  inputMode="numeric"
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (phoneError) setPhoneError(null);
                    if (submitError) setSubmitError(null);
                  }}
                  onBlur={normalizePhoneInput}
                  className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="(11) 9 9999-9999"
                  required
                />
                {phoneError && <p className="mt-2 text-[11px] font-semibold text-red-600">{phoneError}</p>}
              </div>
              <div>
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-1">E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="nome@exemplo.com"
                  required
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
                  onChange={(e) => {
                    setMunicipalityName(e.target.value);
                    if (municipalityError) setMunicipalityError(null);
                    if (submitError) setSubmitError(null);
                  }}
                  onBlur={normalizeMunicipalityInput}
                  className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="Comece a digitar e selecione"
                  required
                />
                {optionsLoading && (
                  <p className="mt-2 text-[11px] font-semibold text-blue-600">
                    Carregando lista oficial de municipios...
                  </p>
                )}
                {municipalityError && (
                  <p className="mt-2 text-[11px] font-semibold text-red-600">{municipalityError}</p>
                )}
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
                value={refIndicator || (refIndicatorId ? 'Indicador identificado' : 'Link sem indicador')}
                className="w-full bg-gray-100 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 text-sm font-semibold opacity-80"
              />
              {!refIndicator && !refIndicatorId && (
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
              disabled={submitting || optionsLoading || (!refIndicator && !refIndicatorId)}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-blue-500/40 active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-50"
            >
              {submitting ? 'Enviando...' : 'Enviar cadastro'}
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="theme-panel bg-white/90 dark:bg-gray-800/90 rounded-[2rem] p-6 shadow-xl border border-white/20 transition-all duration-700 ease-out">
            <h2 className="text-lg font-black mb-2">Como funciona</h2>
            <p className="text-sm opacity-70">
              Preencha seus dados e confirme a igreja e o municipio. Sua indicacao ajuda a
              fortalecer a rede de apoio em todo o estado.
            </p>
          </div>
          <div className="theme-hero rounded-[2rem] p-6 shadow-2xl shadow-blue-500/30 transition-all duration-700 ease-out">
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
