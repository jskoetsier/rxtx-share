<!--
Version: 1.0.0
Last updated: 2026-05-05
Author: Rxtx Share maintainers
-->

# Rxtx Share

Self-hosted file sharing: create time-limited links, optional passwords, email notifications, and ZIP downloads—similar in spirit to consumer “send big files” services, but under your control.

## Features

- Chunked uploads for large files  
- Share links with expiration  
- Passwords, view limits, and optional ClamAV scanning  
- Email recipients and reverse-share (“request files”) flows  
- Local disk or S3-backed storage  
- Local auth, LDAP, and OAuth/OIDC (GitHub, Google, Microsoft, Discord, generic OIDC)  
- Admin UI for configuration; optional `config.yaml` for locked settings  
- Internationalized UI (many locales)

## Architecture

Monorepo with two applications:

| Part | Stack | Default URL |
| --- | --- | --- |
| **Backend** | NestJS, Prisma, SQLite (or your DB URL) | `http://localhost:8080` — routes under `/api` |
| **Frontend** | Next.js 14 (Pages Router), Mantine v6 | `http://localhost:3333` in dev |

Production often runs both behind a reverse proxy (e.g. Caddy): `/api` → NestJS, everything else → Next.js.

## Quick start (Docker)

1. Copy or use the provided `docker-compose.yml` (and adjust volumes/env as needed).  
2. Run:

   ```bash
   docker compose up -d
   ```

3. Open the app (default `http://localhost:3000` in many setups).

Data (uploads and the default SQLite file) usually live under `backend/data/` in the container layout described in this project’s Docker docs.

## Local development

From the repository root:

```bash
# Dependencies
cd backend && npm install && cd ../frontend && npm install

# Database (SQLite default)
cd backend && npx prisma db push && npx prisma db seed

# Terminal 1 — API
cd backend && npm run dev

# Terminal 2 — UI
cd frontend && npm run dev
```

The frontend expects `API_URL` (default `http://localhost:8080`) when calling the backend.

Useful scripts (see each `package.json`):

- `npm run format` / `npm run lint` at repo root  
- `cd backend && npm run build`  
- `cd backend && npm run test:system` (Postman/Newman against a running API)

## Configuration

- **Admin UI**: `/admin/config/...` (requires an admin account).  
- **YAML**: optional `config.yaml` (see `config.example.yaml`); some keys can be marked locked and only set there.  
- **Precedence**: YAML → database → seeded defaults (details in project docs).

## Documentation

Extended guides (install variants, OAuth, upgrades) live in the **`docs/`** site sources in this repo and may be published separately; check the project’s documentation link in the repo metadata or `package.json` for the current URL.

## Security

Report vulnerabilities responsibly; see `SECURITY.md`.

## License

See `LICENSE` in the repository root.
