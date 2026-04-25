import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.neon
dotenv.config({ path: path.resolve(process.cwd(), '.env.neon') });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not found in .env.neon');
    return;
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('Creating profiles table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        uid VARCHAR(128) PRIMARY KEY,
        display_name VARCHAR(255),
        photo_url TEXT,
        last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    console.log('Migrating existing names from leaderboard_entries...');
    await pool.query(`
      INSERT INTO profiles (uid, display_name, photo_url)
      SELECT DISTINCT user_id, user_display_name, user_photo_url
      FROM leaderboard_entries
      ON CONFLICT (uid) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        photo_url = EXCLUDED.photo_url;
    `);
    
    console.log('Setup completed successfully.');
  } catch (err) {
    console.error('Failed to setup profiles:', err);
  } finally {
    await pool.end();
  }
}

main();
