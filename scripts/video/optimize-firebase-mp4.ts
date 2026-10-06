/** Preserve encoded media; create versioned faststart copies and switch question URLs. */
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import pool from '../../lib/db/postgres';
import { hasFastStart } from '../../lib/video/mp4';

const require = createRequire(import.meta.url);
const auth = require('firebase-tools/lib/auth');
const scopes = require('firebase-tools/lib/scopes');
const apply = process.argv.includes('--apply');
const bucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
if (!bucket) throw new Error('Firebase Storage bucket environment variable is required');
const directory = mkdtempSync(join(tmpdir(), 'novarquiz-faststart-'));

async function request(url: string, init: RequestInit = {}) {
  const account = auth.getGlobalDefaultAccount();
  if (!account) throw new Error('Sign in using firebase login first');
  const token = await auth.getAccessToken(account.tokens.refresh_token, [scopes.EMAIL, scopes.OPENID, scopes.CLOUD_PROJECTS_READONLY, scopes.FIREBASE_PLATFORM, scopes.CLOUD_PLATFORM]);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token.access_token}`);
  const result = await fetch(url, { ...init, headers });
  if (!result.ok) throw new Error(`Storage request failed: HTTP ${result.status}`);
  return result;
}
function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || `${command} failed`);
  return result.stdout;
}
function packetHashes(path: string) {
  const data = JSON.parse(run('ffprobe', ['-v', 'error', '-show_packets', '-show_data_hash', 'sha256', '-show_entries', 'packet=stream_index,data_hash', '-of', 'json', path]));
  const tracks: Record<string, string[]> = {};
  for (const packet of data.packets) (tracks[String(packet.stream_index)] ??= []).push(packet.data_hash);
  return JSON.stringify(tracks);
}

async function main() {
  const { rows } = await pool.query<{ id: string; media_path: string; media_url: string }>(
    "SELECT id, media_path, media_url FROM questions WHERE media_type = 'video' AND media_path IS NOT NULL ORDER BY id",
  );
  // Contains original download URLs; keep this local rollback snapshot private.
  writeFileSync(join(directory, 'original-questions.json'), JSON.stringify(rows, null, 2), { mode: 0o600 });
  const limit = Number(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? Infinity);
  const paths = [...new Set(rows.map(row => row.media_path))].filter(path => path.endsWith('.mp4')).slice(0, limit);
  let switched = 0;
  for (const [index, path] of paths.entries()) {
    if (!/^(quiz-media\/|question-sessions\/)/.test(path)) throw new Error('Unexpected media prefix');
    const metadataUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(path)}`;
    const metadata = await (await request(metadataUrl)).json();
    const original = join(directory, `${index}-original.mp4`);
    const optimized = join(directory, `${index}-faststart.mp4`);
    const response = await request(`${metadataUrl}?alt=media&generation=${metadata.generation}`);
    writeFileSync(original, Buffer.from(await response.arrayBuffer()));
    if (hasFastStart(readFileSync(original))) {
      console.log(`${index + 1}/${paths.length}: already faststart`);
      continue;
    }
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', original, '-map', '0', '-c', 'copy', '-movflags', '+faststart', optimized]);
    const output = readFileSync(optimized);
    if (!hasFastStart(output)) throw new Error('Faststart output verification failed');
    if (packetHashes(original) !== packetHashes(optimized)) throw new Error('Encoded media packets changed; refusing upload');
    console.log(`${index + 1}/${paths.length}: verified stream copy (${output.length} bytes)`);
    if (!apply) continue;
    const destination = path.replace(/\.mp4$/, `.faststart-${metadata.generation}.mp4`);
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(destination)}?alt=media`;
    const uploadMetadata = {
      name: destination, contentType: 'video/mp4', contentDisposition: 'inline',
      cacheControl: 'public,max-age=31536000,immutable',
      metadata: { originalPath: path, originalGeneration: metadata.generation, optimization: 'faststart-stream-copy' },
    };
    // Match the existing public quiz-media policy; originals are kept intact.
    const boundary = 'novarquiz-faststart-upload';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(uploadMetadata)}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
      output, Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    await request(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=multipart&ifGenerationMatch=0&predefinedAcl=publicRead`, {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
    });
    // Verify playback access without OAuth or a download token before switching.
    const range = await fetch(url, { headers: { Range: 'bytes=0-65535' } });
    if (range.status !== 206 || range.headers.get('content-type') !== 'video/mp4') {
      await range.body?.cancel();
      throw new Error('Public byte-range playback check failed; original question URLs retained');
    }
    await range.body?.cancel();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        "UPDATE questions SET media_path=$1, media_url=$2, updated_at=NOW() WHERE media_type='video' AND media_path=$3 AND id = ANY($4::uuid[]) RETURNING id",
        [destination, url, path, rows.filter(row => row.media_path === path).map(row => row.id)],
      );
      if (result.rows.length) {
        await client.query('INSERT INTO media_assets (storage_path, usage_count) VALUES ($1,$2) ON CONFLICT (storage_path) DO UPDATE SET usage_count=EXCLUDED.usage_count, updated_at=NOW()', [destination, result.rows.length]);
      }
      await client.query('COMMIT');
      switched += result.rows.length;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'audit', videos: paths.length, questionsUpdated: switched, backupDirectory: directory }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
