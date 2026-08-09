// Utilidades geográficas SEM PostGIS. A distância do check-in até a igreja é
// calculada por Haversine em código; suficiente para geofence de dezenas a
// centenas de metros.

const EARTH_RADIUS_M = 6371000;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Distância em metros entre dois pontos (lat/lng em graus). */
export const haversineMeters = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
};

export type GeofenceStatus = 'confirmado' | 'atencao' | 'fora' | 'sem_referencia';

export interface GeofenceConfig {
  radiusMeters: number; // ideal (ex.: 100)
  warnMeters: number; // aceitável (ex.: 200)
}

/**
 * Classifica o check-in considerando distância E precisão do GPS. Não bloqueia
 * automaticamente: um GPS impreciso (accuracy alta) que "estoura" o raio é
 * tratado como atenção, não como fora — cabe à revisão administrativa decidir.
 */
export const classifyGeofence = (
  distanceMeters: number | null,
  accuracyMeters: number | null,
  cfg: GeofenceConfig
): GeofenceStatus => {
  if (distanceMeters == null) return 'sem_referencia';

  // Margem de tolerância: parte da imprecisão do próprio GPS entra a favor.
  const slack = accuracyMeters && accuracyMeters > 0 ? Math.min(accuracyMeters, 150) : 0;
  const effective = Math.max(0, distanceMeters - slack);

  if (effective <= cfg.radiusMeters) return 'confirmado';
  if (effective <= cfg.warnMeters) return 'atencao';
  return 'fora';
};
