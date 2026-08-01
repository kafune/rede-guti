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
