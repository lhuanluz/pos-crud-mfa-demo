# Debian-based runtime image, aligned with the professor requirement for Debian/Ubuntu environments.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production     PORT=3001     DB_PATH=/app/data/data.db
WORKDIR /app
RUN useradd --system --uid 10001 --create-home --home-dir /home/appuser appuser     && mkdir -p /app/data     && chown -R appuser:appuser /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist
USER appuser
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3   CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
