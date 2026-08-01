import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

const databaseUrl = process.env.DATABASE_URL
  ?? 'postgresql://postgres:postgres@localhost:5432/rede_evangelica_uazapi_task3_codex?schema=public';
process.env.DATABASE_URL = databaseUrl;

let basePrisma: any;
let runtimeConfig: any;
let previewAudience: any;

const tenantA = { id: 'campaign-audience-tenant-a', slug: 'campaign-audience-a', name: 'Campaign Audience A' };
const tenantB = { id: 'campaign-audience-tenant-b', slug: 'campaign-audience-b', name: 'Campaign Audience B' };
const content = {
  primary: { type: 'text', text: 'Olá, {{primeiro_nome}}' },
  sequence: [{ type: 'text', text: 'Cadastro de {{nome}}' }],
};

beforeAll(async () => {
  const [db, tenantContext, configModule, audienceService] = await Promise.all([
    import('../../src/db.js'),
    import('../../src/lib/tenantContext.js'),
    import('../../src/config.js'),
    import('../../src/whatsapp/services/audience-service.js'),
  ]);
  basePrisma = db.basePrisma;
  runtimeConfig = configModule.config;
  previewAudience = audienceService.previewAudience;

  await basePrisma.tenant.createMany({ data: [tenantA, tenantB], skipDuplicates: true });
  tenantContext.setCurrentTenant(tenantA);

  const userData = [
    { id: 'leader-root', email: 'root@audience.test', name: 'Raiz Regional', devzappLink: '(11) 91111-1111', role: 'LIDER_REGIONAL', active: true },
    { id: 'leader-child', email: 'child@audience.test', name: 'Filha Regional', devzappLink: '(11) 92222-2222', role: 'LIDER_REGIONAL', active: true, indicatedByUserId: 'leader-root' },
    { id: 'leader-grandchild', email: 'grandchild@audience.test', name: 'Neta Regional', devzappLink: '(11) 93333-3333', role: 'LIDER_REGIONAL', active: true, indicatedByUserId: 'leader-child' },
    { id: 'leader-inactive', email: 'inactive@audience.test', name: 'Líder Inativa', devzappLink: '(11) 94444-4444', role: 'LIDER_REGIONAL', active: false },
    { id: 'coordinator-audience', email: 'coord@audience.test', name: 'Coordenação', devzappLink: '(11) 95555-5555', role: 'COORDENADOR', active: true },
  ];
  for (const user of userData) {
    await basePrisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: { ...user, tenantId: tenantA.id, passwordHash: 'unused' },
    });
  }
  await basePrisma.user.upsert({
    where: { id: 'leader-other-tenant' }, update: {},
    create: {
      id: 'leader-other-tenant', tenantId: tenantB.id, email: 'leader@other.test', name: 'Outro Tenant',
      devzappLink: '(11) 96666-6666', passwordHash: 'unused', role: 'LIDER_REGIONAL', active: true,
    },
  });

  await basePrisma.church.createMany({ data: [
    { id: 'church-a', tenantId: tenantA.id, name: 'Igreja A' },
    { id: 'church-b', tenantId: tenantA.id, name: 'Igreja B' },
  ], skipDuplicates: true });
  await basePrisma.municipality.createMany({ data: [
    { id: 'municipality-a', tenantId: tenantA.id, name: 'Cidade A', stateCode: 'SP' },
    { id: 'municipality-b', tenantId: tenantA.id, name: 'Cidade B', stateCode: 'SP' },
  ], skipDuplicates: true });
  await basePrisma.indication.createMany({ data: [
    {
      id: 'supporter-a', tenantId: tenantA.id, name: 'Ana Primeira', phone: '(11) 97777-0001', status: 'ATIVO',
      indicatedBy: 'Raiz Regional',
      createdById: 'leader-root', indicatedByUserId: 'leader-root', churchId: 'church-a', municipalityId: 'municipality-a',
      createdAt: new Date('2026-07-10T12:00:00Z'),
    },
    {
      id: 'supporter-duplicate', tenantId: tenantA.id, name: 'Ana Duplicada', phone: '+55 11 97777-0001', status: 'ATIVO',
      indicatedBy: 'Raiz Regional',
      createdById: 'leader-root', indicatedByUserId: 'leader-root', churchId: 'church-a', municipalityId: 'municipality-a',
      createdAt: new Date('2026-07-11T12:00:00Z'),
    },
    {
      id: 'supporter-invalid', tenantId: tenantA.id, name: 'Telefone Inválido', phone: '123', status: 'ATIVO',
      indicatedBy: 'Filha Regional',
      createdById: 'leader-child', indicatedByUserId: 'leader-child', churchId: 'church-b', municipalityId: 'municipality-a',
      createdAt: new Date('2026-07-12T12:00:00Z'),
    },
    {
      id: 'supporter-suppressed', tenantId: tenantA.id, name: 'Pessoa Suprimida', phone: '(11) 98888-0002', status: 'ATIVO',
      indicatedBy: 'Filha Regional',
      createdById: 'leader-child', indicatedByUserId: 'leader-child', churchId: 'church-a', municipalityId: 'municipality-a',
      createdAt: new Date('2026-07-13T12:00:00Z'),
    },
    {
      id: 'supporter-inactive', tenantId: tenantA.id, name: 'Apoiadora Inativa', phone: '(11) 99999-0003', status: 'INATIVO',
      indicatedBy: 'Filha Regional',
      createdById: 'leader-child', indicatedByUserId: 'leader-child', churchId: 'church-b', municipalityId: 'municipality-b',
      createdAt: new Date('2026-06-01T12:00:00Z'),
    },
  ], skipDuplicates: true });
  await basePrisma.whatsAppSuppression.upsert({
    where: { tenantId_phoneNormalized: { tenantId: tenantA.id, phoneNormalized: '5511988880002' } },
    update: { active: true },
    create: { tenantId: tenantA.id, phoneNormalized: '5511988880002', active: true, reason: 'Opt-out' },
  });

  await basePrisma.evento.upsert({
    where: { id: 'event-a' }, update: {},
    create: { id: 'event-a', tenantId: tenantA.id, nome: 'Encontro', data: new Date('2026-08-20T00:00:00Z'), hora: '19:00', local: 'Centro' },
  });
  await basePrisma.eventoIndicado.createMany({ data: [
    { id: 'guest-confirmed', tenantId: tenantA.id, eventoId: 'event-a', nome: 'Convidada Confirmada', telefone: '(11) 91234-1001', liderId: 'leader-root', status: 'CONFIRMADO' },
    { id: 'guest-present', tenantId: tenantA.id, eventoId: 'event-a', nome: 'Convidado Presente', telefone: '(11) 91234-1002', liderId: 'leader-root', status: 'PRESENTE' },
    { id: 'guest-rejected', tenantId: tenantA.id, eventoId: 'event-a', nome: 'Convidado Recusado', telefone: '(11) 91234-1003', liderId: 'leader-root', status: 'RECUSADO' },
  ], skipDuplicates: true });

  await basePrisma.equipe.createMany({ data: [
    {
      id: 'team-active', tenantId: tenantA.id, liderId: 'leader-root', nome: 'Equipe Ativa',
      motoristaNome: 'Motorista Ativo', motoristaCnh: 'CNH1', motoristaTelefone: '(11) 92345-2001',
      carroPlaca: 'ABC1D23', carroModelo: 'Sedan', carroCor: 'Azul', status: 'ATIVA',
    },
    {
      id: 'team-inactive', tenantId: tenantA.id, liderId: 'leader-child', nome: 'Equipe Inativa',
      motoristaNome: 'Motorista Inativo', motoristaCnh: 'CNH2', motoristaTelefone: '(11) 92345-2002',
      carroPlaca: 'DEF4G56', carroModelo: 'SUV', carroCor: 'Preto', status: 'INATIVA',
    },
  ], skipDuplicates: true });
  await basePrisma.equipeMembro.createMany({ data: [
    { id: 'member-active-a', tenantId: tenantA.id, equipeId: 'team-active', nome: 'Membro Ativo A', telefone: '(11) 93456-3001', ordem: 1 },
    { id: 'member-active-b', tenantId: tenantA.id, equipeId: 'team-active', nome: 'Membro Ativo B', telefone: '(11) 93456-3002', ordem: 2 },
    { id: 'member-inactive', tenantId: tenantA.id, equipeId: 'team-inactive', nome: 'Membro Inativo', telefone: '(11) 93456-3003', ordem: 1 },
  ], skipDuplicates: true });
});

