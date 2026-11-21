-- PaiBot – bekannte Geräte: Browser (später auch Apps), in denen sich der Besitzer angemeldet hat,
-- einzeln widerrufbar; Sitzungen gehören zu einem Gerät. Neue Aktionen „Gerät hinzugefügt“ und
-- „Gerät entfernt“ für Regeln und Belege.
--
-- Autor:     Oliver Hees
-- Website:   https://paibot.de
-- Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
-- Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
-- Seit:      2026-11-21

CREATE TABLE "public"."geraete" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"kind" text DEFAULT 'browser' NOT NULL,
	"name" text,
	"rights" text DEFAULT 'voll' NOT NULL,
	"public_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "geraete_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "geraete_id_format" CHECK ("public"."geraete"."id" ~ '^ger_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "geraete_token_hash_format" CHECK ("public"."geraete"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "geraete_kind_werte" CHECK ("public"."geraete"."kind" in ('browser')),
	CONSTRAINT "geraete_rights_werte" CHECK ("public"."geraete"."rights" in ('voll')),
	CONSTRAINT "geraete_name_laenge" CHECK (char_length("public"."geraete"."name") <= 200),
	CONSTRAINT "geraete_public_key_laenge" CHECK (char_length("public"."geraete"."public_key") <= 2000),
	CONSTRAINT "geraete_ablauf_nach_start" CHECK ("public"."geraete"."expires_at" > "public"."geraete"."created_at")
);
--> statement-breakpoint
ALTER TABLE "public"."belege" DROP CONSTRAINT "belege_action_werte";--> statement-breakpoint
ALTER TABLE "public"."rules" DROP CONSTRAINT "rules_action_werte";--> statement-breakpoint
ALTER TABLE "public"."sessions" ADD COLUMN "device_id" text;--> statement-breakpoint
ALTER TABLE "public"."geraete" ADD CONSTRAINT "geraete_owner_id_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "geraete_owner_id_idx" ON "public"."geraete" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_device_id_geraete_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."geraete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."belege" ADD CONSTRAINT "belege_action_werte" CHECK ("public"."belege"."action" is null or "public"."belege"."action" in ('einrichtung.abschliessen', 'zugang.anmelden', 'zugang.abmelden', 'zugang.alle_abmelden', 'zugang.passwort_aendern', 'anbieter.speichern', 'anbieter.loeschen', 'modell.waehlen', 'bot.aendern', 'schleuse.umschalten', 'einstellung.aendern', 'unterhaltung.anlegen', 'unterhaltung.umbenennen', 'unterhaltung.loeschen', 'nachricht.senden', 'modell.anfragen', 'lauf.abbrechen', 'belege.exportieren', 'werkzeug.aufrufen', 'geraet.hinzufuegen', 'geraet.entfernen'));--> statement-breakpoint
ALTER TABLE "public"."rules" ADD CONSTRAINT "rules_action_werte" CHECK ("public"."rules"."action" in ('*', 'einrichtung.abschliessen', 'zugang.anmelden', 'zugang.abmelden', 'zugang.alle_abmelden', 'zugang.passwort_aendern', 'anbieter.speichern', 'anbieter.loeschen', 'modell.waehlen', 'bot.aendern', 'schleuse.umschalten', 'einstellung.aendern', 'unterhaltung.anlegen', 'unterhaltung.umbenennen', 'unterhaltung.loeschen', 'nachricht.senden', 'modell.anfragen', 'lauf.abbrechen', 'belege.exportieren', 'werkzeug.aufrufen', 'geraet.hinzufuegen', 'geraet.entfernen'));