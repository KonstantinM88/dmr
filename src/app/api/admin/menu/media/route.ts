import { z } from 'zod';
import { getStaffPrincipal } from '@/domains/staff/server/session.service';
import {
  deleteMenuMedia,
  uploadMenuMedia,
} from '@/domains/media/server/menu-media.service';
import { MediaValidationError } from '@/domains/media/server/media-processor';
import { MAX_VIDEO_BYTES } from '@/domains/media/shared/types';
import { canMutateMenuMedia } from '@/domains/media/shared/types';
import { isSameOriginRequest } from '@/lib/request-security';
import { getEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request.url, request.headers.get('origin'))) return jsonError('forbidden', 403);
  const principal = await getStaffPrincipal();
  if (!principal) return jsonError('unauthorized', 401);
  if (!principal.permissions.includes('MANAGE_MENU')) return jsonError('forbidden', 403);
  if (!mediaMutationsEnabled()) return jsonError('storage_read_only', 503);

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_VIDEO_BYTES + 1_000_000) return jsonError('file_too_large', 413);

  try {
    const data = await request.formData();
    const itemId = z.string().min(1).max(64).safeParse(data.get('itemId'));
    const altText = z.string().trim().max(300).safeParse(data.get('altText') ?? '');
    const file = data.get('file');
    if (!itemId.success || !altText.success || !(file instanceof File)) {
      return jsonError('invalid_input', 400);
    }

    const result = await uploadMenuMedia(itemId.data, file, altText.data, {
      staffUserId: principal.id,
      venueId: principal.venueId,
      ip: forwardedIp(request.headers),
    });
    if (!result.ok) return jsonError(result.reason, result.reason === 'not_found' ? 404 : 409);
    return Response.json(result, { status: 201, headers: responseHeaders() });
  } catch (error) {
    if (error instanceof MediaValidationError) return jsonError(error.message, 400);
    console.error('Menu media upload failed.', error);
    return jsonError('processing_failed', 500);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request.url, request.headers.get('origin'))) return jsonError('forbidden', 403);
  const principal = await getStaffPrincipal();
  if (!principal) return jsonError('unauthorized', 401);
  if (!principal.permissions.includes('MANAGE_MENU')) return jsonError('forbidden', 403);
  if (!mediaMutationsEnabled()) return jsonError('storage_read_only', 503);

  try {
    const body = await request.json();
    const parsed = z.object({ mediaId: z.string().min(1).max(64) }).safeParse(body);
    if (!parsed.success) return jsonError('invalid_input', 400);
    const result = await deleteMenuMedia(parsed.data.mediaId, {
      staffUserId: principal.id,
      venueId: principal.venueId,
      ip: forwardedIp(request.headers),
    });
    if (!result.ok) return jsonError(result.reason, 404);
    return Response.json(result, { headers: responseHeaders() });
  } catch (error) {
    console.error('Menu media deletion failed.', error);
    return jsonError('delete_failed', 500);
  }
}

function jsonError(error: string, status: number): Response {
  return Response.json({ ok: false, error }, { status, headers: responseHeaders() });
}

function responseHeaders(): HeadersInit {
  return { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
}

function forwardedIp(headers: Headers): string | undefined {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim();
}

function mediaMutationsEnabled(): boolean {
  const env = getEnv();
  return canMutateMenuMedia(env.MEDIA_STORAGE_PROVIDER, env.NODE_ENV);
}
