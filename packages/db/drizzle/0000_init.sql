CREATE TABLE "settings" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"locale" text DEFAULT 'de' NOT NULL,
	"timezone" text DEFAULT 'Europe/Berlin' NOT NULL,
	"schleuse_mode_default" text DEFAULT 'auto' NOT NULL,
	"max_hops" integer DEFAULT 8 NOT NULL,
	"daily_token_budget" integer,
	"setup_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
