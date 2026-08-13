CREATE TABLE "brew_log" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"recipe_id" varchar(36) NOT NULL,
	"recipe_version_id" varchar(36),
	"brewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"yield_actual" real,
	"dose_actual" real,
	"notes" text,
	"personal_rating" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "brew_log_personal_rating_check" CHECK ("brew_log"."personal_rating" BETWEEN 1 AND 10),
	CONSTRAINT "brew_log_yield_actual_check" CHECK ("brew_log"."yield_actual" > 0),
	CONSTRAINT "brew_log_dose_actual_check" CHECK ("brew_log"."dose_actual" > 0)
);
--> statement-breakpoint
ALTER TABLE "brew_log" ADD CONSTRAINT "brew_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brew_log" ADD CONSTRAINT "brew_log_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brew_log" ADD CONSTRAINT "brew_log_recipe_version_id_recipe_version_id_fk" FOREIGN KEY ("recipe_version_id") REFERENCES "public"."recipe_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brew_log_user_brewed_idx" ON "brew_log" USING btree ("user_id","brewed_at");--> statement-breakpoint
CREATE INDEX "brew_log_recipe_brewed_idx" ON "brew_log" USING btree ("recipe_id","brewed_at");--> statement-breakpoint
CREATE INDEX "brew_log_deleted_at_idx" ON "brew_log" USING btree ("deleted_at");