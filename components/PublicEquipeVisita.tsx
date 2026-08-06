import React, { useEffect, useRef, useState } from 'react';
import { BRAND } from '../branding';
import { EquipePublicInfo, EquipeVisitaPublic } from '../types';
import {
  createPublicEquipeVisita,
  fetchPublicEquipeInfo,
  fetchPublicEquipeVisitas,
  getApiErrorMessage
} from '../api';

const parseHashParams = (): { equipeId: string } => {
  const hash = window.location.hash; // "#/equipes/visita?equipe=xyz"
  const [, hashQuery] = hash.split('?');
  const equipeId = new URLSearchParams(hashQuery ?? '').get('equipe') ?? '';
  return { equipeId };
};

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' às ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
};

// Valor inicial para <input type="datetime-local"> no fuso local.
const nowLocalInput = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};

// Redimensiona a foto no cliente para um JPEG leve (<~300KB) em data URL.
const resizeImage = (file: File, maxDim = 1000, quality = 0.72): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler a imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida.'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas indisponível.'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

const PublicEquipeVisita: React.FC = () => {
  const { equipeId } = parseHashParams();

  const [equipe, setEquipe] = useState<EquipePublicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [local, setLocal] = useState('');
  const [dataHora, setDataHora] = useState(nowLocalInput());
  const [registradoPor, setRegistradoPor] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [fotoLoading, setFotoLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [visitas, setVisitas] = useState<EquipeVisitaPublic[]>([]);
  const localRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!equipeId) {
      setLoadError('Link inválido. Solicite um novo link à liderança.');
      setLoading(false);
      return;
    }
    Promise.all([
      fetchPublicEquipeInfo(equipeId),
      fetchPublicEquipeVisitas(equipeId).catch(() => [] as EquipeVisitaPublic[])
    ])
      .then(([info, vs]) => {
        setEquipe(info);
        setVisitas(vs);
      })
      .catch((err) => setLoadError(getApiErrorMessage(err, 'Equipe não encontrada.')))
      .finally(() => setLoading(false));
  }, [equipeId]);

  const handleFoto = async (file: File | undefined) => {
    if (!file) return;
    setFotoLoading(true);
    try {
      setFoto(await resizeImage(file));
    } catch {
      setSubmitError('Não foi possível processar a foto. Tente outra.');
    } finally {
      setFotoLoading(false);
    }
  };

  const captureGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('error');
      return;
    }
    setGpsStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus('ok');
      },
      () => setGpsStatus('error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipe) return;
    if (!local.trim()) {
      setSubmitError('Informe o local / igreja da visita.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const iso = dataHora ? new Date(dataHora).toISOString() : new Date().toISOString();
      const nova = await createPublicEquipeVisita(equipe.id, {
        local: local.trim(),
        dataHora: iso,
        observacoes: observacoes.trim() || null,
        registradoPor: registradoPor.trim() || null,
        fotoUrl: foto,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null
      });
      setVisitas((prev) => [
        {
          id: nova.id,
          local: nova.local,
          dataHora: nova.dataHora,
          registradoPor: nova.registradoPor,
          temLocalizacao: nova.latitude != null && nova.longitude != null
        },
        ...prev
      ]);
      setLocal('');
      setObservacoes('');
      setFoto(null);
      setCoords(null);
      setGpsStatus('idle');
      setDataHora(nowLocalInput());
      localRef.current?.focus();
    } catch (err) {
      setSubmitError(getApiErrorMessage(err, 'Erro ao registrar a visita.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl opacity-30"></i>
      </div>
    );
  }

  if (loadError || !equipe) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-6 text-center gap-4">
        <i className="fa-solid fa-link-slash text-5xl opacity-20"></i>
        <p className="font-black text-lg opacity-60">{loadError ?? 'Equipe não encontrada.'}</p>
      </div>
    );
  }

  const inputClass =
    'w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none text-sm';
  const labelClass = 'text-[10px] font-black uppercase opacity-40 tracking-widest block mb-1';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 pb-8 pt-[calc(env(safe-area-inset-top,0px)+2rem)] flex flex-col items-center">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center mb-2">
          <img src="/logo.jpeg" alt="Logo" className="w-14 h-14 rounded-3xl mx-auto mb-3 object-cover shadow-lg" />
          <h1 className="font-black text-xl">{BRAND.publicHeader}</h1>
          <p className="text-xs opacity-40 font-bold uppercase tracking-widest">Prestação de contas</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-5">
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <i className="fa-solid fa-car-side"></i>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Equipe</span>
          </div>
          <h2 className="font-black text-lg leading-tight">{equipe.nome}</h2>
          <p className="text-sm opacity-60 font-semibold mt-1">
            Liderança: {equipe.liderNome} · {equipe.visitasCount} visita(s) registrada(s)
          </p>
          <p className="text-xs opacity-50 font-semibold mt-2">
            Registre abaixo cada visita feita pela equipe (porta de igreja). Isso gera a prestação de
            contas para a coordenação.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm p-5 space-y-4">
          <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Nova visita</p>

          {submitError && (
            <div className="px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-semibold">
              {submitError}
            </div>
          )}

          <div>
            <label className={labelClass}>Local / Igreja *</label>
            <input
              ref={localRef}
              type="text"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="Ex.: Igreja Batista Central"
              className={inputClass}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className={labelClass}>Data e hora *</label>
              <input
                type="datetime-local"
                value={dataHora}
                onChange={(e) => setDataHora(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Quem está registrando</label>
              <input
                type="text"
                value={registradoPor}
                onChange={(e) => setRegistradoPor(e.target.value)}
                placeholder="Seu nome (opcional)"
                className={inputClass}
              />
            </div>
          </div>

          {/* Geolocalização */}
          <div>
            <label className={labelClass}>Localização (GPS)</label>
            <button
              type="button"
              onClick={captureGps}
              className={`w-full flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest py-3 rounded-2xl transition-transform active:scale-95 ${
                gpsStatus === 'ok'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20'
                  : 'bg-gray-100 dark:bg-gray-900'
              }`}
            >
              {gpsStatus === 'loading' ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin"></i> Obtendo localização...
                </>
              ) : gpsStatus === 'ok' && coords ? (
                <>
                  <i className="fa-solid fa-location-crosshairs"></i> Localização capturada
                </>
              ) : (
                <>
                  <i className="fa-solid fa-location-dot"></i> Capturar minha localização
                </>
              )}
            </button>
            {gpsStatus === 'ok' && coords && (
              <p className="text-[10px] opacity-50 mt-1 ml-1 font-mono">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </p>
            )}
            {gpsStatus === 'error' && (
              <p className="text-[10px] text-amber-600 mt-1 ml-1 font-semibold">
                Não foi possível obter a localização (permissão negada ou indisponível).
              </p>
            )}
          </div>

          {/* Foto de comprovação */}
          <div>
            <label className={labelClass}>Foto de comprovação</label>
            {foto ? (
              <div className="relative">
                <img src={foto} alt="Comprovação" className="w-full rounded-2xl object-cover max-h-56" />
                <button
                  type="button"
                  onClick={() => setFoto(null)}
                  className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/60 text-white text-sm active:scale-95"
                  title="Remover foto"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            ) : (
              <label className="w-full flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest py-3 rounded-2xl bg-gray-100 dark:bg-gray-900 cursor-pointer active:scale-95 transition-transform">
                {fotoLoading ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin"></i> Processando...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-camera"></i> Tirar / anexar foto
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleFoto(e.target.files?.[0])}
                />
              </label>
            )}
          </div>

          <div>
            <label className={labelClass}>Observações</label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Relato da visita, quantidade de pessoas, contatos feitos..."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !local.trim()}
            className="w-full bg-emerald-600 text-white font-black uppercase tracking-widest text-sm py-4 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-50"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <i className="fa-solid fa-circle-notch fa-spin"></i> Enviando...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <i className="fa-solid fa-check"></i> Registrar visita
              </span>
            )}
          </button>
        </form>

        {visitas.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase opacity-40 tracking-widest px-1">
              Visitas registradas ({visitas.length})
            </p>
            {visitas.map((v) => (
              <div
                key={v.id}
                className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 shadow-sm p-3 animate-soft-pop"
              >
                <p className="font-black text-sm">
                  <i className="fa-solid fa-location-dot mr-1 text-emerald-500"></i>
                  {v.local}
                </p>
                <p className="text-[10px] opacity-60 font-bold mt-0.5">
                  <i className="fa-solid fa-calendar mr-1"></i>
                  {formatDateTime(v.dataHora)}
                  {v.registradoPor && <span> · {v.registradoPor}</span>}
                  {v.temLocalizacao && (
                    <span className="ml-1 text-blue-500">
                      <i className="fa-solid fa-location-crosshairs"></i>
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-[10px] opacity-20 font-bold pb-4">{BRAND.publicHeader}</p>
      </div>
    </div>
  );
};

export default PublicEquipeVisita;
