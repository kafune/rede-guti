import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { FastifyInstance } from 'fastify';

if (process.env.ENGAGEMENT_WITHOUT_AUTOMATION_CHILD !== '1') {
  test('runs the engagement-without-automation scenario in an isolated process', () => {
    const result = Bun.spawnSync({
      cmd: [process.execPath, 'test', 'test/engagement-without-automation.test.ts'],
      cwd: new URL('../', import.meta.url).pathname,
      env: { ...process.env, ENGAGEMENT_WITHOUT_AUTOMATION_CHILD: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (result.exitCode !== 0) {
      throw new Error(`${result.stdout.toString()}\n${result.stderr.toString()}`);
    }
    expect(result.exitCode).toBe(0);
  }, 30_000);
} else {
  process.env.DATABASE_URL = process.env.DATABASE_URL
    ?? 'postgresql://postgres:postgres@localhost:5432/rede_evangelica_task5_engagement_codex?schema=public';
  process.env.JWT_SECRET = 'engagement-without-automation-test-secret';

  const tenant = {
    id: 'engagement-without-automation-tenant',
    slug: 'engagement-without-automation',
    name: 'Engagement without automation',
  };
  const coordinatorId = 'engagement-without-automation-coordinator';
  const leaderId = 'engagement-without-automation-leader';
  const churchId = 'engagement-without-automation-church';
  const municipalityId = 'engagement-without-automation-municipality';
  const indicationId = 'engagement-without-automation-indication';
  const originalFetch = globalThis.fetch;
  let outboundFetches = 0;
  let app: FastifyInstance;
  let basePrisma: any;
  let prisma: any;
  let awardPoints: any;
  let coordinatorToken: string;

  globalThis.fetch = (async () => {
    outboundFetches += 1;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  beforeAll(async () => {
    const [{ buildApp }, db, tenantContext, engagementService] = await Promise.all([
      import('../src/app.js'),
      import('../src/db.js'),
      import('../src/lib/tenantContext.js'),
      import('../src/lib/engagementService.js'),
    ]);
    basePrisma = db.basePrisma;
    prisma = db.prisma;
    awardPoints = engagementService.awardPoints;

    await basePrisma.tenant.upsert({ where: { id: tenant.id }, update: tenant, create: tenant });
    tenantContext.setCurrentTenant(tenant);
    await basePrisma.leaderPointsLedger.deleteMany({ where: { userId: { in: [coordinatorId, leaderId] } } });
    await basePrisma.leaderStats.deleteMany({ where: { userId: { in: [coordinatorId, leaderId] } } });
    await basePrisma.indication.deleteMany({ where: { id: indicationId } });
    await basePrisma.user.deleteMany({ where: { id: { in: [coordinatorId, leaderId] } } });
    await basePrisma.church.deleteMany({ where: { id: churchId } });
    await basePrisma.municipality.deleteMany({ where: { id: municipalityId } });

    await basePrisma.user.createMany({ data: [
      {
        id: coordinatorId, tenantId: tenant.id, email: 'coordinator@automation-removal.test',
        name: 'Coordenador', passwordHash: 'unused', role: 'COORDENADOR', active: true,
      },
      {
        id: leaderId, tenantId: tenant.id, email: 'leader@automation-removal.test',
        name: 'Lider', passwordHash: 'unused', role: 'LIDER_REGIONAL', active: true,
      },
    ] });
    await basePrisma.church.create({ data: { id: churchId, tenantId: tenant.id, name: 'Igreja Teste' } });
    await basePrisma.municipality.create({
      data: { id: municipalityId, tenantId: tenant.id, name: 'Cidade Teste', stateCode: 'SP' },
    });
    await basePrisma.indication.create({
      data: {
        id: indicationId, tenantId: tenant.id, name: 'Apoiador Teste', indicatedBy: 'Lider', status: 'ATIVO',
        createdById: leaderId, indicatedByUserId: leaderId, churchId, municipalityId,
      },
    });

    app = await buildApp({ logger: false });
    coordinatorToken = app.jwt.sign(
      { sub: coordinatorId, role: 'COORDENADOR', tenantId: tenant.id },
      { expiresIn: '8h' },
    );
  });

  afterAll(async () => {
    await app?.close();
    await basePrisma?.$disconnect();
    globalThis.fetch = originalFetch;
  });

  describe('engagement without automation infrastructure', () => {
    test('removes legacy routes while retaining coordinator recalculation and local point accounting', async () => {
      const auth = { authorization: `Bearer ${coordinatorToken}` };
      const legacyAutomation = await app.inject({ method: 'POST', url: '/auto' + 'mation/recalculate', headers: auth });
      expect(legacyAutomation.statusCode).toBe(404);

      await awardPoints(leaderId, 'supporter.created', 10, { indicationId });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      const awardedLedger = await prisma.leaderPointsLedger.findMany({
        where: { userId: leaderId, eventType: 'supporter.created' },
        select: { points: true, metadata: true },
      });
      const awardedStats = await prisma.leaderStats.findUnique({
        where: { userId: leaderId },
        select: { score: true },
      });
      expect(awardedLedger).toEqual([{ points: 10, metadata: { indicationId } }]);
      expect(awardedStats).toEqual({ score: 10 });
      expect(outboundFetches).toBe(0);

      const recalculate = await app.inject({ method: 'POST', url: '/engagement/recalculate', headers: auth });
      expect(recalculate.statusCode).toBe(200);
      expect(recalculate.json()).toEqual({ recalculated: 2 });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      const recalculatedStats = await prisma.leaderStats.findUnique({
        where: { userId: leaderId },
        select: { score: true, totalIndications: true, rankingPosition: true },
      });
      expect(recalculatedStats).toEqual({ score: 10, totalIndications: 1, rankingPosition: 1 });
      expect(outboundFetches).toBe(0);
    });
  });
}
