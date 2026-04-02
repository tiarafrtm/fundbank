# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database & Auth**: Supabase (external)
- **Push notifications**: OneSignal
- **WhatsApp notifications**: @whiskeysockets/baileys (Baileys v7)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server (banking queue system)
│       ├── src/
│       │   ├── config/         # Supabase & OneSignal config
│       │   ├── controllers/    # Auth, Antrian, Notif controllers
│       │   ├── middleware/     # Auth + Teller JWT middleware
│       │   ├── routes/         # API route definitions
│       │   └── services/       # OneSignal, WhatsApp, Antrian services
│       ├── public/             # Teller web dashboard (HTML/CSS/JS)
│       │   ├── index.html
│       │   ├── css/style.css
│       │   └── js/dashboard.js
│       ├── supabase_schema.sql # SQL to run in Supabase SQL Editor
│       └── .env.example
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml     # pnpm workspace
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package
```

## Banking Queue System — API Endpoints

### Auth (`/api/auth/*`)
- `POST /api/auth/register` — Register nasabah (nama, email, password, no_hp)
- `POST /api/auth/login` — Login, returns JWT token
- `GET /api/auth/me` — Get current user profile (requires Bearer token)

### Antrian (`/api/antrian/*`)
- `POST /api/antrian/ambil` — Nasabah ambil nomor antrian (requires auth, body: layanan, onesignal_player_id)
- `GET /api/antrian/status` — Nasabah cek posisi antrian mereka (requires auth)
- `GET /api/antrian/list` — Teller lihat semua antrian menunggu (requires teller role)
- `PUT /api/antrian/panggil` — Teller panggil berikutnya (requires teller role, triggers notifications)
- `PUT /api/antrian/selesai/:id` — Teller tandai selesai (requires teller role)
- `DELETE /api/antrian/batal/:id` — Nasabah batalkan antrian (requires auth)

### Notif (`/api/notif/*`)
- `GET /api/notif/status` — Cek status koneksi WA & OneSignal (requires teller role)
- `POST /api/notif/test-push` — Test push notification (requires teller role)
- `POST /api/notif/test-wa` — Test pesan WhatsApp (requires teller role)

### Teller Dashboard
- `GET /api/dashboard/` — Web dashboard teller (HTML/CSS/JS)

## Supabase Setup (REQUIRED)

Run `artifacts/api-server/supabase_schema.sql` in Supabase SQL Editor to create tables:
- `public.profiles` (id, nama, no_hp, role, onesignal_player_id, created_at)
- `public.antrian` (id, user_id, nomor_antrian, layanan, status, notif_sent, created_at, called_at)

To promote a user to teller role, run in Supabase SQL Editor:
```sql
UPDATE public.profiles SET role = 'teller' WHERE id = 'USER_UUID_HERE';
```

## Environment Variables

Set in Replit Secrets:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `ONESIGNAL_APP_ID`
- `ONESIGNAL_API_KEY`

## WhatsApp Setup

On server start, Baileys will try to connect to WhatsApp. If not logged in, a QR code appears in the terminal logs. Scan it with WhatsApp (Linked Devices). Session is saved in `wa_session/` folder.

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/db run push` — push DB schema (for Drizzle, not Supabase)

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server for banking queue management system.

- Entry: `src/index.ts` — reads `PORT`, initializes WhatsApp, starts Express
- App setup: `src/app.ts` — CORS, JSON parsing, static files at `/api/dashboard`, routes at `/api`
- Routes: `src/routes/index.ts` mounts health, auth, antrian, notif routers
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.mjs`)
