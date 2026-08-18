import { z } from 'zod';
import { getStaffPrincipal } from '@/domains/staff/server/session.service';
import { getServiceChangeFeed } from '@/domains/realtime/server/change-feed.service';

const cursorSchema = z.string().datetime({ offset: true }).optional();

export async function GET(request: Request): Promise<Response> {
  const value = new URL(request.url).searchParams.get('cursor') ?? undefined;
  const parsed = cursorSchema.safeParse(value);
  if (!parsed.success) return Response.json({ error: 'invalid_cursor' }, { status: 400 });

  const principal = await getStaffPrincipal();
  if (!principal) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!principal.permissions.includes('VIEW_ASSIGNED_TABLES')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const feed = await getServiceChangeFeed(
    principal.venueId,
    parsed.data ? new Date(parsed.data) : undefined,
  );
  return Response.json(feed, { headers: { 'Cache-Control': 'private, no-store' } });
}
