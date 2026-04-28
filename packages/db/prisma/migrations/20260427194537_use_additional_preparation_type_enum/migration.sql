-- Convert RecipeAdditionalPreparation.type from String to AdditionalPreparationType enum.
-- The cast is safe when existing values are already drawn from the enum domain
-- (milk | water | syrup | spice | other). Rows with values outside that set
-- would fail; in that case backfill them first or coerce to 'other'.
ALTER TABLE "RecipeAdditionalPreparation"
  ALTER COLUMN "type" TYPE "AdditionalPreparationType"
  USING "type"::"AdditionalPreparationType";
