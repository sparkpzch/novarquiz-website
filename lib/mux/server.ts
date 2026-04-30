import Mux from '@mux/mux-node';

export const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET,
  webhookSecret: process.env.MUX_WEBHOOK_SECRET,
});

export function getMuxCorsOrigin(request: Request) {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN;
  if (configuredOrigin) return configuredOrigin;

  const origin = request.headers.get('origin');
  if (origin) return origin;

  return new URL(request.url).origin;
}

export function muxPlaybackUrl(playbackId: string) {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

export function muxPosterUrl(playbackId: string) {
  return `https://image.mux.com/${playbackId}/thumbnail.webp`;
}
