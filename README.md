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

## Prerequisites

- Node.js 20.9 or newer and either npm or Bun
- A Firebase project with Web app credentials, Realtime Database, and Storage enabled
- Firebase Admin credentials for server routes
- PostgreSQL via Docker or Neon

Install dependencies with `npm ci` or `bun install`. The repository contains lockfiles for both package managers.

## Environment variables

Copy the example for the database you will use:

```bash
cp .env.local.example .env.local  # Docker PostgreSQL
# or
cp .env.neon.example .env.neon    # Neon PostgreSQL
```

Set `DATABASE_URL`, the `NEXT_PUBLIC_FIREBASE_*` values, Firebase Admin credentials, and a strong `SESSION_SECRET`. The examples also describe optional Upstash rate limiting. Set `GEMINI_API_KEY` to enable AI drafted summaries; without it, the app uses reviewed explanations or score based feedback. The Neon example does not include this optional key, so add it there if needed.

For local Firebase Admin access, set one of `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`, `FIREBASE_SERVICE_ACCOUNT_KEY`, or `GOOGLE_APPLICATION_CREDENTIALS`. Keep key files outside this repository. Google hosted runtimes can use Application Default Credentials. Do not commit populated env files or service account keys.

## Run locally

### Docker PostgreSQL

Docker Compose reads its own `.env` file for PostgreSQL container settings. Create `.env` at the repository root with values matching the `DATABASE_URL` in `.env.local`:

```dotenv
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=novarquiz_db
```

Then start only the database service and run the app on your host:

```bash
cp .env.local.example .env.local  # fill in Firebase and session values
docker compose up -d NovartisDB
npm run migrate
npm run dev:docker
```

`npm run db:up` starts both the database and the containerized API service; use the command above when developing with Next.js on your host. `npm run db:down` stops both services.

### Neon PostgreSQL

```bash
cp .env.neon.example .env.neon  # fill in database, Firebase, and session values
npm run migrate:neon
npm run dev:neon
```

The development app is available at [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `npm run dev:neon` | Start Next.js with `.env.neon` |
| `npm run dev:docker` | Start Next.js with `.env.local` |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run migrate` | Apply migrations against `.env.local` |
| `npm run migrate:neon` | Apply migrations against `.env.neon` |
| `npm run db:up` / `npm run db:down` | Start / stop all Docker Compose services |
| `npm run set-admin -- --email=user@example.com` | Grant Firebase admin claims |

## Database Notes

- `DB_PROVIDER` supports `docker` and `neon`; if omitted, the provider is inferred from `DATABASE_URL`.
- `db/migrations/005_somchai_refac.sql` is the base schema. `006_rename_quiz_tables.sql` and the later numbered files are applied in order by `scripts/db/migrate.ts`.
- On first creation of the Docker volume, `docker/postgres/init/01-bootstrap-005.sh` loads the base schema. Run `npm run migrate` afterward to apply the remaining migrations.
- Applied filenames are recorded in the database's `schema_migrations` table. Migration metadata and ordering live in `lib/db/schema.ts`.

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
db/migrations/      Numbered SQL migrations
docker/postgres/     Local database bootstrap
scripts/db/         Database migration command
scripts/admin/      Admin account command
public/image/        Static images
```

## Security Practices

- API routes use Zod validation and rate limiting where appropriate; shared rate limit logic lives in `lib/ratelimit.ts`.
- Identity (`uid`, `role`, `isAdmin`) is read only from verified session cookies or Firebase Admin tokens — never trusted from the client.
- Persistent data lives in Postgres; live room and presence state uses Firebase Realtime Database.
- Secrets are loaded from environment variables; service account JSON must never be committed.

## Admin Setup

The admin script reads a service account JSON file through `FIREBASE_SERVICE_ACCOUNT_KEY`. Pass an absolute path outside the repository:

```bash
FIREBASE_SERVICE_ACCOUNT_KEY=/absolute/path/to/service-account.json npm run set-admin -- --email=user@example.com
```

The user must sign out and sign back in before the new custom claims take effect.

## Contributing

- Uses App Router conventions under `app/`.
- Match existing code style; prefer surgical changes.
- Run `npm run lint` and `npm run build` before opening a PR.
- New API routes must include Zod validation and an appropriate rate limit.

## License

Proprietary. All rights reserved unless otherwise noted.
