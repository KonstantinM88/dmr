-- CreateEnum
CREATE TYPE "WaiterCallStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED');

-- Existing database was verified to contain no cash settlements before this
-- migration. Every new cash settlement must reference its immutable Payment.
ALTER TABLE "cash_settlements" ADD COLUMN "paymentId" TEXT NOT NULL;

CREATE TABLE "waiter_calls" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" "WaiterCallStatus" NOT NULL DEFAULT 'OPEN',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "acknowledgedByStaffUserId" TEXT,
    "resolvedByStaffUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "waiter_calls_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_attempt_allocations" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_attempt_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "waiter_calls_sessionId_status_requestedAt_idx"
ON "waiter_calls"("sessionId", "status", "requestedAt");

CREATE INDEX "waiter_calls_updatedAt_idx" ON "waiter_calls"("updatedAt");

-- Repeated taps and concurrent guest devices cannot create multiple active
-- calls for the same table session.
CREATE UNIQUE INDEX "waiter_calls_one_active_per_session"
ON "waiter_calls"("sessionId")
WHERE "status" IN ('OPEN', 'ACKNOWLEDGED');

CREATE INDEX "payment_attempt_allocations_orderItemId_idx"
ON "payment_attempt_allocations"("orderItemId");

CREATE UNIQUE INDEX "payment_attempt_allocations_attemptId_orderItemId_key"
ON "payment_attempt_allocations"("attemptId", "orderItemId");

CREATE UNIQUE INDEX "cash_settlements_paymentId_key"
ON "cash_settlements"("paymentId");

ALTER TABLE "waiter_calls"
ADD CONSTRAINT "waiter_calls_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "dining_sessions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "waiter_calls"
ADD CONSTRAINT "waiter_calls_acknowledgedByStaffUserId_fkey"
FOREIGN KEY ("acknowledgedByStaffUserId") REFERENCES "staff_users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "waiter_calls"
ADD CONSTRAINT "waiter_calls_resolvedByStaffUserId_fkey"
FOREIGN KEY ("resolvedByStaffUserId") REFERENCES "staff_users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_attempt_allocations"
ADD CONSTRAINT "payment_attempt_allocations_attemptId_fkey"
FOREIGN KEY ("attemptId") REFERENCES "payment_attempts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_attempt_allocations"
ADD CONSTRAINT "payment_attempt_allocations_orderItemId_fkey"
FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cash_settlements"
ADD CONSTRAINT "cash_settlements_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "payments"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_attempt_allocations"
ADD CONSTRAINT "payment_attempt_allocations_amount_positive"
CHECK ("amountCents" > 0);

ALTER TABLE "waiter_calls"
ADD CONSTRAINT "waiter_calls_timestamps_match_status"
CHECK (
  ("status" = 'OPEN' AND "acknowledgedAt" IS NULL AND "resolvedAt" IS NULL)
  OR ("status" = 'ACKNOWLEDGED' AND "acknowledgedAt" IS NOT NULL AND "resolvedAt" IS NULL)
  OR ("status" IN ('RESOLVED', 'CANCELLED') AND "resolvedAt" IS NOT NULL)
);
