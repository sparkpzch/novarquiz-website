# Setup Guide

Follow these steps to get the Novarquiz website running locally.

## 1. Install Dependencies

Install the required Node packages:

```bash
yarn install
```

## 2. Environment Variables

Create a `.env` or `.env.local` file in the root directory. You can copy the contents from `.env.local.example` if it exists.

Ensure you provide values for:

- **Neon Database connection**: `DATABASE_URL` (Make sure to include `?uselibpqcompat=true&sslmode=require&channel_binding=require` to avoid SSL warnings)
- **Firebase Client SDK**: All `NEXT_PUBLIC_FIREBASE_*` variables.
- **Firebase Admin SDK**: `FIREBASE_SERVICE_ACCOUNT_KEY`

Example database connection string:

```env
DATABASE_URL="postgresql://[user]:[password]@[neon_hostname]/[dbname]?uselibpqcompat=true&sslmode=require&channel_binding=require"
```

## 3. Database Initialization

You need to initialize the tables in your PostgreSQL (Neon) database.

Execute the SQL schema files located in `db/migrations/` against your Neon database using your preferred database client (e.g., pgAdmin, DBeaver, or the Neon console's SQL Editor).

Run them in this order:

1. `db/migrations/init.sql`
2. `db/migrations/002_private_sessions.sql`

## 4. Run Development Server

Start the Next.js development server:

```bash
yarn dev
```

Visit `http://localhost:3000` to view the application.
