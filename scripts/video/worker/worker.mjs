import pg from 'pg';
import { Storage } from '@google-cloud/storage';
import { OAuth2Client } from 'google-auth-library';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const authClient = process.env.VIDEO_OAUTH_TOKEN ? new OAuth2Client() : undefined;
if (authClient) authClient.setCredentials({ access_token: process.env.VIDEO_OAUTH_TOKEN });
const storage = new Storage({ ...(authClient ? { authClient } : {}) });
const bucket = storage.bucket(process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
const directory = await mkdtemp(join(tmpdir(), 'nq-video-'));
const id = process.env.VIDEO_JOB_ID;
const claim = randomUUID();
const run = (cmd, args) => execFileSync(cmd, args, { timeout: 20 * 60_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' });
async function walk(path, prefix = '') {
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await walk(join(path, entry.name), relative + '/'));
    else files.push(relative);
  }
  return files;
}
try {
  const { rows } = await pool.query(`UPDATE video_processing_jobs SET status='processing',attempts=attempts+1,claim_token=$2,updated_at=NOW(),error=NULL
    WHERE id=$1 AND (status='queued' OR (status='processing' AND updated_at<NOW()-INTERVAL '30 minutes')) RETURNING *`, [id, claim]);
  const job = rows[0];
  if (job) {
    let input = join(directory, 'input.mp4');
    const file = bucket.file(job.source_path, { generation: job.source_generation });
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) > 50 * 1024 * 1024) throw new Error('Video exceeds 50 MB');
    await file.download({ destination: input });
    const info = JSON.parse(run('ffprobe', ['-v','error','-show_streams','-show_format','-of','json',input]));
    const video = info.streams.find(s => s.codec_type === 'video');
    if (!video || Number(info.format.duration) > 600 || !Number.isFinite(Number(info.format.duration))) throw new Error('Use a video up to 10 minutes');
    if (['arib-std-b67','smpte2084'].includes(video.color_transfer)) {
      const sdr = join(directory, 'sdr.mp4');
      // Tone mapping operates on linear, floating-point RGB, then encodes Rec.709.
      run('ffmpeg', ['-hide_banner','-loglevel','error','-nostdin','-i',input,'-map','0:v:0','-map','0:a:0?',
        '-vf',"zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        '-c:v','libx264','-crf','18','-preset','fast','-c:a','aac','-b:a','128k',
        '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',sdr]);
      input = sdr;
    }
    const output = join(directory, 'output');
    const packaged = resolve(dirname(fileURLToPath(import.meta.url)), 'package-hls.mjs');
    const packageScript = process.env.VIDEO_HLS_SCRIPT || packaged;
    run(process.execPath, [packageScript, input, output]);
    run('ffmpeg', ['-hide_banner','-loglevel','error','-nostdin','-i',input,'-map','0:v:0','-map','0:a:0?',
      '-vf',"scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",'-c:v','libx264','-profile:v','main','-pix_fmt','yuv420p','-crf','28','-preset','fast',
      '-c:a','aac','-b:a','128k','-movflags','+faststart',join(output,'fallback.mp4')]);
    run('ffmpeg', ['-hide_banner','-loglevel','error','-nostdin','-i',input,'-frames:v','1','-vf','scale=640:-2',join(output,'poster.jpg')]);
    const prefix = `question-sessions/processed/${claim}/`;
    const publicUrl = path => `https://storage.googleapis.com/${bucket.name}/${path.split('/').map(encodeURIComponent).join('/')}`;
    // Write absolute sibling URLs: Firebase's encoded /o/ download URLs do not
    // preserve a filesystem-style relative playlist hierarchy.
    const { readFile, writeFile } = await import('node:fs/promises');
    const files = await walk(output);
    for (const name of files.filter(name => name.endsWith('.m3u8'))) {
      const base = name.includes('/') ? name.slice(0, name.lastIndexOf('/') + 1) : '';
      const text = await readFile(join(output,name),'utf8');
      const rewritten = text.split('\n').map(line => {
        if (line && !line.startsWith('#')) return publicUrl(prefix + base + line);
        return line.replace(/URI="([^"]+)"/g, (_all, uri) => `URI="${publicUrl(prefix + base + uri)}"`);
      }).join('\n');
      await writeFile(join(output,name),rewritten);
    }
    // Segments first, rendition playlists next, master last; publish only a complete set.
    files.sort((a,b) => Number(a.endsWith('.m3u8'))-Number(b.endsWith('.m3u8')) || Number(a==='master.m3u8')-Number(b==='master.m3u8'));
    for (const name of files) {
      const contentType = name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : name.endsWith('.m4s') ? 'video/iso.segment' : name.endsWith('.jpg') ? 'image/jpeg' : 'video/mp4';
      await bucket.upload(join(output,name), { destination: prefix+name, predefinedAcl:'publicRead', metadata:{contentType, cacheControl:'public,max-age=31536000,immutable',contentDisposition:'inline'} });
    }
    const path = prefix+'master.m3u8';
    for (const required of [path,prefix+'fallback.mp4']) {
      const response = await fetch(publicUrl(required),{headers:{Range:'bytes=0-1023'}});
      await response.body?.cancel();
      if (![200,206].includes(response.status)) throw new Error('Output playback verification failed');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const saved = await client.query(`UPDATE video_processing_jobs SET status='ready',output_path=$3,duration_seconds=$4,updated_at=NOW() WHERE id=$1 AND claim_token=$2 AND status='processing' RETURNING id`,[id,claim,path,Number(info.format.duration)]);
      if (saved.rowCount && process.env.VIDEO_MIGRATION_PREPARE_ONLY !== '1') {
        const updated = await client.query(`UPDATE questions SET media_path=$2,media_url=$3,updated_at=NOW() WHERE media_type='video' AND media_path=$1 RETURNING id`,[job.source_path,path,publicUrl(path)+`#duration=${Number(info.format.duration)}`]);
        if (updated.rowCount) await client.query(`UPDATE media_assets SET usage_count=GREATEST(0,usage_count-$2),updated_at=NOW() WHERE storage_path=$1`,[job.source_path,updated.rowCount]);
        if (updated.rowCount) await client.query(`INSERT INTO media_assets(storage_path,usage_count) VALUES ($1,$2) ON CONFLICT(storage_path) DO UPDATE SET usage_count=media_assets.usage_count+EXCLUDED.usage_count,updated_at=NOW()`,[path,updated.rowCount]);
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    console.log(JSON.stringify({ job:id,status:'ready',files:files.length }));
  }
} catch (error) {
  await pool.query(`UPDATE video_processing_jobs SET status='failed',error=$3,updated_at=NOW() WHERE id=$1 AND claim_token=$2`,[id,claim, String(error.message).slice(0,300)]);
  console.error('Video processing failed'); process.exitCode=1;
} finally { await pool.end(); await rm(directory,{recursive:true,force:true}); }
