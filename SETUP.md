# Setup Guide

Follow these steps to get the Novarquiz website running locally.

## 1. Install Dependencies

Install the required Node packages:

```bash
yarn install
```

## 2. Choose a Database Target

Use one env file per provider and switch with commands instead of editing code.

### Docker / local PostgreSQL

1. Copy `.env.local.example` to `.env.local`
2. Fill in Firebase and session values
3. Keep:

```env
DB_PROVIDER=docker
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/novarquiz_db
```

### Neon PostgreSQL

1. Copy `.env.neon.example` to `.env.neon`
2. Fill in Firebase and session values
3. Use a Neon connection string such as:

```env
DB_PROVIDER=neon
DATABASE_URL=postgresql://[user]:[password]@[neon_hostname]/[dbname]?sslmode=require&channel_binding=require
```

## 3. Initialize the Database

The canonical base schema is `db/migrations/005_somchai_refac.sql`.

### Docker / local PostgreSQL

Start PostgreSQL with Docker Compose:

```bash
yarn db:up
```

On first startup, the Postgres container automatically bootstraps the database from `005_somchai_refac.sql`.

If you need to rebuild the local database from scratch, remove the Docker volume and start again:

```bash
docker compose down -v
docker compose up -d
```

### Neon PostgreSQL

Apply the provider-safe bootstrap script against Neon:

```bash
yarn migrate:005:neon
```

For future forward-only SQL migrations after `005`, use:

```bash
yarn migrate:neon
```

## 4. Run Development Server

Use the command that matches your database target:

### Docker / local PostgreSQL

```bash
yarn dev:docker
```

### Neon PostgreSQL

```bash
yarn dev:neon
```

Visit `http://localhost:3000` to view the application.

## 5. Recommended Switching Workflow

- Keep `.env.local` for Docker-backed local development.
- Keep `.env.neon` for Neon.
- Switch providers by running provider-specific commands such as `yarn dev:docker`, `yarn dev:neon`, `yarn migrate`, and `yarn migrate:neon`.
- Do not scatter provider checks in app code; use `DB_PROVIDER` and `DATABASE_URL` only.
