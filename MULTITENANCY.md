# Multi-tenant (Fase B)

A Fase A colocou duas instâncias independentes no ar (código igual, banco
próprio, parametrização por env). A Fase B torna o **banco compartilhável**:
o schema ganhou a entidade `Tenant` e toda tabela de dados carrega
`tenant_id NOT NULL` com FK. Uma instância continua sendo um processo do
backend + um frontend próprio — a diferença é que agora várias instâncias
podem apontar para o mesmo Postgres sem enxergar os dados umas das outras.

## Como o isolamento funciona (3 camadas)

1. **Extensão do Prisma Client** (`backend/src/db.ts`): todo acesso via
   `prisma` injeta o tenant do processo em todas as operações de todos os
   models — `where` nas leituras/updates/deletes, `data.tenantId` nas
   criações. Um id de outro tenant vira "not found"; um create nunca grava
   fora do tenant. É a garantia que cobre inclusive código futuro que
   esqueça o filtro. O cliente sem escopo (`basePrisma`) existe apenas para
   o bootstrap e para `scripts/create-tenant.ts`.
2. **JWT com claim `tenantId`** (`plugins/auth.ts`): o login assina o claim e
   todo preHandler autenticado o compara com o tenant do processo. Um token
   emitido por uma instância não vale em outra, mesmo que compartilhem o
   `JWT_SECRET` (ainda assim, use segredos distintos). Tokens antigos, de
   antes da Fase B, não têm o claim e são rejeitados — **no primeiro deploy
   todos os usuários precisam logar de novo**.
3. **Scoping explícito em `lib/access.ts`**: os builders de visibilidade
   (`visibleUsersWhere`, `visibleIndicationsWhere`) incluem o `tenantId` do
   ator — documentação do contrato e defesa em profundidade.

## Resolução do tenant

O backend resolve o tenant **uma vez, no boot**, pelo `TENANT_SLUG`
(`lib/tenant.ts`). Sem a env, o slug é `default` — o tenant que a migração
`20260708000000_add_multi_tenant` cria (id fixo `default`) e que adota todos
os dados pré-existentes do banco. Ou seja: **instâncias que já rodavam migram
sem nenhuma env nova e sem mudança de comportamento** (além do re-login).

Um `TENANT_SLUG` que não existe no banco derruba o boot com erro claro (em
vez de criar silenciosamente um tenant vazio, o que faria um typo parecer
perda de dados).

## Unicidade por tenant

- `users.email` → único por `(tenant_id, email)` — o mesmo e-mail pode
  existir em duas instâncias.
- `churches.name` → `(tenant_id, name)`; `municipalities` →
  `(tenant_id, name, state_code)` — cada tenant tem suas próprias linhas de
  igreja/município, mesmo com nomes iguais.
- `app_config` deixou de ser singleton: uma linha por tenant
  (`tenant_id UNIQUE`); link de WhatsApp e aviso são por instância.
- Dedup de apoiador (telefone/e-mail) e ranking de engajamento valem dentro
  do tenant.

## Provisionar um tenant novo no banco compartilhado

```bash
cd backend
# 1. criar o tenant
bun run create:tenant -- --slug regional-sul --name "Regional Sul"
# 2. seed do coordenador daquele tenant
TENANT_SLUG=regional-sul COORD_EMAIL=... COORD_PASSWORD=... bun run seed
# 3. subir a instância com TENANT_SLUG=regional-sul no backend/.env
```

O restante do provisionamento (frontend com branding próprio, Traefik,
GEO_DATASET/CHURCH_FIELD_ENABLED) segue o DEPLOY-REGIONAL.md — a única
diferença é que o `DATABASE_URL` pode apontar para o Postgres compartilhado.

## Consolidar os dois bancos de hoje em um só (opcional)

As duas instâncias atuais têm bancos separados; cada um ganhou seu próprio
tenant `default` na migração. Para unificá-las num único Postgres:

1. Na instância que vai **hospedar** o banco, crie o tenant da outra:
   `bun run create:tenant -- --slug regional --name "Regional"`.
2. Faça dump dos dados da instância que vai **mudar de casa** e importe-os
   reescrevendo `tenant_id='default'` para o id do tenant recém-criado
   (todas as tabelas de dados têm a coluna; os ids são cuid e não colidem —
   ainda assim, confira antes com um `SELECT` de interseção de ids).
3. Aponte o `DATABASE_URL` da instância migrada para o banco compartilhado e
   defina `TENANT_SLUG=regional`.
4. Usuários dessa instância precisam logar de novo (novo emissor do token).

Enquanto essa consolidação não acontecer, nada muda: cada banco tem um único
tenant e o comportamento é o mesmo de antes.

## Notas operacionais

- O deploy aplica a migração normalmente (`prisma migrate deploy`); o
  backfill roda dentro dela. O workflow reutilizável migra num container
  one-off **antes** do `up -d` — o boot da Fase B resolve o tenant no banco
  e falharia se a migração ainda não tivesse rodado.
- **Rollback de código após a migração exige cautela**: o código pré-Fase B
  não preenche `tenant_id` (NOT NULL, sem default) e falharia em INSERTs.
  Para reverter o app, reverta também a migração (ou adicione um DEFAULT
  'default' temporário nas colunas `tenant_id`).
- `scripts/create-coordinator.ts`, `prisma/seed.ts` e
  `scripts/scan-inactive.ts` operam no tenant do `TENANT_SLUG` do ambiente.
- O token estático `AUTOMATION_API_TOKEN` é por instância e as rotas
  `/automation/*` respondem apenas com dados do tenant do processo.
