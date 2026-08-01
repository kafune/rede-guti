# UazapiGO Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar no Rede Guti um módulo nativo, tenant-aware e exclusivo de coordenadores para configurar a UazapiGO, preparar públicos, disparar ou agendar campanhas manuais, acompanhar resultados e auditar opt-outs, removendo toda a infraestrutura n8n.

**Architecture:** O backend Fastify será dividido entre domínio puro (`src/whatsapp/domain`), cliente UazapiGO (`src/whatsapp/uazapi`), serviços persistentes (`src/whatsapp/services`) e rotas (`src/routes/whatsapp`). Campanhas e destinatários serão congelados no PostgreSQL e enviados pela fila nativa `/sender/advanced` da UazapiGO; não haverá processo local periódico. O frontend terá tipos/HTTP próprios e uma área composta em `components/mensagens`, mantendo `App.tsx` apenas como roteador de tela.

**Tech Stack:** TypeScript 5.8, Fastify 5, Prisma 7/PostgreSQL, Bun test, React 19, Vitest, Testing Library, UazapiGO OpenAPI v2.1.1.

## Global Constraints

- Somente `COORDENADOR` pode acessar qualquer rota autenticada `/whatsapp/*`; `LIDER_REGIONAL` e `VERIFICADORA` recebem 403.
- Todas as novas entidades carregam `tenantId`, relações com `Tenant` e/ou `User`, e passam pelo cliente Prisma tenant-aware já existente.
- A UazapiGO usa `admintoken` somente em `POST /instance/create` e o header `token` da instância em endpoints regulares.
- Usar os contratos oficiais v2.1.1: `/instance/create`, `/instance/status`, `/instance/connect`, `/instance/disconnect`, `/webhook`, `/sender/advanced`, `/sender/listfolders`, `/sender/listmessages` e `/sender/edit`.
- Credenciais nunca aparecem em respostas, exceções, logs ou payloads sanitizados.
- `WHATSAPP_ENCRYPTION_KEY` deve representar exatamente 32 bytes (64 caracteres hex ou base64) e AES-256-GCM deve produzir envelope `v1:<iv-base64url>:<tag-base64url>:<cipher-base64url>`.
- Configurações: `UAZAPI_BASE_URL`, `UAZAPI_ADMIN_TOKEN`, `UAZAPI_WEBHOOK_SECRET`, `WHATSAPP_ENCRYPTION_KEY`, `WHATSAPP_DELAY_MIN=5`, `WHATSAPP_DELAY_MAX=15`, `WHATSAPP_UPLOAD_MAX_MB=20`, `WHATSAPP_MASS_MAX_RECIPIENTS=1000`, `PUBLIC_API_URL`.
- Conteúdo aceito: `text`, `image`, `document`, `audio`, `button`, `poll`, `carousel`; uma peça principal e no máximo nove itens em `sequence`.
- Variáveis aceitas: `{{nome}}` e `{{primeiro_nome}}`; qualquer outra variável invalida a requisição.
- Campanhas de marketing recebem exatamente uma vez no último item o texto `Para não receber mais mensagens, responda SAIR.`.
- Cada criação exige `consentimentoConfirmado: true` e grava autor e data da confirmação.
- Datas do navegador chegam como ISO UTC; `scheduledAt` inválido ou anterior ao momento da criação é rejeitado.
- Telefones brasileiros válidos normalizam para 12 ou 13 dígitos iniciados em 55; DDD é de 11 a 99 e o assinante começa entre 2 e 9.
- A prévia conserva inválidos, duplicados e suprimidos com motivo; somente válidos únicos entram na fila.
- O limite de 1.000 é medido em telefones válidos únicos, não em itens da sequência.
- Público, filtros, conteúdo e conteúdo personalizado de cada destinatário são imutáveis após o primeiro envio.
- Métricas e estados são monotônicos; campanhas `COMPLETED`, `CANCELED` ou `FAILED` não são reabertas por eventos atrasados.
- Não criar scheduler, cron, fila local recorrente ou substituto para os workflows n8n.
- Mídias ficam em coluna PostgreSQL `Bytes`, têm token público opaco de 32 bytes e tamanho máximo configurável, inicialmente 20 MB.
- O webhook público compara `UAZAPI_WEBHOOK_SECRET` em tempo constante, aceitando `x-webhook-secret` ou query `secret`, e deduplica pelo ID externo estável.
- O frontend faz polling somente enquanto existir campanha com estado `SCHEDULED`, `QUEUED`, `SENDING` ou `PAUSED`.

