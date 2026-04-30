"use client";

import { useRef, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// Single-threaded core — no COOP/COEP headers required
const CDN_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

export function useFFmpeg() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);

  async function load() {
    if (ffmpegRef.current) return;

    const ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress: p }) => setProgress(Math.round(p * 100)));

    await ffmpeg.load({
      coreURL: await toBlobURL(`${CDN_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CDN_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegRef.current = ffmpeg;
    setReady(true);
  }

  async function compressVideo(file: File): Promise<Blob> {
    const ffmpeg = ffmpegRef.current!;
    setProgress(0);

    await ffmpeg.writeFile("input.mp4", await fetchFile(file));
    await ffmpeg.exec([
      "-i", "input.mp4",
      "-c:v", "libx264",
      "-profile:v", "main",    // iOS hardware decoder supports Baseline/Main/High up to L4.0
      "-level", "4.0",
      "-pix_fmt", "yuv420p",   // required for iOS hardware decode; without this, iOS falls back to software (~7s delay)
      "-crf", "28",
      "-preset", "fast",
      "-c:a", "aac",
      "-b:a", "128k",
      "-vf", "scale=-2:720",
      "-movflags", "+faststart",
      "output.mp4",
    ]);

    const data = await ffmpeg.readFile("output.mp4");
    await ffmpeg.deleteFile("input.mp4");
    await ffmpeg.deleteFile("output.mp4");

    // @ffmpeg returns Uint8Array<ArrayBufferLike>; cast needed for Blob constructor
    return new Blob([data as unknown as BlobPart], { type: "video/mp4" });
  }

  async function extractThumbnail(file: File, atSecond = 1): Promise<Blob> {
    const ffmpeg = ffmpegRef.current!;

    await ffmpeg.writeFile("input.mp4", await fetchFile(file));
    await ffmpeg.exec([
      "-i", "input.mp4",
      "-ss", String(atSecond),
      "-frames:v", "1",
      "-q:v", "2",
      "thumb.jpg",
    ]);

    const data = await ffmpeg.readFile("thumb.jpg");
    await ffmpeg.deleteFile("input.mp4");
    await ffmpeg.deleteFile("thumb.jpg");

    return new Blob([data as unknown as BlobPart], { type: "image/jpeg" });
  }

  return { load, ready, progress, compressVideo, extractThumbnail };
}
