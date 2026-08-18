import { z } from 'zod';
import { getStaffPrincipal } from '@/domains/staff/server/session.service';
import { getProductionQueueDelta } from '@/domains/production/server/production.service';

const querySchema = z.object({
  kind: z.enum(['KITCHEN', 'BAR']),
  cursor: z.string().datetime({ offset: true }).optional(),
});

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    kind: url.searchParams.get('kind'),
    cursor: url.searchParams.get('cursor') ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: 'invalid_query' }, { status: 400 });
  }

  const principal = await getStaffPrincipal();
  if (!principal) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const viewPermission =
    parsed.data.kind === 'KITCHEN' ? 'VIEW_KITCHEN_QUEUE' : 'VIEW_BAR_QUEUE';
  if (!principal.permissions.includes(viewPermission)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const delta = await getProductionQueueDelta({
    venueId: principal.venueId,
    stationKind: parsed.data.kind,
    cursor: parsed.data.cursor ? new Date(parsed.data.cursor) : undefined,
  });

  return Response.json(delta, {
    headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
