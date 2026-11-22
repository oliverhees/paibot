-- PaiBot – Datenbank für Teams (Teil A): Teams, Entwürfe für Teams, Anlagen eines Entwurfs (nur
-- anhängen), Köpfe von Fäden, neue Spalten an Bots, Unterhaltungen und Einstellungen, Unterhaltungen
-- ohne Bot (nur als Faden) und neue Regeln beim Entfernen von Bots und Teams.
--
-- Autor:     Oliver Hees
-- Website:   https://paibot.de
-- Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
-- Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
-- Seit:      2026-11-22
--
-- Vom Werkzeug erzeugt; von Hand ergänzt ist der Teil nach dem letzten erzeugten Befehl (Trigger).
-- Kein Zurück auf eine ältere Version nach dieser Migration: Unterhaltungen ohne Bot kennt der alte
-- Stand nicht. Vor dem Update eine Sicherung anlegen.
--
-- Regeln beim Entfernen seit dieser Migration: Ein Bot mit Läufen lässt sich nicht entfernen
-- (`runs.bot_id`), ebenso nicht der Standard-Bot (`settings.default_bot_id`); ein Team mit Fäden
-- lässt sich nicht entfernen (`conversations.team_id`); fällt ein Bot oder Team weg, werden
-- `teams.lead_bot_id`, `bots.team_id` und `bots.aus_entwurf_id` leer.

