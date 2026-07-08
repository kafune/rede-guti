import { basePrisma } from '../db.js';
import { config } from '../config.js';
import { setCurrentTenant, type CurrentTenant } from './tenantContext.js';

/**
 * Resolve o tenant do processo pelo TENANT_SLUG e o registra no contexto.
 * Deve ser a primeira coisa que o server (e qualquer script/seed) faz antes
 * de tocar no banco via `prisma`.
 *
 * O slug 'default' é auto-criado se faltar (a migração já o cria; isto cobre
 * apenas bancos anteriores a ela em cenários de dev). Qualquer outro slug
 * precisa existir — subir uma instância apontando para um tenant inexistente
 * derruba o boot em vez de criar silenciosamente um tenant vazio, o que
 * mascararia um TENANT_SLUG digitado errado como "perda" de todos os dados.
 * Para provisionar: bun run create:tenant -- --slug <slug> --name "<nome>".
 */
export const resolveTenantFromEnv = async (): Promise<CurrentTenant> => {
  const slug = config.tenantSlug;

  let tenant = await basePrisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true }
  });

  if (!tenant && slug === 'default') {
    tenant = await basePrisma.tenant.create({
      data: { id: 'default', slug: 'default', name: 'Default' },
      select: { id: true, slug: true, name: true }
    });
  }

  if (!tenant) {
    throw new Error(
      `Tenant '${slug}' não encontrado. Crie-o com "bun run create:tenant -- --slug ${slug} --name \"Nome\"" ou corrija TENANT_SLUG.`
    );
  }

  setCurrentTenant(tenant);
  return tenant;
};
