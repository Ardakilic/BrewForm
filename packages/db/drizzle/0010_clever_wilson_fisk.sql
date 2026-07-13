CREATE TYPE "public"."notification_type" AS ENUM('mention');--> statement-breakpoint
CREATE TABLE "notification" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"actor_id" varchar(36),
	"type" "notification_type" NOT NULL,
	"reference_id" varchar(36),
	"reference_type" varchar(50),
	"metadata" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "mentioned_in_comment" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deleted_at_idx" ON "notification" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "notification_user_created_idx" ON "notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_user_read_at_idx" ON "notification" USING btree ("user_id","read_at");