CREATE TABLE "bots" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"model_id" text,
	"avatar_shape" text NOT NULL,
	"color" text NOT NULL,
	"max_output_tokens" integer DEFAULT 4096 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bots_name_eindeutig" UNIQUE("name"),
	CONSTRAINT "bots_id_format" CHECK ("bots"."id" ~ '^bot_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "bots_name_laenge" CHECK (char_length("bots"."name") between 1 and 60),
	CONSTRAINT "bots_instructions_laenge" CHECK (char_length("bots"."instructions") <= 8000),
	CONSTRAINT "bots_avatar_shape_werte" CHECK ("bots"."avatar_shape" in ('blatt', 'bogen', 'kiesel', 'raute', 'dee', 'wabe', 'bluete')),
	CONSTRAINT "bots_color_werte" CHECK ("bots"."color" in ('limette', 'blau', 'gruen', 'violett', 'pink', 'tuerkis', 'gelb', 'orange')),
	CONSTRAINT "bots_max_output_tokens_positiv" CHECK ("bots"."max_output_tokens" > 0)
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"context_window" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "models_provider_slug_eindeutig" UNIQUE("provider_id","slug"),
	CONSTRAINT "models_id_format" CHECK ("models"."id" ~ '^mod_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "models_slug_laenge" CHECK (char_length("models"."slug") between 1 and 200),
	CONSTRAINT "models_display_name_laenge" CHECK (char_length("models"."display_name") between 1 and 200),
	CONSTRAINT "models_context_window_positiv" CHECK ("models"."context_window" is null or "models"."context_window" > 0)
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"api_key_enc" text,
	"region" text NOT NULL,
	"country" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_check_ok" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "providers_base_url_eindeutig" UNIQUE("base_url"),
	CONSTRAINT "providers_id_format" CHECK ("providers"."id" ~ '^anb_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "providers_kind_werte" CHECK ("providers"."kind" in ('openai_compatible')),
	CONSTRAINT "providers_region_werte" CHECK ("providers"."region" in ('eu', 'non_eu', 'local')),
	CONSTRAINT "providers_name_laenge" CHECK (char_length("providers"."name") between 1 and 100),
	CONSTRAINT "providers_country_format" CHECK ("providers"."country" is null or "providers"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "providers_api_key_format" CHECK ("providers"."api_key_enc" is null or "providers"."api_key_enc" ~ '^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$')
);
--> statement-breakpoint
CREATE TABLE "belege" (
	"seq" bigint PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"entry_type" text NOT NULL,
	"action_id" text,
	"action" text,
	"actor" text,
	"conversation_id" text,
	"body" jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	"key_id" text NOT NULL,
	"signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "belege_id_eindeutig" UNIQUE("id"),
	CONSTRAINT "belege_hash_eindeutig" UNIQUE("hash"),
	CONSTRAINT "belege_seq_ab_eins" CHECK ("belege"."seq" >= 1),
	CONSTRAINT "belege_id_format" CHECK ("belege"."id" ~ '^blg_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "belege_entry_type_werte" CHECK ("belege"."entry_type" in ('start', 'decision', 'result', 'key_change')),
	CONSTRAINT "belege_action_id_format" CHECK ("belege"."action_id" is null or "belege"."action_id" ~ '^akt_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "belege_action_werte" CHECK ("belege"."action" is null or "belege"."action" in ('einrichtung.abschliessen', 'zugang.anmelden', 'zugang.abmelden', 'zugang.alle_abmelden', 'anbieter.speichern', 'anbieter.loeschen', 'modell.waehlen', 'bot.aendern', 'schleuse.umschalten', 'einstellung.aendern', 'unterhaltung.anlegen', 'unterhaltung.loeschen', 'nachricht.senden', 'modell.anfragen', 'lauf.abbrechen', 'belege.exportieren')),
	CONSTRAINT "belege_actor_format" CHECK ("belege"."actor" is null or "belege"."actor" ~ '^(besitzer|bot:bot_[0-7][0-9a-hjkmnp-tv-z]{25})$'),
	CONSTRAINT "belege_conversation_id_format" CHECK ("belege"."conversation_id" is null or "belege"."conversation_id" ~ '^unt_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "belege_aktion_nur_bei_entscheidung_und_ergebnis" CHECK (("belege"."entry_type" in ('decision', 'result')) = ("belege"."action_id" is not null and "belege"."action" is not null and "belege"."actor" is not null)),
	CONSTRAINT "belege_prev_hash_format" CHECK ("belege"."prev_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "belege_hash_format" CHECK ("belege"."hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "belege_signature_format" CHECK ("belege"."signature" ~ '^[A-Za-z0-9_-]{85}[AQgw]$'),
	CONSTRAINT "belege_kettenanfang" CHECK (("belege"."seq" = 1) = ("belege"."prev_hash" = 'sha256:0000000000000000000000000000000000000000000000000000000000000000')),
	CONSTRAINT "belege_body_objekt" CHECK (jsonb_typeof("belege"."body") = 'object'),
	CONSTRAINT "belege_body_passt_zur_zeile" CHECK ("belege"."body"->>'type' = "belege"."entry_type" and "belege"."body"->>'id' = "belege"."id" and "belege"."body"->>'prev' = "belege"."prev_hash" and "belege"."body"->>'keyId' = "belege"."key_id")
);
--> statement-breakpoint
CREATE TABLE "installation_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"public_key" text NOT NULL,
	"private_key_enc" text NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "installation_keys_public_key_eindeutig" UNIQUE("public_key"),
	CONSTRAINT "installation_keys_id_format" CHECK ("installation_keys"."id" ~ '^sch_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "installation_keys_purpose_werte" CHECK ("installation_keys"."purpose" in ('receipts')),
	CONSTRAINT "installation_keys_public_key_format" CHECK ("installation_keys"."public_key" ~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'),
	CONSTRAINT "installation_keys_private_key_format" CHECK ("installation_keys"."private_key_enc" ~ '^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'),
	CONSTRAINT "installation_keys_fingerprint_format" CHECK ("installation_keys"."fingerprint" ~ '^[0-9a-f]{4}(-[0-9a-f]{4}){3}$')
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" text NOT NULL,
	"version" integer NOT NULL,
	"action" text NOT NULL,
	"effect" text NOT NULL,
	"stage" text NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority" integer NOT NULL,
	"source" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rules_id_version_pk" PRIMARY KEY("id","version"),
	CONSTRAINT "rules_id_format" CHECK ("rules"."id" ~ '^(R-[0-9]{3}|reg_[0-7][0-9a-hjkmnp-tv-z]{25})$'),
	CONSTRAINT "rules_version_positiv" CHECK ("rules"."version" >= 1),
	CONSTRAINT "rules_action_werte" CHECK ("rules"."action" in ('*', 'einrichtung.abschliessen', 'zugang.anmelden', 'zugang.abmelden', 'zugang.alle_abmelden', 'anbieter.speichern', 'anbieter.loeschen', 'modell.waehlen', 'bot.aendern', 'schleuse.umschalten', 'einstellung.aendern', 'unterhaltung.anlegen', 'unterhaltung.loeschen', 'nachricht.senden', 'modell.anfragen', 'lauf.abbrechen', 'belege.exportieren')),
	CONSTRAINT "rules_effect_werte" CHECK ("rules"."effect" in ('allow', 'deny', 'ask')),
	CONSTRAINT "rules_stage_werte" CHECK ("rules"."stage" in ('ask', 'prepare', 'execute')),
	CONSTRAINT "rules_source_werte" CHECK ("rules"."source" in ('standard', 'owner', 'proposal')),
	CONSTRAINT "rules_conditions_liste" CHECK (jsonb_typeof("rules"."conditions") = 'array'),
	CONSTRAINT "rules_priority_bereich" CHECK ("rules"."priority" between 0 and 1000000),
	CONSTRAINT "rules_title_laenge" CHECK (char_length("rules"."title") between 1 and 200),
	CONSTRAINT "rules_reason_laenge" CHECK (char_length("rules"."reason") between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "conversation_events" (
	"conversation_id" text NOT NULL,
	"seq" bigint NOT NULL,
	"run_id" text,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_events_conversation_id_seq_pk" PRIMARY KEY("conversation_id","seq"),
	CONSTRAINT "conversation_events_run_id_format" CHECK ("conversation_events"."run_id" is null or "conversation_events"."run_id" ~ '^lau_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "conversation_events_seq_ab_eins" CHECK ("conversation_events"."seq" >= 1),
	CONSTRAINT "conversation_events_type_werte" CHECK ("conversation_events"."type" in ('message.created', 'run.queued', 'run.started', 'text.delta', 'message.completed', 'run.waiting', 'run.resumed', 'run.cancelled', 'run.failed', 'run.denied', 'schleuse.blockiert', 'beleg.created')),
	CONSTRAINT "conversation_events_payload_objekt" CHECK (jsonb_typeof("conversation_events"."payload") = 'object')
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"bot_id" text NOT NULL,
	"title" text NOT NULL,
	"schleuse_mode" text,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_id_format" CHECK ("conversations"."id" ~ '^unt_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "conversations_title_laenge" CHECK (char_length("conversations"."title") between 1 and 200),
	CONSTRAINT "conversations_schleuse_mode_werte" CHECK ("conversations"."schleuse_mode" is null or "conversations"."schleuse_mode" in ('off', 'on'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'complete' NOT NULL,
	"run_id" text,
	"model_id" text,
	"provider_id" text,
	"route" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_id_format" CHECK ("messages"."id" ~ '^nac_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "messages_run_id_format" CHECK ("messages"."run_id" is null or "messages"."run_id" ~ '^lau_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "messages_model_id_format" CHECK ("messages"."model_id" is null or "messages"."model_id" ~ '^mod_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "messages_provider_id_format" CHECK ("messages"."provider_id" is null or "messages"."provider_id" ~ '^anb_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "messages_role_werte" CHECK ("messages"."role" in ('user', 'assistant', 'system')),
	CONSTRAINT "messages_status_werte" CHECK ("messages"."status" in ('complete', 'streaming', 'cancelled', 'failed')),
	CONSTRAINT "messages_route_werte" CHECK ("messages"."route" is null or "messages"."route" in ('direct', 'schleuse')),
	CONSTRAINT "messages_tokens_in_nicht_negativ" CHECK ("messages"."tokens_in" is null or "messages"."tokens_in" >= 0),
	CONSTRAINT "messages_tokens_out_nicht_negativ" CHECK ("messages"."tokens_out" is null or "messages"."tokens_out" >= 0),
	CONSTRAINT "messages_error_code_format" CHECK ("messages"."error_code" is null or "messages"."error_code" ~ '^[a-z]+(_[a-z]+)*$')
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"trigger_message_id" text NOT NULL,
	"bot_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"resumes_run_id" text,
	"cancel_requested_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runs_id_format" CHECK ("runs"."id" ~ '^lau_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "runs_status_werte" CHECK ("runs"."status" in ('queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled', 'denied')),
	CONSTRAINT "runs_resumes_run_id_anders" CHECK ("runs"."resumes_run_id" is null or "runs"."resumes_run_id" <> "runs"."id"),
	CONSTRAINT "runs_error_code_format" CHECK ("runs"."error_code" is null or "runs"."error_code" ~ '^[a-z]+(_[a-z]+)*$')
);
--> statement-breakpoint
CREATE TABLE "owner" (
	"id" text PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_id_format" CHECK ("owner"."id" ~ '^bes_[0-7][0-9a-hjkmnp-tv-z]{25}$')
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start"),
	CONSTRAINT "rate_limits_key_format" CHECK ("rate_limits"."key" ~ '^[a-z][a-z_]*:.+$'),
	CONSTRAINT "rate_limits_key_laenge" CHECK (char_length("rate_limits"."key") <= 200),
	CONSTRAINT "rate_limits_count_nicht_negativ" CHECK ("rate_limits"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"auth_level" text NOT NULL,
	"method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	CONSTRAINT "sessions_id_format" CHECK ("sessions"."id" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "sessions_auth_level_werte" CHECK ("sessions"."auth_level" in ('password', 'password+totp')),
	CONSTRAINT "sessions_method_werte" CHECK ("sessions"."method" in ('password')),
	CONSTRAINT "sessions_user_agent_laenge" CHECK (char_length("sessions"."user_agent") <= 200),
	CONSTRAINT "sessions_ablauf_nach_start" CHECK ("sessions"."expires_at" > "sessions"."created_at")
);
--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "schleuse_mode_default" SET DEFAULT 'off';--> statement-breakpoint
UPDATE "settings" SET "schleuse_mode_default" = 'off' WHERE "schleuse_mode_default" = 'auto';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "history_token_limit" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "kill_switch" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "installation_id" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "default_bot_id" text;--> statement-breakpoint
ALTER TABLE "bots" ADD CONSTRAINT "bots_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "belege" ADD CONSTRAINT "belege_key_id_installation_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."installation_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_trigger_message_id_messages_id_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_resumes_run_id_runs_id_fk" FOREIGN KEY ("resumes_run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_owner_id_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "belege_prev_hash_eindeutig" ON "belege" USING btree ("prev_hash");--> statement-breakpoint
CREATE INDEX "belege_action_id_idx" ON "belege" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "belege_conversation_id_idx" ON "belege" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "belege_created_at_idx" ON "belege" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "installation_keys_ein_aktiver_schluessel" ON "installation_keys" USING btree ("purpose") WHERE "installation_keys"."retired_at" is null;--> statement-breakpoint
CREATE INDEX "rules_aktiv_priority_idx" ON "rules" USING btree ("enabled","priority");--> statement-breakpoint
CREATE INDEX "conversation_events_run_id_idx" ON "conversation_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "conversation_events_aufraeumen_idx" ON "conversation_events" USING btree ("created_at") WHERE "conversation_events"."type" = 'text.delta';--> statement-breakpoint
CREATE INDEX "conversations_last_message_at_idx" ON "conversations" USING btree ("last_message_at" desc nulls last);--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_run_id_idx" ON "messages" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "runs_conversation_created_idx" ON "runs" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_resumes_run_id_idx" ON "runs" USING btree ("resumes_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_ein_offener_lauf_je_unterhaltung" ON "runs" USING btree ("conversation_id") WHERE "runs"."status" in ('queued', 'running', 'waiting_approval');--> statement-breakpoint
CREATE INDEX "runs_aktiv_heartbeat_idx" ON "runs" USING btree ("status","heartbeat_at") WHERE "runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "owner_einzige_zeile" ON "owner" USING btree ((true));--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_default_bot_id_bots_id_fk" FOREIGN KEY ("default_bot_id") REFERENCES "public"."bots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_installation_id_unique" UNIQUE("installation_id");--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_nur_eine_zeile" CHECK ("settings"."id" = 'singleton');--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_locale_werte" CHECK ("settings"."locale" in ('de', 'en'));--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_schleuse_mode_werte" CHECK ("settings"."schleuse_mode_default" in ('off', 'on'));--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_max_hops_positiv" CHECK ("settings"."max_hops" > 0);--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_tagesbudget_positiv" CHECK ("settings"."daily_token_budget" is null or "settings"."daily_token_budget" > 0);--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_verlaufsgrenze_positiv" CHECK ("settings"."history_token_limit" is null or "settings"."history_token_limit" > 0);--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_installation_id_format" CHECK ("settings"."installation_id" is null or "settings"."installation_id" ~ '^ins_[0-7][0-9a-hjkmnp-tv-z]{25}$');