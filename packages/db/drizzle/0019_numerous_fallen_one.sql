CREATE INDEX "recipe_version_product_name_trgm_idx" ON "recipe_version" USING gin ("product_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "recipe_version_personal_notes_trgm_idx" ON "recipe_version" USING gin ("personal_notes" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "recipe_title_trgm_idx" ON "recipe" USING gin ("title" gin_trgm_ops);