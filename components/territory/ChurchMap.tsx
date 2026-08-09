import React, { useMemo, useState } from 'react';
import { ElectoralZone, TerritoryChurch } from '../../territoryTypes';

interface Props {
  churches: TerritoryChurch[];
  zones: ElectoralZone[];
  onSelect?: (church: TerritoryChurch) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  activeZone?: string | null;
  onZoneClick?: (zoneNumber: string | null) => void;
}

const W = 900;
const H = 620;
const PAD = 40;

// Mapa de pontos das igrejas por Zona Eleitoral. Projeção linear com correção de
// aspecto por latitude — suficiente na escala de um município. Sem tiles/dependências
// externas (o motorista usa apps de mapa externos para navegar).
const ChurchMap: React.FC<Props> = ({ churches, zones, onSelect, selectedIds, onToggleSelect, activeZone, onZoneClick }) => {
  const [hover, setHover] = useState<TerritoryChurch | null>(null);
  const withCoords = useMemo(() => churches.filter((c) => c.latitude != null && c.longitude != null), [churches]);

  const project = useMemo(() => {
    if (!withCoords.length) return null;
    const lats = withCoords.map((c) => c.latitude as number);
    const lngs = withCoords.map((c) => c.longitude as number);
    let minLat = Math.min(...lats), maxLat = Math.max(...lats);
    let minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    // margem mínima para não colar nas bordas quando há poucos pontos
    const padLat = Math.max((maxLat - minLat) * 0.08, 0.004);
    const padLng = Math.max((maxLng - minLng) * 0.08, 0.004);
    minLat -= padLat; maxLat += padLat; minLng -= padLng; maxLng += padLng;
    const centerLat = (minLat + maxLat) / 2;
    const cos = Math.cos((centerLat * Math.PI) / 180) || 1;
    const spanLng = (maxLng - minLng) * cos;
    const spanLat = maxLat - minLat;
    const scale = Math.min((W - PAD * 2) / spanLng, (H - PAD * 2) / spanLat);
    const drawW = spanLng * scale;
    const drawH = spanLat * scale;
    const offX = (W - drawW) / 2;
    const offY = (H - drawH) / 2;
    return (lat: number, lng: number) => ({
      x: offX + (lng - minLng) * cos * scale,
      y: offY + (maxLat - lat) * scale,
    });
  }, [withCoords]);

  const zoneColor = (num: string | null) => zones.find((z) => z.number === num)?.color ?? '#94a3b8';

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2 mb-3">
        {zones.map((z) => (
          <button
            key={z.id}
            onClick={() => onZoneClick?.(activeZone === z.number ? null : z.number)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
              activeZone && activeZone !== z.number ? 'opacity-30' : ''
            }`}
            style={{ background: `${z.color}22`, color: z.color ?? undefined }}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: z.color ?? '#94a3b8' }} />
            Zona {z.number}
          </button>
        ))}
      </div>

      {!project ? (
        <div className="rounded-3xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center text-sm opacity-60">
          Nenhuma igreja com coordenada ainda. Geocodifique/edite as igrejas para vê-las no mapa.
        </div>
      ) : (
        <div className="relative rounded-3xl overflow-hidden bg-slate-100 dark:bg-slate-900/50 border border-gray-200 dark:border-gray-800">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
            {withCoords.map((c) => {
              const p = project(c.latitude as number, c.longitude as number);
              const selected = selectedIds?.has(c.id);
              const dim = activeZone && c.zoneNumber !== activeZone;
              return (
                <g
                  key={c.id}
                  transform={`translate(${p.x},${p.y})`}
                  onMouseEnter={() => setHover(c)}
                  onMouseLeave={() => setHover((h) => (h?.id === c.id ? null : h))}
                  onClick={() => (onToggleSelect ? onToggleSelect(c.id) : onSelect?.(c))}
                  className="cursor-pointer"
                  opacity={dim ? 0.2 : 1}
                >
                  <circle
                    r={selected ? 9 : 6}
                    fill={zoneColor(c.zoneNumber)}
                    stroke={selected ? '#fff' : c.zoneRequiresReview ? '#f59e0b' : 'rgba(0,0,0,0.3)'}
                    strokeWidth={selected ? 3 : c.zoneRequiresReview ? 2 : 1}
                  />
                </g>
              );
            })}
          </svg>
          {hover && (
            <div className="absolute top-3 left-3 bg-black/80 text-white text-xs rounded-xl px-3 py-2 max-w-[70%] pointer-events-none">
              <div className="font-black">{hover.name}</div>
              <div className="opacity-70">
                {hover.district ?? '—'} {hover.zoneNumber ? `· Zona ${hover.zoneNumber}` : '· sem zona'}
              </div>
              {hover.currentTeamName && <div className="opacity-50">Equipe: {hover.currentTeamName}</div>}
            </div>
          )}
          <div className="absolute bottom-2 right-3 text-[10px] opacity-50">
            {withCoords.length} de {churches.length} com coordenada
          </div>
        </div>
      )}
    </div>
  );
};

export default ChurchMap;
