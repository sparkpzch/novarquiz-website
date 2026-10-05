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

Development scripts bind to the loopback address for `localhost` so HMR, development source maps, and
developer filesystem paths are accessible only from this machine. Keep development
servers behind trusted access controls; `allowedDevOrigins` does not restrict
network access to a development listener. Production browser source maps are
explicitly disabled in `next.config.ts`.

For access by other users, run `npm run build` followed by `npm run start` behind
an HTTPS reverse proxy, or use Firebase App Hosting. Load the same environment
for both commands (Next.js loads `.env.local` automatically; `.env.neon` needs
`npx dotenv -e .env.neon -- npm run build` and
`npx dotenv -e .env.neon -- npm run start`). Do not send real authentication
tokens over a shared HTTP connection.

Set `APP_ORIGIN` to the exact browser-facing origin, including its scheme and
non-default port, without a trailing slash or path. For example, a production
reverse proxy requires its public HTTPS origin even if Next.js listens internally
over HTTP. A mismatch causes `403 Cross-origin request denied`; the CSRF check
must stay enabled. Use one canonical origin for each running instance.
For local development, open `http://localhost:3000` as shown above; an IP address
is a different origin. If you intentionally use a different browser-facing
origin, configure `APP_ORIGIN` for that instance and restart it.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `npm run dev:neon` | Start Next.js with `.env.neon` |
| `npm run dev:docker` | Start Next.js with `.env.local` |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run lint:ci` | Fail on ESLint errors beyond the recorded baseline |
| `npm run typecheck` | Check TypeScript without emitting files |
| `npm test` | Run unit tests |
| `npm run migrate` | Apply migrations against `.env.local` |
| `npm run migrate:neon` | Apply migrations against `.env.neon` |
| `npm run db:up` / `npm run db:down` | Start / stop all Docker Compose services |
| `npm run set-admin -- --email=user@example.com` | Grant Firebase admin claims |

## CI/CD

GitHub Actions runs lint regression checks, TypeScript, unit tests, and a production build for pull requests and pushes to `main`. The build uses placeholder environment variables and does not connect to the production database or Firebase project.

`npm run lint` currently reports 32 existing errors. `npm run lint:ci` compares error counts by file and rule with `scripts/ci/lint-baseline.json` and fails when a count exceeds its baseline. Remove baseline entries as those errors are fixed.

Firebase App Hosting is connected to this repository and automatically rolls out commits pushed to `main` to backend `novarquiz-website-sg`. Its rollout starts independently of the GitHub Actions result. Require the CI check before merging into `main` if production should receive only verified pull requests.

## Database Notes

- `DB_PROVIDER` supports `docker` and `neon`; if omitted, the provider is inferred from `DATABASE_URL`.
- `db/migrations/005_somchai_refac.sql` is the base schema. `006_rename_quiz_tables.sql` and the later numbered files are applied in order by `scripts/db/migrate.ts`.
- On first creation of the Docker volume, `docker/postgres/init/01-bootstrap-005.sh` loads the base schema. Run `npm run migrate` afterward to apply the remaining migrations.
- Applied filenames are recorded in the database's `schema_migrations` table. Migration metadata and ordering live in `lib/db/schema.ts`.

## Player feedback

After a quiz, AI analyzes recorded selections, the answer key, and authored explanations after the player accepts the current privacy notice. Answer-based summaries take priority over general admin templates. Identical answer patterns share one cached summary per quiz, audience, and language. Approved summaries may also cover similar answer sets when **every source selection and explanation matches** and covers at least **80%** of the new answers; changed selections require new feedback. Players see an “awaiting admin or doctor review” badge until approval in **Admin → Insight Summaries**. Admins can edit, save, and approve the wording alongside the source answers. Rejecting offers a choice to keep the text for reconsideration or delete it; both hide it from users. Deletion retains a blocked cache key so the rejected pattern cannot silently regenerate. Concurrent edits are checked using a revision token. If Gemini is unavailable, the app falls back to general approved summaries, reviewed choice explanations, or a score overview. The Gemini request contains no player identifiers, scores, or profiles. No additional database migration is needed for the review workflow.

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
- Run `npm run lint:ci`, `npm run typecheck`, `npm test`, and `npm run build` before opening a PR.
- New API routes must include Zod validation and an appropriate rate limit.

## License

Proprietary. All rights reserved unless otherwise noted.
