import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { QueryResult, QueryResultRow } from 'pg';
import { getScopedDbClient, withDbClient, withDbSavepoint } from '../query-context';
import type { IDbClient } from '../postgres';

test('concurrent player work uses one connection each even when every pool slot is occupied', { timeout: 2000 }, async () => {
  const waiting: Array<() => void> = [];
  let active = 0;
  let acquisitions = 0;
  let outsideQueries = 0;
  const fakePool = {
    async connect(): Promise<IDbClient> {
      if (active === 3) await new Promise<void>(resolve => waiting.push(resolve));
      active++;
      const id = ++acquisitions;
      return {
        async query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> {
          await Promise.resolve();
          return { command: sql, rowCount: 1, oid: 0, fields: [], rows: [{ id, marker: values?.[0] }] as unknown as R[] };
        },
        release() { active--; waiting.shift()?.(); },
      };
    },
    async query() { outsideQueries++; throw new Error('Player query escaped its connection'); },
    end: async () => {}, on() {},
  };
  process.env.DATABASE_URL ??= 'postgres://unused/isolated-test';
  globalThis.__novarquizPool = fakePool;
  globalThis.__novarquizPoolVersion = 'v4-pg-only';
  const { default: pool, queryWithRetry } = await import('../postgres');
  await Promise.all(Array.from({ length: 12 }, async (_, marker) => {
    const client = await pool.connect();
    try {
      await withDbClient(client, async () => {
        assert.equal(getScopedDbClient(), client);
        const direct = await pool.query('SELECT player', [marker]);
        const retried = await queryWithRetry('SELECT completion', [marker]);
        assert.equal(direct.rows[0].id, retried.rows[0].id);
        assert.equal(direct.rows[0].marker, marker);
      });
    } finally { client.release(); }
  }));
  assert.equal(acquisitions, 12, 'No query should acquire a second connection inside a player lock');
  assert.equal(outsideQueries, 0); assert.equal(active, 0);
  assert.equal(getScopedDbClient(), undefined);
});

test('recap preparation failure rolls back only its savepoint and allows completion to continue', async () => {
  const statements: string[] = [];
  const client: IDbClient = {
    async query<R extends QueryResultRow>(sql: string): Promise<QueryResult<R>> {
      statements.push(sql);
      return { command: sql, rowCount: 0, oid: 0, fields: [], rows: [] };
    }, release() {},
  };
  await withDbClient(client, async () => {
    await assert.rejects(withDbSavepoint(async () => { throw new Error('Recap failed'); }), /Recap failed/);
    await client.query('COMMIT');
  });
  const name = statements[0].replace('SAVEPOINT ', '');
  assert.deepEqual(statements, [`SAVEPOINT ${name}`, `ROLLBACK TO SAVEPOINT ${name}`, `RELEASE SAVEPOINT ${name}`, 'COMMIT']);
});
