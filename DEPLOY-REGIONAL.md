# Deploy — Segunda instância (vertical regional)

Roteiro para colocar no ar uma instância **independente** do Redgut (dados, usuários e
hierarquia próprios), a partir do mesmo código-fonte. A instância original não é tocada.

> **Fase B (multi-tenant):** o schema agora suporta várias instâncias no
> **mesmo banco**, isoladas por `tenant_id` + `TENANT_SLUG` no `backend/.env`.
> Este roteiro (banco próprio por instância) continua válido; para compartilhar
> o Postgres entre instâncias ou consolidar bancos, ver `MULTITENANCY.md`.

## Visão geral

| | Instância 1 (igrejas/SP) | Instância regional |
|---|---|---|
| Checkout no VPS | `/home/paiva/rede-guti` | `/home/paiva/rede-guti-regional` |
| Compose | `docker-compose.yml` | `docker-compose.regional.yml` (`-p rede-regional`) |
| Banco | `rede_evangelica` (volume `rede-guti_db_data`) | `rede_regional` (volume `rede-regional_db_data`) |
| Domínio | `redeguti.ddnsfree.com` | `REGIONAL_DOMAIN` (ex.: `regional.redeguti.ddnsfree.com`) |
| Frontend build | `/var/www/rede/dist` | `/var/www/rede-regional/dist` |
| API no host | `127.0.0.1:4000` | `127.0.0.1:4001` |

## 1. Preparar o VPS

```bash
# Segundo checkout do mesmo repositório
git clone https://github.com/kafune/rede-guti.git /home/paiva/rede-guti-regional
mkdir -p /var/www/rede-regional/dist
```

Aponte o DNS do novo domínio para o VPS (mesmo IP; o Traefik roteia por `Host`).

## 2. Configurar variáveis

**`.env` na raiz do checkout regional** (lido pelo compose):

```env
REGIONAL_DOMAIN=regional.redeguti.ddnsfree.com
REGIONAL_DIST_DIR=/var/www/rede-regional/dist
REGIONAL_NGINX_CONF=/home/paiva/rede-guti-regional/nginx-spa.conf
REGIONAL_DB_NAME=rede_regional
REGIONAL_DB_USER=postgres
REGIONAL_DB_PASSWORD=<senha forte>
REGIONAL_API_PORT=4001
```

**`backend/.env` do checkout regional** (lido pela API). Além das variáveis usuais
(ver `backend/.env.example`), atenção obrigatória a:

```env
DATABASE_URL="postgresql://postgres:<senha>@db-regional:5432/rede_regional?schema=public"
# CRÍTICO: segredo próprio, diferente da instância 1 — um token de login de uma
# instância NÃO pode ser válido na outra.
JWT_SECRET="<segredo novo e aleatório>"
COORD_EMAIL="coordenacao@vertical-regional.com"
COORD_PASSWORD="<senha>"
COORD_NAME="Coordenação Regional"
LR_EMAIL="lider@vertical-regional.com"
LR_PASSWORD="<senha>"
APP_PUBLIC_URL="https://regional.redeguti.ddnsfree.com"
# Token próprio se a vertical usar as automações n8n
# AUTOMATION_API_TOKEN="<token novo>"

# Parâmetros da instância
GEO_DATASET="sp"            # ou <nome> → backend/src/data/municipios_<nome>.csv
GEO_STATE_CODE="SP"
CHURCH_FIELD_ENABLED="false" # vertical regional não coleta igreja
```

## 3. Dataset geográfico (se a área não for o estado de SP)

- **Backend**: criar `backend/src/data/municipios_<nome>.csv` no mesmo layout do
  `municipios_sp_645.csv` (cabeçalho + linhas `codigo,nome`) e definir `GEO_DATASET=<nome>`.
- **Frontend**: fornecer `data/<nome>.geo.json` (FeatureCollection com
  `properties.id`/`properties.name` por município) e definir `VITE_GEO_DATASET=<nome>`
  no build, junto com `VITE_GEO_MAP_TITLE`, `VITE_GEO_LOADING_LABEL` e
  `VITE_GEO_TOTAL_MUNICIPALITIES`.

