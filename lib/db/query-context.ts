import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { IDbClient } from './postgres';

const clients = new AsyncLocalStorage<IDbClient>();

export const getScopedDbClient = () => clients.getStore();

/** Reads and writes under a player lock must use its connection. Acquiring
 * extra pool connections inside every lock can exhaust the small Neon pool. */
export function withDbClient<T>(client: IDbClient, work: () => Promise<T>): Promise<T> {
  return clients.run(client, work);
}

/** Optional recap preparation must not roll back a successfully finished quiz. */
export async function withDbSavepoint<T>(work: () => Promise<T>): Promise<T> {
  const client = getScopedDbClient();
  if (!client) return work();
  const name = `recap_${randomUUID().replaceAll('-', '')}`;
  await client.query(`SAVEPOINT ${name}`);
  try {
    const result = await work();
    await client.query(`RELEASE SAVEPOINT ${name}`);
    return result;
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    await client.query(`RELEASE SAVEPOINT ${name}`);
    throw error;
  }
}