---

### Task 1: Persistência e domínio puro do WhatsApp

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/src/config.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260801000000_add_whatsapp_module/migration.sql`
- Create: `backend/src/whatsapp/types.ts`
- Create: `backend/src/whatsapp/domain/crypto.ts`
- Create: `backend/src/whatsapp/domain/phone.ts`
- Create: `backend/src/whatsapp/domain/content.ts`
- Create: `backend/src/whatsapp/domain/metrics.ts`
- Test: `backend/test/whatsapp/domain.test.ts`

**Interfaces:**
- Produces: `normalizeBrazilianPhone(value): PhoneNormalization`, `personalizeContent(content, person): WhatsAppCampaignContent`, `applyMarketingFooter(content): WhatsAppCampaignContent`, `buildUazapiMessage(item, context): UazapiAdvancedMessage`, `encryptSecret/decryptSecret`, `sanitizeCredentials`, `advanceRecipientStatus`, `mergeCampaignMetrics`.
- Produces: Prisma models `WhatsAppConfig`, `WhatsAppCampaign`, `WhatsAppRecipient`, `WhatsAppTemplate`, `WhatsAppMedia`, `WhatsAppSuppression`, `WhatsAppInteraction` and their enums.

- [ ] **Step 1: Configure a backend test runner and write failing domain tests**

  Add `"test": "bun test"` and create table-driven Bun tests whose hand-written expectations prove: formatted Brazilian numbers normalize; malformed length/DDD/subscriber are rejected; both supported variables personalize; unknown variables throw; seven content kinds produce the documented Uazapi advanced fields; a ten-item campaign is accepted and an eleven-item campaign is rejected; marketing footer is added once to the last item; AES round-trip works and authentication fails after ciphertext mutation; recursive credential keys are replaced by `[REDACTED]`; recipient status never regresses; terminal campaign status never reopens and counters use `Math.max`.

- [ ] **Step 2: Run the focused test and record RED**

  Run `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rede_guti bun test test/whatsapp/domain.test.ts` from `backend/`. Expected: failure because the domain modules do not exist.

- [ ] **Step 3: Add exact configuration and shared content types**

  Define `WhatsAppContentItem` as a discriminated union. Media items carry `mediaId`, `caption?`, and `filename?`; buttons carry `{label, action: 'REPLY'|'URL'|'CALL'|'COPY', value}[]`; poll carries `choices` and `selectableCount`; carousel carries cards with text, optional `mediaId`, and typed buttons. `WhatsAppCampaignContent` is `{ primary, sequence }`. Parse numeric env values as positive integers, enforce `delayMin <= delayMax`, strip trailing slash from base/public URLs, and keep secrets nullable until an operation needs them.

- [ ] **Step 4: Implement the pure domain functions minimally**

  Normalize digits with optional country code; return `{ normalized, valid, reason }`. Personalize every text-bearing field without mutating the input. Convert media IDs through a supplied `mediaUrl(mediaId)` callback. Map text to advanced `text`; image/document/audio to `file` plus caption/docName; button/poll to Uazapi `choices`; carousel to v2.1.1 bracket/brace `choices`. Footer application must detect an existing normalized footer before appending.

- [ ] **Step 5: Add the Prisma schema and SQL migration**

  Use enums for campaign, recipient, origin, category and interaction status. `WhatsAppConfig.tenantId` and `WhatsAppSuppression(tenantId, phoneNormalized)` are unique; `WhatsAppMedia.publicToken` is globally unique; `WhatsAppInteraction(tenantId, externalId)` is unique. Campaign stores JSON `audienceFilter` and `content`, author/consent timestamps, remote folder, monotonic counters, error and lifecycle dates. Recipient stores origin/source, original/normalized phone, frozen personalized JSON, validity/exclusion, status, external message IDs and error. Add all inverse `Tenant`/`User` relations and cascade only child history where deletion is explicitly safe.

- [ ] **Step 6: Generate Prisma and turn the focused suite GREEN**

  Run `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rede_guti bun run prisma:generate`, `bun test test/whatsapp/domain.test.ts`, `bun run build`, and `prisma validate --config prisma.config.ts`. All must pass without credential output.

- [ ] **Step 7: Commit**

  Commit as `feat: add whatsapp persistence and domain`.

### Task 2: Cliente UazapiGO, instância, templates e mídias

**Files:**
- Modify: `backend/package.json`
- Create: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/fastify.d.ts`
- Create: `backend/src/whatsapp/uazapi/client.ts`
- Create: `backend/src/whatsapp/services/config-service.ts`
- Create: `backend/src/routes/whatsapp/instance.ts`
- Create: `backend/src/routes/whatsapp/templates.ts`
- Create: `backend/src/routes/whatsapp/media.ts`
- Create: `backend/src/routes/whatsapp/index.ts`
- Test: `backend/test/whatsapp/uazapi-client.test.ts`
- Test: `backend/test/whatsapp/resources.integration.test.ts`

