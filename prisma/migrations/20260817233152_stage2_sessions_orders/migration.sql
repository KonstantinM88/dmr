-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('OPEN', 'PAYMENT_PENDING', 'PARTIALLY_PAID', 'PAID', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReorderApprovalMode" AS ENUM ('REQUIRE_WAITER', 'AUTO_ACCEPT');

-- CreateEnum
CREATE TYPE "OrderRoundStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'IN_PROGRESS', 'READY', 'SERVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'IN_PREPARATION', 'READY', 'SERVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "dining_sessions" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'OPEN',
    "reorderApprovalMode" "ReorderApprovalMode" NOT NULL DEFAULT 'REQUIRE_WAITER',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedByStaffUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedByStaffUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dining_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_participants" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "displayLabel" TEXT,
    "seatLabel" TEXT,
    "isStaffProxy" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "session_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_rounds" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "OrderRoundStatus" NOT NULL DEFAULT 'SUBMITTED',
    "approvalMode" "ReorderApprovalMode" NOT NULL,
    "isFirstRound" BOOLEAN NOT NULL DEFAULT false,
    "clientRequestId" TEXT NOT NULL,
    "createdByParticipantId" TEXT,
    "createdByStaffUserId" TEXT,
    "totalGrossCents" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "orderedByParticipantId" TEXT,
    "menuItemId" TEXT,
    "menuVariantId" TEXT,
    "stationId" TEXT,
    "status" "OrderItemStatus" NOT NULL DEFAULT 'SUBMITTED',
    "seatLabel" TEXT,
    "guestNote" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "variantNameSnapshot" TEXT,
    "localeSnapshot" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotalCents" INTEGER NOT NULL,
    "taxRateBasisPoints" INTEGER NOT NULL,
    "taxAmountCents" INTEGER NOT NULL,
    "stationKindSnapshot" "ProductionStationKind",
    "allocatedPaidCents" INTEGER NOT NULL DEFAULT 0,
    "remainingCents" INTEGER NOT NULL DEFAULT 0,
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_modifiers" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "modifierOptionId" TEXT,
    "groupTitleSnapshot" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "priceDeltaCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_round_decisions" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "staffUserId" TEXT,
    "decision" "OrderRoundStatus" NOT NULL,
    "acceptedItemIds" TEXT[],
    "rejectedItemIds" TEXT[],
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_round_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dining_sessions_venueId_status_openedAt_idx" ON "dining_sessions"("venueId", "status", "openedAt");

-- CreateIndex
CREATE INDEX "dining_sessions_tableId_status_idx" ON "dining_sessions"("tableId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "session_participants_tokenHash_key" ON "session_participants"("tokenHash");

-- CreateIndex
CREATE INDEX "session_participants_sessionId_idx" ON "session_participants"("sessionId");

-- CreateIndex
CREATE INDEX "order_rounds_sessionId_status_idx" ON "order_rounds"("sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "order_rounds_sessionId_clientRequestId_key" ON "order_rounds"("sessionId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "order_rounds_sessionId_sequence_key" ON "order_rounds"("sessionId", "sequence");

-- CreateIndex
CREATE INDEX "order_items_roundId_status_idx" ON "order_items"("roundId", "status");

-- CreateIndex
CREATE INDEX "order_item_modifiers_orderItemId_idx" ON "order_item_modifiers"("orderItemId");

-- CreateIndex
CREATE INDEX "order_round_decisions_roundId_createdAt_idx" ON "order_round_decisions"("roundId", "createdAt");

-- AddForeignKey
ALTER TABLE "dining_sessions" ADD CONSTRAINT "dining_sessions_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dining_sessions" ADD CONSTRAINT "dining_sessions_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "dining_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "dining_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_rounds" ADD CONSTRAINT "order_rounds_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "dining_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_rounds" ADD CONSTRAINT "order_rounds_createdByParticipantId_fkey" FOREIGN KEY ("createdByParticipantId") REFERENCES "session_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_rounds" ADD CONSTRAINT "order_rounds_createdByStaffUserId_fkey" FOREIGN KEY ("createdByStaffUserId") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "order_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderedByParticipantId_fkey" FOREIGN KEY ("orderedByParticipantId") REFERENCES "session_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menuVariantId_fkey" FOREIGN KEY ("menuVariantId") REFERENCES "menu_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "production_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_round_decisions" ADD CONSTRAINT "order_round_decisions_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "order_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_round_decisions" ADD CONSTRAINT "order_round_decisions_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Не более одной незавершённой сессии на стол.
CREATE UNIQUE INDEX "dining_sessions_active_per_table"
  ON "dining_sessions" ("tableId")
  WHERE "status" NOT IN ('CLOSED', 'CANCELLED');
