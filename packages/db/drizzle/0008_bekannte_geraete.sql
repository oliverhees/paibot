-- PaiBot – bekannte Geräte: Browser, in denen sich der Besitzer angemeldet hat (nur der SHA-256 der
-- Kennung aus dem Cookie). Abmelden, „Alle Sitzungen beenden“ und ein neues Passwort löschen sie.
--
-- Autor:     Oliver Hees
-- Website:   https://paibot.de
-- Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
-- Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
-- Seit:      2026-11-21

CREATE TABLE "public"."geraete" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "geraete_id_format" CHECK ("public"."geraete"."id" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "geraete_ablauf_nach_start" CHECK ("public"."geraete"."expires_at" > "public"."geraete"."created_at")
);
--> statement-breakpoint
ALTER TABLE "public"."geraete" ADD CONSTRAINT "geraete_owner_id_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "geraete_owner_id_idx" ON "public"."geraete" USING btree ("owner_id");