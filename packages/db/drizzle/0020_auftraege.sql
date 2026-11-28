-- PaiBot – Datenbank für Aufträge: Aufträge, die Läufe der Bots zu einem Baum verbinden, ihre
-- Ereignisse und Zuschläge (beide nur anhängen), Stand, Staffelstab und Kennzeichen „belastet“ am
-- Faden, Autor, Auftrag, Herkunft und Bezug auf eine Frage an Nachrichten, Auftrag und Kennzeichen
-- an Läufen (ein aktiver Lauf je Auftragsbaum), Grenzen der Aufträge und Not-Aus-Epoche in den
-- Einstellungen.
--
-- Autor:     Oliver Hees
-- Website:   https://paibot.de
-- Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
-- Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
-- Seit:      2026-11-28
--
-- Vom Werkzeug erzeugt; von Hand ergänzt ist der Teil nach dem letzten erzeugten Befehl (Trigger).
-- Bestehende Zeilen bleiben, wie sie sind: Ältere Nachrichten haben keinen Autor und keinen
-- Auftrag, ältere Läufe keinen Auftrag und kein erfasstes Kennzeichen (`untrusted_input` leer).
-- Kein Zurück auf eine ältere Version nach dieser Migration: Herkunft `rueckmeldung` und
-- `vorschlag` kennt der alte Stand nicht. Vor dem Update eine Sicherung anlegen.

