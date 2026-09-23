# NovarQuiz

NovarQuiz is an interactive quiz platform built around branching, graph-based question flows. It supports live host-led sessions, team and solo play modes, real-time leaderboards, and an admin analytics dashboard.

The app is built on **Next.js 16 (App Router)** and **React 19**, with **PostgreSQL** for persistent content and **Firebase Realtime Database** for live session state.

## Highlights

- Node-based quiz editor for branching question graphs
- Live host lobbies with shareable join tokens / QR codes
- Solo and team play modes
- Real-time leaderboard updates
- Admin analytics dashboard
- Firebase-backed authentication with server-side session cookies
- English and Thai UI (i18next)

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Persistent DB | PostgreSQL (Docker or Neon) |
| Live state | Firebase Realtime Database |
| Auth | Firebase Auth + signed session cookies (`jose`) |
| Rate limiting | Upstash Redis (`@upstash/ratelimit`) with in-process fallback |
| Validation | Zod |
| Animation | Motion |
| Media | Sharp, FFmpeg (WASM) |

## Requirements

- Node.js 20+
- `npm` or `bun`
- A Firebase project with:
  - Web app credentials
  - Realtime Database enabled
  - Storage enabled
  - A service account for server routes
- Either Docker Desktop (local Postgres) **or** a Neon Postgres database

## Environment Setup

Two local database setups are supported:

- `docker` — local PostgreSQL via `docker-compose.yml`
- `neon` — hosted PostgreSQL via Neon

Copy one of the example env files:

```bash
cp .env.local.example .env.local
# or
cp .env.neon.example .env.neon
```

Fill in:

- `DATABASE_URL`
- Firebase client variables (`NEXT_PUBLIC_FIREBASE_*`)
- Firebase Admin credentials (see below)
- `SESSION_SECRET`

Do **not** commit any populated `.env*` files or service account JSON.

## Firebase Admin Credentials

Server routes use the Firebase Admin SDK for session verification, admin stats, uploads, and Realtime Database access.

Pick one credential strategy:

1. Set `FIREBASE_SERVICE_ACCOUNT_JSON` to the full service account JSON.
2. Set `GOOGLE_APPLICATION_CREDENTIALS` to an absolute path **outside** the repo.
3. Set `FIREBASE_SERVICE_ACCOUNT_KEY` only if you must point at a key file, and keep that file outside the repository.

On Firebase App Hosting, Cloud Run, App Engine, or Cloud Functions, prefer **Application Default Credentials** instead of shipping a key file.

## Install

```bash
npm install
# or
bun install
```

## Run Locally

### Option 1 — Docker Postgres

```bash
cp .env.local.example .env.local   # fill in values
npm run db:up                       # start local Postgres
npm run migrate                     # apply migrations
npm run dev:docker                  # start Next.js
```

### Option 2 — Neon Postgres

```bash
cp .env.neon.example .env.neon      # fill in values
npm run migrate:neon                # apply migrations
npm run dev                         # start Next.js (uses .env.neon)
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js with `.env.neon` |
| `npm run dev:docker` | Start Next.js with `.env.local` |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run migrate` | Apply migrations against `.env.local` |
| `npm run migrate:neon` | Apply migrations against `.env.neon` |
| `npm run db:up` / `db:down` | Start / stop local Postgres |
| `npm run set-admin -- --email=user@example.com` | Grant Firebase admin claims |

## Database Notes

- `DB_PROVIDER` supports `docker` and `neon`. If omitted, it is inferred from `DATABASE_URL`.
- Base schema lives in `db/migrations/005_somchai_refac.sql`; forward-only migrations sit alongside it.
- Schema metadata: `lib/db/schema.ts`.
- Migration entry point: `scripts/migrate.ts`.

## Player feedback

After a quiz, feedback combines reviewed explanations for the player's choices with a summary. Approved admin summaries take priority. If no approved summary matches a published quiz, Gemini can use the player's recorded selections, the answer key, and authored explanations to create feedback after the player accepts the current privacy notice. Identical answer patterns share one cached summary per quiz, audience, and language. Players see an "awaiting review" label until an admin approves or rejects it in **Admin → Insight Summaries**. Rejection hides it for that answer pattern. If Gemini is unavailable, the app falls back to reviewed choice explanations or a score overview. The Gemini request contains no player identifiers, scores, or profiles.

## Project Layout

```
app/                Routes, layouts, API handlers (App Router)
  (auth)/           Sign-in, sign-up, password flows
  (dashboard)/      Authenticated dashboard, quizzes, history, admin
  api/              Route handlers (Zod-validated, rate-limited)
  join/, play/      Player-facing join and gameplay flows
components/
  node-editor/      Graph-based quiz editor
  ui/               Shared UI primitives
lib/
  auth.ts           Session cookie signing / verification
  ratelimit.ts      Upstash + in-process rate limiting
  db/               Postgres config, queries, migrations helpers
  firebase/         Firebase client + admin integrations
  i18n/             i18next configuration
db/migrations/      SQL migrations
scripts/            Migration, admin, and export scripts
```

## Security Practices

- All API routes validate input with **Zod** before any work.
- Endpoints are **rate limited** via `lib/ratelimit.ts` (auth-keyed where a session exists, IP-keyed only when `TRUST_PROXY` is set).
- Identity (`uid`, `role`, `isAdmin`) is read only from verified session cookies or Firebase Admin tokens — never trusted from the client.
- Persistent data lives in Postgres; live room/presence in Firebase Realtime Database. State is not duplicated across the two without reason.
- Secrets are loaded from environment variables; service account JSON must never be committed.

## Admin Setup

Promote a user to admin:

```bash
npm run set-admin -- --email=user@example.com
```

The user must sign out and sign back in before the new custom claims take effect.

## Contributing

- Uses App Router conventions under `app/`.
- Match existing code style; prefer surgical changes.
- Run `npm run lint` and `npm run build` before opening a PR.
- New API routes must include Zod validation and an appropriate rate limit.

## License

Proprietary. All rights reserved unless otherwise noted.
