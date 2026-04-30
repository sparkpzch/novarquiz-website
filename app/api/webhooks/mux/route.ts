import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  markMuxAssetErrored,
  markMuxAssetReady,
  markMuxUploadAssetCreated,
} from '@/lib/db/queries';
import { mux } from '@/lib/mux/server';

type MuxWebhookData = {
  id?: string;
  asset_id?: string;
  playback_ids?: Array<{ id?: string; policy?: string }>;
  error?: { message?: string; type?: string };
};

export async function POST(request: Request) {
  if (!process.env.MUX_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Mux webhook secret is not configured' }, { status: 500 });
  }

  const body = await request.text();
  const event = await mux.webhooks.unwrap(body, await headers()) as unknown as {
    type: string;
    data: MuxWebhookData;
  };

  switch (event.type) {
    case 'video.upload.asset_created': {
      const uploadId = event.data.id;
      const assetId = event.data.asset_id;
      if (uploadId && assetId) {
        await markMuxUploadAssetCreated({ upload_id: uploadId, asset_id: assetId });
      }
      break;
    }
    case 'video.asset.ready': {
      const assetId = event.data.id;
      const playbackId = event.data.playback_ids?.find((id) => id.policy === 'public')?.id
        ?? event.data.playback_ids?.[0]?.id;
      if (assetId && playbackId) {
        await markMuxAssetReady({ asset_id: assetId, playback_id: playbackId });
      }
      break;
    }
    case 'video.upload.errored':
    case 'video.asset.errored': {
      await markMuxAssetErrored({
        upload_id: event.type === 'video.upload.errored' ? event.data.id : null,
        asset_id: event.type === 'video.asset.errored' ? event.data.id : event.data.asset_id,
        error_message: event.data.error?.message ?? event.data.error?.type ?? null,
      });
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
