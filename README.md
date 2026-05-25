# NovarQuiz

NovarQuiz is an interactive quiz platform with branching question flows, live sessions, team play, solo runs, and real-time leaderboards.

The app is built with Next.js 16, React 19, PostgreSQL, Firebase Auth, Firebase Realtime Database, and Firebase Storage. Quiz content lives in Postgres, while live room state and presence are synced through Firebase.

## Highlights

- Node-based quiz editor for branching question flows
- Live host lobbies with shareable join tokens
- Solo and team play modes
- Real-time leaderboard updates
- Admin analytics dashboard
- Firebase-backed authentication and session rehydration
- English and Thai UI support

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- PostgreSQL (`docker` or `neon` provider)
- Firebase Auth, Realtime Database, Storage, and Admin SDK
- Motion for UI animation

## Requirements

- Node.js 20+
- `npm` or `bun`
- A Firebase project with:
  - Web app credentials
  - Realtime Database enabled
  - Storage enabled
  - A service account for server routes
- Either:
  - Docker Desktop for local Postgres, or
  - A Neon Postgres database

## Environment Setup

This repo supports two local database setups:

- `docker`: local PostgreSQL via `docker-compose.yml`
- `neon`: hosted PostgreSQL via Neon

Copy one of the example env files:

```bash
cp .env.local.example .env.local
```

or:

```bash
cp .env.neon.example .env.neon
```

Fill in:

- `DATABASE_URL`
- Firebase client variables (`NEXT_PUBLIC_FIREBASE_*`)
- Firebase Admin credentials
- `SESSION_SECRET`

## Firebase Admin Setup

This app uses the Firebase Admin SDK for server routes such as admin stats, session auth, uploads, and Realtime Database access.

For local development, prefer one of these credential strategies:

1. Set `FIREBASE_SERVICE_ACCOUNT_JSON` in `.env.local` or `.env.neon` to the full service account JSON.
2. Or set `GOOGLE_APPLICATION_CREDENTIALS` to an absolute path outside the repo.
3. Use `FIREBASE_SERVICE_ACCOUNT_KEY` only if you must point directly at a key file, and keep that file outside the repository.

Notes:

- Do not commit service account JSON files into the repository.
- On Firebase App Hosting, Cloud Run, App Engine, or Cloud Functions, prefer Application Default Credentials instead of shipping a key file.
- If you use a raw JSON value in `.env*`, Next.js supports multiline environment variables.

## Install Dependencies

```bash
npm install
```

If your local workflow uses Bun, `bun install` also works. The repo currently declares `bun@1.2.0` as its package manager, but the scripts are written to work with `npm`.

## Run Locally

### Option 1: Docker Postgres

1. Create `.env.local` from `.env.local.example`.
2. Start Postgres:

```bash
npm run db:up
```

3. Apply migrations:

```bash
npm run migrate
```

4. Start the app:

```bash
npm run dev:docker
```

The site will be available at [http://localhost:3000](http://localhost:3000).

### Option 2: Neon Postgres

1. Create `.env.neon` from `.env.neon.example`.
2. Apply migrations:

```bash
npm run migrate:neon
```

3. Start the app:

```bash
npm run dev
```

Notes:

- `npm run dev` and `npm run dev:neon` both load `.env.neon`.
- The default `dev` script assumes the Neon setup.

## Available Scripts

- `npm run dev`: start Next.js with `.env.neon`
- `npm run dev:docker`: start Next.js with `.env.local`
- `npm run dev:neon`: explicit Neon dev command
- `npm run build`: production build
- `npm run start`: start the production server
- `npm run lint`: run ESLint
- `npm run migrate`: apply migrations using `.env.local`
- `npm run migrate:neon`: apply migrations using `.env.neon`
- `npm run migrate:005`: run the local 005 migration script
- `npm run migrate:005:neon`: run the Neon 005 migration script
- `npm run db:up`: start local Postgres with Docker Compose
- `npm run db:down`: stop local Postgres containers
- `npm run set-admin -- --email=user@example.com`: grant Firebase admin claims to a user

## Database Notes

- `DB_PROVIDER` supports `docker` and `neon`.
- If `DB_PROVIDER` is omitted, the app infers the provider from `DATABASE_URL`.
- The main migration entrypoint is [scripts/migrate.ts](/Users/pjirawat/Downloads/_VSCode/novarquiz-website/scripts/migrate.ts).
- Base schema metadata lives in [lib/db/schema.ts](/Users/pjirawat/Downloads/_VSCode/novarquiz-website/lib/db/schema.ts).

## Project Areas

- [app](/Users/pjirawat/Downloads/_VSCode/novarquiz-website/app): routes, layouts, and API handlers
- [components/node-editor](/Users/pjirawat/Downloads/_VSCode/novarquiz-website/components/node-editor): admin quiz graph editor
- [lib/db](/Users/pjirawat/Downloads/_VSCode/novarquiz-website/lib/db): database config, queries, and migration helpers
- [lib/firebase](/Users/pjirawat/Downloads/_VSCode/novarquiz-website/lib/firebase): Firebase client and admin integrations
- [scripts](/Users/pjirawat/Downloads/_VSCode/novarquiz-website/scripts): operational scripts such as migrations and admin setup

## Admin Setup

To promote a user to admin, run:

```bash
npm run set-admin -- --email=user@example.com
```

The user must sign out and sign back in before the new custom claims take effect.

## Local URLs

- App: [http://localhost:3000](http://localhost:3000)
- Docker production-style container app: [http://localhost:8080](http://localhost:8080)

## Notes for Contributors

- The repo uses App Router conventions under `app/`.
- Live room state is stored in Firebase Realtime Database.
- Persistent quiz, question, session, and leaderboard data is stored in Postgres.
- The admin UI assumes desktop layouts in several flows.
