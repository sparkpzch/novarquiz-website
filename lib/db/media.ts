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
  const oldSet = new Set(oldPaths.filter(Boolean));
  const newSet = new Set(newPaths.filter(Boolean));

  // Paths to increment: in new but not in old
  for (const path of newSet) {
    if (!oldSet.has(path)) {
      await incrementMediaUsage(client, path);
    }
  }

  // Paths to decrement: in old but not in new
  for (const path of oldSet) {
    if (!newSet.has(path)) {
      await decrementMediaUsage(client, path);
    }
  }
}