-- Die Liste „fertig, wenn“ eines Fadens: höchstens 12 Punkte, je ein Text von 1 bis 200 Zeichen. Eine
-- CHECK-Regel darf keine Unterabfrage enthalten, deshalb steht die Prüfung in dieser Funktion.
CREATE FUNCTION paibot_fertig_wenn_ok(liste jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN jsonb_typeof(liste) <> 'array' THEN false
    ELSE jsonb_array_length(liste) <= 12 AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(liste) AS p(wert)
      WHERE jsonb_typeof(p.wert) <> 'string' OR char_length(p.wert #>> '{}') NOT BETWEEN 1 AND 200
    )
  END
$$;
--> statement-breakpoint
CREATE TABLE "public"."faeden" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"ziel" text NOT NULL,
	"fertig_wenn" jsonb NOT NULL,
	"abnahme" text NOT NULL,
	"herkunft" text NOT NULL,
	"action_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faeden_ziel_laenge" CHECK (char_length("public"."faeden"."ziel") between 1 and 2000),
	CONSTRAINT "faeden_fertig_wenn_liste" CHECK (paibot_fertig_wenn_ok("public"."faeden"."fertig_wenn")),
	CONSTRAINT "faeden_abnahme_werte" CHECK ("public"."faeden"."abnahme" in ('leitung', 'besitzer', 'ohne')),
	CONSTRAINT "faeden_herkunft_werte" CHECK ("public"."faeden"."herkunft" in ('besitzer')),
	CONSTRAINT "faeden_action_id_format" CHECK ("public"."faeden"."action_id" ~ '^akt_[0-7][0-9a-hjkmnp-tv-z]{25}$')
);
--> statement-breakpoint
CREATE TABLE "public"."team_anlagen" (
	"entwurf_id" text NOT NULL,
	"objekt_art" text NOT NULL,
	"objekt_id" text NOT NULL,
	"stand_bei_anlage" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_anlagen_entwurf_id_objekt_art_objekt_id_pk" PRIMARY KEY("entwurf_id","objekt_art","objekt_id"),
	CONSTRAINT "team_anlagen_objekt_art_werte" CHECK ("public"."team_anlagen"."objekt_art" in ('bot', 'team')),
	CONSTRAINT "team_anlagen_objekt_id_laenge" CHECK (char_length("public"."team_anlagen"."objekt_id") between 1 and 60),
	CONSTRAINT "team_anlagen_stand_laenge" CHECK (char_length("public"."team_anlagen"."stand_bei_anlage") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "public"."team_entwuerfe" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"herkunft" text NOT NULL,
	"quelle" text NOT NULL,
	"titel" text NOT NULL,
	"inhalt" jsonb NOT NULL,
	"abdruck" text NOT NULL,
	"format_fassung" integer NOT NULL,
	"gilt_bis" timestamp with time zone,
	"angelegt_action_id" text,
	"zurueck_action_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_entwuerfe_id_format" CHECK ("public"."team_entwuerfe"."id" ~ '^ent_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "team_entwuerfe_status_werte" CHECK ("public"."team_entwuerfe"."status" in ('offen', 'angelegt', 'zurueckgenommen', 'verworfen', 'verfallen')),
	CONSTRAINT "team_entwuerfe_herkunft_werte" CHECK ("public"."team_entwuerfe"."herkunft" in ('vorlage', 'datei')),
	CONSTRAINT "team_entwuerfe_quelle_laenge" CHECK (char_length("public"."team_entwuerfe"."quelle") between 1 and 300),
	CONSTRAINT "team_entwuerfe_titel_laenge" CHECK (char_length("public"."team_entwuerfe"."titel") between 1 and 200),
	CONSTRAINT "team_entwuerfe_inhalt_objekt" CHECK (jsonb_typeof("public"."team_entwuerfe"."inhalt") = 'object'),
	CONSTRAINT "team_entwuerfe_abdruck_format" CHECK ("public"."team_entwuerfe"."abdruck" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "team_entwuerfe_fassung_positiv" CHECK ("public"."team_entwuerfe"."format_fassung" >= 1),
	CONSTRAINT "team_entwuerfe_angelegt_action_id_format" CHECK ("public"."team_entwuerfe"."angelegt_action_id" is null or "public"."team_entwuerfe"."angelegt_action_id" ~ '^akt_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "team_entwuerfe_zurueck_action_id_format" CHECK ("public"."team_entwuerfe"."zurueck_action_id" is null or "public"."team_entwuerfe"."zurueck_action_id" ~ '^akt_[0-7][0-9a-hjkmnp-tv-z]{25}$')
);
--> statement-breakpoint
CREATE TABLE "public"."teams" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"lead_bot_id" text,
	"zusammenarbeit" text DEFAULT 'aus' NOT NULL,
	"abnahme_standard" text DEFAULT 'leitung' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_name_eindeutig" UNIQUE("name"),
	CONSTRAINT "teams_id_format" CHECK ("public"."teams"."id" ~ '^tea_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "teams_name_laenge" CHECK (char_length("public"."teams"."name") between 1 and 60),
	CONSTRAINT "teams_zusammenarbeit_werte" CHECK ("public"."teams"."zusammenarbeit" in ('aus', 'leitung_fuehrt')),
	CONSTRAINT "teams_abnahme_standard_werte" CHECK ("public"."teams"."abnahme_standard" in ('leitung', 'besitzer', 'ohne'))
);
--> statement-breakpoint
ALTER TABLE "public"."settings" DROP CONSTRAINT "settings_default_bot_id_bots_id_fk";
--> statement-breakpoint
ALTER TABLE "public"."runs" DROP CONSTRAINT "runs_bot_id_bots_id_fk";
--> statement-breakpoint
ALTER TABLE "public"."conversations" ALTER COLUMN "bot_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."bots" ADD COLUMN "role" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."bots" ADD COLUMN "paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."bots" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "public"."bots" ADD COLUMN "aus_entwurf_id" text;--> statement-breakpoint
ALTER TABLE "public"."settings" ADD COLUMN "stabschef_erlaubt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."conversations" ADD COLUMN "kind" text DEFAULT 'direkt' NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."conversations" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "public"."faeden" ADD CONSTRAINT "faeden_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."team_anlagen" ADD CONSTRAINT "team_anlagen_entwurf_id_team_entwuerfe_id_fk" FOREIGN KEY ("entwurf_id") REFERENCES "public"."team_entwuerfe"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."teams" ADD CONSTRAINT "teams_lead_bot_id_bots_id_fk" FOREIGN KEY ("lead_bot_id") REFERENCES "public"."bots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_entwuerfe_status_idx" ON "public"."team_entwuerfe" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "teams_lead_bot_id_idx" ON "public"."teams" USING btree ("lead_bot_id");--> statement-breakpoint
ALTER TABLE "public"."bots" ADD CONSTRAINT "bots_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."bots" ADD CONSTRAINT "bots_aus_entwurf_id_team_entwuerfe_id_fk" FOREIGN KEY ("aus_entwurf_id") REFERENCES "public"."team_entwuerfe"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_default_bot_id_bots_id_fk" FOREIGN KEY ("default_bot_id") REFERENCES "public"."bots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."runs" ADD CONSTRAINT "runs_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bots_team_id_idx" ON "public"."bots" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "conversations_team_id_idx" ON "public"."conversations" USING btree ("team_id");--> statement-breakpoint
ALTER TABLE "public"."bots" ADD CONSTRAINT "bots_role_laenge" CHECK (char_length("public"."bots"."role") <= 200);--> statement-breakpoint
ALTER TABLE "public"."bots" ADD CONSTRAINT "bots_team_id_format" CHECK ("public"."bots"."team_id" is null or "public"."bots"."team_id" ~ '^tea_[0-7][0-9a-hjkmnp-tv-z]{25}$');--> statement-breakpoint
ALTER TABLE "public"."bots" ADD CONSTRAINT "bots_aus_entwurf_id_format" CHECK ("public"."bots"."aus_entwurf_id" is null or "public"."bots"."aus_entwurf_id" ~ '^ent_[0-7][0-9a-hjkmnp-tv-z]{25}$');--> statement-breakpoint
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_kind_werte" CHECK ("public"."conversations"."kind" in ('direkt', 'faden', 'entwurf'));--> statement-breakpoint
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_team_id_format" CHECK ("public"."conversations"."team_id" is null or "public"."conversations"."team_id" ~ '^tea_[0-7][0-9a-hjkmnp-tv-z]{25}$');--> statement-breakpoint
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_bot_oder_team" CHECK (("public"."conversations"."kind" in ('direkt', 'entwurf') and "public"."conversations"."bot_id" is not null and "public"."conversations"."team_id" is null) or ("public"."conversations"."kind" = 'faden' and "public"."conversations"."bot_id" is null and "public"."conversations"."team_id" is not null));
--> statement-breakpoint
CREATE TRIGGER team_anlagen_nur_anhaengen
BEFORE UPDATE OR DELETE ON "team_anlagen"
FOR EACH ROW EXECUTE FUNCTION paibot_apps_nur_anhaengen();
--> statement-breakpoint
CREATE TRIGGER team_anlagen_kein_truncate
BEFORE TRUNCATE ON "team_anlagen"
FOR EACH STATEMENT EXECUTE FUNCTION paibot_apps_nur_anhaengen();
