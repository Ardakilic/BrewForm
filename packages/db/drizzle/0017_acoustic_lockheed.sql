CREATE UNIQUE INDEX "setup_user_default_unique" ON "setup" USING btree ("user_id") WHERE "setup"."is_default" = true and "setup"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_lower_unique" ON "user" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "user_username_lower_unique" ON "user" USING btree (lower("username"));