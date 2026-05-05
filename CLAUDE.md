# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install deps for both frontend and backend
cd backend && npm install && cd ../frontend && npm install

# Start development servers (backend first)
cd backend && npm run dev     # NestJS on :8080
cd frontend && npm run dev    # Next.js on :3333

# Format & lint (run from repo root)
npm run format
npm run lint

# Build backend
cd backend && npm run build

# Seed database
cd backend && npx prisma db push && npx prisma db seed

# Run backend system tests (Newman/Postman based)
cd backend && npm run test:system
```

## Architecture

Rxtx Share is a self-hosted file sharing platform (WeTransfer alternative). It consists of two apps in a monorepo:

### Backend — NestJS (`backend/`)

The backend runs on `:8080` and exposes all routes under `/api`. The module structure:

- **`Share`** — core file-sharing logic: creating, viewing, downloading, and expiring shares
- **`File`** — abstraction over storage providers; delegates to `LocalFileService` (disk) or `S3FileService` based on config
- **`ReverseShare`** — "reverse shares" where someone requests files from a user via a link
- **`Auth`** — local auth (argon2 + Passport JWT/Local), refresh tokens, login tokens for email-based passwordless login
- **`OAuth`** — OAuth/OIDC providers: GitHub, Google, Microsoft, Discord, generic OIDC. Maps external identities to local users via the `OAuthUser` model
- **`User`** — user CRUD, TOTP setup, admin user management
- **`Config`** — the configuration system (see below)
- **`Email`** — sends notification emails for shares, password resets, invites, and reverse shares via Nodemailer
- **`ClamScan`** — ClamAV integration for scanning uploaded files
- **`Jobs`** — scheduled tasks (cleanup expired shares, remove unused files)
- **`Cache`** — caching abstraction using `cache-manager` with optional Redis
- **`Prisma`** — Prisma client module shared across all services

**Configuration system**: App config can be set via a YAML file (`config.yaml`, see `config.example.yaml`) or via the admin UI. Config values are stored in the `Config` database table (key-value by `name` + `category`). The `ConfigService` first checks the YAML file, then falls back to the database value, then the default. Configs are runtime-mutable and `locked` configs can only be set via YAML.

**Database**: Prisma with SQLite by default (`backend/data/rxtx-share.db`). Path is configurable via `DATABASE_URL` env var. Schema lives at `backend/prisma/schema.prisma`.

### Frontend — Next.js (`frontend/`)

Uses **Pages Router** (Next.js 14) with Mantine UI v6 component library.

- **Routing**: `src/pages/` structure — `/upload` (main share creation), `/share/[shareId]` (view/download), `/s/[shareId]` (short share link), `/admin/config/[category]` (admin panel), `/auth/*` (sign in/up/TOTP/reset password), `/account`
- **Middleware** (`src/middleware.ts`): edge middleware that handles auth-based redirects and route gating based on app config (registration enabled, unauthenticated shares, legal pages)
- **i18n**: `react-intl` with translations loaded from `src/i18n/`. Locale auto-detected from `Accept-Language` header with cookie override
- **API proxy**: Frontend is a standalone Next.js server that calls the backend at `API_URL` (default `localhost:8080`). API calls use `axios` via services (`src/services/`)
- **Auth flow**: On first page load, `_app.tsx` `getInitialProps` calls the backend to hydrate user and config into React contexts (`UserContext`, `ConfigContext`). Token refresh runs on a 2-minute interval

### Docker / Production

In production, a **Caddy** reverse proxy (`reverse-proxy/Caddyfile`) routes `/api/*` to the NestJS backend and all other requests to the Next.js frontend. The Dockerfile uses multi-stage builds and runs both servers inside one container.

- Data is stored in `backend/data/` (uploads + SQLite DB)
- Default port: `3000`
- Healthcheck: `GET /api/health`

### Key patterns

- Chunked uploads: the frontend splits files into configurable-size chunks and uploads them sequentially via the `File` controller
- Shares get unique 8-character nanoid IDs (length configurable)
- Zip downloads: shares can be downloaded as a zip; the backend creates zips on-demand using `archiver`
- All shares have an expiration date; a scheduled job deletes expired shares
