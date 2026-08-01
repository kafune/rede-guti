# Task 3 — relatório de implementação

## Status

Implementada a resolução tenant-aware de públicos, prévia, envio direto de teste e criação/listagem/detalhe de campanhas WhatsApp via `POST /sender/advanced` da Uazapi v2.1.1.

## Implementação

- `AudienceFilter` discriminado para `LEADERS`, `SUPPORTERS`, `EVENT_GUESTS` e `TEAM_CONTACTS`.
- Filtros por papéis, atividade, hierarquia recursiva, IDs selecionados, status, municípios, igrejas, lideranças, intervalo de criação, evento, equipes e tipos de contato.
- Resolução determinística com normalização brasileira, deduplicação, supressão ativa e contadores separados.
- Prévia com todas as linhas auditáveis e até dez amostras válidas personalizadas.
- Limite de 1.000 aplicado somente a telefones válidos únicos.
- Rodapé de marketing aplicado antes da personalização.
- Envio de teste normaliza um telefone e envia todos os itens sem criar campanha ou destinatário.
- Criação transacional congela campanha e todas as linhas da prévia antes da chamada remota.
- Envio avançado usa mensagens personalizadas, delays configurados, `info` da campanha e `scheduled_for` em epoch milliseconds.
- Sucesso persiste metadados da pasta e marca destinatários válidos como `QUEUED`.
- Falha remota preserva campanha/destinatários válidos como `FAILED`, mantém excluídos auditáveis e grava somente mensagem sanitizada.
- Rotas de listagem e detalhe usam o Prisma tenant-aware existente.
- Autorização herdada do agrupamento `/whatsapp`: somente coordenadores do tenant atual.

## Arquivos

- Criado `backend/src/whatsapp/domain/audience.ts`.
- Criado `backend/src/whatsapp/services/audience-service.ts`.
- Criado `backend/src/whatsapp/services/campaign-service.ts`.
- Criado `backend/src/routes/whatsapp/campaigns.ts`.
- Modificado `backend/src/routes/whatsapp/index.ts`.
- Criado `backend/test/whatsapp/audience.test.ts`.
- Criado `backend/test/whatsapp/campaign-create.integration.test.ts`.

## TDD — RED

Banco exclusivo criado e migrado:

```text
rede_evangelica_uazapi_task3_codex
16 migrations applied successfully
```

Comando:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/rede_evangelica_uazapi_task3_codex?schema=public' \
  bun test test/whatsapp/audience.test.ts test/whatsapp/campaign-create.integration.test.ts
```

Resultado RED observado:

```text
0 pass
9 fail
audience-service ausente; rotas de campanhas retornando 404
```

Uma primeira execução revelou também um fixture incompatível com o `NOT NULL` real de `indicated_by`; o fixture foi corrigido e o RED foi repetido até restarem somente as falhas do comportamento ausente.

## TDD — GREEN

Comando focado após implementação:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/rede_evangelica_uazapi_task3_codex?schema=public' \
  bun test test/whatsapp/audience.test.ts test/whatsapp/campaign-create.integration.test.ts
```

Resultado:

```text
7 pass, 0 fail no processo principal
O teste de campanhas executa isoladamente um cenário filho com 8 testes de integração reais.
```

O isolamento em subprocesso evita que o singleton de configuração carregado pelo upstream falso da campanha contamine `resources.integration.test.ts` quando toda a suíte roda no mesmo processo Bun.

Comando da suíte completa:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/rede_evangelica_uazapi_task3_codex?schema=public' bun test
```

Resultado observado antes do relatório:

```text
53 pass, 0 fail, 144 expect() calls
```

Comando de build:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/rede_evangelica_uazapi_task3_codex?schema=public' bun run build
```

Resultado:

```text
tsc exit 0
```

## Self-review

- Conferidos os requisitos do brief um a um.
- Conferido que o rodapé de marketing antecede a personalização.
- Conferido que somente linhas válidas entram no payload remoto.
- Conferido que inválidos, duplicados e suprimidos são persistidos na auditoria.
- Conferido que erros remotos não expõem token nem corpo upstream.
- Conferido escopo tenant-aware em consultas e persistência.
- `git diff --check` sem erros.

