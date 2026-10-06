import { adminStorage } from '../firebase/admin';
import type { IDbClient } from './postgres';

/**
 * Increments the usage count of a media asset in the database.
 * If the asset doesn't exist, it is created with usage_count = 1.
 */
export async function incrementMediaUsage(client: IDbClient, path: string | null) {
  if (!path) return;
  
  await client.query(
    `INSERT INTO media_assets (storage_path, usage_count)
     VALUES ($1, 1)
     ON CONFLICT (storage_path) DO UPDATE SET 
       usage_count = media_assets.usage_count + 1,
       updated_at = NOW()`,
    [path]
  );
}

/**
 * Decrements the usage count of a media asset in the database.
 * If usage_count hits 0, it deletes the file from Firebase Storage.
 */
export async function decrementMediaUsage(client: IDbClient, path: string | null) {
  if (!path) return;

  const result = await client.query(
    `UPDATE media_assets 
     SET usage_count = usage_count - 1, updated_at = NOW()
     WHERE storage_path = $1
     RETURNING usage_count`,
    [path]
  );

  if (result.rows.length > 0 && result.rows[0].usage_count <= 0) {
    // Processing sources and whole immutable HLS bundles are retained for rollback.
    const managed = await client.query('SELECT 1 FROM video_processing_jobs WHERE source_path=$1 OR output_path=$1 LIMIT 1', [path]);
    if (managed.rowCount) return;
    // Delete from Storage
    try {
      const bucket = adminStorage.bucket();
      const file = bucket.file(path);
      await file.delete().catch(err => {
        // Ignore if file already deleted
        if (err.code !== 404) throw err;
      });
      
      // Remove from DB
      await client.query('DELETE FROM media_assets WHERE storage_path = $1', [path]);
      console.log(`Deleted media asset: ${path}`);
    } catch (err) {
      console.error(`Failed to delete media asset ${path}:`, err);
    }
  }
}

/**
 * Synchronizes media usage for a quiz/question set.
 * Increments new paths and decrements old paths that are no longer used.
 */
export async function syncMediaUsage(client: IDbClient, oldPaths: (string | null)[], newPaths: (string | null)[]) {
  const oldCounts = new Map<string, number>();
  const newCounts = new Map<string, number>();

  for (const path of oldPaths) {
    if (!path) continue;
    oldCounts.set(path, (oldCounts.get(path) ?? 0) + 1);
  }

  for (const path of newPaths) {
    if (!path) continue;
    newCounts.set(path, (newCounts.get(path) ?? 0) + 1);
  }

  const allPaths = new Set([...oldCounts.keys(), ...newCounts.keys()]);

  for (const path of allPaths) {
    const oldCount = oldCounts.get(path) ?? 0;
    const newCount = newCounts.get(path) ?? 0;

    if (newCount > oldCount) {
      for (let i = 0; i < newCount - oldCount; i++) {
        await incrementMediaUsage(client, path);
      }
    }

    if (oldCount > newCount) {
      for (let i = 0; i < oldCount - newCount; i++) {
        await decrementMediaUsage(client, path);
      }
    }
  }
}
