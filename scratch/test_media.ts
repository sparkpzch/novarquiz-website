import { Pool } from 'pg';
import dotenv from 'dotenv';
import { incrementMediaUsage } from '../lib/db/media';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function test() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const path = 'test-path-' + Date.now();
    console.log('Testing incrementMediaUsage with path:', path);
    await incrementMediaUsage(client, path);
    await client.query('COMMIT');
    console.log('Success!');
    
    const rows = await pool.query('SELECT * FROM media_assets WHERE storage_path = $1', [path]);
    console.log('Verifying row:', rows.rows);
  } catch (err) {
    console.error('Error:', err);
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}

test();
