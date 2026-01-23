import React, { useMemo, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import type { FeatureCollection, Geometry } from 'geojson';
import { Supporter } from '../types';
import spGeo from '../data/sp.geo.json';

interface Marker {
  name: string;
  count: number;
  x: number;
  y: number;
}

interface Props {
  supporters: Supporter[];
  onSelectSupporter: (s: Supporter) => void;
}

const VIEWBOX = { width: 800, height: 600, padding: 40 };
const GEO_DATA = spGeo as FeatureCollection<Geometry>;

const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  'São Paulo': { lat: -23.5506507, lon: -46.6333824 },
  'Guarulhos': { lat: -23.4675941, lon: -46.5277704 },
  'Osasco': { lat: -23.5324859, lon: -46.7916801 },
  'Santo André': { lat: -23.6533509, lon: -46.5279039 },
  'São Bernardo do Campo': { lat: -23.7080345, lon: -46.5506747 },
  'Santos': { lat: -23.9335988, lon: -46.3286399 },
  'Campinas': { lat: -22.9056391, lon: -47.059564 },
  'Sorocaba': { lat: -23.5003451, lon: -47.4582864 },
  'São José dos Campos': { lat: -23.1867782, lon: -45.8854538 },
  'Ribeirão Preto': { lat: -21.1776315, lon: -47.8100983 },
  'Bauru': { lat: -22.3218102, lon: -49.0705863 },
  'Marília': { lat: -22.2172002, lon: -49.9500061 },
  'Presidente Prudente': { lat: -22.1225167, lon: -51.3882528 },
  'São José do Rio Preto': { lat: -20.8125851, lon: -49.3804212 },
  'Araçatuba': { lat: -21.207992, lon: -50.4390225 },
  'Botucatu': { lat: -22.8879628, lon: -48.4410712 },
  'Jundiaí': { lat: -23.1887668, lon: -46.884506 },
  'Piracicaba': { lat: -22.725165, lon: -47.6493269 },
  'Taubaté': { lat: -23.031448, lon: -45.5612792 },
  'Praia Grande': { lat: -24.008979, lon: -46.4144939 },
  'Guarujá': { lat: -23.9927768, lon: -46.2558332 },
  'Mogi das Cruzes': { lat: -23.5234284, lon: -46.1926671 },
  'Jacareí': { lat: -23.3050682, lon: -45.9723075 },
  'Limeira': { lat: -22.5615068, lon: -47.401766 }
};

const hashToPoint = (name: string) => {
  const bounds = {
    xMin: VIEWBOX.padding,
    xMax: VIEWBOX.width - VIEWBOX.padding,
    yMin: VIEWBOX.padding,
    yMax: VIEWBOX.height - VIEWBOX.padding
  };
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 100000;
  }
  const x = bounds.xMin + (hash % Math.max(1, bounds.xMax - bounds.xMin));
  const y = bounds.yMin + (Math.floor(hash / 7) % Math.max(1, bounds.yMax - bounds.yMin));
  return { x, y };
};