CREATE TABLE "public"."auftraege" (
	"id" text PRIMARY KEY NOT NULL,
	"art" text NOT NULL,
	"parent_auftrag_id" text,
	"root_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"bot_id" text NOT NULL,
	"geber" text,
	"zettel" text DEFAULT '' NOT NULL,
	"fertig_wenn" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'gefragt' NOT NULL,
	"action_id" text NOT NULL,
	"notaus_epoche" integer NOT NULL,
	"belastet" boolean DEFAULT false NOT NULL,
	"rueckfragen" integer DEFAULT 0 NOT NULL,
	"bitten" integer DEFAULT 0 NOT NULL,
	"end_grund" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "auftraege_id_format" CHECK ("public"."auftraege"."id" ~ '^auf_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "auftraege_root_id_format" CHECK ("public"."auftraege"."root_id" ~ '^auf_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "auftraege_parent_id_format" CHECK ("public"."auftraege"."parent_auftrag_id" is null or "public"."auftraege"."parent_auftrag_id" ~ '^auf_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "auftraege_art_werte" CHECK ("public"."auftraege"."art" in ('wurzel', 'uebergabe', 'bitte', 'rueckkehr', 'faecher', 'sammeln', 'rueckmeldung', 'rueckgabe')),
	CONSTRAINT "auftraege_status_werte" CHECK ("public"."auftraege"."status" in ('gefragt', 'arbeitet', 'wartet_auf_dich', 'fertig', 'gescheitert', 'abgelehnt', 'abgebrochen')),
	CONSTRAINT "auftraege_action_id_format" CHECK ("public"."auftraege"."action_id" ~ '^akt_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "auftraege_wurzel_ohne_eltern" CHECK (("public"."auftraege"."art" = 'wurzel') = ("public"."auftraege"."parent_auftrag_id" is null) and ("public"."auftraege"."art" = 'wurzel') = ("public"."auftraege"."root_id" = "public"."auftraege"."id")),
	CONSTRAINT "auftraege_geber_format" CHECK ("public"."auftraege"."geber" is null or "public"."auftraege"."geber" ~ '^(besitzer|bot:bot_[0-7][0-9a-hjkmnp-tv-z]{25})$'),
	CONSTRAINT "auftraege_geber_nur_ohne_server" CHECK (("public"."auftraege"."art" in ('rueckkehr', 'sammeln', 'rueckmeldung')) = ("public"."auftraege"."geber" is null)),
	CONSTRAINT "auftraege_wurzel_vom_besitzer" CHECK ("public"."auftraege"."art" <> 'wurzel' or "public"."auftraege"."geber" = 'besitzer'),
	CONSTRAINT "auftraege_zettel_laenge" CHECK (char_length("public"."auftraege"."zettel") <= 2000),
	CONSTRAINT "auftraege_zettel_bereinigt" CHECK (not ("public"."auftraege"."zettel" ~ '[\u0001-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]')),
	CONSTRAINT "auftraege_fertig_wenn_laenge" CHECK (char_length("public"."auftraege"."fertig_wenn") <= 2000),
	CONSTRAINT "auftraege_fertig_wenn_bereinigt" CHECK (not ("public"."auftraege"."fertig_wenn" ~ '[\u0001-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]')),
	CONSTRAINT "auftraege_epoche_nicht_negativ" CHECK ("public"."auftraege"."notaus_epoche" >= 0),
	CONSTRAINT "auftraege_rueckfragen_nicht_negativ" CHECK ("public"."auftraege"."rueckfragen" >= 0),
	CONSTRAINT "auftraege_bitten_nicht_negativ" CHECK ("public"."auftraege"."bitten" >= 0),
	CONSTRAINT "auftraege_end_grund_format" CHECK ("public"."auftraege"."end_grund" is null or "public"."auftraege"."end_grund" ~ '^[a-z]+(_[a-z]+)*$'),
	CONSTRAINT "auftraege_ende_passt" CHECK (("public"."auftraege"."status" in ('fertig', 'gescheitert', 'abgelehnt', 'abgebrochen')) = ("public"."auftraege"."finished_at" is not null)),
	CONSTRAINT "auftraege_grund_nur_am_ende" CHECK ("public"."auftraege"."end_grund" is null or "public"."auftraege"."status" in ('fertig', 'gescheitert', 'abgelehnt', 'abgebrochen'))
);
--> statement-breakpoint
CREATE TABLE "public"."auftrag_ereignisse" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "public"."auftrag_ereignisse_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"auftrag_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auftrag_ereignisse_type_werte" CHECK ("public"."auftrag_ereignisse"."type" in ('auftrag.created', 'auftrag.status', 'stab.moved')),
	CONSTRAINT "auftrag_ereignisse_payload_objekt" CHECK (jsonb_typeof("public"."auftrag_ereignisse"."payload") = 'object')
);
--> statement-breakpoint
CREATE TABLE "public"."auftrag_zuschlaege" (
	"auftrag_root_id" text NOT NULL,
	"nr" integer NOT NULL,
	"action_id" text NOT NULL,
	"tokens" integer DEFAULT 10000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auftrag_zuschlaege_nr_je_wurzel" UNIQUE("auftrag_root_id","nr"),
	CONSTRAINT "auftrag_zuschlaege_action_id_eindeutig" UNIQUE("action_id"),
	CONSTRAINT "auftrag_zuschlaege_nr_bereich" CHECK ("public"."auftrag_zuschlaege"."nr" between 1 and 5),
	CONSTRAINT "auftrag_zuschlaege_tokens_fest" CHECK ("public"."auftrag_zuschlaege"."tokens" = 10000),
	CONSTRAINT "auftrag_zuschlaege_action_id_format" CHECK ("public"."auftrag_zuschlaege"."action_id" ~ '^akt_[0-7][0-9a-hjkmnp-tv-z]{25}$')
);
--> statement-breakpoint
ALTER TABLE "public"."messages" DROP CONSTRAINT "messages_origin_werte";--> statement-breakpoint
ALTER TABLE "public"."settings" ADD COLUMN "auftrag_max_tiefe" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."settings" ADD COLUMN "auftrag_max_anzahl" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."settings" ADD COLUMN "auftrag_max_tokens" integer DEFAULT 200000 NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."settings" ADD COLUMN "auftrag_max_minuten" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."settings" ADD COLUMN "auftrag_max_breite" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."settings" ADD COLUMN "auftraege_je_mitglied" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."settings" ADD COLUMN "rueckfragen_je_faden" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."settings" ADD COLUMN "bitten_je_auftrag" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."settings" ADD COLUMN "zuschlaege_je_baum" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."settings" ADD COLUMN "erwaehnungen_je_nachricht" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."settings" ADD COLUMN "notaus_epoche" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."faeden" ADD COLUMN "stand" text DEFAULT 'laufend' NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."faeden" ADD COLUMN "stab_bei" text;--> statement-breakpoint
ALTER TABLE "public"."faeden" ADD COLUMN "belastet" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."messages" ADD COLUMN "bot_id" text;--> statement-breakpoint
ALTER TABLE "public"."messages" ADD COLUMN "auftrag_id" text;--> statement-breakpoint
ALTER TABLE "public"."messages" ADD COLUMN "frage_bezug" text;--> statement-breakpoint
ALTER TABLE "public"."runs" ADD COLUMN "auftrag_id" text;--> statement-breakpoint
ALTER TABLE "public"."runs" ADD COLUMN "auftrag_root_id" text;--> statement-breakpoint
ALTER TABLE "public"."runs" ADD COLUMN "untrusted_input" boolean;--> statement-breakpoint
ALTER TABLE "public"."runs" ADD COLUMN "finish_reason" text;--> statement-breakpoint
ALTER TABLE "public"."auftraege" ADD CONSTRAINT "auftraege_parent_auftrag_id_auftraege_id_fk" FOREIGN KEY ("parent_auftrag_id") REFERENCES "public"."auftraege"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."auftraege" ADD CONSTRAINT "auftraege_root_id_auftraege_id_fk" FOREIGN KEY ("root_id") REFERENCES "public"."auftraege"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."auftraege" ADD CONSTRAINT "auftraege_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."auftraege" ADD CONSTRAINT "auftraege_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."auftrag_ereignisse" ADD CONSTRAINT "auftrag_ereignisse_auftrag_id_auftraege_id_fk" FOREIGN KEY ("auftrag_id") REFERENCES "public"."auftraege"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."auftrag_zuschlaege" ADD CONSTRAINT "auftrag_zuschlaege_auftrag_root_id_auftraege_id_fk" FOREIGN KEY ("auftrag_root_id") REFERENCES "public"."auftraege"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auftraege_root_id_idx" ON "public"."auftraege" USING btree ("root_id","bot_id");--> statement-breakpoint
CREATE INDEX "auftraege_parent_id_idx" ON "public"."auftraege" USING btree ("parent_auftrag_id");--> statement-breakpoint
CREATE INDEX "auftraege_conversation_id_idx" ON "public"."auftraege" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auftraege_einmal_je_entscheidung" ON "public"."auftraege" USING btree ("action_id","art","bot_id");--> statement-breakpoint
CREATE INDEX "auftrag_ereignisse_auftrag_id_idx" ON "public"."auftrag_ereignisse" USING btree ("auftrag_id","seq");--> statement-breakpoint
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_auftrag_id_auftraege_id_fk" FOREIGN KEY ("auftrag_id") REFERENCES "public"."auftraege"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_frage_bezug_messages_id_fk" FOREIGN KEY ("frage_bezug") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."runs" ADD CONSTRAINT "runs_auftrag_id_auftraege_id_fk" FOREIGN KEY ("auftrag_id") REFERENCES "public"."auftraege"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."runs" ADD CONSTRAINT "runs_auftrag_root_id_auftraege_id_fk" FOREIGN KEY ("auftrag_root_id") REFERENCES "public"."auftraege"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_auftrag_id_idx" ON "public"."messages" USING btree ("auftrag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_ein_aktiver_lauf_je_auftragsbaum" ON "public"."runs" USING btree ("auftrag_root_id") WHERE "public"."runs"."auftrag_root_id" is not null and "public"."runs"."status" in ('queued', 'running', 'waiting_approval');--> statement-breakpoint
CREATE INDEX "runs_auftrag_id_idx" ON "public"."runs" USING btree ("auftrag_id");--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_auftrag_max_tiefe_bereich" CHECK ("public"."settings"."auftrag_max_tiefe" between 1 and 5);--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_auftrag_max_anzahl_bereich" CHECK ("public"."settings"."auftrag_max_anzahl" between 1 and 100);--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_auftrag_max_tokens_bereich" CHECK ("public"."settings"."auftrag_max_tokens" between 1000 and 2000000);--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_auftrag_max_minuten_bereich" CHECK ("public"."settings"."auftrag_max_minuten" between 1 and 240);--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_auftrag_max_breite_bereich" CHECK ("public"."settings"."auftrag_max_breite" between 1 and 12);--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_auftraege_je_mitglied_bereich" CHECK ("public"."settings"."auftraege_je_mitglied" between 1 and 10);--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_rueckfragen_je_faden_bereich" CHECK ("public"."settings"."rueckfragen_je_faden" between 1 and 10);--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_bitten_je_auftrag_bereich" CHECK ("public"."settings"."bitten_je_auftrag" between 1 and 3);--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_zuschlaege_je_baum_fest" CHECK ("public"."settings"."zuschlaege_je_baum" = 5);--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_erwaehnungen_je_nachricht_bereich" CHECK ("public"."settings"."erwaehnungen_je_nachricht" between 1 and 12);--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_notaus_epoche_nicht_negativ" CHECK ("public"."settings"."notaus_epoche" >= 0);--> statement-breakpoint
ALTER TABLE "public"."faeden" ADD CONSTRAINT "faeden_stand_werte" CHECK ("public"."faeden"."stand" in ('laufend', 'wartet_auf_dich', 'wartet_auf_abnahme', 'fertig', 'abgebrochen', 'gescheitert'));--> statement-breakpoint
ALTER TABLE "public"."faeden" ADD CONSTRAINT "faeden_stab_bei_format" CHECK ("public"."faeden"."stab_bei" is null or "public"."faeden"."stab_bei" ~ '^(besitzer|bot:bot_[0-7][0-9a-hjkmnp-tv-z]{25})$');--> statement-breakpoint
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_bot_id_format" CHECK ("public"."messages"."bot_id" is null or "public"."messages"."bot_id" ~ '^bot_[0-7][0-9a-hjkmnp-tv-z]{25}$');--> statement-breakpoint
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_auftrag_id_format" CHECK ("public"."messages"."auftrag_id" is null or "public"."messages"."auftrag_id" ~ '^auf_[0-7][0-9a-hjkmnp-tv-z]{25}$');--> statement-breakpoint
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_frage_bezug_format" CHECK ("public"."messages"."frage_bezug" is null or "public"."messages"."frage_bezug" ~ '^nac_[0-7][0-9a-hjkmnp-tv-z]{25}$');--> statement-breakpoint
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_autor_nur_bot" CHECK ("public"."messages"."bot_id" is null or "public"."messages"."role" = 'assistant');--> statement-breakpoint
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_frage_bezug_nur_person" CHECK ("public"."messages"."frage_bezug" is null or "public"."messages"."role" = 'user');--> statement-breakpoint
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_vorschlag_mit_bezug" CHECK ("public"."messages"."origin" <> 'vorschlag' or ("public"."messages"."role" = 'user' and "public"."messages"."frage_bezug" is not null));--> statement-breakpoint
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_rueckmeldung_nur_bot" CHECK ("public"."messages"."origin" <> 'rueckmeldung' or "public"."messages"."role" = 'assistant');--> statement-breakpoint
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_origin_werte" CHECK ("public"."messages"."origin" in ('modell', 'fest', 'rueckmeldung', 'vorschlag'));--> statement-breakpoint
ALTER TABLE "public"."runs" ADD CONSTRAINT "runs_auftrag_id_format" CHECK ("public"."runs"."auftrag_id" is null or "public"."runs"."auftrag_id" ~ '^auf_[0-7][0-9a-hjkmnp-tv-z]{25}$');--> statement-breakpoint
ALTER TABLE "public"."runs" ADD CONSTRAINT "runs_auftrag_root_id_format" CHECK ("public"."runs"."auftrag_root_id" is null or "public"."runs"."auftrag_root_id" ~ '^auf_[0-7][0-9a-hjkmnp-tv-z]{25}$');--> statement-breakpoint
ALTER TABLE "public"."runs" ADD CONSTRAINT "runs_auftrag_mit_wurzel" CHECK (("public"."runs"."auftrag_id" is null) = ("public"."runs"."auftrag_root_id" is null));--> statement-breakpoint
ALTER TABLE "public"."runs" ADD CONSTRAINT "runs_auftrag_mit_kennzeichen" CHECK ("public"."runs"."auftrag_id" is null or "public"."runs"."untrusted_input" is not null);--> statement-breakpoint
ALTER TABLE "public"."runs" ADD CONSTRAINT "runs_finish_reason_format" CHECK ("public"."runs"."finish_reason" is null or "public"."runs"."finish_reason" ~ '^[a-z][a-z-]{0,31}$');
--> statement-breakpoint
-- Von Hand ergänzt: Trigger.
--
-- Aufträge: beginnen als `gefragt`, mit den Zählern bei 0, bei abgeschaltetem Not-Aus und mit der
-- aktuellen Not-Aus-Epoche. Jeder Auftrag gehört zu einer Entscheidung des Tors: die Wurzel zu
-- deiner Nachricht (`nachricht.senden`, erlaubt, in derselben Unterhaltung); ein Auftrag eines
-- Bots zu seiner erlaubten Übergabe an genau diesen Empfänger (`auftrag.uebergeben`); ein Auftrag
-- von dir unter einer Wurzel zu deiner Nachricht in derselben Unterhaltung oder zu deinem
-- Zurückgeben an genau diesen Empfänger (`auftrag.zurueckgeben`). Die Arten des Servers tragen die
-- Entscheidung, die den Zweig geöffnet hat: `rueckkehr` nur, wenn das Kind dieser Entscheidung zu
-- Ende ist; `sammeln` nur, wenn kein Fächer-Kind mehr offen ist; `rueckmeldung` nur in den Chat mit
-- Pai, wenn der Team-Auftrag zu Ende ist; alle drei an den Bot des Eltern-Auftrags. Ein Kind hängt
-- an einem offenen Eltern-Auftrag derselben Wurzel und Epoche und erbt „belastet“.
-- Danach fest: alles außer Stand, Zählern, „belastet“, Grund und Zeiten. Die Zähler werden nie
-- kleiner, „belastet“ nie wieder falsch. Der Stand wechselt nur auf diesen Wegen:
--   gefragt → arbeitet | abgelehnt | abgebrochen | gescheitert
--   arbeitet → wartet_auf_dich | fertig | gescheitert | abgebrochen
--   wartet_auf_dich → arbeitet | fertig | gescheitert | abgebrochen
--   fertig → arbeitet (nur die Wurzel: du gibst das Ergebnis zurück)
-- „arbeitet“ nur mit einem aktiven Lauf dieses Auftrags; Grund und Ende nur mit dem Wechsel.
CREATE FUNCTION paibot_auftraege_regeln() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  einstellung record;
  eltern record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'gefragt' OR NEW.rueckfragen <> 0 OR NEW.bitten <> 0 THEN
      RAISE EXCEPTION 'Ein Auftrag beginnt immer als gefragt, ohne Rückfragen und Bitten.'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT s.kill_switch, s.notaus_epoche INTO einstellung
      FROM public.settings s WHERE s.id = 'singleton';
    IF NOT FOUND OR einstellung.kill_switch THEN
      RAISE EXCEPTION 'Ohne Einstellungen oder bei eingeschaltetem Not-Aus entsteht kein Auftrag.'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.notaus_epoche IS DISTINCT FROM einstellung.notaus_epoche THEN
      RAISE EXCEPTION 'Der Auftrag trägt nicht die aktuelle Not-Aus-Epoche.'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.art = 'wurzel' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.belege b
        WHERE b.action_id = NEW.action_id AND b.entry_type = 'decision'
          AND b.action = 'nachricht.senden' AND b.actor = 'besitzer'
          AND b.body -> 'decision' ->> 'outcome' = 'allow'
          AND b.body -> 'action' -> 'target' ->> 'conversationId' = NEW.conversation_id) THEN
        RAISE EXCEPTION 'Zu dieser Wurzel gibt es keine erlaubte Nachricht des Besitzers.'
          USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN NEW;
    END IF;
    SELECT a.root_id, a.bot_id, a.status, a.notaus_epoche, a.belastet INTO eltern
      FROM public.auftraege a WHERE a.id = NEW.parent_auftrag_id;
    IF NOT FOUND OR eltern.status NOT IN ('gefragt', 'arbeitet', 'wartet_auf_dich') THEN
      RAISE EXCEPTION 'Ein Auftrag hängt nur an einem offenen Eltern-Auftrag.'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.root_id IS DISTINCT FROM eltern.root_id
      OR NEW.notaus_epoche IS DISTINCT FROM eltern.notaus_epoche THEN
      RAISE EXCEPTION 'Ein Auftrag gehört zur Wurzel und Not-Aus-Epoche seines Eltern-Auftrags.'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF eltern.belastet THEN
      NEW.belastet := true;
    END IF;
    IF NEW.art IN ('rueckkehr', 'sammeln', 'rueckmeldung') THEN
      IF NEW.bot_id IS DISTINCT FROM eltern.bot_id THEN
        RAISE EXCEPTION 'Rückkehr, Sammeln und Rückmeldung gehen an den Bot des Eltern-Auftrags.'
          USING ERRCODE = 'restrict_violation';
      END IF;
      IF NEW.art = 'rueckkehr' AND NOT EXISTS (
        SELECT 1 FROM public.auftraege k
        WHERE k.parent_auftrag_id = NEW.parent_auftrag_id AND k.action_id = NEW.action_id
          AND k.art IN ('uebergabe', 'bitte', 'rueckgabe')
          AND k.status IN ('fertig', 'gescheitert', 'abgelehnt', 'abgebrochen')) THEN
        RAISE EXCEPTION 'Eine Rückkehr gibt es nur nach dem Ende des Kind-Auftrags dieser Entscheidung.'
          USING ERRCODE = 'restrict_violation';
      END IF;
      IF NEW.art = 'sammeln' AND (
        NOT EXISTS (
          SELECT 1 FROM public.auftraege k
          WHERE k.parent_auftrag_id = NEW.parent_auftrag_id AND k.action_id = NEW.action_id
            AND k.art = 'faecher')
        OR EXISTS (
          SELECT 1 FROM public.auftraege k
          WHERE k.parent_auftrag_id = NEW.parent_auftrag_id AND k.art = 'faecher'
            AND k.status IN ('gefragt', 'arbeitet', 'wartet_auf_dich'))) THEN
        RAISE EXCEPTION 'Gesammelt wird nur nach einem Fächer, dessen Aufträge alle zu Ende sind.'
          USING ERRCODE = 'restrict_violation';
      END IF;
      IF NEW.art = 'rueckmeldung' AND (
        NOT EXISTS (
          SELECT 1 FROM public.auftraege k
          WHERE k.parent_auftrag_id = NEW.parent_auftrag_id AND k.action_id = NEW.action_id
            AND k.art = 'uebergabe'
            AND k.status IN ('fertig', 'gescheitert', 'abgelehnt', 'abgebrochen'))
        OR NOT EXISTS (
          SELECT 1 FROM public.conversations c
          WHERE c.id = NEW.conversation_id AND c.kind = 'direkt')) THEN
        RAISE EXCEPTION 'Eine Rückmeldung gibt es nur im Chat mit Pai nach dem Ende des Team-Auftrags.'
          USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.geber = 'besitzer' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.belege b
        WHERE b.action_id = NEW.action_id AND b.entry_type = 'decision' AND b.actor = 'besitzer'
          AND b.body -> 'decision' ->> 'outcome' = 'allow'
          AND ((b.action = 'nachricht.senden'
                AND b.body -> 'action' -> 'target' ->> 'conversationId' = NEW.conversation_id)
            OR (b.action = 'auftrag.zurueckgeben'
                AND b.body -> 'action' -> 'target' ->> 'toBotId' = NEW.bot_id))) THEN
        RAISE EXCEPTION 'Zu diesem Auftrag gibt es keine passende erlaubte Entscheidung des Besitzers.'
          USING ERRCODE = 'restrict_violation';
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.belege b
      WHERE b.action_id = NEW.action_id AND b.entry_type = 'decision'
        AND b.action = 'auftrag.uebergeben' AND b.actor = NEW.geber
        AND b.body -> 'decision' ->> 'outcome' = 'allow'
        AND b.body -> 'action' -> 'target' ->> 'toBotId' = NEW.bot_id) THEN
      RAISE EXCEPTION 'Zu diesem Auftrag gibt es keine erlaubte Übergabe an diesen Empfänger.'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.art IS DISTINCT FROM OLD.art
    OR NEW.parent_auftrag_id IS DISTINCT FROM OLD.parent_auftrag_id
    OR NEW.root_id IS DISTINCT FROM OLD.root_id
    OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.bot_id IS DISTINCT FROM OLD.bot_id
    OR NEW.geber IS DISTINCT FROM OLD.geber
    OR NEW.zettel IS DISTINCT FROM OLD.zettel
    OR NEW.fertig_wenn IS DISTINCT FROM OLD.fertig_wenn
    OR NEW.action_id IS DISTINCT FROM OLD.action_id
    OR NEW.notaus_epoche IS DISTINCT FROM OLD.notaus_epoche
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Art, Zettel, Entscheidung, Baum, Unterhaltung, Empfänger, Geber und Epoche eines Auftrags sind unveränderlich.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.belastet AND NOT NEW.belastet THEN
    RAISE EXCEPTION 'Das Kennzeichen „belastet“ eines Auftrags lässt sich nicht zurücknehmen.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.rueckfragen < OLD.rueckfragen OR NEW.bitten < OLD.bitten THEN
    RAISE EXCEPTION 'Die Zähler eines Auftrags werden nie kleiner.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.status = OLD.status THEN
    IF NEW.end_grund IS DISTINCT FROM OLD.end_grund
      OR NEW.finished_at IS DISTINCT FROM OLD.finished_at THEN
      RAISE EXCEPTION 'Grund und Ende eines Auftrags ändern sich nur mit seinem Stand.'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT ((OLD.status = 'gefragt' AND NEW.status IN ('arbeitet', 'abgelehnt', 'abgebrochen', 'gescheitert'))
       OR (OLD.status = 'arbeitet' AND NEW.status IN ('wartet_auf_dich', 'fertig', 'gescheitert', 'abgebrochen'))
       OR (OLD.status = 'wartet_auf_dich' AND NEW.status IN ('arbeitet', 'fertig', 'gescheitert', 'abgebrochen'))
       OR (OLD.status = 'fertig' AND NEW.status = 'arbeitet' AND OLD.art = 'wurzel')) THEN
    RAISE EXCEPTION 'Dieser Wechsel des Stands eines Auftrags ist nicht erlaubt.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.status = 'arbeitet' AND NOT EXISTS (
    SELECT 1 FROM public.runs r
    WHERE r.auftrag_id = NEW.id AND r.status IN ('queued', 'running')) THEN
    RAISE EXCEPTION 'Ein Auftrag arbeitet nur mit einem aktiven Lauf.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER auftraege_regeln