**Interfaces:**
- Consumes: encrypted config and `WhatsAppCampaignContent` from Task 1.
- Produces: `UazapiClient`, `getConfiguredUazapiClient()`, `buildApp(options?)`, registered `/whatsapp/instance`, `/whatsapp/templates`, `/whatsapp/media`, and `/public/whatsapp/media/:token` routes.

- [ ] **Step 1: Write failing client and Fastify.inject tests**

  Client tests use a local Fastify stub and assert header `admintoken` for create, header `token` for regular calls, timeout translation, safe messages for 401/429/500, recursive response sanitization and absence of supplied token in serialized errors. Integration tests inject coordinator/leader/verifier JWTs and prove only coordinator succeeds; instance responses expose `configured`, name and connection data but never encrypted/plain token; template create/list/update/delete/duplicate/favorite increments version correctly; multipart media enforces MIME/size and public opaque-token download returns exact bytes; a tenant-B record is invisible under tenant A.

- [ ] **Step 2: Run both test files and record RED**

  Run `bun test test/whatsapp/uazapi-client.test.ts test/whatsapp/resources.integration.test.ts`. Expected: missing app/client/routes.

- [ ] **Step 3: Implement the reusable client**

  Use one `fetch`-based client instance per credential set, `AbortSignal.timeout`, JSON body parsing guarded against malformed responses, and a `UazapiError` containing only safe code/status/message. Implement exact methods for instance create/status/connect/disconnect, webhook get/set, advanced send, folder/messages listing and folder edit. Never retain admin and instance headers in the same request.

- [ ] **Step 4: Make Fastify injectable and add resource routes**

  Move plugin and route registration into `buildApp`; keep `server.ts` responsible only for tenant resolution/listen. Add `@fastify/multipart`. Instance creation persists only AES envelope; connect omits phone to request QR Code; webhook configuration sends `events: ['messages','messages_update','sender']`, `excludeMessages: ['wasSentByApi']`, and `${PUBLIC_API_URL}/public/whatsapp/webhook?secret=${encodeURIComponent(secret)}`. Template bodies validate variables/content and update version atomically. Media upload streams to a bounded buffer, checks configured max, persists bytes, and public download sets stored MIME, length and safe filename headers.

