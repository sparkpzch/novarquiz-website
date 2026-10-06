# Adaptive video delivery

The shared player accepts MP4 and HTTPS HLS `.m3u8` URLs. Safari uses native HLS; other supported browsers load hls.js on demand. HLS.js starts at the first (lowest-bandwidth) variant, caps quality to the displayed player size, adapts automatically, and keeps a bounded forward/back buffer. Native Safari chooses its own quality and buffer policy.

Answer submission fetches the next question while feedback is open. On a good connection (or HD preference), it prepares only that next video and reuses the same media element on continuation. Data Saver, SD preference, and networks without a positive speed signal skip speculative video downloads. Safari preload/autoplay remain best effort: offscreen playback and Low Power Mode may prevent warmup. The current visible player still loads independently, and native controls let the user start it if autoplay is blocked. The join page also accepts HLS and retains its existing readiness timeout.

## Prepare streams

Install a native FFmpeg/ffprobe build with libx264 (and libx265 for HLG). Run:

```sh
node scripts/video/package-hls.mjs /absolute/path/source-sdr.mp4 /absolute/path/new-version
```

The output contains a multivariant `master.m3u8`, 360p/480p/720p renditions, aligned two-second keyframes/segments, fMP4 initialization files, and AAC audio when present. Use a fresh output directory per version. This operates on original source files outside browser uploads. Existing uploaded MP4s are not automatically converted.

For true HLG HDR, provide matching, frame-aligned SDR and BT.2020 HLG source edits:

```sh
node scripts/video/package-hls.mjs /absolute/path/source-sdr.mp4 /absolute/path/new-version --hlg-input /absolute/path/source-hlg.mov
```

This adds 10-bit HEVC HLG variants with `VIDEO-RANGE=HLG`, alongside H.264 SDR fallbacks. It requires a genuine HLG source; SDR is not relabeled as HDR. Prepare the SDR fallback with proper tone mapping in your media workflow. Validate the resulting playlist and codecs with Apple's HLS tools and test HDR on actual compatible devices before publishing; runtime HDR rendering depends on display, OS, and codec support. HLG is a color transfer function, while HLS is the streaming protocol and ABR is quality adaptation. Existing browser-side MP4 compression is SDR and is unsuitable for preserving HLG masters.

## Publish and select

1. Upload the entire versioned output directory to an HTTPS CDN or object host preserving relative paths. Do not upload only the master playlist. All child playlists and segments must be reachable by the player, including when the master URL has a query token (tokens are not inherited by relative URLs).
2. Serve `.m3u8` as `application/vnd.apple.mpegurl`, `.m4s` as `video/iso.segment`, and `.mp4` as `video/mp4`. Configure CORS for the app origin on every resource; permit GET/HEAD and Range where applicable.
3. For these immutable VOD versions, use `Cache-Control: public, max-age=31536000, immutable` where access policy permits. Never mutate files under a published version. Protect private content with a suitable signed-cookie or per-resource URL system instead of publicly caching it.
4. Paste the master URL into **Adaptive video URL (HLS)** in the question editor, then save the quiz. Existing MP4 questions continue to work.

Prefer CDN and browser HTTP caching over app-managed full-video Cache Storage/IndexedDB. Full-file fetch-to-Blob makes playback wait for the download, consumes memory, and loses normal streaming/range handling. Progressive MP4 with `faststart` and byte-range support can already begin before the whole file arrives, but it cannot adapt bitrate. The existing MP4 compressor already applies `faststart`; HLS adds multiple encoded qualities and independently cacheable segments. For recorded quiz clips, ordinary VOD HLS is sufficient; low-latency live HLS is not needed.

No assets are converted, uploaded, or switched remotely by this code change. Production ABR starts only after an encoded multivariant playlist is hosted and selected for a question.

References: [Apple HLS authoring specification](https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices/), [HLS.js API](https://github.com/video-dev/hls.js/blob/master/docs/API.md).
