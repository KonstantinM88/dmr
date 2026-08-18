-- CreateEnum
CREATE TYPE "ProductionTicketStatus" AS ENUM ('QUEUED', 'ACCEPTED', 'IN_PROGRESS', 'READY', 'HANDED_OFF', 'CANCELLED');

-- CreateTable
CREATE TABLE "production_tickets" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "status" "ProductionTicketStatus" NOT NULL DEFAULT 'QUEUED',
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "handedOffAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "production_tickets_orderItemId_key" ON "production_tickets"("orderItemId");

-- CreateIndex
CREATE INDEX "production_tickets_stationId_status_queuedAt_idx" ON "production_tickets"("stationId", "status", "queuedAt");

-- CreateIndex
CREATE INDEX "production_tickets_updatedAt_idx" ON "production_tickets"("updatedAt");

-- AddForeignKey
ALTER TABLE "production_tickets" ADD CONSTRAINT "production_tickets_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_tickets" ADD CONSTRAINT "production_tickets_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "production_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill принятых/готовящихся/поданных позиций Этапа 2. Идентификатор
-- детерминирован от OrderItem, поэтому SQL остаётся идемпотентным при
-- диагностическом повторе внутри транзакции миграции.
INSERT INTO "production_tickets" (
    "id",
    "orderItemId",
    "stationId",
    "status",
    "queuedAt",
    "acceptedAt",
    "startedAt",
    "readyAt",
    "handedOffAt",
    "cancelledAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'stage3_' || md5(oi."id"),
    oi."id",
    oi."stationId",
    CASE
      WHEN oi."status" = 'IN_PREPARATION' THEN 'IN_PROGRESS'::"ProductionTicketStatus"
      WHEN oi."status" = 'READY' THEN 'READY'::"ProductionTicketStatus"
      WHEN oi."status" = 'SERVED' THEN 'HANDED_OFF'::"ProductionTicketStatus"
      WHEN oi."status" = 'CANCELLED' THEN 'CANCELLED'::"ProductionTicketStatus"
      ELSE 'QUEUED'::"ProductionTicketStatus"
    END,
    oi."createdAt",
    CASE WHEN oi."status" IN ('IN_PREPARATION', 'READY', 'SERVED') THEN oi."updatedAt" END,
    CASE WHEN oi."status" IN ('IN_PREPARATION', 'READY', 'SERVED') THEN oi."updatedAt" END,
    CASE WHEN oi."status" IN ('READY', 'SERVED') THEN oi."updatedAt" END,
    CASE WHEN oi."status" = 'SERVED' THEN oi."updatedAt" END,
    CASE WHEN oi."status" = 'CANCELLED' THEN oi."updatedAt" END,
    oi."createdAt",
    oi."updatedAt"
FROM "order_items" oi
WHERE oi."stationId" IS NOT NULL
  AND oi."status" IN ('ACCEPTED', 'IN_PREPARATION', 'READY', 'SERVED', 'CANCELLED')
ON CONFLICT ("orderItemId") DO NOTHING;

INSERT INTO "lifecycle_events" (
  "id", "entityType", "entityId", "fromState", "toState",
  "actorType", "metadata", "createdAt"
)
SELECT
  'stage3_ticket_' || md5(pt."id"),
  'ProductionTicket',
  pt."id",
  NULL,
  pt."status"::text,
  'SYSTEM'::"AuditActorType",
  jsonb_build_object('via', 'stage3_backfill'),
  CURRENT_TIMESTAMP
FROM "production_tickets" pt
WHERE pt."id" LIKE 'stage3_%'
ON CONFLICT ("id") DO NOTHING;

-- Синхронизировать агрегированный OrderRound исторических позиций и
-- записать каждый последовательный переход, не перепрыгивая state machine.
CREATE TEMP TABLE "_stage3_round_targets" AS
SELECT
  r."id",
  r."status" AS "oldStatus",
  CASE
    WHEN COUNT(*) FILTER (WHERE oi."status" NOT IN ('REJECTED', 'CANCELLED')) > 0
      AND BOOL_AND(oi."status" = 'SERVED') FILTER (WHERE oi."status" NOT IN ('REJECTED', 'CANCELLED'))
      THEN 'SERVED'::"OrderRoundStatus"
    WHEN COUNT(*) FILTER (WHERE oi."status" NOT IN ('REJECTED', 'CANCELLED')) > 0
      AND BOOL_AND(oi."status" IN ('READY', 'SERVED')) FILTER (WHERE oi."status" NOT IN ('REJECTED', 'CANCELLED'))
      THEN 'READY'::"OrderRoundStatus"
    WHEN BOOL_OR(oi."status" IN ('IN_PREPARATION', 'READY', 'SERVED'))
      THEN 'IN_PROGRESS'::"OrderRoundStatus"
    ELSE r."status"
  END AS "newStatus"
FROM "order_rounds" r
JOIN "order_items" oi ON oi."roundId" = r."id"
WHERE r."status" IN ('ACCEPTED', 'PARTIALLY_ACCEPTED', 'IN_PROGRESS', 'READY')
GROUP BY r."id", r."status";

INSERT INTO "lifecycle_events" (
  "id", "entityType", "entityId", "fromState", "toState",
  "actorType", "metadata", "createdAt"
)
SELECT
  'stage3_round_ip_' || md5(t."id"),
  'OrderRound', t."id", t."oldStatus"::text, 'IN_PROGRESS',
  'SYSTEM'::"AuditActorType", jsonb_build_object('via', 'stage3_backfill'), CURRENT_TIMESTAMP
FROM "_stage3_round_targets" t
WHERE t."oldStatus" IN ('ACCEPTED', 'PARTIALLY_ACCEPTED')
  AND t."newStatus" IN ('IN_PROGRESS', 'READY', 'SERVED')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "lifecycle_events" (
  "id", "entityType", "entityId", "fromState", "toState",
  "actorType", "metadata", "createdAt"
)
SELECT
  'stage3_round_ready_' || md5(t."id"),
  'OrderRound', t."id", 'IN_PROGRESS', 'READY',
  'SYSTEM'::"AuditActorType", jsonb_build_object('via', 'stage3_backfill'), CURRENT_TIMESTAMP
FROM "_stage3_round_targets" t
WHERE t."oldStatus" IN ('ACCEPTED', 'PARTIALLY_ACCEPTED', 'IN_PROGRESS')
  AND t."newStatus" IN ('READY', 'SERVED')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "lifecycle_events" (
  "id", "entityType", "entityId", "fromState", "toState",
  "actorType", "metadata", "createdAt"
)
SELECT
  'stage3_round_served_' || md5(t."id"),
  'OrderRound', t."id", 'READY', 'SERVED',
  'SYSTEM'::"AuditActorType", jsonb_build_object('via', 'stage3_backfill'), CURRENT_TIMESTAMP
FROM "_stage3_round_targets" t
WHERE t."oldStatus" IN ('ACCEPTED', 'PARTIALLY_ACCEPTED', 'IN_PROGRESS', 'READY')
  AND t."newStatus" = 'SERVED'
ON CONFLICT ("id") DO NOTHING;

UPDATE "order_rounds" r
SET "status" = t."newStatus", "updatedAt" = CURRENT_TIMESTAMP
FROM "_stage3_round_targets" t
WHERE r."id" = t."id" AND r."status" <> t."newStatus";

DROP TABLE "_stage3_round_targets";
