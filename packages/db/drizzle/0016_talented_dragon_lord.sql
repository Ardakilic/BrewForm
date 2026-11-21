CREATE TABLE "user_recipe_note" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"recipe_id" varchar(36) NOT NULL,
	"notes" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "user_recipe_note_user_id_recipe_id_unique" UNIQUE("user_id","recipe_id"),
	CONSTRAINT "user_recipe_note_notes_length_check" CHECK (char_length("user_recipe_note"."notes") <= 10000)
);
--> statement-breakpoint
ALTER TABLE "user_recipe_note" ADD CONSTRAINT "user_recipe_note_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recipe_note" ADD CONSTRAINT "user_recipe_note_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_recipe_note_recipe_id_idx" ON "user_recipe_note" USING btree ("recipe_id");