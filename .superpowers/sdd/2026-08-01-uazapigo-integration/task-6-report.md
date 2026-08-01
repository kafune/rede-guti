# Task 6 — Área React Mensagens e cliente HTTP isolado

## Status

Concluída. A área `Mensagens` está integrada ao `App` somente para `COORDENADOR`, com quatro tabs funcionais, workflow de campanha, cliente HTTP e contratos isolados em `whatsapp/`.

## TDD: RED observado

Comando efetivo do runner React:

```text
bun run test -- components/mensagens/*.test.tsx
```

RED inicial: 3 suites falharam porque `MensagensPanel`, `MessageComposer` e `CampaignHistory` ainda não existiam. A falha foi a esperada (`Failed to resolve import`).

RED adicional de integração:

```text
bun run test -- App.test.tsx
```

Após corrigir o setup de `localStorage` do ambiente Bun/jsdom, o teste falhou pela ausência do botão acessível `Mensagens`, como esperado.

REDs de self-review:

```text
bun run test -- components/mensagens/MensagensPanel.test.tsx components/mensagens/MessageComposer.test.tsx
```

Quatro testes falharam pelos labels ainda ausentes de filtros de status/seleções de convidados/equipes e campos de mídia/botões do carrossel. Esses controles foram então implementados.

## GREEN e verificação final

```text
bun run test
```

Resultado final após a rodada de revisão: 8 arquivos de teste, 44 testes, 44 aprovados.

```text
bun run build
```

Resultado: frontend Vite/PWA aprovado. Há apenas o aviso já existente de chunks acima de 500 kB.

```text
cd backend && bun run build
```

Resultado: backend TypeScript aprovado.

```text
cd backend && bun test --timeout 30000
```

Resultado: 8 arquivos, 56 testes e 148 assertions aprovados. Na primeira execução completa faltavam dois bancos PostgreSQL isolados usados por testes antigos; eles foram criados, receberam as 17 migrations e a repetição ficou integralmente verde.

```text
cd backend && DATABASE_URL=... bunx prisma validate --config prisma.config.ts
```

Resultado: schema Prisma válido. O cliente também foi regenerado e a migration incremental foi aplicada nos bancos de teste.

Também foi executado `bunx tsc --noEmit` na raiz. Esse comando inclui backend e testes Bun fora do tsconfig de build e reporta erros preexistentes nesses arquivos, em `Dashboard.tsx` e em `EventoDetail.tsx`. Um erro novo localizado em `CampaignPreview.tsx` foi corrigido por narrowing do union; a repetição filtrada não retornou erros em `components/mensagens` ou `whatsapp`.

`git diff --check` foi executado sem apontamentos.

## Cobertura comportamental

- serialização tipada dos quatro públicos e ocultação do filtro de igreja por feature flag;
- conversão local → UTC somente por `whatsapp/date.ts` antes de preview/create/reschedule;
- sete tipos de conteúdo, variáveis permitidas, máximo de nove itens de sequência, mídia e carrossel;
- templates (carregar, salvar, duplicar, favoritar e excluir), upload `FormData` sem `Content-Type` manual e envio de teste;
- preview com totais, amostras personalizadas e exclusões;
- confirmação obrigatória de consentimento e controle explícito de marketing;
- histórico, métricas, erros de destinatários e lifecycle conforme status;
- polling a cada 15s apenas para `SCHEDULED`, `QUEUED`, `SENDING` e `PAUSED`, com cleanup;
- conexão de instância e supressões/reautorização;
- navegação mobile/desktop coordinator-only e redirect defensivo de view sem autorização.

## Rodada de revisão crítica

Foram observados REDs específicos e corrigidos para:

- retry que cria uma nova campanha: o histórico agora faz upsert/seleciona a filha, atualiza a lista e suprime novo retry da campanha original quando já existe uma filha `RETRY`;
- CRUD completo de templates com estado explícito de criação/edição, confirmação para duplicar/excluir, mensagens de sucesso/erro e `name`, `category`, `purpose` e `content`;
- gates de lifecycle alinhados aos fatos exigidos pelo backend: contadores de início, pasta remota, estado remoto ativo e status local;
- validação estrutural dos sete tipos antes da prévia, incluindo limites de enquete, botões/cards e mídia direta ou enviada;
- cobertura faltante para público `LEADERS`, view obsoleta sem autorização, upload multipart, envio de teste, conexão, supressão/reautorização, CRUD de templates e retry.

### Gap cross-task fechado

O plano exigia `purpose/finalidade` persistida, mas o backend anterior não tinha campo, contrato ou migration. A correção incluiu RED de integração para create/list/update/duplicate, `WhatsAppTemplate.purpose String?`, migration incremental `20260801010000_add_whatsapp_template_purpose`, schemas Zod e cópia do campo na duplicação. O teste focado de recursos terminou com 7/7 testes e 59 assertions aprovados.

## Arquivos

- `whatsapp/types.ts`, `whatsapp/api.ts`, `whatsapp/date.ts`
- `components/mensagens/AudienceSelector.tsx`
- `components/mensagens/CampaignDetail.tsx`
- `components/mensagens/CampaignHistory.tsx`
- `components/mensagens/CampaignPreview.tsx`
- `components/mensagens/MensagensPanel.tsx`
- `components/mensagens/MessageComposer.tsx`
- `components/mensagens/SuppressionsPanel.tsx`
- `components/mensagens/TemplatesPanel.tsx`
- `components/mensagens/WhatsAppConnection.tsx`
- testes focados em `components/mensagens/*.test.tsx` e `App.test.tsx`
- `whatsapp/api.test.ts`
- `backend/prisma/migrations/20260801010000_add_whatsapp_template_purpose/migration.sql`
- `backend/src/routes/whatsapp/templates.ts`, `backend/test/whatsapp/resources.integration.test.ts`
- `vitest.config.ts`, `vitest.setup.ts`, `package.json`, `bun.lock`, `App.tsx`

Os arquivos raiz `api.ts` e `types.ts` não foram alterados.

## Preocupações

- O backend não oferece endpoints de catálogo para mídia, eventos, equipes ou contatos dentro de `/whatsapp`; por isso os filtros avançados e seleção de mídia aceitam IDs explícitos, além do upload direto. Isso é funcional, mas menos amigável do que seletores pesquisáveis.
- O bundle frontend continua emitindo o aviso existente de chunks grandes; code splitting está fora do escopo desta tarefa.
