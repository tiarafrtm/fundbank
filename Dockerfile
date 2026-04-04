# ==============================================================
# Stage 1 — Builder
# Install semua deps, build bundle via esbuild, lalu jalankan
# pnpm deploy untuk buat folder produksi yang self-contained.
# ==============================================================
FROM node:22-alpine AS builder

# Build tools: dibutuhkan saat install @whiskeysockets/baileys (protobufjs native)
RUN apk add --no-cache python3 make g++ git

WORKDIR /repo

# Aktifkan corepack agar pnpm tersedia tanpa install manual
RUN corepack enable

# Copy manifest dulu (layer cache — install ulang hanya saat lockfile berubah)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/api-zod/package.json      ./lib/api-zod/package.json
COPY lib/db/package.json           ./lib/db/package.json
COPY artifacts/api-server/package.json ./artifacts/api-server/package.json

RUN pnpm install --frozen-lockfile

# Copy source code setelah install supaya cache node_modules tidak batal
COPY lib/                 ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

# Build — esbuild bundle semua workspace deps ke dist/index.mjs
RUN pnpm --filter @workspace/api-server run build

# pnpm deploy buat folder produksi:
# - Salin package + node_modules (hanya prod deps, workspace deps di-flatten)
# - dist/ & public/ ikut karena ada di package dir saat deploy dijalankan
RUN pnpm --filter @workspace/api-server deploy --prod --legacy /deploy

# ==============================================================
# Stage 2 — Runner (image sekecil mungkin)
# ==============================================================
FROM node:22-alpine AS runner

# OpenSSL: dibutuhkan oleh @whiskeysockets/baileys saat runtime
RUN apk add --no-cache openssl

WORKDIR /app

# Ambil hasil pnpm deploy (node_modules prod + semua file package)
COPY --from=builder /deploy .

# Pastikan dist & public ada (override kalau pnpm deploy sudah include)
COPY --from=builder /repo/artifacts/api-server/dist   ./dist
COPY --from=builder /repo/artifacts/api-server/public ./public

# Buat folder wa_session default (bisa di-override via WA_SESSION_PATH + Railway Volume)
RUN mkdir -p /app/wa_session /data/wa_session

ENV NODE_ENV=production
ENV PORT=8080
ENV WA_SESSION_PATH=/data/wa_session

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