afterAll(async () => {
  await basePrisma?.$disconnect();
});

describe('audience resolution', () => {
  test('filters leaders by role, active flag, recursive hierarchy and selected IDs without crossing tenants', async () => {
    const preview = await previewAudience({
      type: 'LEADERS', roles: ['LIDER_REGIONAL'], active: true,
      hierarchyRootId: 'leader-root', selectedIds: ['leader-child', 'leader-grandchild', 'leader-other-tenant'],
    }, content);

    expect(preview.recipients.map((row: any) => row.sourceId)).toEqual(['leader-child', 'leader-grandchild']);
    expect(preview.recipients.map((row: any) => row.personName)).toEqual(['Filha Regional', 'Neta Regional']);
  });

  test('filters supporters by status, municipality, church, leader, date and selected IDs', async () => {
    const preview = await previewAudience({
      type: 'SUPPORTERS', statuses: ['ATIVO'], municipalityIds: ['municipality-a'], churchIds: ['church-a'],
      leaderIds: ['leader-root'], createdFrom: '2026-07-09T00:00:00Z', createdTo: '2026-07-11T23:59:59Z',
      selectedIds: ['supporter-a', 'supporter-duplicate', 'supporter-inactive'],
    }, content);

    expect(preview.recipients.map((row: any) => row.sourceId)).toEqual(['supporter-a', 'supporter-duplicate']);
  });

  test('rejects a church filter when the church field is disabled', async () => {
    const original = runtimeConfig.churchFieldEnabled;
    runtimeConfig.churchFieldEnabled = false;
    try {
      await expect(previewAudience({ type: 'SUPPORTERS', churchIds: ['church-a'] }, content))
        .rejects.toThrow('Church audience filters are disabled.');
    } finally {
      runtimeConfig.churchFieldEnabled = original;
    }
  });

  test('requires an event and filters guests by status and selected IDs', async () => {
    const preview = await previewAudience({
      type: 'EVENT_GUESTS', eventId: 'event-a', statuses: ['CONFIRMADO', 'PRESENTE'],
      selectedIds: ['guest-confirmed', 'guest-rejected'],
    }, content);
    expect(preview.recipients.map((row: any) => row.sourceId)).toEqual(['guest-confirmed']);
  });

  test('filters active team drivers and members by leader, team, contact kind and source IDs', async () => {
    const drivers = await previewAudience({
      type: 'TEAM_CONTACTS', statuses: ['ATIVA'], leaderIds: ['leader-root'], teamIds: ['team-active'],
      contactKinds: ['DRIVER'], selectedIds: ['team-active', 'member-active-a'],
    }, content);
    expect(drivers.recipients.map((row: any) => [row.origin, row.sourceId])).toEqual([
      ['TEAM_DRIVER', 'team-active'],
    ]);

    const members = await previewAudience({
      type: 'TEAM_CONTACTS', statuses: ['ATIVA'], contactKinds: ['MEMBER'],
      selectedIds: ['member-active-b', 'member-inactive'],
    }, content);
    expect(members.recipients.map((row: any) => [row.origin, row.sourceId])).toEqual([
      ['TEAM_MEMBER', 'member-active-b'],
    ]);
  });

  test('keeps invalid, duplicate and actively suppressed rows while counting only unique valid phones', async () => {
    const preview = await previewAudience({
      type: 'SUPPORTERS', selectedIds: [
        'supporter-a', 'supporter-duplicate', 'supporter-invalid', 'supporter-suppressed',
      ],
    }, content);

    expect(preview.totals).toEqual({ source: 4, valid: 1, invalid: 1, duplicate: 1, suppressed: 1 });
    expect(preview.recipients.map((row: any) => ({ id: row.sourceId, reason: row.exclusionReason }))).toEqual([
      { id: 'supporter-a', reason: null },
      { id: 'supporter-duplicate', reason: 'DUPLICATE' },
      { id: 'supporter-invalid', reason: 'INVALID_LENGTH' },
      { id: 'supporter-suppressed', reason: 'SUPPRESSED' },
    ]);
    expect(preview.samples).toEqual([{
      sourceId: 'supporter-a', personName: 'Ana Primeira', phoneNormalized: '5511977770001',
      content: {
        primary: { type: 'text', text: 'Olá, Ana' },
        sequence: [{ type: 'text', text: 'Cadastro de Ana Primeira' }],
      },
    }]);
  });
});
