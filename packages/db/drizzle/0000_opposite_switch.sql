CREATE TYPE "public"."additional_preparation_type" AS ENUM('milk', 'water', 'syrup', 'spice', 'other');--> statement-breakpoint
CREATE TYPE "public"."badge_rule" AS ENUM('first_brew', 'decade_brewer', 'centurion', 'first_fork', 'fan_favourite', 'community_star', 'conversationalist', 'precision_brewer', 'explorer', 'influencer');--> statement-breakpoint
CREATE TYPE "public"."brew_method" AS ENUM('espresso_machine', 'v60', 'french_press', 'aeropress', 'turkish_coffee', 'drip_coffee', 'chemex', 'kalita_wave', 'moka_pot', 'cold_brew', 'siphon');--> statement-breakpoint
CREATE TYPE "public"."coffee_variety_category" AS ENUM('variety', 'processing', 'market_name');--> statement-breakpoint
CREATE TYPE "public"."date_format" AS ENUM('DD_MM_YYYY', 'MM_DD_YYYY', 'YYYY_MM_DD');--> statement-breakpoint
CREATE TYPE "public"."drink_type" AS ENUM('espresso', 'americano', 'flat_white', 'latte', 'cappuccino', 'cortado', 'macchiato', 'turkish_coffee', 'pour_over', 'cold_brew', 'french_press', 'aeropress', 'drip_coffee', 'moka_pot', 'siphon');--> statement-breakpoint
CREATE TYPE "public"."emoji_tag" AS ENUM('fire', 'rocket', 'thumbsup', 'neutral', 'thumbsdown', 'nauseated');--> statement-breakpoint
CREATE TYPE "public"."equipment_delete_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."equipment_type" AS ENUM('espresso_machine', 'grinder', 'pour_over_brewer', 'immersion_brewer', 'kettle', 'milk_tool', 'scale_accessory', 'roaster', 'portafilter', 'basket', 'puck_screen', 'paper_filter', 'tamper', 'mesh_filter', 'cezve', 'thermometer', 'other');--> statement-breakpoint
CREATE TYPE "public"."temperature_unit" AS ENUM('celsius', 'fahrenheit');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('light', 'dark', 'coffee');--> statement-breakpoint
CREATE TYPE "public"."unit_system" AS ENUM('metric', 'imperial');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('draft', 'private', 'unlisted', 'public');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"admin_id" varchar(36) NOT NULL,
	"action" varchar(255) NOT NULL,
	"entity" varchar(255) NOT NULL,
	"entity_id" varchar(36),
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badge" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"icon" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"rule" "badge_rule" NOT NULL,
	"threshold" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "badge_rule_unique" UNIQUE("rule")
);
--> statement-breakpoint
CREATE TABLE "bean" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"brand" varchar(255),
	"vendor_id" varchar(36),
	"roaster" varchar(255),
	"roast_level" varchar(100),
	"processing" varchar(100),
	"origin" varchar(255),
	"user_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "brew_method_equipment_rule" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"brew_method" "brew_method" NOT NULL,
	"equipment_type" "equipment_type" NOT NULL,
	"compatible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brew_method_equipment_rule_brew_method_equipment_type_unique" UNIQUE("brew_method","equipment_type")
);
--> statement-breakpoint
CREATE TABLE "coffee_variety" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" "coffee_variety_category" NOT NULL,
	"species" varchar(255),
	"origin" varchar(500),
	"spread" text,
	"altitude_range_m" varchar(100),
	"cup_profile" text,
	"body" varchar(100),
	"acidity" varchar(100),
	"caffeine_pct" varchar(50),
	"processing_compatibility" text[],
	"disease_resistance" varchar(100),
	"yield" varchar(100),
	"plant_size" varchar(100),
	"notes" text,
	"sub_varieties" text[],
	"fermentation" text,
	"drying_time_days" varchar(50),
	"drying_method" text,
	"mucilage_retention_pct" varchar(50),
	"price_range" varchar(100),
	"processing" varchar(255),
	"type_label" varchar(255),
	"notable_farms" text[],
	"notable_regions" text[],
	"regional_variants" text[],
	"global_share_pct" varchar(50),
	"is_system" boolean DEFAULT true NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"recipe_id" varchar(36) NOT NULL,
	"author_id" varchar(36) NOT NULL,
	"content" text NOT NULL,
	"parent_comment_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
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
CREATE TABLE "equipment" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "equipment_type" NOT NULL,
	"brand" varchar(255),
	"model" varchar(255),
	"description" text,
	"created_by" varchar(36),
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "equipment_delete_request" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"equipment_id" varchar(36) NOT NULL,
	"requested_by_id" varchar(36) NOT NULL,
	"reason" text,
	"status" "equipment_delete_request_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by_id" varchar(36),
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "photo" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"recipe_id" varchar(36) NOT NULL,
	"url" varchar(500) NOT NULL,
	"thumbnail_url" varchar(500),
	"alt" varchar(255),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recipe_additional_preparation" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"recipe_version_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "additional_preparation_type" NOT NULL,
	"input_amount" varchar(100) NOT NULL,
	"preparation_type" varchar(100) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_equipment" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"recipe_version_id" varchar(36) NOT NULL,
	"equipment_id" varchar(36) NOT NULL,
	CONSTRAINT "recipe_equipment_recipe_version_id_equipment_id_unique" UNIQUE("recipe_version_id","equipment_id")
);
--> statement-breakpoint
CREATE TABLE "recipe_taste_note" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"recipe_version_id" varchar(36) NOT NULL,
	"taste_note_id" varchar(36) NOT NULL,
	"intensity" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "recipe_taste_note_recipe_version_id_taste_note_id_unique" UNIQUE("recipe_version_id","taste_note_id")
);
--> statement-breakpoint
CREATE TABLE "recipe_version_photo" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"recipe_version_id" varchar(36) NOT NULL,
	"photo_id" varchar(36) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "recipe_version_photo_recipe_version_id_photo_id_unique" UNIQUE("recipe_version_id","photo_id")
);
--> statement-breakpoint
CREATE TABLE "recipe_version" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"recipe_id" varchar(36) NOT NULL,
	"version_number" integer NOT NULL,
	"product_name" varchar(255),
	"coffee_brand" varchar(255),
	"coffee_processing" varchar(255),
	"vendor_id" varchar(36),
	"roast_date" timestamp with time zone,
	"package_open_date" timestamp with time zone,
	"grind_date" timestamp with time zone,
	"brew_date" timestamp with time zone DEFAULT now() NOT NULL,
	"brew_method" "brew_method" NOT NULL,
	"drink_type" "drink_type" NOT NULL,
	"brewer_details" varchar(500),
	"grinder" varchar(255),
	"grind_size" varchar(50),
	"ground_weight_grams" real,
	"extraction_time_seconds" integer,
	"extraction_volume_ml" real,
	"temperature_celsius" real,
	"tds" numeric(4, 2),
	"brew_ratio" real,
	"flow_rate" real,
	"pre_infusion_time_seconds" integer,
	"bean_id" varchar(36),
	"coffee_variety_id" varchar(36),
	"coffee_variety_name" varchar(255),
	"personal_notes" text,
	"preparation_notes" text NOT NULL,
	"is_favourite" boolean DEFAULT false NOT NULL,
	"rating" integer,
	"emoji_tag" "emoji_tag",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_version_recipe_id_version_number_unique" UNIQUE("recipe_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "recipe" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"slug" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"author_id" varchar(36) NOT NULL,
	"visibility" "visibility" DEFAULT 'draft' NOT NULL,
	"current_version_id" varchar(36),
	"like_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"fork_count" integer DEFAULT 0 NOT NULL,
	"forked_from_id" varchar(36),
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "recipe_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"reporter_id" varchar(36) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setup" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"brewer_details" varchar(500),
	"grinder" varchar(255),
	"portafilter_id" varchar(36),
	"basket_id" varchar(36),
	"puck_screen_id" varchar(36),
	"paper_filter_id" varchar(36),
	"tamper_id" varchar(36),
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "taste_note" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"parent_id" varchar(36),
	"color" varchar(50),
	"definition" text,
	"depth" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_badge" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"badge_id" varchar(36) NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_badge_user_id_badge_id_unique" UNIQUE("user_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "user_follow" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"follower_id" varchar(36) NOT NULL,
	"following_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_follow_follower_id_following_id_unique" UNIQUE("follower_id","following_id")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"unit_system" "unit_system" DEFAULT 'metric' NOT NULL,
	"temperature_unit" "temperature_unit" DEFAULT 'celsius' NOT NULL,
	"theme" "theme" DEFAULT 'light' NOT NULL,
	"locale" varchar(10) DEFAULT 'en' NOT NULL,
	"timezone" varchar(50) DEFAULT 'UTC' NOT NULL,
	"date_format" date_format DEFAULT 'YYYY_MM_DD' NOT NULL,
	"new_follower" boolean DEFAULT true NOT NULL,
	"recipe_liked" boolean DEFAULT true NOT NULL,
	"recipe_commented" boolean DEFAULT true NOT NULL,
	"followed_user_posted" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_recipe_favourite" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"recipe_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_recipe_favourite_user_id_recipe_id_unique" UNIQUE("user_id","recipe_id")
);
--> statement-breakpoint
CREATE TABLE "user_recipe_like" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"recipe_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_recipe_like_user_id_recipe_id_unique" UNIQUE("user_id","recipe_id")
);
--> statement-breakpoint
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
CREATE TABLE "user" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_verified_at" timestamp with time zone,
	"username" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"avatar_url" varchar(500),
	"bio" text,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "vendor" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"website" varchar(500),
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_admin_id_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bean" ADD CONSTRAINT "bean_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bean" ADD CONSTRAINT "bean_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffee_variety" ADD CONSTRAINT "coffee_variety_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_parent_comment_id_comment_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."comment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_token" ADD CONSTRAINT "email_verification_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_delete_request" ADD CONSTRAINT "equipment_delete_request_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_delete_request" ADD CONSTRAINT "equipment_delete_request_requested_by_id_user_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_delete_request" ADD CONSTRAINT "equipment_delete_request_reviewed_by_id_user_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset" ADD CONSTRAINT "password_reset_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_additional_preparation" ADD CONSTRAINT "recipe_addl_prep_recipe_version_id_fk" FOREIGN KEY ("recipe_version_id") REFERENCES "public"."recipe_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_equipment" ADD CONSTRAINT "recipe_equipment_recipe_version_id_recipe_version_id_fk" FOREIGN KEY ("recipe_version_id") REFERENCES "public"."recipe_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_equipment" ADD CONSTRAINT "recipe_equipment_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_taste_note" ADD CONSTRAINT "recipe_taste_note_recipe_version_id_recipe_version_id_fk" FOREIGN KEY ("recipe_version_id") REFERENCES "public"."recipe_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_taste_note" ADD CONSTRAINT "recipe_taste_note_taste_note_id_taste_note_id_fk" FOREIGN KEY ("taste_note_id") REFERENCES "public"."taste_note"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_version_photo" ADD CONSTRAINT "recipe_version_photo_recipe_version_id_recipe_version_id_fk" FOREIGN KEY ("recipe_version_id") REFERENCES "public"."recipe_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_version_photo" ADD CONSTRAINT "recipe_version_photo_photo_id_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_version" ADD CONSTRAINT "recipe_version_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_version" ADD CONSTRAINT "recipe_version_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_version" ADD CONSTRAINT "recipe_version_bean_id_bean_id_fk" FOREIGN KEY ("bean_id") REFERENCES "public"."bean"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_version" ADD CONSTRAINT "recipe_version_coffee_variety_id_coffee_variety_id_fk" FOREIGN KEY ("coffee_variety_id") REFERENCES "public"."coffee_variety"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_current_version_id_recipe_version_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."recipe_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_forked_from_id_recipe_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup" ADD CONSTRAINT "setup_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup" ADD CONSTRAINT "setup_portafilter_id_equipment_id_fk" FOREIGN KEY ("portafilter_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup" ADD CONSTRAINT "setup_basket_id_equipment_id_fk" FOREIGN KEY ("basket_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup" ADD CONSTRAINT "setup_puck_screen_id_equipment_id_fk" FOREIGN KEY ("puck_screen_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup" ADD CONSTRAINT "setup_paper_filter_id_equipment_id_fk" FOREIGN KEY ("paper_filter_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup" ADD CONSTRAINT "setup_tamper_id_equipment_id_fk" FOREIGN KEY ("tamper_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taste_note" ADD CONSTRAINT "taste_note_parent_id_taste_note_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."taste_note"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badge" ADD CONSTRAINT "user_badge_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badge" ADD CONSTRAINT "user_badge_badge_id_badge_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badge"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follow" ADD CONSTRAINT "user_follow_follower_id_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follow" ADD CONSTRAINT "user_follow_following_id_user_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recipe_favourite" ADD CONSTRAINT "user_recipe_favourite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recipe_favourite" ADD CONSTRAINT "user_recipe_favourite_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recipe_like" ADD CONSTRAINT "user_recipe_like_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recipe_like" ADD CONSTRAINT "user_recipe_like_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recipe_rating" ADD CONSTRAINT "user_recipe_rating_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recipe_rating" ADD CONSTRAINT "user_recipe_rating_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_admin_id_idx" ON "audit_log" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "badge_rule_idx" ON "badge" USING btree ("rule");--> statement-breakpoint
CREATE INDEX "bean_user_id_idx" ON "bean" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bean_deleted_at_idx" ON "bean" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "brew_method_equipment_rule_brew_method_idx" ON "brew_method_equipment_rule" USING btree ("brew_method");--> statement-breakpoint
CREATE INDEX "brew_method_equipment_rule_equipment_type_idx" ON "brew_method_equipment_rule" USING btree ("equipment_type");--> statement-breakpoint
CREATE INDEX "coffee_variety_name_idx" ON "coffee_variety" USING btree ("name");--> statement-breakpoint
CREATE INDEX "coffee_variety_category_idx" ON "coffee_variety" USING btree ("category");--> statement-breakpoint
CREATE INDEX "coffee_variety_deleted_at_idx" ON "coffee_variety" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "comment_recipe_id_idx" ON "comment" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "comment_author_id_idx" ON "comment" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "comment_parent_comment_id_idx" ON "comment" USING btree ("parent_comment_id");--> statement-breakpoint
CREATE INDEX "comment_created_at_idx" ON "comment" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "comment_deleted_at_idx" ON "comment" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "email_verification_token_token_idx" ON "email_verification_token" USING btree ("token");--> statement-breakpoint
CREATE INDEX "email_verification_token_user_id_idx" ON "email_verification_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_verification_token_expires_at_idx" ON "email_verification_token" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "equipment_type_idx" ON "equipment" USING btree ("type");--> statement-breakpoint
CREATE INDEX "equipment_name_idx" ON "equipment" USING btree ("name");--> statement-breakpoint
CREATE INDEX "equipment_deleted_at_idx" ON "equipment" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "edr_equipment_id_idx" ON "equipment_delete_request" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "edr_status_idx" ON "equipment_delete_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "password_reset_token_idx" ON "password_reset" USING btree ("token");--> statement-breakpoint
CREATE INDEX "password_reset_user_id_idx" ON "password_reset" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_expires_at_idx" ON "password_reset" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "photo_recipe_id_idx" ON "photo" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "photo_deleted_at_idx" ON "photo" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "recipe_additional_preparation_recipe_version_id_idx" ON "recipe_additional_preparation" USING btree ("recipe_version_id");--> statement-breakpoint
CREATE INDEX "recipe_equipment_recipe_version_id_idx" ON "recipe_equipment" USING btree ("recipe_version_id");--> statement-breakpoint
CREATE INDEX "recipe_equipment_equipment_id_idx" ON "recipe_equipment" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "recipe_taste_note_recipe_version_id_idx" ON "recipe_taste_note" USING btree ("recipe_version_id");--> statement-breakpoint
CREATE INDEX "recipe_taste_note_taste_note_id_idx" ON "recipe_taste_note" USING btree ("taste_note_id");--> statement-breakpoint
CREATE INDEX "recipe_version_photo_recipe_version_id_idx" ON "recipe_version_photo" USING btree ("recipe_version_id");--> statement-breakpoint
CREATE INDEX "recipe_version_photo_photo_id_idx" ON "recipe_version_photo" USING btree ("photo_id");--> statement-breakpoint
CREATE INDEX "recipe_version_recipe_id_idx" ON "recipe_version" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_version_brew_method_idx" ON "recipe_version" USING btree ("brew_method");--> statement-breakpoint
CREATE INDEX "recipe_version_drink_type_idx" ON "recipe_version" USING btree ("drink_type");--> statement-breakpoint
CREATE INDEX "recipe_version_created_at_idx" ON "recipe_version" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "recipe_author_id_idx" ON "recipe" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "recipe_visibility_idx" ON "recipe" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "recipe_created_at_idx" ON "recipe" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "recipe_like_count_idx" ON "recipe" USING btree ("like_count");--> statement-breakpoint
CREATE INDEX "recipe_forked_from_id_idx" ON "recipe" USING btree ("forked_from_id");--> statement-breakpoint
CREATE INDEX "recipe_slug_idx" ON "recipe" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "recipe_deleted_at_idx" ON "recipe" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "report_entity_type_entity_id_idx" ON "report" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "report_status_idx" ON "report" USING btree ("status");--> statement-breakpoint
CREATE INDEX "report_reporter_id_idx" ON "report" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "report_created_at_idx" ON "report" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "setup_user_id_idx" ON "setup" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "setup_deleted_at_idx" ON "setup" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "taste_note_parent_id_idx" ON "taste_note" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "taste_note_name_idx" ON "taste_note" USING btree ("name");--> statement-breakpoint
CREATE INDEX "taste_note_depth_idx" ON "taste_note" USING btree ("depth");--> statement-breakpoint
CREATE INDEX "user_badge_user_id_idx" ON "user_badge" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_badge_badge_id_idx" ON "user_badge" USING btree ("badge_id");--> statement-breakpoint
CREATE INDEX "user_follow_follower_id_idx" ON "user_follow" USING btree ("follower_id");--> statement-breakpoint
CREATE INDEX "user_follow_following_id_idx" ON "user_follow" USING btree ("following_id");--> statement-breakpoint
CREATE INDEX "user_follow_created_at_idx" ON "user_follow" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_recipe_favourite_user_id_idx" ON "user_recipe_favourite" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_recipe_favourite_recipe_id_idx" ON "user_recipe_favourite" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "user_recipe_favourite_created_at_idx" ON "user_recipe_favourite" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_recipe_like_user_id_idx" ON "user_recipe_like" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_recipe_like_recipe_id_idx" ON "user_recipe_like" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "user_recipe_like_created_at_idx" ON "user_recipe_like" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_recipe_rating_user_id_idx" ON "user_recipe_rating" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_recipe_rating_recipe_id_idx" ON "user_recipe_rating" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "user_email_idx" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_username_idx" ON "user" USING btree ("username");--> statement-breakpoint
CREATE INDEX "user_created_at_idx" ON "user" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_deleted_at_idx" ON "user" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "vendor_name_idx" ON "vendor" USING btree ("name");--> statement-breakpoint
CREATE INDEX "vendor_deleted_at_idx" ON "vendor" USING btree ("deleted_at");