BEFORE INSERT OR UPDATE ON "auftraege"
FOR EACH ROW EXECUTE FUNCTION paibot_auftraege_regeln();
--> statement-breakpoint
-- Anlegen und jeder Wechsel des Stands eines Auftrags stehen als Ereignis in `auftrag_ereignisse`
-- (ohne Zettel und ohne Texte).
CREATE FUNCTION paibot_auftraege_ereignisse() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.auftrag_ereignisse (auftrag_id, type, payload)
    VALUES (NEW.id, 'auftrag.created', jsonb_build_object(
      'art', NEW.art, 'status', NEW.status, 'botId', NEW.bot_id, 'rootId', NEW.root_id,
      'parentId', NEW.parent_auftrag_id, 'actionId', NEW.action_id,
      'notausEpoche', NEW.notaus_epoche, 'belastet', NEW.belastet));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.auftrag_ereignisse (auftrag_id, type, payload)
    VALUES (NEW.id, 'auftrag.status', jsonb_build_object(
      'von', OLD.status, 'nach', NEW.status, 'grund', NEW.end_grund));
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER auftraege_ereignisse
AFTER INSERT OR UPDATE ON "auftraege"
FOR EACH ROW EXECUTE FUNCTION paibot_auftraege_ereignisse();
--> statement-breakpoint
-- Nur anhängen: Ereignisse und Zuschläge eines Auftrags lassen sich weder ändern noch leeren, auch
-- nicht vom Besitzer der Tabelle. Gelöscht werden sie nur zusammen mit ihrem Auftrag (der mit
-- seiner Unterhaltung geht).
CREATE FUNCTION paibot_auftrag_nur_anhaengen() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Ein Löschen ist nur erlaubt, wenn der Auftrag schon weg ist (Kaskade aus `auftraege`).
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'auftrag_ereignisse' THEN
      IF NOT EXISTS (SELECT 1 FROM public.auftraege a WHERE a.id = to_jsonb(OLD) ->> 'auftrag_id') THEN
        RETURN OLD;
      END IF;
    ELSIF NOT EXISTS (
        SELECT 1 FROM public.auftraege a WHERE a.id = to_jsonb(OLD) ->> 'auftrag_root_id') THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION '% ist nur zum Anhängen: % ist nicht erlaubt (gelöscht wird nur mit dem Auftrag).', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER auftrag_ereignisse_nur_anhaengen
