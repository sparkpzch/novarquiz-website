import {
  Pool,
  neonConfig,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from '@neondatabase/serverless';
import { setDefaultResultOrder } from 'dns';
import { configureNeonForNodeRuntime, getDatabaseConnectionOptions } from './config';

setDefaultResultOrder('ipv4first');
configureNeonForNodeRuntime(neonConfig);

declare global {
  var __novarquizPool: Pool | undefined;
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

type QueryRetryOptions = {
  allowWriteRetry?: boolean;
};

function createPool() {
  const nextPool = new Pool({
    ...getDatabaseConnectionOptions(),
    keepAlive: true,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
    maxLifetimeSeconds: POOL_MAX_LIFETIME_SECONDS,
    maxUses: POOL_MAX_USES,
  });

  nextPool.on('error', (error: Error) => {
    console.error('Unexpected Postgres pool error:', error);
  });

  return nextPool;
}

let currentPool = globalThis.__novarquizPool ?? createPool();
globalThis.__novarquizPool = currentPool;

function getPool() {
  return currentPool;
}

function replacePool(reason: unknown) {
  const oldPool = currentPool;
  const nextPool = createPool();
  currentPool = nextPool;
  globalThis.__novarquizPool = nextPool;

  console.warn('Resetting Postgres pool after transient connection error.', reason);
  void oldPool.end().catch((endError) => {
    console.error('Failed to close stale Postgres pool:', endError);
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: string }).code)
    : '';
}

function isRetryableConnectionError(error: unknown) {
  return RETRYABLE_DB_ERROR_CODES.has(getErrorCode(error));
}

function isRetryableError(error: unknown, queryText: string, allowWriteRetry = false) {
  if (!isRetryableConnectionError(error)) {
    return false;
  }

  return allowWriteRetry || READ_ONLY_QUERY_RE.test(queryText);
}

async function runQuery<
  R extends QueryResultRow = QueryResultRow,
>(
  queryText: string,
  values?: readonly unknown[],
): Promise<QueryResult<R>> {
  let client: PoolClient | undefined;

  try {
    client = await getPool().connect();
    const result = await client.query<R>(queryText, values as never[] | undefined);
    client.release();
    client = undefined;
    return result;
  } catch (error) {
    if (client) {
      client.release(isRetryableConnectionError(error));
      client = undefined;
    }
    throw error;
  }
}

export async function queryWithRetry<
  R extends QueryResultRow = QueryResultRow,
>(
  queryText: string,
  values?: readonly unknown[],
  options?: QueryRetryOptions
): Promise<QueryResult<R>> {
  for (let attempt = 0; attempt <= MAX_QUERY_RETRIES; attempt++) {
    try {
      return await runQuery<R>(queryText, values);
    } catch (error) {
      const shouldRetry =
        attempt < MAX_QUERY_RETRIES &&
        isRetryableError(error, queryText, options?.allowWriteRetry);

      if (!shouldRetry) {
        throw error;
      }

      replacePool(error);
      console.warn(`Retrying transient Postgres query (${attempt + 1}/${MAX_QUERY_RETRIES})`, error);
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw new Error('Unreachable retry state');
}

const pool = new Proxy({} as Pool, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getPool(), prop, receiver);
    return typeof value === 'function' ? value.bind(getPool()) : value;
  },
});

export default pool;
