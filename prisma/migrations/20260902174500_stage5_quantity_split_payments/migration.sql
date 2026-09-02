-- Existing allocations were created only for whole remaining OrderItem rows.
-- Read-only readiness probe before this migration confirmed:
-- 0 active attempts, 0 non-integral allocations, 0 partial allocation rows.

ALTER TABLE "payment_attempt_allocations"
ADD COLUMN "quantity" INTEGER,
ADD COLUMN "expectedRemainingCents" INTEGER;

ALTER TABLE "payment_allocations"
ADD COLUMN "quantity" INTEGER;

UPDATE "payment_attempt_allocations" AS allocation
SET
  "quantity" = item."quantity",
  "expectedRemainingCents" = allocation."amountCents"
FROM "order_items" AS item
WHERE item."id" = allocation."orderItemId";

UPDATE "payment_allocations" AS allocation
SET "quantity" = item."quantity"
FROM "order_items" AS item
WHERE item."id" = allocation."orderItemId";

ALTER TABLE "payment_attempt_allocations"
ALTER COLUMN "quantity" SET NOT NULL,
ALTER COLUMN "expectedRemainingCents" SET NOT NULL;

ALTER TABLE "payment_allocations"
ALTER COLUMN "quantity" SET NOT NULL;

ALTER TABLE "payment_attempt_allocations"
ADD CONSTRAINT "payment_attempt_allocations_quantity_positive"
CHECK ("quantity" > 0),
ADD CONSTRAINT "payment_attempt_allocations_expected_remaining_valid"
CHECK ("expectedRemainingCents" >= "amountCents");

ALTER TABLE "payment_allocations"
ADD CONSTRAINT "payment_allocations_quantity_positive"
CHECK ("quantity" > 0);
