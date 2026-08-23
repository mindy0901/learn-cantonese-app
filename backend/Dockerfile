# Debian base (glibc) — required for manylinux wheels (opencv/onnxruntime) used
# by RapidOCR. Alpine/musl cannot build opencv-python for the Python 3.14 venv.
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
        wget python3 python3-venv python3-pip gcc g++ make \
        libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/translate-venv \
    && /opt/translate-venv/bin/pip install --no-cache-dir \
        deep-translator psycopg2-binary rapidocr onnxruntime
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="$PNPM_HOME/bin:$PATH"
RUN wget -qO- https://get.pnpm.io/install.sh | env PNPM_VERSION=11.22.0 ENV="$HOME/.bashrc" SHELL="$(which bash)" bash -
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
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
