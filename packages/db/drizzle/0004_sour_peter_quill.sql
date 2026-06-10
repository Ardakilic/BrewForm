CREATE TYPE "public"."report_status" AS ENUM('pending', 'reviewed', 'resolved', 'dismissed');--> statement-breakpoint
ALTER TABLE "report" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."report_status";--> statement-breakpoint
ALTER TABLE "report" ALTER COLUMN "status" SET DATA TYPE "public"."report_status" USING "status"::"public"."report_status";