ALTER TABLE "recipe_taste_note" ADD COLUMN "intensity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_version" ADD COLUMN "pre_infusion_time_seconds" integer;--> statement-breakpoint
ALTER TABLE "recipe_version" ADD COLUMN "bean_id" varchar(36);--> statement-breakpoint
ALTER TABLE "recipe_version" ADD CONSTRAINT "recipe_version_bean_id_bean_id_fk" FOREIGN KEY ("bean_id") REFERENCES "public"."bean"("id") ON DELETE no action ON UPDATE no action;