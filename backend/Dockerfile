FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV BACKEND_HOST=0.0.0.0
ENV BACKEND_PORT=3001
EXPOSE 3001
# Named volume may lag package.json after dependency changes — sync before dev.
CMD ["sh", "-c", "pnpm install && pnpm dev"]

FROM base AS runner
ENV NODE_ENV=production
ENV BACKEND_HOST=0.0.0.0
ENV BACKEND_PORT=3001
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod
COPY . .
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:3001/health" > /dev/null || exit 1
CMD ["pnpm", "start"]
