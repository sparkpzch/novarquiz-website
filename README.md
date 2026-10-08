# NovarQuiz

NovarQuiz is an interactive quiz platform built around branching, graph-based question flows. It supports live host-led sessions, team and solo play, real-time leaderboards, AI-assisted player feedback, and an admin analytics dashboard.

Built on **Next.js 16 (App Router)** and **React 19**, with **PostgreSQL** for persistent content and **Firebase Realtime Database** for live session state.

## Highlights

- Node-based editor for branching question graphs
- Live host lobbies with join tokens / QR codes, plus private quiz invitations
- Solo and team play with resumable sessions
- Real-time leaderboards and admin analytics
- AI-drafted post-quiz summaries (Gemini) with an admin review workflow
- Adaptive video questions (MP4 or HLS)
- Firebase Auth with server-side session cookies
- English and Thai UI (i18next), light and dark themes

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4, Motion |
| Data fetching | TanStack Query |
| Persistent DB | PostgreSQL (Docker or Neon) |
| Live state | Firebase Realtime Database |
| Auth | Firebase Auth + signed session cookies (`jose`) |
| Rate limiting | Upstash Redis with in-process fallback |
| Validation | Zod |
| Media | Sharp, FFmpeg (WASM), hls.js |
| AI | Google Gemini (optional) |

## Getting Started

**Prerequisites:** Node.js 20.9+ (npm or Bun), a Firebase project (Web app, Realtime Database, Storage), Firebase Admin credentials, and PostgreSQL via Docker or Neon.

```bash
npm ci   # or: bun install
```

### Environment

Copy the example for your database and fill in `DATABASE_URL`, `NEXT_PUBLIC_FIREBASE_*`, Firebase Admin credentials, and a strong `SESSION_SECRET`:

```bash
cp .env.local.example .env.local  # Docker PostgreSQL
cp .env.neon.example .env.neon    # Neon PostgreSQL
```

- **Firebase Admin:** set one of `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`, `FIREBASE_SERVICE_ACCOUNT_KEY`, or `GOOGLE_APPLICATION_CREDENTIALS`. Keep key files outside the repo; never commit them or populated env files.
- **`APP_ORIGIN`:** the exact browser-facing origin (scheme + non-default port, no trailing slash). A mismatch causes `403 Cross-origin request denied`.
- **Optional:** Upstash keys for rate limiting; `GEMINI_API_KEY` for AI summaries (not in the Neon example — add it if needed).

### Run locally

Docker PostgreSQL — create a root `.env` with `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` matching `DATABASE_URL`, then:

```bash
docker compose up -d NovartisDB
npm run migrate
npm run dev:docker
```

Neon PostgreSQL:

```bash
npm run migrate:neon
npm run dev:neon
```

Open [http://localhost:3000](http://localhost:3000). Dev servers bind to `localhost` only. For shared access, use `npm run build` + `npm run start` behind HTTPS, or Firebase App Hosting.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `dev:neon` | Next.js dev with `.env.neon` |
| `npm run dev:docker` | Next.js dev with `.env.local` |
| `npm run build` / `start` | Production build / server |
| `npm run analyze` | Build with bundle analyzer |
| `npm run lint` / `lint:ci` | ESLint / fail only on errors above `scripts/ci/lint-baseline.json` |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (`lib/**/*.test.ts`) |
| `npm run migrate` / `migrate:neon` | Apply DB migrations |
| `npm run db:up` / `db:down` | Start / stop Docker Compose services |
| `npm run set-admin -- --email=…` | Grant Firebase admin claims |

## Summary of Key Areas

- **Database:** `db/migrations/005_somchai_refac.sql` is the base schema; later files are applied in order by `scripts/db/migrate.ts` and tracked in `schema_migrations`. `DB_PROVIDER` (`docker`/`neon`) is inferred from `DATABASE_URL` if omitted.
- **Player feedback:** after a quiz (and privacy consent), Gemini drafts a summary from the player's answers and authored explanations. Summaries are cached per answer pattern, shown as "awaiting review" until approved in **Admin → Insight Summaries**, and fall back to approved templates or score overviews when AI is unavailable. No player identifiers are sent to Gemini.
- **Video:** questions accept MP4 or HLS. See [docs/video-streaming.md](docs/video-streaming.md) for packaging streams with `scripts/video/package-hls.mjs`.
- **CI/CD:** GitHub Actions runs `lint:ci`, typecheck, tests, and build on PRs and `main`. Firebase App Hosting auto-deploys `main` to `novarquiz-website-sg` independently of CI.
- **QA:** emulator/API suites live in `scripts/qa/` (`node scripts/qa/run.mjs`).

## Project Layout

```
app/
  (auth)/           Sign-in, sign-up, password flows
  (dashboard)/      Dashboard, join, quizzes, history, stats, leaderboard, admin
  api/              Route handlers (Zod-validated, rate-limited)
  play/             Gameplay
components/         node-editor, play, admin, stats, ui, …
lib/                auth, ratelimit, db, firebase, ai, i18n, security, video, …
proxy.ts            Security headers and auth gating
db/migrations/      Numbered SQL migrations
docker/postgres/    Local database bootstrap
scripts/            admin, ci, db, qa, video
docs/               Video streaming, UI copy, QA notes
```

## Security Practices

- Every API route validates input with Zod and goes through `lib/ratelimit.ts`.
- Identity (`uid`, `role`, `isAdmin`) comes only from verified session cookies or Firebase Admin tokens.
- Persistent data in Postgres; live room/presence state in Firebase RTDB.
- Secrets come from environment variables only.

## Admin Setup

```bash
FIREBASE_SERVICE_ACCOUNT_KEY=/absolute/path/to/service-account.json npm run set-admin -- --email=user@example.com
```

The user must sign out and back in for new claims to apply.

## Contributing

Match existing style, keep changes surgical, and run `npm run lint:ci`, `npm run typecheck`, `npm test`, and `npm run build` before opening a PR. New API routes need Zod validation and a rate limit.

## License

Proprietary. All rights reserved unless otherwise noted.