BEFORE UPDATE OR DELETE ON "auftrag_ereignisse"
FOR EACH ROW EXECUTE FUNCTION paibot_auftrag_nur_anhaengen();
--> statement-breakpoint
CREATE TRIGGER auftrag_ereignisse_kein_truncate
BEFORE TRUNCATE ON "auftrag_ereignisse"
FOR EACH STATEMENT EXECUTE FUNCTION paibot_auftrag_nur_anhaengen();
--> statement-breakpoint
CREATE TRIGGER auftrag_zuschlaege_nur_anhaengen
BEFORE UPDATE OR DELETE ON "auftrag_zuschlaege"
FOR EACH ROW EXECUTE FUNCTION paibot_auftrag_nur_anhaengen();
--> statement-breakpoint
CREATE TRIGGER auftrag_zuschlaege_kein_truncate
BEFORE TRUNCATE ON "auftrag_zuschlaege"
FOR EACH STATEMENT EXECUTE FUNCTION paibot_auftrag_nur_anhaengen();
--> statement-breakpoint
-- Zuschläge: nur für die Wurzel eines offenen Baums, nur mit deiner erlaubten Entscheidung
-- `auftrag.budget_erhoehen` für diesen Baum. Die Nummer vergibt der Trigger (1 bis 5, eindeutig je
-- Wurzel); ein sechster Zuschlag scheitert an der Prüfregel `auftrag_zuschlaege_nr_bereich`.
CREATE FUNCTION paibot_auftrag_zuschlaege_regeln() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.auftraege a
    WHERE a.id = NEW.auftrag_root_id AND a.art = 'wurzel'
      AND a.status IN ('gefragt', 'arbeitet', 'wartet_auf_dich')) THEN
    RAISE EXCEPTION 'Einen Zuschlag gibt es nur für die Wurzel eines offenen Auftragsbaums.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.belege b
    WHERE b.action_id = NEW.action_id AND b.entry_type = 'decision'
      AND b.action = 'auftrag.budget_erhoehen' AND b.actor = 'besitzer'
      AND b.body -> 'decision' ->> 'outcome' = 'allow'
      AND b.body -> 'action' -> 'target' ->> 'auftragId' = NEW.auftrag_root_id) THEN
    RAISE EXCEPTION 'Zu diesem Zuschlag gibt es keine erlaubte Entscheidung des Besitzers.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  NEW.nr := (SELECT coalesce(max(z.nr), 0) + 1 FROM public.auftrag_zuschlaege z
             WHERE z.auftrag_root_id = NEW.auftrag_root_id);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER auftrag_zuschlaege_regeln
