CREATE TABLE "email_verification_token" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_verification_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_verification_token" ADD CONSTRAINT "email_verification_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_verification_token_token_idx" ON "email_verification_token" USING btree ("token");--> statement-breakpoint
CREATE INDEX "email_verification_token_user_id_idx" ON "email_verification_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_verification_token_expires_at_idx" ON "email_verification_token" USING btree ("expires_at");