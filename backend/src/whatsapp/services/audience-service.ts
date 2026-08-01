import { config } from '../../config.js';
import { prisma } from '../../db.js';
import type {
  AudienceFilter,
  AudienceOrigin,
  AudiencePreview,
  AudienceRecipient,
} from '../domain/audience.js';
import { AudienceLimitError, AudienceValidationError } from '../domain/audience.js';
import { personalizeContent } from '../domain/content.js';
import { normalizeBrazilianPhone } from '../domain/phone.js';
import type { WhatsAppCampaignContent } from '../types.js';

interface SourceContact {
  origin: AudienceOrigin;
  sourceId: string;
  sourceName: string;
  personName: string;
  phone: string;
}

const bySourceId = (left: SourceContact, right: SourceContact) =>
  left.sourceId.localeCompare(right.sourceId, 'en');

async function hierarchyIds(rootId: string): Promise<string[]> {
  const ids = new Set<string>([rootId]);
  let frontier = [rootId];
  while (frontier.length > 0) {
    const children = await prisma.user.findMany({
      where: { indicatedByUserId: { in: frontier } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    frontier = children.map(({ id }) => id).filter((id) => !ids.has(id));
    frontier.forEach((id) => ids.add(id));
  }
  return [...ids];
}

async function resolveLeaders(filter: Extract<AudienceFilter, { type: 'LEADERS' }>): Promise<SourceContact[]> {
  const hierarchy = filter.hierarchyRootId
    ? await hierarchyIds(filter.hierarchyRootId)
    : undefined;
  const selectedIds = filter.selectedIds === undefined
    ? hierarchy
    : hierarchy === undefined
      ? filter.selectedIds
      : filter.selectedIds.filter((id) => hierarchy.includes(id));
  const rows = await prisma.user.findMany({
    where: {
      ...(filter.roles === undefined ? {} : { role: { in: filter.roles } }),
      ...(filter.active === undefined ? {} : { active: filter.active }),
      ...(selectedIds === undefined ? {} : { id: { in: selectedIds } }),
    },
    select: { id: true, name: true, devzappLink: true },
    orderBy: { id: 'asc' },
  });
  return rows.map((row) => ({
    origin: 'MANUAL',
    sourceId: row.id,
    sourceName: row.name ?? '',
    personName: row.name ?? '',
    phone: row.devzappLink ?? '',
  }));
}

async function resolveSupporters(filter: Extract<AudienceFilter, { type: 'SUPPORTERS' }>): Promise<SourceContact[]> {
  if (!config.churchFieldEnabled && filter.churchIds !== undefined) {
    throw new AudienceValidationError('Church audience filters are disabled.');
  }
  const rows = await prisma.indication.findMany({
    where: {
      ...(filter.statuses === undefined ? {} : { status: { in: filter.statuses } }),
      ...(filter.municipalityIds === undefined ? {} : { municipalityId: { in: filter.municipalityIds } }),
      ...(filter.churchIds === undefined ? {} : { churchId: { in: filter.churchIds } }),
      ...(filter.leaderIds === undefined ? {} : { indicatedByUserId: { in: filter.leaderIds } }),
      ...(filter.selectedIds === undefined ? {} : { id: { in: filter.selectedIds } }),
      ...(
        filter.createdFrom === undefined && filter.createdTo === undefined
          ? {}
          : {
            createdAt: {
              ...(filter.createdFrom === undefined ? {} : { gte: new Date(filter.createdFrom) }),
              ...(filter.createdTo === undefined ? {} : { lte: new Date(filter.createdTo) }),
            },
          }
      ),
    },
    select: { id: true, name: true, phone: true },
    orderBy: { id: 'asc' },
  });
  return rows.map((row) => ({
    origin: 'INDICATION', sourceId: row.id, sourceName: row.name,
    personName: row.name, phone: row.phone ?? '',
  }));
}

async function resolveEventGuests(filter: Extract<AudienceFilter, { type: 'EVENT_GUESTS' }>): Promise<SourceContact[]> {
  const rows = await prisma.eventoIndicado.findMany({
    where: {
      eventoId: filter.eventId,
      ...(filter.statuses === undefined ? {} : { status: { in: filter.statuses } }),
      ...(filter.selectedIds === undefined ? {} : { id: { in: filter.selectedIds } }),
    },
    select: { id: true, nome: true, telefone: true },
    orderBy: { id: 'asc' },
  });
  return rows.map((row) => ({
    origin: 'EVENT_GUEST', sourceId: row.id, sourceName: row.nome,
    personName: row.nome, phone: row.telefone,
  }));
}

async function resolveTeamContacts(filter: Extract<AudienceFilter, { type: 'TEAM_CONTACTS' }>): Promise<SourceContact[]> {
  const kinds = new Set(filter.contactKinds ?? ['DRIVER', 'MEMBER']);
  const teams = await prisma.equipe.findMany({
    where: {
      ...(filter.statuses === undefined ? {} : { status: { in: filter.statuses } }),
      ...(filter.leaderIds === undefined ? {} : { liderId: { in: filter.leaderIds } }),
      ...(filter.teamIds === undefined ? {} : { id: { in: filter.teamIds } }),
    },
    select: {
      id: true,
      nome: true,
      motoristaNome: true,
      motoristaTelefone: true,
      ...(kinds.has('MEMBER') ? {
        membros: { select: { id: true, nome: true, telefone: true }, orderBy: { id: 'asc' as const } },
      } : {}),
    },
    orderBy: { id: 'asc' },
  });
  const selected = filter.selectedIds === undefined ? null : new Set(filter.selectedIds);
  const contacts: SourceContact[] = [];
  for (const team of teams) {
    if (kinds.has('DRIVER') && (selected === null || selected.has(team.id))) {
      contacts.push({
        origin: 'TEAM_DRIVER', sourceId: team.id, sourceName: team.nome,
        personName: team.motoristaNome, phone: team.motoristaTelefone,
      });
    }
    if (kinds.has('MEMBER') && 'membros' in team) {
      for (const member of team.membros) {
        if (selected !== null && !selected.has(member.id)) continue;
        contacts.push({
          origin: 'TEAM_MEMBER', sourceId: member.id, sourceName: team.nome,
          personName: member.nome, phone: member.telefone,
        });
      }
    }
  }
  return contacts.sort(bySourceId);
}

async function resolveSources(filter: AudienceFilter): Promise<SourceContact[]> {
  switch (filter.type) {
    case 'LEADERS': return resolveLeaders(filter);
    case 'SUPPORTERS': return resolveSupporters(filter);
    case 'EVENT_GUESTS': return resolveEventGuests(filter);
    case 'TEAM_CONTACTS': return resolveTeamContacts(filter);
  }
}

export async function previewAudience(
  filter: AudienceFilter,
  content: WhatsAppCampaignContent,
): Promise<AudiencePreview> {
  const sources = await resolveSources(filter);
  const normalized = sources.map((source) => ({ source, phone: normalizeBrazilianPhone(source.phone) }));
  const validPhones = normalized.flatMap(({ phone }) => phone.valid ? [phone.normalized] : []);
  const suppressions = validPhones.length === 0
    ? []
    : await prisma.whatsAppSuppression.findMany({
      where: { active: true, phoneNormalized: { in: validPhones } },
      select: { phoneNormalized: true },
    });
  const suppressed = new Set(suppressions.map(({ phoneNormalized }) => phoneNormalized));
  const seen = new Set<string>();

  const recipients: AudienceRecipient[] = normalized.map(({ source, phone }) => {
    let exclusionReason: AudienceRecipient['exclusionReason'] = null;
    if (!phone.valid) {
      exclusionReason = phone.reason;
    } else if (seen.has(phone.normalized)) {
      exclusionReason = 'DUPLICATE';
    } else {
      seen.add(phone.normalized);
      if (suppressed.has(phone.normalized)) exclusionReason = 'SUPPRESSED';
    }
    return {
      origin: source.origin,
      sourceId: source.sourceId,
      sourceName: source.sourceName,
      personName: source.personName,
      phoneOriginal: source.phone,
      phoneNormalized: phone.valid ? phone.normalized : null,
      isValid: exclusionReason === null,
      exclusionReason,
      personalizedContent: personalizeContent(content, { name: source.personName }),
    };
  });

  const totals = {
    source: recipients.length,
    valid: recipients.filter(({ isValid }) => isValid).length,
    invalid: recipients.filter(({ exclusionReason }) => exclusionReason?.startsWith('INVALID_')).length,
    duplicate: recipients.filter(({ exclusionReason }) => exclusionReason === 'DUPLICATE').length,
    suppressed: recipients.filter(({ exclusionReason }) => exclusionReason === 'SUPPRESSED').length,
  };
  if (totals.valid > config.whatsappMassMaxRecipients) {
    throw new AudienceLimitError(config.whatsappMassMaxRecipients);
  }

  return {
    totals,
    recipients,
    samples: recipients
      .filter((recipient): recipient is AudienceRecipient & { phoneNormalized: string } => recipient.isValid)
      .slice(0, 10)
      .map((recipient) => ({
        sourceId: recipient.sourceId,
        personName: recipient.personName,
        phoneNormalized: recipient.phoneNormalized,
        content: recipient.personalizedContent,
      })),
  };
}
