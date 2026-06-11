CREATE INDEX "bean_user_created_idx" ON "bean" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "coffee_variety_category_name_idx" ON "coffee_variety" USING btree ("category","name");--> statement-breakpoint
CREATE INDEX "comment_recipe_parent_created_idx" ON "comment" USING btree ("recipe_id","parent_comment_id","created_at");--> statement-breakpoint
CREATE INDEX "comment_parent_created_idx" ON "comment" USING btree ("parent_comment_id","created_at");--> statement-breakpoint
CREATE INDEX "equipment_type_name_idx" ON "equipment" USING btree ("type","name");--> statement-breakpoint
CREATE INDEX "photo_recipe_sort_order_idx" ON "photo" USING btree ("recipe_id","sort_order");--> statement-breakpoint
CREATE INDEX "recipe_version_coffee_variety_idx" ON "recipe_version" USING btree ("coffee_variety_id","recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_author_visibility_idx" ON "recipe" USING btree ("author_id","visibility");--> statement-breakpoint
CREATE INDEX "recipe_visibility_created_idx" ON "recipe" USING btree ("visibility","created_at");--> statement-breakpoint
CREATE INDEX "recipe_visibility_like_count_idx" ON "recipe" USING btree ("visibility","like_count");--> statement-breakpoint
CREATE INDEX "report_status_created_idx" ON "report" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "setup_user_created_idx" ON "setup" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "taste_note_deleted_at_idx" ON "taste_note" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "taste_note_parent_name_idx" ON "taste_note" USING btree ("parent_id","name");--> statement-breakpoint
CREATE INDEX "taste_note_depth_name_idx" ON "taste_note" USING btree ("depth","name");--> statement-breakpoint
CREATE INDEX "user_follow_following_created_idx" ON "user_follow" USING btree ("following_id","created_at");--> statement-breakpoint
CREATE INDEX "user_follow_follower_created_idx" ON "user_follow" USING btree ("follower_id","created_at");