import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BRAND } from '../branding';
import { PublicVisit as PublicVisitType, VISIT_STATUS_LABEL } from '../territoryTypes';
import {
  fetchPublicVisit,
  publicCheckin,
  publicSubmitOutcome,
  publicUploadPhoto,
} from '../territoryApi';
import { getApiErrorMessage } from '../api';

const getToken = () => {
  const hash = window.location.hash || '';
  const m = hash.match(/#\/v\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : '';
};

// Reduz a foto no cliente (~1280px, JPEG 0.7) para caber como data URL no banco.
const downscaleImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler a imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida.'));
      img.onload = () => {
        const max = 1280;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas indisponível.'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

const fmtDate = (iso: string | null) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
};

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white/5 border border-white/10 rounded-3xl p-5 ${className}`}>{children}</div>
);

const BigButton: React.FC<{
  onClick?: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'ghost' | 'success';
  disabled?: boolean;
  href?: string;
}> = ({ onClick, children, variant = 'primary', disabled, href }) => {
  const styles =
    variant === 'primary'
      ? 'bg-blue-600 text-white active:bg-blue-700'
      : variant === 'success'
      ? 'bg-emerald-600 text-white active:bg-emerald-700'
      : 'bg-white/10 text-white active:bg-white/20';
  const cls = `w-full min-h-[56px] rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-colors ${styles} ${disabled ? 'opacity-40 pointer-events-none' : ''}`;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
};

const PublicVisit: React.FC = () => {
  const token = useMemo(getToken, []);
  const [visit, setVisit] = useState<PublicVisitType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [checkinInfo, setCheckinInfo] = useState<{ status: string; distance: number | null; radius: number } | null>(null);
  const [needsJustification, setNeedsJustification] = useState(false);
  const [justification, setJustification] = useState('');
  const [lastCoords, setLastCoords] = useState<{ lat: number; lng: number; acc: number | null } | null>(null);

  const [photoData, setPhotoData] = useState<string | null>(null);
  const [photoStamp, setPhotoStamp] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [happened, setHappened] = useState<'sim' | 'nao' | 'parcialmente'>('sim');
  const [outcome, setOutcome] = useState('recebido pelo pastor/líder');
  const [notes, setNotes] = useState('');
  const [done, setDone] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const v = await fetchPublicVisit(token);
      setVisit(v);
      if (v.checkinAt) setCheckinInfo({ status: v.status === 'pendente_validacao' ? 'fora' : 'confirmado', distance: null, radius: v.settings.checkinRadiusMeters });
      if (v.status === 'visita_realizada' || v.status === 'nao_realizada') setDone(true);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Visita não encontrada.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      setError('Link inválido.');
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const doCheckin = async (withJustification = false) => {
    if (!('geolocation' in navigator)) {
      setError('Seu aparelho não permite capturar localização.');
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude, accuracy } = pos.coords;
          setLastCoords({ lat: latitude, lng: longitude, acc: accuracy ?? null });
          const res = await publicCheckin(token, {
            latitude,
            longitude,
            accuracy: accuracy ?? null,
            deviceTimestamp: new Date(pos.timestamp).toISOString(),
            justification: withJustification ? justification.trim() : null,
          });
          setCheckinInfo({ status: res.geofenceStatus, distance: res.distanceFromChurch, radius: res.radiusMeters });
          setNeedsJustification(res.needsJustification);
          if (!res.needsJustification) {
            await load();
          }
        } catch (e) {
          setError(getApiErrorMessage(e, 'Falha ao registrar check-in.'));
        } finally {
          setBusy(false);
        }
      },
      (geoErr) => {
        setBusy(false);
        setError(
          geoErr.code === geoErr.PERMISSION_DENIED
            ? 'Permissão de localização negada. Autorize para comprovar a visita.'
            : 'Não foi possível obter a localização. Tente novamente.'
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const data = await downscaleImage(file);
      setPhotoData(data);
      setPhotoStamp(data);
      await publicUploadPhoto(token, data);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Falha ao enviar a foto.'));
    } finally {
      setBusy(false);
    }
  };

  const submitOutcome = async () => {
    setBusy(true);
    setError(null);
    try {
      await publicSubmitOutcome(token, { happened, outcome, notes: notes.trim() || undefined });
      setDone(true);
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Falha ao concluir a visita.'));
    } finally {
      setBusy(false);
    }
  };

  const mapsHref = useMemo(() => {
    const c = visit?.church;
    if (!c) return '#';
    if (c.latitude != null && c.longitude != null) {
      return `https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}`;
    }
    const addr = [c.street, c.number, c.district, c.city].filter(Boolean).join(', ');
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
  }, [visit]);

  const checkinDone = Boolean(visit?.checkinAt) || (checkinInfo && !needsJustification);
  const photoDone = Boolean(visit?.hasPhoto) || Boolean(photoData);
  const requirePhoto = visit?.settings.requirePhoto ?? true;

  return (
    <div className="min-h-screen bg-[#0b1220] text-white px-4 py-6 flex flex-col items-center">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <div className="text-[11px] font-black uppercase tracking-widest opacity-50">{BRAND.publicHeader}</div>
          <h1 className="text-xl font-black mt-1">Visita à Igreja</h1>
        </div>

        {loading && <Card>Carregando…</Card>}

        {error && (
          <div className="px-4 py-3 rounded-2xl bg-red-500/15 text-red-300 text-sm font-semibold">{error}</div>
        )}

        {done && visit && (
          <Card className="text-center border-emerald-500/30 bg-emerald-500/10">
            <i className="fa-solid fa-circle-check text-emerald-400 text-4xl"></i>
            <h2 className="text-lg font-black mt-3">Visita registrada ✓</h2>
            <p className="text-sm opacity-70 mt-1">{visit.church.name}</p>
            <p className="text-xs opacity-50 mt-2">{VISIT_STATUS_LABEL[visit.status] ?? visit.status}</p>
          </Card>
        )}

        {!loading && !done && visit && (
          <>
            <Card>
              <div className="text-[11px] font-black uppercase tracking-widest opacity-40">
                Visita #{visit.visitNumber}
                {visit.church.zoneNumber ? ` · Zona ${visit.church.zoneNumber}` : ''}
              </div>
              <h2 className="text-lg font-black mt-1">{visit.church.name}</h2>
              {visit.church.denomination && <p className="text-sm opacity-60">{visit.church.denomination}</p>}
              <p className="text-sm opacity-80 mt-2">
                <i className="fa-solid fa-location-dot mr-2 opacity-60"></i>
                {[visit.church.street, visit.church.number].filter(Boolean).join(', ')}
                {visit.church.district ? ` — ${visit.church.district}` : ''}
              </p>
              {visit.scheduledDate && (
                <p className="text-sm opacity-70 mt-1">
                  <i className="fa-regular fa-calendar mr-2 opacity-60"></i>
                  {fmtDate(visit.scheduledDate)} {visit.scheduledStartTime ?? ''}
                </p>
              )}
              {visit.team && <p className="text-xs opacity-50 mt-1">Equipe: {visit.team.name}</p>}
              <div className="mt-4">
                <BigButton href={mapsHref} variant="ghost">
                  <i className="fa-solid fa-diamond-turn-right"></i> Abrir rota
                </BigButton>
              </div>
            </Card>

            {/* PASSO 1 — CHECK-IN */}
            <Card className={checkinDone ? 'border-emerald-500/30' : ''}>
              <div className="flex items-center justify-between">
                <h3 className="font-black">1. Check-in no local</h3>
                {checkinDone && <i className="fa-solid fa-circle-check text-emerald-400"></i>}
              </div>
              {!checkinDone && (
                <p className="text-xs opacity-60 mt-1">
                  Sua localização será registrada para comprovação desta visita.
                </p>
              )}

              {checkinInfo && (
                <div
                  className={`mt-3 text-sm rounded-2xl px-3 py-2 ${
                    checkinInfo.status === 'confirmado'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : checkinInfo.status === 'atencao'
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'bg-red-500/15 text-red-300'
                  }`}
                >
                  {checkinInfo.distance != null
                    ? `Você está a ~${checkinInfo.distance} m do endereço (raio ideal ${checkinInfo.radius} m).`
                    : 'Localização capturada (igreja sem coordenada cadastrada).'}
                </div>
              )}

              {needsJustification && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="Justifique o check-in fora do local (obrigatório)"
                    className="w-full rounded-2xl bg-white/10 border border-white/10 px-3 py-2 text-sm min-h-[72px]"
                  />
                  <BigButton
                    onClick={() => doCheckin(true)}
                    disabled={busy || justification.trim().length < 3}
                    variant="primary"
                  >
                    Enviar check-in com justificativa
                  </BigButton>
                  <BigButton onClick={() => doCheckin(false)} disabled={busy} variant="ghost">
                    <i className="fa-solid fa-rotate"></i> Tentar localização novamente
                  </BigButton>
                </div>
              )}

              {!checkinDone && !needsJustification && (
                <div className="mt-3">
                  <BigButton onClick={() => doCheckin(false)} disabled={busy}>
                    <i className="fa-solid fa-location-crosshairs"></i> {busy ? 'Capturando…' : 'Fazer check-in'}
                  </BigButton>
                </div>
              )}
            </Card>

            {/* PASSO 2 — FOTO */}
            {checkinDone && (
              <Card className={photoDone ? 'border-emerald-500/30' : ''}>
                <div className="flex items-center justify-between">
                  <h3 className="font-black">2. Foto do local {requirePhoto && <span className="text-red-400">*</span>}</h3>
                  {photoDone && <i className="fa-solid fa-circle-check text-emerald-400"></i>}
                </div>
                {photoStamp && (
                  <div className="relative mt-3 rounded-2xl overflow-hidden">
                    <img src={photoStamp} alt="Foto da visita" className="w-full block" />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/55 text-[10px] leading-tight p-2 font-mono">
                      <div className="font-black">VISITA REGISTRADA · #{visit.visitNumber}</div>
                      <div>{visit.church.name}{visit.church.zoneNumber ? ` · Zona ${visit.church.zoneNumber}` : ''}</div>
                      <div>{new Date().toLocaleString('pt-BR')}</div>
                      {lastCoords && (
                        <div>
                          GPS {lastCoords.lat.toFixed(5)}, {lastCoords.lng.toFixed(5)}
                          {checkinInfo?.distance != null ? ` · ${checkinInfo.distance} m` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={onPickPhoto}
                />
                <div className="mt-3">
                  <BigButton onClick={() => fileRef.current?.click()} disabled={busy} variant={photoDone ? 'ghost' : 'primary'}>
                    <i className="fa-solid fa-camera"></i> {photoDone ? 'Trocar foto' : 'Tirar foto do local'}
                  </BigButton>
                </div>
              </Card>
            )}

            {/* PASSO 3 — RESULTADO */}
            {checkinDone && (photoDone || !requirePhoto) && (
              <Card>
                <h3 className="font-black">3. Resultado da visita</h3>
                <label className="block text-xs opacity-60 mt-3 mb-1">A visita aconteceu?</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['sim', 'parcialmente', 'nao'] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setHappened(opt)}
                      className={`py-2 rounded-2xl text-sm font-bold capitalize ${
                        happened === opt ? 'bg-blue-600 text-white' : 'bg-white/10'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <label className="block text-xs opacity-60 mt-4 mb-1">Resultado</label>
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  className="w-full rounded-2xl bg-white/10 border border-white/10 px-3 py-2 text-sm"
                >
                  <option>recebido pelo pastor/líder</option>
                  <option>recebido por representante</option>
                  <option>igreja fechada</option>
                  <option>responsável ausente</option>
                  <option>endereço incorreto</option>
                  <option>visita reagendada</option>
                  <option>outro</option>
                </select>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observações (opcional)"
                  className="w-full rounded-2xl bg-white/10 border border-white/10 px-3 py-2 text-sm min-h-[64px] mt-3"
                />
                <div className="mt-4">
                  <BigButton onClick={submitOutcome} disabled={busy} variant="success">
                    <i className="fa-solid fa-flag-checkered"></i> Concluir visita
                  </BigButton>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PublicVisit;