Se a vertical regional também cobre o estado de SP, nada disso é necessário — os
defaults já servem.

## 4. Build do frontend (variáveis `VITE_*`)

O branding/geografia do frontend é resolvido em build-time. O workflow
`deploy-regional.yml` já faz isso no CI; para build manual:

```bash
cat > .env.local <<'EOF'
VITE_API_URL=/api
VITE_CHURCH_FIELD_ENABLED=false
VITE_BRAND_NAME=Rede Regional
VITE_BRAND_CAMPAIGN=Guti 2026
VITE_BRAND_INITIAL=G
VITE_BRAND_SHARE_NAME=Rede Guti 2026 – Regional
VITE_BRAND_TAGLINE=Rede de Apoiadores por Região
VITE_BRAND_NETWORK_TOTAL_LABEL=Total da Rede Regional
VITE_BRAND_WELCOME_TITLE=Bem-vindo à Rede Regional!
VITE_BRAND_FOOTER=Guti 2026 • Rede Regional
VITE_BRAND_PUBLIC_HEADER=Rede Regional · Guti 2026
VITE_BRAND_DIRECT_LEADERSHIP_LABEL=Liderança Direta
VITE_BRAND_HTML_TITLE=Rede de Apoiadores – Regional (Guti 2026)
VITE_BRAND_HTML_DESCRIPTION=Aplicativo para cadastro e gestão de apoiadores por região.
VITE_BRAND_SITE_NAME=Rede de Apoiadores – Regional
VITE_BRAND_PUBLIC_URL=https://regional.redeguti.ddnsfree.com
VITE_BRAND_PWA_NAME=Rede Regional (Guti 2026)
VITE_BRAND_PWA_SHORT_NAME=Rede Regional
VITE_BRAND_PWA_DESCRIPTION=Aplicativo para cadastro e gestão de apoiadores por região.
EOF
bun install --frozen-lockfile
bun run build
rsync -az --delete dist/ /var/www/rede-regional/dist/
```

Rótulos de papéis também são configuráveis (`VITE_ROLE_LABEL_COORDENADOR`,
`VITE_ROLE_LABEL_LIDER_REGIONAL`, `VITE_ROLE_LABEL_VERIFICADORA`) — sem essas
variáveis valem "Coordenador", "Lider Regional" e "Verificadora".

## 5. Subir a stack e inicializar o banco

```bash
cd /home/paiva/rede-guti-regional
docker compose -p rede-regional -f docker-compose.regional.yml build api
docker compose -p rede-regional -f docker-compose.regional.yml up -d
# Banco novo e vazio: aplica todas as migrations e cria os acessos iniciais
docker compose -p rede-regional -f docker-compose.regional.yml exec -T api npm run prisma:deploy
docker compose -p rede-regional -f docker-compose.regional.yml exec -T api npm run seed
```

Nenhum dado da instância 1 é copiado — o isolamento é total por construção.

## 6. Verificação

- `https://<REGIONAL_DOMAIN>/api/health` responde.
- Login com as credenciais de seed funciona; um token da instância 1 **não** autentica
  aqui (segredos JWT distintos).
- Cadastro público ponta a ponta: formulário → município validado contra o dataset da
  instância → indicação criada (sem campo igreja quando `CHURCH_FIELD_ENABLED=false`).
- A instância 1 continua intacta em seu domínio.

## Scripts utilitários de banco

Os scripts `scripts/db-*.sh` funcionam na instância regional sem alteração, via as
variáveis nativas do Docker Compose mais as do próprio script:

```bash
cd /home/paiva/rede-guti-regional
COMPOSE_FILE=docker-compose.regional.yml COMPOSE_PROJECT_NAME=rede-regional \
  DB_SERVICE=db-regional POSTGRES_DB=rede_regional ./scripts/db-shell.sh
```
