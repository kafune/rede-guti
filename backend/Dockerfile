FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
COPY prisma.config.ts ./
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}

RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev

COPY --from=build /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=build /app/dist /app/dist
COPY prisma ./prisma
COPY prisma.config.ts ./

CMD ["node", "dist/server.js"]
