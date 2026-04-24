import { setDefaultResultOrder } from 'dns';
import {
  neonConfig,
  Pool as NeonPool,
  type PoolClient as NeonPoolClient,
  type QueryResult,
  type QueryResultRow,
} from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import {
  configureNeonForNodeRuntime,
  getDatabaseConnectionOptions,
  getDatabaseProvider,
} from './config';

setDefaultResultOrder('ipv4first');
configureNeonForNodeRuntime(neonConfig);

// ---------------------------------------------------------------------------
// Minimal interface that both pg.Pool and @neondatabase/serverless Pool satisfy
// at runtime. Avoids the union-type overload incompatibility that TS complains
// about when you write NeonPool | PgPool directly.
// ---------------------------------------------------------------------------

export interface IDbClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<R extends QueryResultRow = any>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
  /** pg.PoolClient.release() accepts Error|undefined; Neon's accepts boolean|undefined. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  release(errOrDestroy?: any): void;
}

export interface IDbPool {
  connect(): Promise<IDbClient>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<R extends QueryResultRow = any>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
  end(): Promise<void>;
  on(event: 'error', cb: (err: Error) => void): void;
}

// ---------------------------------------------------------------------------
// Global pool singleton (survives Next.js HMR reloads in dev)
// ---------------------------------------------------------------------------

// Bump this whenever the pool implementation changes to bust the HMR cache.
const POOL_VERSION = 'v3-pg-docker-robust';

declare global {
  // eslint-disable-next-line no-var
  var __novarquizPool: IDbPool | undefined;
  // eslint-disable-next-line no-var
  var __novarquizPoolVersion: string | undefined;
}

const RETRYABLE_DB_ERROR_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  '57P01',
  '57P02',
  '57P03',
]);

const READ_ONLY_QUERY_RE = /^\s*SELECT\b/i;
const MAX_QUERY_RETRIES = 2;
const RETRY_DELAY_MS = 250;
const POOL_IDLE_TIMEOUT_MS = 10_000;
const POOL_MAX_LIFETIME_SECONDS = 45;
const POOL_MAX_USES = 7_500;

export type QueryRetryOptions = {
  allowWriteRetry?: boolean;
};

function createPool(): IDbPool {
  const opts = getDatabaseConnectionOptions();
  const provider = getDatabaseProvider();

  if (provider === 'docker') {
    // Local Docker PostgreSQL – use the native pg.Pool (plain TCP).
    // @neondatabase/serverless connects via WebSocket even in Node mode which
    // causes "ErrorEvent { type: 'error' }" failures against a plain Postgres
    // server that has no WebSocket proxy in front of it.
    const pool = new PgPool({
      connectionString: opts.connectionString,
      ssl: false,
      keepAlive: true,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
    });
    pool.on('error', (err: Error) => console.error('Postgres pool error:', err));
    return pool as unknown as IDbPool;
  }

  // Neon serverless (production) – WebSocket-based Pool.
  const pool = new NeonPool({
    ...opts,
    keepAlive: true,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
    maxLifetimeSeconds: POOL_MAX_LIFETIME_SECONDS,
    maxUses: POOL_MAX_USES,
  });
  pool.on('error', (err: Error) => console.error('Postgres pool error:', err));
  return pool as unknown as IDbPool;
}

// Invalidate cached pool if the implementation version changed (e.g. after HMR).
if (globalThis.__novarquizPoolVersion !== POOL_VERSION && globalThis.__novarquizPool) {
  void globalThis.__novarquizPool.end().catch(() => {});
  globalThis.__novarquizPool = undefined;
}

let currentPool: IDbPool = globalThis.__novarquizPool ?? createPool();
globalThis.__novarquizPool = currentPool;
globalThis.__novarquizPoolVersion = POOL_VERSION;

function getPool(): IDbPool {
  return currentPool;
}

function replacePool(reason: unknown) {
  const oldPool = currentPool;
  currentPool = createPool();
  globalThis.__novarquizPool = currentPool;
  console.warn('Resetting Postgres pool after transient connection error.', reason);
  void oldPool.end().catch((err) => console.error('Failed to close stale pool:', err));
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function getErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: string }).code)
    : '';
}

function isRetryableConnectionError(error: unknown): boolean {
  return RETRYABLE_DB_ERROR_CODES.has(getErrorCode(error));
}

function isRetryableError(error: unknown, queryText: string, allowWriteRetry = false): boolean {
  return isRetryableConnectionError(error) && (allowWriteRetry || READ_ONLY_QUERY_RE.test(queryText));
}

async function runQuery<R extends QueryResultRow = QueryResultRow>(
  queryText: string,
  values?: readonly unknown[],
): Promise<QueryResult<R>> {
  let client: IDbClient | undefined;
  try {
    client = await getPool().connect();
    const result = await client.query<R>(queryText, values as unknown[]);
    client.release();
    client = undefined;
    return result;
  } catch (error) {
    if (client) {
      // Handle potential differences in release() signature if necessary, 
      // but IDbClient.release(any) covers both IDbClient (Neon) and PgClient (pg).
      client.release(isRetryableConnectionError(error));
      client = undefined;
    }
    throw error;
  }
}

export async function queryWithRetry<R extends QueryResultRow = QueryResultRow>(
  queryText: string,
  values?: readonly unknown[],
  options?: QueryRetryOptions,
): Promise<QueryResult<R>> {
  for (let attempt = 0; attempt <= MAX_QUERY_RETRIES; attempt++) {
    try {
      return await runQuery<R>(queryText, values);
    } catch (error) {
      const shouldRetry =
        attempt < MAX_QUERY_RETRIES &&
        isRetryableError(error, queryText, options?.allowWriteRetry);

      if (!shouldRetry) throw error;

      replacePool(error);
      console.warn(`Retrying transient Postgres query (${attempt + 1}/${MAX_QUERY_RETRIES})`, error);
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw new Error('Unreachable retry state');
}

// Proxy so callers can call `pool.query(...)` or `pool.connect()` directly
// without holding a stale reference after a pool replacement.
const pool = new Proxy({} as IDbPool, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getPool(), prop, receiver);
    return typeof value === 'function' ? value.bind(getPool()) : value;
  },
});

export default pool;
