ALTER TABLE "recipe_equipment" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_taste_note" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_version_photo" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;