const MapView: React.FC<Props> = ({ supporters, onSelectSupporter }) => {
  const [selectedMunicipality, setSelectedMunicipality] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const projection = useMemo(() => {
    return geoMercator().fitExtent(
      [
        [VIEWBOX.padding, VIEWBOX.padding],
        [VIEWBOX.width - VIEWBOX.padding, VIEWBOX.height - VIEWBOX.padding]
      ],
      GEO_DATA
    );
  }, []);

  const pathGenerator = useMemo(() => geoPath(projection), [projection]);
  const mapPath = useMemo(() => pathGenerator(GEO_DATA) || '', [pathGenerator]);

  const projectLatLon = (lat: number, lon: number) => {
    const point = projection([lon, lat]);
    if (!point) return null;
    return { x: point[0], y: point[1] };
  };

  const municipalityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    supporters.forEach((s) => {
      const name = (s.notes || '').trim() || 'Não informado';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [supporters]);

  const markers = useMemo(() => {
    return municipalityCounts.map((item) => {
      const coords = CITY_COORDS[item.name];
      const projected = coords ? projectLatLon(coords.lat, coords.lon) : null;
      const point = projected ?? hashToPoint(item.name);
      return { ...item, ...point } as Marker;
    });
  }, [municipalityCounts, projection]);

  const selectedSupporters = useMemo(() => {
    if (!selectedMunicipality) {
      return supporters.slice(0, 6);
    }
    return supporters.filter((s) => (s.notes || '').trim() === selectedMunicipality);
  }, [supporters, selectedMunicipality]);

  const topMunicipalities = municipalityCounts.slice(0, 6);
  const totalSupporters = supporters.length;
  const hasSelection = Boolean(selectedMunicipality);

  return (
    <div className="h-full min-h-0 flex flex-col gap-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Visualização do Estado</p>
          <h2 className="text-3xl font-black">Mapa de Apoiadores SP</h2>
        </div>
        {selectedMunicipality && (
          <div className="flex items-center gap-4 animate-soft-pop">
            <div className="text-right">
              <p className="text-sm font-black uppercase tracking-widest opacity-40">Cidade selecionada</p>
              <p className="text-xl font-black text-blue-700 dark:text-blue-300 leading-none">
                {selectedMunicipality}
              </p>
              <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mt-1">
                {selectedSupporters.length} cadastrados
              </p>
            </div>
            <button
              onClick={() => setSelectedMunicipality(null)}
              className="text-xs font-black uppercase text-blue-600"
            >
              Limpar filtro
            </button>
          </div>
        )}
      </div>

      <div
        className={`grid grid-cols-1 gap-4 flex-1 min-h-0 ${
          hasSelection
            ? 'lg:grid-cols-[1.4fr_1.6fr] xl:grid-cols-[1.2fr_1.8fr]'
            : 'lg:grid-cols-[3fr_1fr] xl:grid-cols-[3.5fr_1fr]'
        } transition-all duration-700 ease-out`}
      >
        <div className="bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-gray-950 p-6 rounded-[2rem] border dark:border-gray-800 shadow-sm relative overflow-hidden flex flex-col min-h-0 transition-all duration-700 ease-out">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_60%)]" />
          <div className="relative flex-1 min-h-0 flex flex-col transition-all duration-700 ease-out">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Total na Rede</p>
                <p className="text-3xl font-black text-blue-700 dark:text-blue-400">{totalSupporters}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Municípios Ativos</p>
                <p className="text-xl font-black">{municipalityCounts.length}</p>
              </div>
            </div>

            <div className="relative w-full flex-1 min-h-0 transition-all duration-700 ease-out">
              <svg
                viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
                preserveAspectRatio="xMidYMid meet"
                className="w-full h-full"
              >
                <defs>
                  <linearGradient id="sp-fill" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity="0.08" />
                  </linearGradient>
                  <filter id="marker-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <clipPath id="sp-clip">
                    <path d={mapPath} />
                  </clipPath>
                </defs>

                <path
                  d={mapPath}
                  fill="url(#sp-fill)"
                  stroke="#3B82F6"
                  strokeOpacity="0.4"
                  strokeWidth="1.8"
                  vectorEffect="non-scaling-stroke"
                  className="transition-all duration-700 ease-out"
                />

                <g clipPath="url(#sp-clip)">
                  {markers.map((marker) => {
                    const size = Math.max(6, Math.min(22, 6 + marker.count * 1.8));
                    const isActive = selectedMunicipality === marker.name || hovered === marker.name;
                    const isHidden = hasSelection && marker.name !== selectedMunicipality;
                    return (
                      <g
                        key={marker.name}
                        onMouseEnter={() => setHovered(marker.name)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => setSelectedMunicipality(marker.name)}
                        className="cursor-pointer transition-all duration-500 ease-out"
                        style={{
                          opacity: isHidden ? 0 : 1,
                          transform: isHidden ? 'scale(0.9)' : 'scale(1)',
                          transformOrigin: 'center',
                          transformBox: 'fill-box',
                          pointerEvents: isHidden ? 'none' : 'auto'
                        }}
                      >
                        <circle
                          cx={marker.x}
                          cy={marker.y}
                          r={size}
                          fill={isActive ? '#1D4ED8' : '#60A5FA'}
                          opacity={isActive ? 0.95 : 0.6}
                          filter="url(#marker-glow)"
                          style={{ transition: 'r 320ms ease, opacity 320ms ease, fill 320ms ease' }}
                        />
                        <circle
                          cx={marker.x}
                          cy={marker.y}
                          r={Math.max(3, size * 0.45)}
                          fill="#EFF6FF"
                          opacity={0.9}
                          style={{ transition: 'r 320ms ease, opacity 320ms ease' }}
                        />
                      </g>
                    );
                  })}
                </g>

                {hovered && (
                  <text x="40" y="560" className="fill-blue-700 text-[16px] font-black">
                    {hovered}
                  </text>
                )}
              </svg>
            </div>
          </div>
        </div>

        <div className={`space-y-4 h-full flex flex-col min-h-0 transition-all duration-700 ease-out ${hasSelection ? 'lg:pr-4' : ''}`}>
          {!hasSelection && (
            <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] border dark:border-gray-700 shadow-sm flex-1 min-h-0 animate-soft-pop">
              <h3 className="text-sm font-black uppercase tracking-widest opacity-40 mb-3">Top Municípios</h3>
              <div className="space-y-3">
                {topMunicipalities.map((city, index) => (
                  <button
                    key={city.name}
                    onClick={() => setSelectedMunicipality(city.name)}
                    className="w-full flex items-center justify-between text-left transition-transform duration-300 ease-out hover:-translate-y-0.5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-2xl bg-blue-600 text-white text-xs font-black flex items-center justify-center">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-black text-sm">{city.name}</p>
                        <p className="text-[10px] opacity-40 font-bold uppercase">Município</p>
                      </div>
                    </div>
                    <span className="text-sm font-black text-blue-600">{city.count}</span>
                  </button>
                ))}
                {topMunicipalities.length === 0 && (
                  <p className="text-xs opacity-40">Nenhum dado disponível.</p>
                )}
              </div>
            </div>
          )}

          <div
            className={`bg-white dark:bg-gray-800 p-5 rounded-[2rem] border dark:border-gray-700 shadow-sm flex-1 min-h-0 ${
              hasSelection ? 'ring-2 ring-blue-100 dark:ring-blue-500/20' : ''
            } transition-all duration-700 ease-out`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black uppercase tracking-widest opacity-40">
                {selectedMunicipality ? `Apoiadores em ${selectedMunicipality}` : 'Últimos cadastrados'}
              </h3>
              {selectedMunicipality && (
                <span className="text-xs font-black text-blue-600 animate-soft-pop">{selectedSupporters.length}</span>
              )}
            </div>
            <div className="space-y-2">
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
                    <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 font-black flex items-center justify-center">
                      {supporter.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm truncate">{supporter.name}</p>
                      <p className="text-[10px] opacity-40 font-bold uppercase truncate">{supporter.church}</p>
                    </div>
                    <span className="text-[10px] font-black uppercase text-blue-600">
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

