CREATE TABLE "user_recipe_rating" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"recipe_id" varchar(36) NOT NULL,
	"rating" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_recipe_rating_user_id_recipe_id_unique" UNIQUE("user_id","recipe_id")
);
--> statement-breakpoint
ALTER TABLE "user_recipe_rating" ADD CONSTRAINT "user_recipe_rating_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recipe_rating" ADD CONSTRAINT "user_recipe_rating_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_recipe_rating_user_id_idx" ON "user_recipe_rating" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_recipe_rating_recipe_id_idx" ON "user_recipe_rating" USING btree ("recipe_id");