import React, { useEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { Supporter } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos & constantes
// ─────────────────────────────────────────────────────────────────────────────

interface MunicipalityProps {
  id: string;
  name: string;
  description?: string;
}

type MunicipalityFeature = Feature<Geometry, MunicipalityProps>;
type MunicipalityCollection = FeatureCollection<Geometry, MunicipalityProps>;

interface Props {
  supporters: Supporter[];
  onSelectSupporter: (s: Supporter) => void;
}

const VIEWBOX = { width: 900, height: 640, padding: 30 };

// Paleta — escala azul → ouro conforme densidade
const COLOR_EMPTY = 'rgba(122, 159, 212, 0.08)';
const COLOR_LOW = 'rgba(96, 145, 217, 0.55)';
const COLOR_MID = 'rgba(78, 132, 213, 0.78)';
const COLOR_HIGH = 'rgba(201, 168, 76, 0.88)';
const COLOR_PEAK = 'rgba(232, 187, 64, 1)';

const STROKE_BASE = 'rgba(13, 31, 78, 0.22)';
const STROKE_HOVER = 'rgba(232, 187, 64, 0.95)';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Mapeia count → cor. Usa escala log-like para realçar diferenças. */
const colorForCount = (count: number, max: number): string => {
  if (count <= 0) return COLOR_EMPTY;
  if (max <= 1) return COLOR_LOW;
  // log-ish ratio (suaviza outliers)
  const ratio = Math.log(count + 1) / Math.log(max + 1);
  if (ratio < 0.2) return COLOR_LOW;
  if (ratio < 0.5) return COLOR_MID;
  if (ratio < 0.8) return COLOR_HIGH;
  return COLOR_PEAK;
};

/** Animação simples de count-up para os números do header. */
const useCountUp = (target: number, duration = 900) => {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;
    let raf = 0;
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(fromRef.current + (target - fromRef.current) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const MapView: React.FC<Props> = ({ supporters, onSelectSupporter }) => {
  const [geoData, setGeoData] = useState<MunicipalityCollection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; count: number } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Lazy-load do GeoJSON dos 645 municípios (~1.9MB → gzip ~600KB)
  useEffect(() => {
    let cancelled = false;
    import('../data/sp-municipios.geo.json')
      .then((mod) => {
        if (!cancelled) setGeoData(mod.default as MunicipalityCollection);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message ?? 'Falha ao carregar mapa.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Projeção e gerador de path — recalculados quando o GeoJSON chega
  const projection = useMemo(() => {
    if (!geoData) return null;
    return geoMercator().fitExtent(
      [
        [VIEWBOX.padding, VIEWBOX.padding],
        [VIEWBOX.width - VIEWBOX.padding, VIEWBOX.height - VIEWBOX.padding]
      ],
      geoData
    );
  }, [geoData]);

  const pathGen = useMemo(() => (projection ? geoPath(projection) : null), [projection]);

  // Contagem por nome de município (normalizado)
  const countsByNorm = useMemo(() => {
    const m = new Map<string, number>();
    supporters.forEach((s) => {
      const raw = (s.notes || '').trim();
      if (!raw) return;
      const key = normalize(raw);
      m.set(key, (m.get(key) ?? 0) + 1);
    });
    return m;
  }, [supporters]);

  // Lista ordenada por count (para painel lateral) — usa nome oficial do GeoJSON quando casa
  const ranking = useMemo(() => {
    if (!geoData) {
      // fallback: usa nomes brutos das notes
      const m = new Map<string, number>();
      supporters.forEach((s) => {
        const name = (s.notes || '').trim() || 'Não informado';
        m.set(name, (m.get(name) ?? 0) + 1);
      });
      return Array.from(m.entries())
        .map(([name, count]) => ({ id: normalize(name), name, count }))
        .sort((a, b) => b.count - a.count);
    }
    const items: { id: string; name: string; count: number }[] = [];
    geoData.features.forEach((f) => {
      const norm = normalize(f.properties.name);
      const count = countsByNorm.get(norm) ?? 0;
      if (count > 0) {
        items.push({ id: f.properties.id, name: f.properties.name, count });
      }
    });
    return items.sort((a, b) => b.count - a.count);
  }, [geoData, countsByNorm, supporters]);

  const maxCount = useMemo(() => ranking.reduce((m, r) => Math.max(m, r.count), 0), [ranking]);

  // Centroides dos municípios com pelo menos 1 apoiador (para pulse markers)
  const activeMarkers = useMemo(() => {
    if (!geoData || !pathGen) return [];
    return geoData.features
      .map((f) => {
        const norm = normalize(f.properties.name);
        const count = countsByNorm.get(norm) ?? 0;
        if (count === 0) return null;
        const c = pathGen.centroid(f);
        if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
        return { id: f.properties.id, name: f.properties.name, count, x: c[0], y: c[1] };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.count - b.count); // maiores ficam por cima
  }, [geoData, pathGen, countsByNorm]);

  // Município selecionado
  const selectedFeature = useMemo(() => {
    if (!geoData || !selectedId) return null;
    return geoData.features.find((f) => f.properties.id === selectedId) ?? null;
  }, [geoData, selectedId]);

  const selectedName = selectedFeature?.properties.name ?? null;

  const selectedSupporters = useMemo(() => {
    if (!selectedName) return supporters.slice(0, 8);
    const target = normalize(selectedName);
    return supporters.filter((s) => normalize((s.notes || '').trim()) === target);
  }, [supporters, selectedName]);

  const totalSupporters = supporters.length;
  const animatedTotal = useCountUp(totalSupporters);
  const animatedActive = useCountUp(ranking.length);

  const hasSelection = Boolean(selectedId);

  // Tooltip handler
  const handleMouseMove = (e: React.MouseEvent, name: string, count: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      name,
      count
    });
  };

  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div className="md:h-full min-h-0 flex flex-col gap-4 animate-fade-up">
      {/* HEADER ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Mapa político de São Paulo</p>
          <h2 className="text-2xl sm:text-3xl font-black">Apoiadores por Município</h2>
        </div>
        {selectedName && (
          <div className="flex items-center gap-4 animate-soft-pop">
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Cidade selecionada</p>
              <p className="text-xl font-black text-blue-700 dark:text-blue-300 leading-none">{selectedName}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600 mt-1">
                {selectedSupporters.length} cadastrados
              </p>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className="text-xs font-black uppercase text-blue-600 hover:text-blue-800 transition-colors"
            >
              Limpar filtro
            </button>
          </div>
        )}
      </div>

      <div
        className={`grid grid-cols-1 gap-4 md:flex-1 md:min-h-0 ${
          hasSelection
            ? 'lg:grid-cols-[1.4fr_1.6fr] xl:grid-cols-[1.2fr_1.8fr]'
            : 'lg:grid-cols-[3fr_1fr] xl:grid-cols-[3.5fr_1fr]'
        } transition-all duration-700 ease-out`}
      >
        {/* MAPA ──────────────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-[#0a1530] p-4 sm:p-6 rounded-[2rem] border dark:border-gray-800 shadow-sm relative overflow-hidden flex flex-col min-h-[55dvh] md:min-h-0">
          {/* glow ambiente */}
          <div className="theme-map-glow absolute inset-0 pointer-events-none" />
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.18] dark:opacity-[0.08]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(122,159,212,0.6) 1px, transparent 0)',
              backgroundSize: '22px 22px'
            }}
          />

          <div className="relative flex-1 min-h-0 flex flex-col">
            {/* stats topo */}
            <div className="flex items-center justify-between mb-4 z-10">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Total na rede</p>
                <p className="text-4xl font-black text-blue-700 dark:text-blue-300 tabular-nums">
                  {animatedTotal}
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Municípios ativos</p>
                  <p className="text-2xl font-black text-amber-600 dark:text-amber-400 tabular-nums">
                    {animatedActive}
                    <span className="text-xs font-bold opacity-40 ml-1">/ 645</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Loading / erro */}
            {!geoData && !loadError && (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 opacity-60">
                  <i className="fa-solid fa-circle-notch fa-spin text-3xl text-blue-500"></i>
                  <p className="text-xs font-black uppercase tracking-widest">Carregando mapa político de SP...</p>
                </div>
              </div>
            )}
            {loadError && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-red-500 font-semibold">Erro ao carregar mapa: {loadError}</p>
              </div>
            )}

            {/* SVG ────────────────────────────────────────────────────────── */}
            {geoData && pathGen && (
              <div className="relative w-full flex-1 min-h-0">
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
                  preserveAspectRatio="xMidYMid meet"
                  className="w-full h-full"
                  onMouseLeave={() => {
                    setHoverId(null);
                    setTooltip(null);
                  }}
                >
                  <defs>
                    {/* glow para os marcadores */}
                    <filter id="marker-glow" x="-100%" y="-100%" width="300%" height="300%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    {/* glow forte para halos pulsantes */}
                    <filter id="pulse-glow" x="-200%" y="-200%" width="500%" height="500%">
                      <feGaussianBlur stdDeviation="8" />
                    </filter>
                    {/* gradiente do destaque selecionado */}
                    <radialGradient id="selected-grad" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#fde68a" stopOpacity="0.95" />
                      <stop offset="100%" stopColor="#c9a84c" stopOpacity="0.55" />
                    </radialGradient>
                    {/* drop-shadow nos polígonos com apoiadores */}
                    <filter id="poly-shadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
                      <feOffset dx="0" dy="1" result="offset" />
                      <feComponentTransfer>
                        <feFuncA type="linear" slope="0.4" />
                      </feComponentTransfer>
                      <feMerge>
                        <feMergeNode />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* CSS de animação dentro do SVG */}
                  <style>{`
                    @keyframes mv-pulse {
                      0%   { transform: scale(0.6); opacity: 0.85; }
                      80%  { transform: scale(2.4); opacity: 0; }
                      100% { transform: scale(2.4); opacity: 0; }
                    }
                    @keyframes mv-breathe {
                      0%, 100% { opacity: 0.85; }
                      50%      { opacity: 1; }
                    }
                    .mv-pulse-ring {
                      transform-origin: center;
                      transform-box: fill-box;
                      animation: mv-pulse 2.4s ease-out infinite;
                    }
                    .mv-pulse-ring.delay-1 { animation-delay: 0.8s; }
                    .mv-pulse-ring.delay-2 { animation-delay: 1.6s; }
                    .mv-marker-core {
                      animation: mv-breathe 2.4s ease-in-out infinite;
                    }
                  `}</style>

                  {/* POLÍGONOS DOS MUNICÍPIOS ──────────────────────────────── */}
                  <g>
                    {geoData.features.map((feature) => {
                      const id = feature.properties.id;
                      const name = feature.properties.name;
                      const norm = normalize(name);
                      const count = countsByNorm.get(norm) ?? 0;
                      const d = pathGen(feature) || '';
                      const isHover = hoverId === id;
                      const isSelected = selectedId === id;
                      const dimmed = hasSelection && !isSelected;

                      const fill = isSelected
                        ? 'url(#selected-grad)'
                        : colorForCount(count, maxCount);

                      const stroke = isHover || isSelected ? STROKE_HOVER : STROKE_BASE;
                      const strokeWidth = isSelected ? 2.2 : isHover ? 1.6 : 0.55;

                      return (
                        <path
                          key={id}
                          d={d}
                          fill={fill}
                          stroke={stroke}
                          strokeWidth={strokeWidth}
                          vectorEffect="non-scaling-stroke"
                          opacity={dimmed ? 0.35 : 1}
                          style={{
                            transition:
                              'fill 320ms ease, stroke 200ms ease, opacity 320ms ease, stroke-width 160ms ease',
                            cursor: count > 0 || isSelected ? 'pointer' : 'default'
                          }}
                          onMouseEnter={() => setHoverId(id)}
                          onMouseMove={(e) => handleMouseMove(e, name, count)}
                          onClick={() => {
                            if (count > 0 || isSelected) {
                              setSelectedId((prev) => (prev === id ? null : id));
                            }
                          }}
                          filter={count > 0 ? 'url(#poly-shadow)' : undefined}
                        />
                      );
                    })}
                  </g>

                  {/* HALOS PULSANTES nos municípios com apoiadores ──────────── */}
                  <g style={{ pointerEvents: 'none' }}>
                    {activeMarkers.map((m) => {
                      const isSelected = selectedId === m.id;
                      const dimmed = hasSelection && !isSelected;
                      const baseR = Math.max(4, Math.min(14, 4 + Math.log(m.count + 1) * 3.2));
                      const color = isSelected
                        ? '#fbbf24'
                        : m.count >= Math.max(5, maxCount * 0.6)
                          ? '#e8bb40'
                          : '#7AB8E8';

                      return (
                        <g
                          key={m.id}
                          opacity={dimmed ? 0.25 : 1}
                          style={{ transition: 'opacity 400ms ease' }}
                        >
                          {/* anéis pulsantes (3 com defasagem) */}
                          <circle
                            cx={m.x}
                            cy={m.y}
                            r={baseR}
                            fill="none"
                            stroke={color}
                            strokeWidth="1.5"
                            opacity="0"
                            className="mv-pulse-ring"
                          />
                          <circle
                            cx={m.x}
                            cy={m.y}
                            r={baseR}
                            fill="none"
                            stroke={color}
                            strokeWidth="1.5"
                            opacity="0"
                            className="mv-pulse-ring delay-1"
                          />
                          <circle
                            cx={m.x}
                            cy={m.y}
                            r={baseR}
                            fill="none"
                            stroke={color}
                            strokeWidth="1.5"
                            opacity="0"
                            className="mv-pulse-ring delay-2"
                          />
                          {/* halo blur */}
                          <circle
                            cx={m.x}
                            cy={m.y}
                            r={baseR * 1.15}
                            fill={color}
                            opacity="0.35"
                            filter="url(#pulse-glow)"
                          />
                          {/* núcleo */}
                          <circle
                            cx={m.x}
                            cy={m.y}
                            r={baseR * 0.55}
                            fill={color}
                            className="mv-marker-core"
                            filter="url(#marker-glow)"
                          />
                          <circle
                            cx={m.x}
                            cy={m.y}
                            r={baseR * 0.28}
                            fill="#ffffff"
                            opacity="0.9"
                          />
                        </g>
                      );
                    })}
                  </g>

                  {/* MARCADOR DE SELEÇÃO (destaque extra) ──────────────────── */}
                  {selectedFeature && pathGen && (() => {
                    const c = pathGen.centroid(selectedFeature);
                    if (!Number.isFinite(c[0])) return null;
                    return (
                      <g style={{ pointerEvents: 'none' }}>
                        <circle
                          cx={c[0]}
                          cy={c[1]}
                          r="22"
                          fill="none"
                          stroke="#fbbf24"
                          strokeWidth="2"
                          opacity="0.7"
                          className="mv-pulse-ring"
                        />
                      </g>
                    );
                  })()}
                </svg>

                {/* TOOLTIP ───────────────────────────────────────────────── */}
                {tooltip && (
                  <div
                    className="pointer-events-none absolute z-20 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-2xl px-3 py-2 shadow-xl border border-blue-100 dark:border-blue-500/30 text-xs whitespace-nowrap"
                    style={{
                      left: tooltip.x + 14,
                      top: tooltip.y + 14,
                      transform: tooltip.x > VIEWBOX.width * 0.7 ? 'translateX(-110%)' : undefined
                    }}
                  >
                    <p className="font-black text-sm leading-tight">{tooltip.name}</p>
                    <p
                      className={`text-[10px] font-black uppercase tracking-widest mt-0.5 ${
                        tooltip.count > 0 ? 'text-blue-600 dark:text-blue-400' : 'opacity-40'
                      }`}
                    >
                      {tooltip.count > 0
                        ? `${tooltip.count} ${tooltip.count === 1 ? 'apoiador' : 'apoiadores'}`
                        : 'Sem cadastro'}
                    </p>
                  </div>
                )}

                {/* LEGENDA ───────────────────────────────────────────────── */}
                <div className="absolute bottom-2 left-2 bg-white/85 dark:bg-gray-900/85 backdrop-blur-sm rounded-2xl px-3 py-2 border dark:border-gray-700 text-[9px] font-black uppercase tracking-widest opacity-90">
                  <p className="opacity-50 mb-1">Densidade</p>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded" style={{ background: COLOR_EMPTY }} />
                    <span className="w-3 h-3 rounded" style={{ background: COLOR_LOW }} />
                    <span className="w-3 h-3 rounded" style={{ background: COLOR_MID }} />
                    <span className="w-3 h-3 rounded" style={{ background: COLOR_HIGH }} />
                    <span className="w-3 h-3 rounded" style={{ background: COLOR_PEAK }} />
                  </div>
                  <div className="flex items-center justify-between mt-0.5 opacity-60">
                    <span>—</span>
                    <span>+</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* PAINEL LATERAL ─────────────────────────────────────────────────── */}
        <div
          className={`space-y-4 md:h-full flex flex-col md:min-h-0 transition-all duration-700 ease-out ${
            hasSelection ? 'lg:pr-4' : ''
          }`}
        >
          {!hasSelection && (
            <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] border dark:border-gray-700 shadow-sm md:flex-1 md:min-h-0 animate-soft-pop flex flex-col md:overflow-hidden">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <h3 className="text-sm font-black uppercase tracking-widest opacity-40">Top Municípios</h3>
                <span className="text-[10px] font-black uppercase opacity-40">{ranking.length}</span>
              </div>
              <div className="space-y-2 md:overflow-y-auto md:min-h-0 md:flex-1">
                {ranking.slice(0, 12).map((city, index) => {
                  const pct = maxCount > 0 ? (city.count / maxCount) * 100 : 0;
                  return (
                    <button
                      key={city.id}
                      onClick={() => setSelectedId(city.id)}
                      className="w-full text-left transition-transform duration-300 ease-out hover:-translate-y-0.5 group"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-2xl text-white text-xs font-black flex items-center justify-center shrink-0 ${
                            index === 0
                              ? 'bg-gradient-to-br from-amber-400 to-amber-600'
                              : index === 1
                                ? 'bg-gradient-to-br from-slate-400 to-slate-600'
                                : index === 2
                                  ? 'bg-gradient-to-br from-orange-400 to-orange-600'
                                  : 'bg-blue-600'
                          }`}
                        >
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-sm truncate group-hover:text-blue-600 transition-colors">
                            {city.name}
                          </p>
                          <div className="h-1 mt-1 bg-blue-50 dark:bg-blue-500/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-amber-400 rounded-full transition-all duration-700 ease-out"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-sm font-black text-blue-600 tabular-nums shrink-0">
                          {city.count}
                        </span>
                      </div>
                    </button>
                  );
                })}
                {ranking.length === 0 && (
                  <p className="text-xs opacity-40">Nenhum dado disponível.</p>
                )}
              </div>
            </div>
          )}

          <div
            className={`bg-white dark:bg-gray-800 p-5 rounded-[2rem] border dark:border-gray-700 shadow-sm md:flex-1 md:min-h-0 flex flex-col md:overflow-hidden ${
              hasSelection ? 'ring-2 ring-blue-100 dark:ring-blue-500/20' : ''
            } transition-all duration-700 ease-out`}
          >
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h3 className="text-sm font-black uppercase tracking-widest opacity-40">
                {selectedName ? `Apoiadores em ${selectedName}` : 'Últimos cadastrados'}
              </h3>
              {selectedName && (
                <span className="text-xs font-black text-blue-600 animate-soft-pop">
                  {selectedSupporters.length}
                </span>
              )}
            </div>
            <div className="space-y-2 md:overflow-y-auto md:min-h-0 md:flex-1">
              {selectedSupporters.length > 0 ? (
                selectedSupporters.map((supporter) => (
                  <button
                    key={supporter.id}
                    onClick={() => onSelectSupporter(supporter)}
                    className={`w-full flex items-center gap-3 text-left rounded-2xl px-3 py-2 transition-all ${
                      hasSelection
                        ? 'bg-blue-50/70 dark:bg-blue-500/10 hover:bg-blue-100/70 hover:-translate-y-0.5'
                        : 'hover:bg-blue-50 dark:hover:bg-gray-700/60 hover:-translate-y-0.5'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-black flex items-center justify-center shrink-0">
                      {supporter.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm truncate">{supporter.name}</p>
                      <p className="text-[10px] opacity-40 font-bold uppercase truncate">
                        {supporter.church}
                      </p>
                    </div>
                    <span className="text-[10px] font-black uppercase text-blue-600 shrink-0">
                      {supporter.notes || 'SP'}
                    </span>
                  </button>
                ))
              ) : (
                <p className="text-xs opacity-40">Nenhum apoiador para este município.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapView;
