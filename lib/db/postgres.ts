import { Pool } from 'pg';
import { setDefaultResultOrder } from 'dns';

setDefaultResultOrder('ipv4first');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default pool;
