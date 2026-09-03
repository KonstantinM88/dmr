-- Per-product production targets. Existing products and historical order
-- snapshots stay unconfigured until an administrator sets real values.
ALTER TABLE "menu_items"
  ADD COLUMN "recommendedPreparationMinutes" INTEGER,
  ADD COLUMN "criticalPreparationMinutes" INTEGER;

ALTER TABLE "order_items"
  ADD COLUMN "recommendedPreparationMinutesSnapshot" INTEGER,
  ADD COLUMN "criticalPreparationMinutesSnapshot" INTEGER;

ALTER TABLE "menu_items"
  ADD CONSTRAINT "menu_items_preparation_sla_complete_check"
    CHECK (
      ("recommendedPreparationMinutes" IS NULL AND "criticalPreparationMinutes" IS NULL)
      OR
      (
        "recommendedPreparationMinutes" BETWEEN 1 AND 240
        AND "criticalPreparationMinutes" BETWEEN 1 AND 240
        AND "criticalPreparationMinutes" >= "recommendedPreparationMinutes"
      )
    );

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_preparation_sla_snapshot_check"
    CHECK (
      ("recommendedPreparationMinutesSnapshot" IS NULL AND "criticalPreparationMinutesSnapshot" IS NULL)
      OR
      (
        "recommendedPreparationMinutesSnapshot" BETWEEN 1 AND 240
        AND "criticalPreparationMinutesSnapshot" BETWEEN 1 AND 240
        AND "criticalPreparationMinutesSnapshot" >= "recommendedPreparationMinutesSnapshot"
      )
    );