- [ ] **Step 5: Run GREEN verification**

  Run both focused tests, `bun run build`, and `DATABASE_URL=... bun run prisma:generate`. Test output must not contain secrets.

- [ ] **Step 6: Commit**

  Commit as `feat: add whatsapp instance and resources`.

### Task 3: Resolução dos públicos, prévia, teste e criação de campanhas

**Files:**
- Create: `backend/src/whatsapp/domain/audience.ts`
- Create: `backend/src/whatsapp/services/audience-service.ts`
- Create: `backend/src/whatsapp/services/campaign-service.ts`
- Create: `backend/src/routes/whatsapp/campaigns.ts`
- Modify: `backend/src/routes/whatsapp/index.ts`
- Test: `backend/test/whatsapp/audience.test.ts`
- Test: `backend/test/whatsapp/campaign-create.integration.test.ts`

**Interfaces:**
- Produces: `AudienceFilter` union for `LEADERS`, `SUPPORTERS`, `EVENT_GUESTS`, `TEAM_CONTACTS`; `previewAudience(filter, content)`; `createCampaign(input, coordinatorId)`; routes `POST /whatsapp/campaigns/preview`, `POST /whatsapp/campaigns/test`, `POST /whatsapp/campaigns`, `GET /whatsapp/campaigns`, `GET /whatsapp/campaigns/:id`.

- [ ] **Step 1: Write failing resolver and creation tests**

  Seed two tenants and fixtures for leader hierarchy, active/inactive supporter with municipality/church/leader/date, event guests by statuses, and active/inactive teams with driver/members. Assert each filter selects only requested IDs/status/hierarchy; church filter is rejected when `CHURCH_FIELD_ENABLED=false`; duplicate phone appears once valid and once with `DUPLICATE`; invalid and active suppression remain in preview with reasons; 1,001 valid unique contacts returns 400; personalized sample uses frozen names; leader/verifier are forbidden; campaign without literal `true` consent is rejected; scheduled ISO is stored UTC; Uazapi receives `/sender/advanced` with v2.1.1 message objects, configured delays, millisecond `scheduled_for`, folder info and every personalized sequence item.

- [ ] **Step 2: Run focused tests and record RED**

  Run `bun test test/whatsapp/audience.test.ts test/whatsapp/campaign-create.integration.test.ts`. Expected: missing audience/campaign services.

- [ ] **Step 3: Implement backend-only audience resolution**

  `LEADERS` supports `roles`, `active`, `hierarchyRootId`, `selectedIds`; `SUPPORTERS` supports `statuses`, `municipalityIds`, `churchIds`, `leaderIds`, `createdFrom`, `createdTo`, `selectedIds`; `EVENT_GUESTS` requires `eventId` and supports statuses/selected IDs; `TEAM_CONTACTS` supports team statuses, leader IDs, `contactKinds: ['DRIVER','MEMBER']`, team IDs and selected source IDs. Select only source ID, name and phone, then normalize/deduplicate/suppress in one deterministic pass.

- [ ] **Step 4: Implement preview, test send and frozen campaign creation**

  Preview returns totals `{source, valid, invalid, duplicate, suppressed}`, all rows with reason, and at most ten personalized valid samples. Test send accepts one Brazilian phone and directly sends every content item without creating a campaign. Creation uses a transaction to persist campaign and every preview row, requires valid configuration and explicit consent, then calls `/sender/advanced` only with valid recipients. On remote failure it preserves the audit row as `FAILED` with sanitized error; on success it stores `folder_id`, marks valid recipients `QUEUED`, and returns 201. Immediate manual campaigns use current epoch milliseconds; scheduled campaigns use the parsed UTC epoch.

- [ ] **Step 5: Run GREEN verification**

  Run both focused tests and full backend `bun test`; then run `bun run build`.

- [ ] **Step 6: Commit**

  Commit as `feat: add whatsapp campaign creation`.

