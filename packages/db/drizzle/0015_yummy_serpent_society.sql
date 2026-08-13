DROP INDEX "brew_log_recipe_brewed_idx";--> statement-breakpoint
CREATE INDEX "brew_log_recipe_brewed_idx" ON "brew_log" USING btree ("recipe_id","user_id","brewed_at");