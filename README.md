# NovarQuiz

NovarQuiz is an interactive quiz platform with branching question flows, live host sessions, solo and team play modes, and real-time leaderboards.

Quiz content and analytics live in **PostgreSQL**. Live room state, presence, and host control are synced through **Firebase Realtime Database**. Authentication is handled by **Firebase Auth**, and media uploads land in **Firebase Storage**.

## Highlights

- Node-based quiz editor for branching question flows (`@xyflow/react`)
- Live host lobbies with shareable join tokens and QR codes
- Solo and team play modes with realtime leaderboards
- Admin analytics dashboard and per-session history
- Hardened auth flow with session cookies (JWT via `jose`) and consent tracking
- Distributed rate limiting via Upstash Redis, with safe in-process fallback for dev
- Bilingual UI (English and Thai) via `react-i18next`
- Server-side input validation with `zod` on every API route

## Tech Stack

- **Framework:** Next.js 16 (App Router) on React 19
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS 4
- **Database:** PostgreSQL — local Docker or hosted Neon
- **Realtime + Auth:** Firebase Auth, Realtime Database, Storage, Admin SDK
- **Rate limiting:** Upstash Redis (sliding window) with in-process fallback
- **Validation:** Zod
- **Animation:** Motion
- **Media processing:** FFmpeg (`@ffmpeg/ffmpeg`), Sharp
- **Package manager:** Bun 1.2 (npm also works)

## Requirements

- Node.js 20 or newer
- Bun 1.2 (recommended) or npm
- A Firebase project with:
  - Web app credentials
  - Realtime Database enabled
  - Storage enabled
  - A service account for server routes
- Either:
  - Docker Desktop for local PostgreSQL, or
  - A Neon PostgreSQL database

## Quick Start

### 1. Install

```bash
bun install
```

`npm install` also works — script names match either runner.

### 2. Pick a database target

Copy the example env file for the provider you want:

```bash
cp .env.local.example .env.local   # local Docker Postgres
# or
cp .env.neon.example .env.neon     # hosted Neon Postgres
```

Fill in:

- `DATABASE_URL`
- Firebase client variables (`NEXT_PUBLIC_FIREBASE_*`)
- Firebase Admin credentials (see below)
- `SESSION_SECRET` — 32+ random characters

### 3. Bring up Postgres and migrate

**Docker:**

```bash
bun run db:up
bun run migrate
```

On first boot, the Postgres container bootstraps from `db/migrations/005_somchai_refac.sql`. To rebuild from scratch, run `docker compose down -v` and start again.

**Neon:**

```bash
bun run migrate:005:neon   # one-time bootstrap
bun run migrate:neon       # forward-only migrations after 005
```

### 4. Run the dev server

```bash
bun run dev:docker   # uses .env.local
# or
bun run dev:neon     # uses .env.neon (also aliased as `bun run dev`)
```

The app is available at [http://localhost:3000](http://localhost:3000).

## Firebase Admin Setup

Server routes (admin stats, session auth, uploads, Realtime Database writes) use the Firebase Admin SDK. Pick one credential strategy for local development:

1. **Recommended** — set `FIREBASE_SERVICE_ACCOUNT_JSON` to the full service account JSON (Next.js handles multiline env values).
2. Set `GOOGLE_APPLICATION_CREDENTIALS` to an absolute path to a JSON key **outside the repo**.
3. As a last resort, set `FIREBASE_SERVICE_ACCOUNT_KEY` to an absolute path to a key file **outside the repo**.

> Never commit a service account JSON into the repository. On Firebase App Hosting, Cloud Run, App Engine, or Cloud Functions, prefer Application Default Credentials over shipping a key file.

## Rate Limiting and Proxy Trust

Rate limits are enforced in `lib/ratelimit.ts`:

- When `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, limits are enforced **globally** via Upstash Redis sliding window. Recommended for any deployed environment.
- When unset, the app falls back to **per-instance, in-process counting**. Fine for local development.

`TRUST_PROXY` controls how the client IP is derived from `X-Forwarded-For`:

- Set to `true` **only** when a known proxy in front of the app (Firebase App Hosting, Cloud Run, Vercel) appends the real client IP as the **last** entry of `X-Forwarded-For`.
- When unset or `false`, `X-Forwarded-For` is treated as attacker-controlled and ignored. IP-based limits collapse to a single shared bucket, but auth-keyed limits (per-uid) remain unaffected.

## Available Scripts

| Script | Purpose |
| --- | --- |
| `bun run dev` | Start Next.js with `.env.neon` |
| `bun run dev:docker` | Start Next.js with `.env.local` |
| `bun run dev:neon` | Explicit Neon dev command |
| `bun run build` | Production build |
| `bun run start` | Start the production server |
| `bun run lint` | Run ESLint |
| `bun run analyze` | Production build with bundle analyzer |
| `bun run migrate` | Apply migrations against `.env.local` |
| `bun run migrate:neon` | Apply migrations against `.env.neon` |
| `bun run migrate:005` | Run the local 005 bootstrap |
| `bun run migrate:005:neon` | Run the Neon 005 bootstrap |
| `bun run db:up` | Start local Postgres via Docker Compose |
| `bun run db:down` | Stop local Postgres containers |
| `bun run set-admin -- --email=user@example.com` | Grant Firebase admin custom claims |

## Project Structure

```
app/
  (auth)/             Sign-in, sign-up, password reset
  (dashboard)/        Authenticated routes (quizzes, history, leaderboard, admin)
  api/                Route handlers — auth, sessions, play, team-rooms, upload
  join/               Join-by-token landing page
  play/               In-game player experience
components/
  node-editor/        xyflow-based quiz graph editor
  ui/                 Shared UI primitives
  InvitationModal.tsx
lib/
  auth.ts             Session cookie helpers (jose JWT)
  ratelimit.ts        Upstash + in-process rate limiter
  security.ts         Shared input-validation helpers
  db/                 Postgres pool, queries, schema metadata
  firebase/           Firebase client and Admin SDK integrations
  hooks/              Shared React hooks
  i18n/               Localization
  constants/, types/, utils.ts
scripts/
  migrate.ts          Forward-only SQL migrator
  migrate-005.ts      Provider-safe 005 bootstrap
  set-admin.ts        Grant Firebase admin custom claims
  setup-profiles.ts   Profile bootstrapping helper
middleware.ts         Edge middleware — security headers, auth gating
database.rules.json   Firebase Realtime Database security rules
storage.rules         Firebase Storage security rules
firebase.json         Firebase emulator and deployment config
apphosting.yaml       Firebase App Hosting config
docker-compose.yml    Local Postgres
```

## Admin Setup

Promote a user to admin (after they sign in once):

```bash
bun run set-admin -- --email=user@example.com
```

The user must sign out and sign back in for the new custom claims to take effect.

## Local URLs

- App: [http://localhost:3000](http://localhost:3000)
- Docker production-style container: [http://localhost:8080](http://localhost:8080)

## Notes for Contributors

- This repo uses the **Next.js 16 App Router** — APIs and conventions may differ from older Next.js. See [`AGENTS.md`](./AGENTS.md).
- Persistent state (quizzes, questions, sessions, leaderboards) lives in Postgres.
- Live room state and presence live in Firebase Realtime Database.
- Server routes validate input with Zod and rate-limit through `lib/ratelimit.ts` — keep both invariants when adding endpoints.
- The admin UI assumes desktop layouts in several flows.
- See [`SETUP.md`](./SETUP.md) for the deeper provider-switching workflow.
