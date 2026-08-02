-- Custom SQL migration file, put your code below! --> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'follow';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'like';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'comment';--> statement-breakpoint
ALTER TABLE "user_preferences" RENAME COLUMN "new_follower" TO "notify_new_follower";--> statement-breakpoint
ALTER TABLE "user_preferences" RENAME COLUMN "recipe_liked" TO "notify_recipe_liked";--> statement-breakpoint
ALTER TABLE "user_preferences" RENAME COLUMN "recipe_commented" TO "notify_recipe_commented";--> statement-breakpoint
ALTER TABLE "user_preferences" RENAME COLUMN "followed_user_posted" TO "notify_followed_user_posted";--> statement-breakpoint
ALTER TABLE "user_preferences" RENAME COLUMN "mentioned_in_comment" TO "notify_mentioned_in_comment";