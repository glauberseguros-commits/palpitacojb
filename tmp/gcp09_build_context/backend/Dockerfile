FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo

COPY package.json package-lock.json ./

RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY --chown=node:node . .

RUN mkdir -p /app/logs \
    && chown -R node:node /app/logs

USER node

CMD ["node", "scripts/runAutoImportHeartbeat.js"]