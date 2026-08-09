# Módulo Territorial — Igrejas × Zona Eleitoral × Equipes × Visitas

Sistema operacional territorial de Guarulhos construído **dentro da stack atual**
(Fastify + Prisma + Postgres + React/Vite, multi-tenant) — sem PostGIS e sem
reescrever para Supabase/Next. A hierarquia acompanhada é:

```
Guarulhos → Zonas Eleitorais → Igrejas → Equipes → 2 visitas → check-in GPS → foto → resultado
```

## Como a Zona Eleitoral é resolvida (sem PostGIS)

O TSE/TRE não publicam polígonos oficiais confiáveis de zona. A fonte usada é o
**"Mapa Político de Guarulhos"** (foto da coordenação), digitalizado como
dicionário `bairro → zona` (`backend/src/lib/territory.ts`, 7 zonas / 137 bairros).

`ElectoralZoneResolver` (`backend/src/lib/zoneResolver.ts`) classifica pelo bairro:

- **1 zona candidata** → confiança alta (0.9), sem revisão.
- **Bairro em >1 zona** (ex.: Bonsucesso 394/395, Vila Progresso 176/278) →
  `requer validação`.
- **Bairro fora do dicionário** → `requer validação`.

Nunca apresenta estimativa como oficial. A coordenação valida/override manual na
tela da igreja; toda troca de zona vai para `audit_logs`. Para corrigir/ampliar o
dicionário, edite `GUARULHOS_ZONES` e rode o seed de novo (idempotente).

## Deploy

O módulo entra automaticamente no fluxo de deploy existente:

```bash
# aplica a migration 20260809000000_add_territory
npm run prisma:deploy
# semeia zonas + dicionário bairro→zona (idempotente) + settings padrão
npm run seed
```

`prisma migrate deploy` só adiciona colunas/tabelas novas — a igreja ganha campos
territoriais opcionais e o restante são tabelas novas. Nada existente é alterado.

### Flags por instância

| Flag | Onde | Default | Efeito |
|---|---|---|---|
| `TERRITORY_SEED` | backend `.env` | `true` | `false` não semeia zonas (instâncias fora de Guarulhos) |
| `VITE_TERRITORY_ENABLED` | build frontend | `true` | `false` esconde a aba Território |

## Geocodificação (endereço → lat/lng)

Mapa e geofence dependem de coordenada por igreja. A importação já aceita colunas
`lat`/`lng`; quando faltam, use o **geocodificador em lote** (aba Igrejas → botão
**Geocodificar**, coordenação). Provedor padrão: **Nominatim/OSM** (grátis).

- Respeita ~1 req/s no servidor; o frontend chama em lotes (5) até acabar.
- `geocode_cache` evita reconsultar o mesmo endereço (guarda inclusive negativos).
- Igreja sem resultado fica marcada `geocodingProvider = nao_encontrado` e sai do
  lote; ao corrigir o endereço na tela da igreja, o marcador é limpo e ela volta.
- Abstração `GeocodingProvider` (`backend/src/lib/geocoding.ts`) isola o provedor
  — trocar por Google/Mapbox depois não afeta o resto.

Env (backend, todas opcionais):

| Env | Default | Uso |
|---|---|---|
| `GEOCODER_PROVIDER` | `nominatim` | provedor |
| `NOMINATIM_URL` | `https://nominatim.openstreetmap.org` | endpoint |
| `GEOCODER_USER_AGENT` | `rede-guti-territorial/1.0 …` | exigido pela política do OSM |
| `GEOCODER_EMAIL` | — | identificação (recomendado pelo Nominatim) |
| `GEOCODER_DEFAULT_CITY` / `_STATE` | `Guarulhos` / `SP` | completa endereços sem cidade |

> Para geocodificar as ~858 igrejas de uma vez, deixe o botão rodando (leva
> alguns minutos pela cota de 1 req/s). Endereços não encontrados aparecem no
> filtro por revisão para correção manual.

## Configuração operacional (`territory_settings`, uma linha por tenant)

- `checkin_radius_meters` (100) — raio ideal do geofence.
- `checkin_warn_meters` (200) — raio de atenção.
- `require_photo` (true) — foto obrigatória para concluir.
- `visits_per_church` (2) — quantas visitas gerar por igreja.

O geofence é **tolerante à precisão do GPS** (não bloqueia automaticamente): parte
da imprecisão informada pelo aparelho entra a favor; check-ins fora do raio exigem
justificativa e caem na fila de **Revisão**.

## Fluxo do motorista (sem login)

Cada visita gera um link individual `#/v/{token}` (token aleatório, revogável).
No celular: aviso de privacidade → check-in (GPS) → foto do local (câmera traseira)
→ resultado → conclusão. A localização só é capturada na ação de check-in
(nunca rastreamento contínuo). O check-in é **append-only** (`visit_checkins`): o
original nunca é sobrescrito.

## Papéis

Mantidos os 3 papéis atuais (sem inflar para 7): **Coordenador** edita tudo;
**Verificadora** visualiza; o **motorista** opera pelo link público, sem conta.

## Endpoints

- `/territory/*` (autenticado): `zones`, `churches` (CRUD/import/reclassify/zone),
  `churches/:id/visits/generate`, `teams` (+members), `assign`, `visits`
  (agenda/status/revoke-token), `review`, `dashboard`, `settings`.
- `/public/visits/:token` (motorista): `GET`, `checkin`, `photo`, `outcome`.

## O que ficou fora do MVP (por decisão de custo/benefício)

PostGIS, migração Supabase/Next, RBAC de 7 papéis, sincronização offline real,
EXIF, otimização de rota. Ganchos previstos no schema/arquitetura para evoluir
sem retrabalho.

## Armazenamento de fotos (MVP)

Fotos são reduzidas no cliente (~1280px, JPEG) e guardadas como data URL no
banco, com hash SHA-256 do arquivo. Caminho de evolução: mover para object
storage (a coluna vira URL) sem mudar o fluxo.
