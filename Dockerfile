FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/src/game ./src/game
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '8787') + '/healthz').then(response => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "--import", "tsx", "server/index.ts"]
