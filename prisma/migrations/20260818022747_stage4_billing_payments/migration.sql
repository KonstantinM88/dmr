-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('DRAFT', 'OPEN', 'PAYMENT_PENDING', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('STRIPE', 'CASH', 'TERMINAL');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProviderEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateTable
CREATE TABLE "bills" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'OPEN',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "totalGrossCents" INTEGER NOT NULL DEFAULT 0,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "remainingCents" INTEGER NOT NULL DEFAULT 0,
    "taxTotalCents" INTEGER NOT NULL DEFAULT 0,
    "requestedAt" TIMESTAMP(3),
    "requestedByStaffUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'STRIPE',
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "providerRef" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "reservedUntil" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdByParticipantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'STRIPE',
    "status" "PaymentStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "providerRef" TEXT,
    "providerEventId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_provider_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "ProviderEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payloadDigest" TEXT,
    "relatedPaymentIntentId" TEXT,
    "processedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT,
    "providerRef" TEXT,
    "requestedByStaffUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tips" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_settlements" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "amountCents" INTEGER NOT NULL,
    "receivedCents" INTEGER NOT NULL,
    "changeCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "note" TEXT,
    "staffUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_audit_events" (
    "id" TEXT NOT NULL,
    "venueId" TEXT,
    "billId" TEXT,
    "paymentId" TEXT,
    "action" TEXT NOT NULL,
    "actorType" "AuditActorType" NOT NULL DEFAULT 'SYSTEM',
    "actorId" TEXT,
    "amountCents" INTEGER,
    "currency" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bills_sessionId_key" ON "bills"("sessionId");

-- CreateIndex
CREATE INDEX "bills_sessionId_status_idx" ON "bills"("sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_providerRef_key" ON "payment_attempts"("providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_idempotencyKey_key" ON "payment_attempts"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payment_attempts_billId_status_idx" ON "payment_attempts"("billId", "status");

-- Database-level guard for two devices/double clicks racing to pay one bill.
CREATE UNIQUE INDEX "payment_attempts_one_active_per_bill"
ON "payment_attempts"("billId")
WHERE "status" IN ('CREATED', 'PENDING');

-- CreateIndex
CREATE UNIQUE INDEX "payments_attemptId_key" ON "payments"("attemptId");

-- CreateIndex
CREATE INDEX "payments_billId_status_idx" ON "payments"("billId", "status");

CREATE UNIQUE INDEX "payments_providerRef_key"
ON "payments"("providerRef") WHERE "providerRef" IS NOT NULL;

CREATE UNIQUE INDEX "payments_providerEventId_key"
ON "payments"("providerEventId") WHERE "providerEventId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "payment_allocations_orderItemId_idx" ON "payment_allocations"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_paymentId_orderItemId_key" ON "payment_allocations"("paymentId", "orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_events_providerEventId_key" ON "payment_provider_events"("providerEventId");

-- CreateIndex
CREATE INDEX "payment_provider_events_eventType_createdAt_idx" ON "payment_provider_events"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "payment_provider_events_relatedPaymentIntentId_idx" ON "payment_provider_events"("relatedPaymentIntentId");

-- CreateIndex
CREATE INDEX "refunds_paymentId_status_idx" ON "refunds"("paymentId", "status");

-- CreateIndex
CREATE INDEX "tips_paymentId_idx" ON "tips"("paymentId");

-- CreateIndex
CREATE INDEX "cash_settlements_billId_createdAt_idx" ON "cash_settlements"("billId", "createdAt");

-- CreateIndex
CREATE INDEX "financial_audit_events_venueId_createdAt_idx" ON "financial_audit_events"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "financial_audit_events_billId_createdAt_idx" ON "financial_audit_events"("billId", "createdAt");

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "dining_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requestedByStaffUserId_fkey" FOREIGN KEY ("requestedByStaffUserId") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tips" ADD CONSTRAINT "tips_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_settlements" ADD CONSTRAINT "cash_settlements_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_settlements" ADD CONSTRAINT "cash_settlements_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Monetary invariants: invalid or over-allocated rows are rejected even if a
-- future code path forgets the domain checks.
ALTER TABLE "bills" ADD CONSTRAINT "bills_amounts_valid"
CHECK (
  "totalGrossCents" >= 0 AND "paidCents" >= 0 AND "remainingCents" >= 0
  AND "taxTotalCents" >= 0
  AND "paidCents" + "remainingCents" = "totalGrossCents"
);

ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_amount_positive"
CHECK ("amountCents" > 0);

ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive"
CHECK ("amountCents" > 0);

ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_amount_positive"
CHECK ("amountCents" > 0);

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_positive"
CHECK ("amountCents" > 0);

ALTER TABLE "tips" ADD CONSTRAINT "tips_amount_positive"
CHECK ("amountCents" > 0);

ALTER TABLE "cash_settlements" ADD CONSTRAINT "cash_settlements_amounts_valid"
CHECK (
  "method" IN ('CASH', 'TERMINAL') AND "amountCents" > 0
  AND "receivedCents" >= "amountCents" AND "changeCents" >= 0
  AND "receivedCents" - "changeCents" = "amountCents"
);

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_allocation_amounts_valid"
CHECK (
  "allocatedPaidCents" >= 0 AND "remainingCents" >= 0
  AND "allocatedPaidCents" + "remainingCents" = "lineTotalCents"
);
