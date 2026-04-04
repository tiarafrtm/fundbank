# ==============================================================
# Stage 1 — Builder
# Install semua deps, build bundle via esbuild, lalu jalankan
# pnpm deploy untuk buat folder produksi yang self-contained.
# ==============================================================
FROM node:22-alpine AS builder

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
RUN pnpm --filter @workspace/api-server deploy --prod /deploy

# ==============================================================
# Stage 2 — Runner (image sekecil mungkin)
# ==============================================================
FROM node:22-alpine AS runner

WORKDIR /app

# Ambil hasil pnpm deploy (node_modules prod + semua file package)
COPY --from=builder /deploy .

# Pastikan dist & public ada (override kalau pnpm deploy sudah include)
COPY --from=builder /repo/artifacts/api-server/dist   ./dist
COPY --from=builder /repo/artifacts/api-server/public ./public

# Buat folder wa_session — Railway akan mount volume di sini
# Set WA_SESSION_PATH=/data/wa_session (atau path lain) via env var Railway
RUN mkdir -p /app/wa_session

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
