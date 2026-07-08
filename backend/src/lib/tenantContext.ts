// Contexto do tenant do processo. Sem imports de propósito: db.ts depende
// deste módulo (a extensão lê getTenantId em cada query) e o resolvedor
// (lib/tenant.ts) depende de db.ts — este arquivo quebra o ciclo.
//
// O backend é single-tenant por processo: cada instância sobe com TENANT_SLUG
// e todas as queries ficam escopadas a esse tenant. O banco pode ser
// compartilhado entre instâncias.

export type CurrentTenant = {
  id: string;
  slug: string;
  name: string;
};

let currentTenant: CurrentTenant | null = null;

export const setCurrentTenant = (tenant: CurrentTenant) => {
  currentTenant = tenant;
};

export const getCurrentTenant = (): CurrentTenant => {
  if (!currentTenant) {
    throw new Error(
      'Tenant não resolvido. Chame resolveTenantFromEnv() (lib/tenant.ts) antes de usar o prisma escopado.'
    );
  }
  return currentTenant;
};

export const getTenantId = () => getCurrentTenant().id;
