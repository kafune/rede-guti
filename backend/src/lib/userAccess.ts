import { prisma } from '../db.js';
import { normalizeRole } from './access.js';
import { getTenantId } from './tenantContext.js';

/** Chave geral do tenant: lideranças (LIDER_REGIONAL) temporariamente bloqueadas. */
export const isLiderAccessBlocked = async () => {
  const config = await prisma.appConfig.findUnique({
    where: { tenantId: getTenantId() },
    select: { liderAccessBlocked: true }
  });
  return config?.liderAccessBlocked ?? false;
};

/**
 * Revalida um usuário já autenticado por JWT: conta desativada ou liderança
 * sob bloqueio geral perde o acesso imediatamente, mesmo com token válido.
 * Retorna null quando o acesso está liberado; senão, a mensagem de erro.
 */
export const getAccessDeniedReason = async (userId: string): Promise<string | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { active: true, role: true }
  });

  if (!user || !user.active) {
    return 'Conta desativada. Fale com a coordenação.';
  }

  if (normalizeRole(user.role) === 'LIDER_REGIONAL' && (await isLiderAccessBlocked())) {
    return 'Sistema temporariamente indisponível para lideranças. Tente mais tarde.';
  }

  return null;
};
