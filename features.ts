// Feature flags da instância (build-time). A vertical regional desliga o
// campo "igreja" com VITE_CHURCH_FIELD_ENABLED=false; sem a env, tudo fica
// ligado como na instância original.
const env = (import.meta as any).env ?? {};

const flag = (key: string, fallback: boolean): boolean => {
  const value = String(env[key] ?? '').trim().toLowerCase();
  if (!value) return fallback;
  return value !== 'false';
};

export const FEATURES = {
  churchFieldEnabled: flag('VITE_CHURCH_FIELD_ENABLED', true),
  // Módulo territorial (Igrejas × Zona Eleitoral × Equipes × Visitas). Ligado
  // por padrão; instâncias que não usam podem desligar com
  // VITE_TERRITORY_ENABLED=false.
  territoryEnabled: flag('VITE_TERRITORY_ENABLED', true),
};
