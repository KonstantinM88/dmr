import { cookies } from 'next/headers';
import { z } from 'zod';
import { getGuestChangeFeed } from '@/domains/realtime/server/change-feed.service';
import { TABLE_TOKEN_COOKIE } from '@/lib/venue';

const cursorSchema = z.string().datetime({ offset: true }).optional();

export async function GET(request: Request): Promise<Response> {
  const value = new URL(request.url).searchParams.get('cursor') ?? undefined;
  const parsed = cursorSchema.safeParse(value);
  if (!parsed.success) return Response.json({ error: 'invalid_cursor' }, { status: 400 });

  const cookieStore = await cookies();
  const feed = await getGuestChangeFeed(
    cookieStore.get(TABLE_TOKEN_COOKIE)?.value,
    parsed.data ? new Date(parsed.data) : undefined,
  );
  return Response.json(feed, { headers: { 'Cache-Control': 'private, no-store' } });
}