### Task 4: Sincronização, controles, webhook e supressões

**Files:**
- Modify: `backend/src/whatsapp/services/campaign-service.ts`
- Create: `backend/src/whatsapp/services/webhook-service.ts`
- Create: `backend/src/routes/whatsapp/suppressions.ts`
- Create: `backend/src/routes/whatsapp/webhook.ts`
- Modify: `backend/src/routes/whatsapp/campaigns.ts`
- Modify: `backend/src/routes/whatsapp/index.ts`
- Test: `backend/test/whatsapp/lifecycle.integration.test.ts`
- Test: `backend/test/whatsapp/webhook.integration.test.ts`

**Interfaces:**
- Produces: `syncCampaign`, `syncActiveCampaigns`, `pauseCampaign`, `resumeCampaign`, `cancelCampaign`, `rescheduleCampaign`, `editUnstartedCampaign`, `retryFailedRecipients`, `processUazapiWebhook`; routes for all operations and suppression audit.

- [ ] **Step 1: Write failing lifecycle and webhook tests**

  Prove folder status/counters only advance; delayed `Scheduled` cannot replace `Read`; completed/canceled campaigns stay terminal; pause maps to Uazapi `stop`, resume to `continue`, cancel to `delete`; reschedule/edit succeeds only before any recipient is `SENT` or beyond and recreates the remote folder; retry failed creates a new folder for failed phones without altering successful recipients; batch sync processes only active campaigns. Webhook tests send duplicate stable events and assert one interaction; delivery/read/played updates are monotonic; inbound reply attaches only to a campaign recipient; standalone inbound message is ignored; `SAIR` activates one suppression and cancels only pending recipients with that normalized phone across campaigns; explicit reauthorization records coordinator/time and deactivates suppression.

- [ ] **Step 2: Run focused tests and record RED**

  Run `bun test test/whatsapp/lifecycle.integration.test.ts test/whatsapp/webhook.integration.test.ts`. Expected: missing lifecycle/webhook operations.

- [ ] **Step 3: Implement lifecycle controls against v2.1.1**

  List remote folders and `/sender/listmessages` with pagination up to 1,000. Match messages by normalized `chatid`/`sender` and store `messageid` arrays. Apply rank `PENDING < QUEUED < SENT < DELIVERED < READ < PLAYED`, with `FAILED` and `CANCELED` terminal for a recipient. Recompute campaign counters from recipients using `Math.max` with stored values. Recreate unstarted campaign folders for reschedule/edit because v2.1.1 exposes no in-place content/reschedule action.

- [ ] **Step 4: Implement public webhook and suppression audit**

  Authenticate before body processing. Derive external ID from provider event/id/status when no explicit event ID exists. Incoming association first uses quoted external message ID, then the most recent sent campaign recipient for the same phone within 30 days. Persist only campaign replies and opt-out interactions. `SAIR` matching is case-insensitive after trim and permits a final period/exclamation mark. Manual suppression requires reason; reauthorization requires `consentimentoConfirmado: true` and stores coordinator/time.

- [ ] **Step 5: Run GREEN verification**

  Run both focused tests, the full backend suite and backend build. Inspect test output for leaked tokens.

- [ ] **Step 6: Commit**

  Commit as `feat: add whatsapp campaign lifecycle`.

### Task 5: Remoção integral do n8n sem perder pontuação

