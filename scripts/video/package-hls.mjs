#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const [inputArg, outputArg, ...extras] = process.argv.slice(2);
if (!inputArg || !outputArg || (extras.length && (extras[0] !== '--hlg-input' || extras.length !== 2))) {
  console.error('Usage: node scripts/video/package-hls.mjs SDR_INPUT OUTPUT_DIRECTORY [--hlg-input HLG_INPUT]');
  process.exit(1);
}
const input = resolve(inputArg);
const output = resolve(outputArg);
const hlgInput = extras.length ? resolve(extras[1]) : null;
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || `${command} failed`);
  return result.stdout;
}
function inspect(file) {
  const info = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-of', 'json', file])).streams[0];
  if (!info) throw new Error(`No video stream: ${file}`);
  return info;
}
const sdr = inspect(input);

if (['arib-std-b67', 'smpte2084'].includes(sdr.color_transfer)) {
  throw new Error('The primary input must be SDR. Supply a properly tone-mapped SDR fallback; pass a real HLG original with --hlg-input.');
}
if (hlgInput) {
  const hdr = inspect(hlgInput);
  if (hdr.color_transfer !== 'arib-std-b67' || hdr.color_primaries !== 'bt2020') {
    throw new Error('--hlg-input requires a genuine BT.2020 HLG source, not SDR or HDR10 relabeled as HLG.');
  }
  if (Math.abs(Number(sdr.duration) - Number(hdr.duration)) > 0.1) {
    throw new Error('SDR and HLG inputs must be matching edits with the same duration.');
  }
}
// A fresh versioned directory prevents overwriting segments in use by clients.
mkdirSync(output);
const ladder = [
  { width: 640, height: 360, rate: 650, peak: 780, level: '3.0', codec: 'avc1.4d401e' },
  { width: 854, height: 480, rate: 1200, peak: 1440, level: '3.1', codec: 'avc1.4d401f' },
  { width: 1280, height: 720, rate: 2400, peak: 2880, level: '3.1', codec: 'avc1.4d401f' },
];
const master = ['#EXTM3U', '#EXT-X-VERSION:7', '#EXT-X-INDEPENDENT-SEGMENTS'];
for (const range of hlgInput ? ['SDR', 'HLG'] : ['SDR']) {
  for (const variant of ladder) {
    const { width, height, rate, peak, level, codec } = variant;
    const hdr = range === 'HLG';
    const name = `${range.toLowerCase()}-${height}`;
    const directory = join(output, name);
    mkdirSync(directory);
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', hdr ? hlgInput : input,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', `scale=w='min(${width},iw)':h='min(${height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1`,
      '-r', '30', '-c:v', hdr ? 'libx265' : 'libx264', '-preset', 'fast',
      '-profile:v', hdr ? 'main10' : 'main', '-pix_fmt', hdr ? 'yuv420p10le' : 'yuv420p',
      '-b:v', `${rate}k`, '-maxrate', `${peak}k`, '-bufsize', `${peak * 2}k`,
      '-g', '60', '-keyint_min', '60', '-sc_threshold', '0', '-force_key_frames', 'expr:gte(t,n_forced*2)'];
    if (hdr) args.push('-tag:v', 'hvc1', '-color_primaries', 'bt2020', '-color_trc', 'arib-std-b67', '-colorspace', 'bt2020nc', '-x265-params', 'open-gop=0:scenecut=0:repeat-headers=1:colorprim=9:transfer=18:colormatrix=9');
    else args.push('-level:v', level);
    args.push('-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-ac', '2',
      '-f', 'hls', '-hls_time', '2', '-hls_list_size', '0', '-hls_playlist_type', 'vod',
      '-hls_segment_type', 'fmp4', '-hls_flags', 'independent_segments', '-hls_fmp4_init_filename', 'init.mp4',
      '-hls_segment_filename', join(directory, 'segment-%04d.m4s'), join(directory, 'index.m3u8'));
    console.log(`Encoding ${name}…`);
    run('ffmpeg', args);
    const streams = JSON.parse(run('ffprobe', ['-v', 'error', '-show_data', '-show_streams', '-of', 'json', join(directory, 'init.mp4')])).streams;
    const video = streams.find(stream => stream.codec_type === 'video');
    const hex = video.extradata.split('\n').filter(line => line.includes(':')).map(line => line.split(':')[1].trim().split('  ')[0].replace(/\s/g, '')).join('');
    const bytes = Buffer.from(hex, 'hex');
    let videoCodec = hdr ? codec : `avc1.${bytes.subarray(1,4).toString('hex')}`;
    if (hdr) {
      let compatibility = bytes.readUInt32BE(2);
      let reversed = 0;
      for (let bit = 0; bit < 32; bit++) { reversed = reversed * 2 + (compatibility & 1); compatibility >>>= 1; }
      const constraints = Array.from(bytes.subarray(6, 12));
      while (constraints.length && constraints.at(-1) === 0) constraints.pop();
      videoCodec = `hvc1.${['', 'A', 'B', 'C'][bytes[1] >> 6]}${bytes[1] & 31}.${reversed.toString(16).toUpperCase()}.${bytes[1] & 32 ? 'H' : 'L'}${bytes[12]}${constraints.map(value => '.' + value.toString(16).toUpperCase()).join('')}`;
    }
    const codecs = `,CODECS="${videoCodec}${streams.some(stream => stream.codec_type === 'audio') ? ',mp4a.40.2' : ''}"`;
    master.push(`#EXT-X-STREAM-INF:BANDWIDTH=${(peak + 120) * 1000},AVERAGE-BANDWIDTH=${(rate + 96) * 1000},RESOLUTION=${video.width}x${video.height},FRAME-RATE=30.000,VIDEO-RANGE=${range}${codecs}`, `${name}/index.m3u8`);
  }
}
writeFileSync(join(output, 'master.m3u8'), `${master.join('\n')}\n`);
console.log(`Ready: ${join(output, 'master.m3u8')}`);
