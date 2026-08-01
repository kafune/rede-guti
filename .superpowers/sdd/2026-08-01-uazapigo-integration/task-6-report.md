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

Resultado: 4 arquivos de teste, 20 testes, 20 aprovados.

```text
bun run build
```

Resultado: frontend Vite/PWA aprovado. Há apenas o aviso já existente de chunks acima de 500 kB.

```text
cd backend && bun run build
```

Resultado: backend TypeScript aprovado.

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
- `vitest.config.ts`, `vitest.setup.ts`, `package.json`, `bun.lock`, `App.tsx`

Os arquivos raiz `api.ts` e `types.ts` não foram alterados.

## Preocupações

- O backend não oferece endpoints de catálogo para mídia, eventos, equipes ou contatos dentro de `/whatsapp`; por isso os filtros avançados e seleção de mídia aceitam IDs explícitos, além do upload direto. Isso é funcional, mas menos amigável do que seletores pesquisáveis.
- O bundle frontend continua emitindo o aviso existente de chunks grandes; code splitting está fora do escopo desta tarefa.