## Preocupações

- O contrato do brief não especifica paginação para `GET /whatsapp/campaigns`; a implementação retorna a lista tenant-scoped ordenada por criação, coerente com as rotas de recursos existentes.
- Conteúdos que referenciam uma mídia persistida resolvem seu `publicToken`; IDs não encontrados são tratados como token público para manter compatibilidade com conteúdo já serializado.
- O banco descartável é removido ao final da execução e não contém dados do usuário.

## Fix round 1

### Findings corrigidos

- O contrato de criação agora aceita exclusivamente `consentimentoConfirmado: true`; ausência, `false` e o alias incorreto `consent: true` retornam 400 sem persistência nem chamada remota.
- O autor continua congelado em `createdById` e o instante do consentimento em `consentAt`.
- `scheduledAt` inválido ou menor/igual ao instante de criação é rejeitado antes de configuração, persistência ou Uazapi.
- A fase remota e a consolidação local foram separadas: somente uma rejeição de `sendAdvanced` marca campanha e destinatários válidos como `FAILED`.
- Depois de uma resposta aceita pela Uazapi, falha de consolidação local retorna 503 seguro de estado indeterminado, não grava `FAILED` e não repete `/sender/advanced`.

### TDD — RED

O cenário real foi executado diretamente no processo filho contra `e3067b3`, em banco PostgreSQL descartável recriado do zero:

```bash
CAMPAIGN_CREATE_SCENARIO_CHILD=1 \
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/rede_evangelica_uazapi_task3_codex?schema=public' \
bun test test/whatsapp/campaign-create.integration.test.ts
```

RED do consentimento:

```text
Expected 400, received 201 para consent: true
Expected 201, received 400 para consentimentoConfirmado: true
4 pass, 6 fail (casos conformes subsequentes bloqueados pelo schema antigo)
```

Após a correção mínima exclusiva do nome do campo, os outros findings ficaram observáveis sem mascaramento:

```text
Agendamento no passado: expected 400, received 201
Falha local após aceite remoto: expected 503, received 502
8 pass, 2 fail
```

Depois da validação temporal mínima, permaneceu o RED específico da separação das fases:

```text
Falha local após aceite remoto: expected 503, received 502
9 pass, 1 fail
```

O seam determinístico usa o PostgreSQL real: um trigger temporário rejeita somente a transição de destinatário `PENDING` → `QUEUED`, depois que o upstream falso já aceitou `/sender/advanced`. O teste remove trigger/função em `finally` e prova uma chamada remota, campanha não-`FAILED` e nenhum destinatário `FAILED`.

### GREEN e verificação

Comando focado do cenário filho:

```text
10 pass, 0 fail, 52 expect() calls
```

Suíte backend completa, após nova recriação/migração do banco descartável:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/rede_evangelica_uazapi_task3_codex?schema=public' bun test
```

```text
53 pass, 0 fail, 144 expect() calls
O wrapper inclui o cenário filho com os 10 testes de integração acima.
```

Build:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/rede_evangelica_uazapi_task3_codex?schema=public' bun run build
```

```text
tsc exit 0
```

### Arquivos do fix

- `backend/src/routes/whatsapp/campaigns.ts`
- `backend/src/whatsapp/services/campaign-service.ts`
- `backend/test/whatsapp/campaign-create.integration.test.ts`
- `.superpowers/sdd/2026-08-01-uazapigo-integration/task-3-report.md`

### Self-review do fix

- O schema é `strict`, portanto o alias `consent` não é aceito junto ou isoladamente.
- A comparação temporal usa um único instante capturado na entrada de `createCampaign`; igualdade também é rejeitada.
- `remoteFolder` e todas as atualizações locais ficam fora do `catch` que marca falha remota.
- O 503 pós-aceite não contém erro SQL, payload upstream ou credenciais e instrui explicitamente a não repetir automaticamente.
- O seam exerce banco, rota, serviço e cliente reais; apenas a Uazapi externa permanece substituída pelo upstream HTTP controlado já usado pelo teste.