BEFORE INSERT ON "auftrag_zuschlaege"
FOR EACH ROW EXECUTE FUNCTION paibot_auftrag_zuschlaege_regeln();
--> statement-breakpoint
-- Kopf eines Fadens: Ziel, Abnahme, Herkunft und Entscheidung bleiben; „belastet“ wird nie wieder
-- falsch.
CREATE FUNCTION paibot_faeden_regeln() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.ziel IS DISTINCT FROM OLD.ziel
    OR NEW.abnahme IS DISTINCT FROM OLD.abnahme
    OR NEW.herkunft IS DISTINCT FROM OLD.herkunft
    OR NEW.action_id IS DISTINCT FROM OLD.action_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Ziel, Abnahme, Herkunft und Entscheidung eines Fadens sind unveränderlich.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.belastet AND NOT NEW.belastet THEN
    RAISE EXCEPTION 'Das Kennzeichen „belastet“ eines Fadens lässt sich nicht zurücknehmen.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER faeden_regeln
BEFORE UPDATE ON "faeden"
FOR EACH ROW EXECUTE FUNCTION paibot_faeden_regeln();
--> statement-breakpoint
-- Nachrichten (ersetzt die Funktion aus 0014 und 0016): Schritt, Herkunft, Rolle, Lauf,
-- Unterhaltung, Autor, Auftrag und Bezug bleiben nach dem Anlegen gleich; „fremder Inhalt“ wird
-- nie zurückgenommen; nach dem Abschluss (Zustand nicht mehr `streaming`) bleiben Inhalt und
-- Zustand gleich.
CREATE OR REPLACE FUNCTION paibot_messages_unveraenderlich() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.step IS DISTINCT FROM OLD.step
    OR NEW.origin IS DISTINCT FROM OLD.origin
    OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW.run_id IS DISTINCT FROM OLD.run_id
    OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.bot_id IS DISTINCT FROM OLD.bot_id
    OR NEW.auftrag_id IS DISTINCT FROM OLD.auftrag_id
    OR NEW.frage_bezug IS DISTINCT FROM OLD.frage_bezug THEN
    RAISE EXCEPTION 'Schritt, Herkunft, Rolle, Lauf, Unterhaltung, Autor, Auftrag und Bezug einer Nachricht sind nach dem Anlegen unveränderlich.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.untrusted AND NOT NEW.untrusted THEN
    RAISE EXCEPTION 'Das Kennzeichen „fremder Inhalt“ lässt sich nicht zurücknehmen.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status <> 'streaming'
    AND (NEW.content IS DISTINCT FROM OLD.content OR NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE EXCEPTION 'Inhalt und Zustand einer abgeschlossenen Nachricht sind unveränderlich.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Neue Nachrichten: Eine Antwort in einem Faden nennt ihren Autor; der Autor einer Antwort ist der
-- Bot ihres Laufs; ein Auftrag gehört zur selben Unterhaltung; der Bezug zeigt auf eine Antwort
-- eines Bots in derselben Unterhaltung.
CREATE FUNCTION paibot_messages_bezuege() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.role = 'assistant' AND NEW.bot_id IS NULL AND EXISTS (
    SELECT 1 FROM public.conversations c WHERE c.id = NEW.conversation_id AND c.kind = 'faden') THEN
    RAISE EXCEPTION 'Eine Antwort in einem Faden nennt ihren Autor.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.bot_id IS NOT NULL AND NEW.run_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.runs r WHERE r.id = NEW.run_id AND r.bot_id = NEW.bot_id) THEN
    RAISE EXCEPTION 'Der Autor einer Antwort ist der Bot ihres Laufs.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.auftrag_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.auftraege a
    WHERE a.id = NEW.auftrag_id AND a.conversation_id = NEW.conversation_id) THEN
    RAISE EXCEPTION 'Der Auftrag einer Nachricht gehört zu ihrer Unterhaltung.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.frage_bezug IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = NEW.frage_bezug AND m.conversation_id = NEW.conversation_id
      AND m.role = 'assistant') THEN
    RAISE EXCEPTION 'Der Bezug zeigt auf eine Antwort eines Bots in derselben Unterhaltung.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER messages_bezuege