**Files:**
- Delete: `automations/n8n/`
- Delete: `backend/src/routes/automation.ts`
- Delete: `backend/src/lib/automationWebhookService.ts`
- Modify: `backend/src/lib/engagementService.ts`
- Modify: `backend/src/plugins/auth.ts`
- Modify: `backend/src/fastify.d.ts`
- Modify: `backend/src/config.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/.env.example`
- Modify: `README.md`
- Modify: `DEPLOY.md`
- Modify: `DEPLOY-REGIONAL.md`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.regional.yml`
- Modify: `backend/docker-compose.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/deploy-instance.yml`
- Modify: `.github/workflows/deploy-regional.yml`
- Test: `backend/test/engagement-without-automation.test.ts`

**Interfaces:**
- Preserves: `/engagement/me`, leaderboards, ledger, coordinator recalculate and manual inactive scan if already exposed by normal engagement routes.
- Removes: `/automation/*`, `requireAutomation`, all outbound engagement webhooks and all n8n/env/deploy references.

- [ ] **Step 1: Write a failing regression test around normal engagement behavior**

  Use `Fastify.inject` to assert `/automation/recalculate` is absent, coordinator `/engagement/recalculate` remains authorized, points calculation still updates ledger/stats, and no outbound fetch occurs during point awarding or recalculation.

- [ ] **Step 2: Run the focused test and record RED**

  Run `bun test test/engagement-without-automation.test.ts`. Expected: automation route or outbound service still exists.

- [ ] **Step 3: Remove runtime automation infrastructure and calls**

  Delete route/service registration and auth decoration. Remove imports/calls to all `emit*` functions while retaining database transactions, point constants, ranking calculations and public engagement method signatures used by normal routes.

- [ ] **Step 4: Remove files and deployment documentation**

  Delete all JSON workflows and references to `AUTOMATION_API_TOKEN`, `ENGAGEMENT_WEBHOOK_URL`, `ENGAGEMENT_WEBHOOK_TIMEOUT_MS`, `APP_PUBLIC_URL` and n8n. Do not remove the newly introduced `PUBLIC_API_URL`.

- [ ] **Step 5: Run GREEN verification**

  Run focused/full backend tests, backend build, frontend build and `rg -n "n8n|AUTOMATION_API_TOKEN|ENGAGEMENT_WEBHOOK|APP_PUBLIC_URL|requireAutomation|/automation/" . --glob '!node_modules' --glob '!dist'`; the final search must have no matches.

- [ ] **Step 6: Commit**

  Commit as `refactor: remove n8n automations`.

### Task 6: Área React “Mensagens” e cliente HTTP isolado

**Files:**
- Modify: `package.json`
- Create: `whatsapp/types.ts`
- Create: `whatsapp/api.ts`
- Create: `whatsapp/date.ts`
- Create: `components/mensagens/MensagensPanel.tsx`
- Create: `components/mensagens/WhatsAppConnection.tsx`
- Create: `components/mensagens/AudienceSelector.tsx`
- Create: `components/mensagens/MessageComposer.tsx`
- Create: `components/mensagens/CampaignPreview.tsx`
- Create: `components/mensagens/TemplatesPanel.tsx`
- Create: `components/mensagens/CampaignHistory.tsx`
- Create: `components/mensagens/CampaignDetail.tsx`
- Create: `components/mensagens/SuppressionsPanel.tsx`
- Modify: `App.tsx`
- Test: `components/mensagens/MensagensPanel.test.tsx`
- Test: `components/mensagens/MessageComposer.test.tsx`
- Test: `components/mensagens/CampaignHistory.test.tsx`

**Interfaces:**
- Consumes: every `/whatsapp/*` JSON contract from Tasks 2–4.
- Produces: coordinator-only view key `mensagens`, four internal tabs `conexao`, `nova`, `historico`, `supressoes`, and an HTTP module independent of root `api.ts`.

- [ ] **Step 1: Configure Vitest and write failing component tests**

  Add `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, scripts `test` and `test:watch`, and jsdom setup. Tests render real focused components with a fake HTTP adapter and assert: audience filters serialize correctly; church filter hides when disabled; composer rejects unknown variables and sequence item ten-plus-one; local datetime is converted with `new Date(value).toISOString()`; preview displays valid/invalid/duplicate/suppressed totals and personalized sample; campaign confirmation cannot submit before consent checkbox; active history starts polling and terminal-only history does not; pause/resume/cancel/edit/retry buttons appear only for allowed statuses.

- [ ] **Step 2: Run component tests and record RED**

  Run `bun test components/mensagens/*.test.tsx`. Expected: missing components/module.

- [ ] **Step 3: Implement centralized frontend types, date and HTTP**

  Keep every WhatsApp request/response type in `whatsapp/types.ts`; export typed functions for instance, media, templates, preview/test/create/list/detail/control/sync and suppressions from `whatsapp/api.ts`. FormData upload must not force `Content-Type`. Convert browser date exactly once before API calls.

- [ ] **Step 4: Implement the focused campaign workflow**

  `MensagensPanel` owns only tab/routing state. New campaign follows Público → Conteúdo → Prévia → Confirmação/agendamento. Show samples and exclusion reasons before submit. Support all seven content types, media selection/upload, template load/save/duplicate/favorite, one primary plus nine sequence items, and explicit marketing/consent controls. History cards show queued/sent/failed/delivered/read/played/replies/opt-outs; detail exposes lifecycle controls and recipient errors.

- [ ] **Step 5: Integrate coordinator-only navigation in App.tsx**

  Add `mensagens` to the view union, render only for `currentUser.role === 'COORDENADOR'`, redirect unauthorized stale view to dashboard, and add mobile/desktop nav button labeled `Mensagens` without importing WhatsApp types into root `api.ts` or root `types.ts`.

- [ ] **Step 6: Run GREEN verification**

  Run component tests, frontend `bun run build`, and backend `bun run build`.

- [ ] **Step 7: Commit**

  Commit as `feat: add whatsapp campaign interface`.

### Task 7: Cobertura integrada, configuração de implantação e migração limpa

**Files:**
- Modify: `backend/.env.example`
- Modify: `DEPLOY.md`
- Modify: `DEPLOY-REGIONAL.md`
- Modify: `README.md`
- Create: `backend/test/whatsapp/full-flow.integration.test.ts`
- Create: `docs/whatsapp-homologation.md`

**Interfaces:**
- Produces: documentação de implantação/homologação e evidência executável do fluxo completo.

- [ ] **Step 1: Write the final failing integration scenarios**

  With a clean test database and UazapiGO Fastify stub, cover instance create/status/connect QR/webhook setup, media upload/public fetch, template CRUD/duplicate/favorite, all four audience previews, test send, immediate and future campaign, pre-send edit/reschedule, pause/resume/sync/cancel, webhook delivery/read/reply/SAIR idempotency, manual suppression/reauthorization, retry failed and tenant/role isolation. Assert every external failure response and captured log omits admin token, instance token, encryption key and webhook secret.

- [ ] **Step 2: Run the final integration test and record RED if it exposes a cross-task gap**

  Run `bun test test/whatsapp/full-flow.integration.test.ts`. Any missing behavior must be corrected through a failing focused assertion before production edits.

- [ ] **Step 3: Finish env/deploy documentation**

  Document all nine WhatsApp env values, migration-before-deploy ordering, `PUBLIC_API_URL`, dedicated WhatsApp Business number warning, webhook registration, initial test send, small homologation campaign and the absence of automatic sends. The homologation checklist must enumerate QR connect, test, schedule, webhook receive, pause, resume, cancel and retry failed.

- [ ] **Step 4: Validate a clean PostgreSQL migration**

  Start an empty PostgreSQL database, run `DATABASE_URL=<clean-db> bun run prisma:deploy`, then query Prisma for all seven new tables and their unique constraints. Do not reuse production or user data.

- [ ] **Step 5: Run full verification**

  From `backend/`: Prisma generate/validate, full `bun test`, and build. From root: full component tests and production build. Run `git diff --check` and the n8n/reference search from Task 5. Capture exact pass/fail counts in the task report.

- [ ] **Step 6: Commit**

  Commit as `test: verify whatsapp integration flow`.