BEFORE INSERT ON "messages"
FOR EACH ROW EXECUTE FUNCTION paibot_messages_bezuege();
--> statement-breakpoint
-- Steht in einem Faden eine Nachricht mit fremdem Inhalt, gilt der ganze Faden als belastet.
CREATE FUNCTION paibot_messages_faden_belasten() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.untrusted THEN
    UPDATE public.faeden f SET belastet = true
    WHERE f.conversation_id = NEW.conversation_id AND NOT f.belastet;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER messages_faden_belasten
AFTER INSERT OR UPDATE OF untrusted ON "messages"
FOR EACH ROW EXECUTE FUNCTION paibot_messages_faden_belasten();
--> statement-breakpoint
-- Bestand: Fäden, in denen schon vor diesem Update fremder Inhalt steht, gelten sofort als
-- belastet (der Trigger oben sieht nur neue Schreibvorgänge). Nachrichten bleiben unverändert.
UPDATE "faeden" f SET "belastet" = true
WHERE NOT f."belastet" AND EXISTS (
  SELECT 1 FROM "messages" m WHERE m."conversation_id" = f."conversation_id" AND m."untrusted");
--> statement-breakpoint
-- Läufe mit Auftrag (eigene Funktion neben `paibot_runs_regeln`): Auftrag, Wurzel und Kennzeichen
-- bleiben nach dem Anlegen gleich; der Abschluss-Grund wird einmal gesetzt. Ein Lauf passt zu
-- seinem Auftrag (Wurzel, Unterhaltung, Bot), der Auftrag ist offen (oder eine fertige Wurzel, die
-- du zurückgibst: Sie wechselt danach von `fertig` nach `arbeitet`), und angelegt oder gestartet
-- wird er nur bei abgeschaltetem Not-Aus in der Epoche, in der der Auftrag entstand.
CREATE FUNCTION paibot_runs_auftrag() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  auftrag record;
  einstellung record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.auftrag_id IS DISTINCT FROM OLD.auftrag_id
      OR NEW.auftrag_root_id IS DISTINCT FROM OLD.auftrag_root_id
      OR NEW.untrusted_input IS DISTINCT FROM OLD.untrusted_input THEN
      RAISE EXCEPTION 'Auftrag, Wurzel und Kennzeichen eines Laufs sind nach dem Anlegen unveränderlich.'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.finish_reason IS NOT NULL AND NEW.finish_reason IS DISTINCT FROM OLD.finish_reason THEN
      RAISE EXCEPTION 'Der Abschluss-Grund eines Laufs wird nur einmal gesetzt.'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.auftrag_id IS NULL OR NEW.status <> 'running' OR OLD.status = 'running' THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.auftrag_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT a.art, a.root_id, a.conversation_id, a.bot_id, a.status, a.notaus_epoche INTO auftrag
    FROM public.auftraege a WHERE a.id = NEW.auftrag_id;
  IF NOT FOUND
    OR auftrag.root_id IS DISTINCT FROM NEW.auftrag_root_id
    OR auftrag.conversation_id IS DISTINCT FROM NEW.conversation_id
    OR auftrag.bot_id IS DISTINCT FROM NEW.bot_id THEN
    RAISE EXCEPTION 'Ein Lauf passt nur zu einem Auftrag derselben Wurzel, Unterhaltung und desselben Bots.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF auftrag.status NOT IN ('gefragt', 'arbeitet', 'wartet_auf_dich')
    AND NOT (auftrag.art = 'wurzel' AND auftrag.status = 'fertig') THEN
    RAISE EXCEPTION 'Ein Lauf arbeitet nur unter einem offenen Auftrag (oder einer fertigen Wurzel, die du zurückgibst).'
      USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT s.kill_switch, s.notaus_epoche INTO einstellung
    FROM public.settings s WHERE s.id = 'singleton';
  IF NOT FOUND OR einstellung.kill_switch
    OR einstellung.notaus_epoche IS DISTINCT FROM auftrag.notaus_epoche THEN
    RAISE EXCEPTION 'Nach dem Not-Aus startet kein Lauf eines vorher angelegten Auftrags.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER runs_auftrag
BEFORE INSERT OR UPDATE ON "runs"
FOR EACH ROW EXECUTE FUNCTION paibot_runs_auftrag();
--> statement-breakpoint
-- Not-Aus-Epoche: steigt genau um 1, wenn der Not-Aus eingeschaltet wird (fehlt die Erhöhung,
-- setzt sie der Trigger), und sonst nie; sie sinkt nie.
CREATE FUNCTION paibot_settings_epoche() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT OLD.kill_switch AND NEW.kill_switch THEN
    IF NEW.notaus_epoche = OLD.notaus_epoche THEN
      NEW.notaus_epoche := OLD.notaus_epoche + 1;
    ELSIF NEW.notaus_epoche <> OLD.notaus_epoche + 1 THEN
      RAISE EXCEPTION 'Die Not-Aus-Epoche steigt beim Einschalten des Not-Aus genau um 1.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  ELSIF NEW.notaus_epoche IS DISTINCT FROM OLD.notaus_epoche THEN
    RAISE EXCEPTION 'Die Not-Aus-Epoche ändert sich nur beim Einschalten des Not-Aus.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER settings_epoche
BEFORE UPDATE ON "settings"
FOR EACH ROW EXECUTE FUNCTION paibot_settings_epoche();
