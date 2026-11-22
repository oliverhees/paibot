-- PaiBot – Datenbank für Werkzeug-Aufrufe: neue Spalten an Werkzeug-Aufrufen, Nachrichten und
-- Einstellungen, Obergrenze der Ausgabe der Bots, gespeicherte Standard-Regel R-010, neue Arten von
-- Ereignissen und Trigger, die unveränderliche Felder schützen und jeden Weg in „wartet auf
-- Freigabe“ verschließen.
--
-- Autor:     Oliver Hees
-- Website:   https://paibot.de
-- Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
-- Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
-- Seit:      2026-11-21
--
-- Von Hand in die erzeugte Reihenfolge eingefügt (sonst unverändert):
-- 1. vor dem eindeutigen Index „eine End-Antwort je Lauf“: Abbruch mit Meldung bei doppelten
--    Antworten des Bots je Lauf (statt eines Fehlers des Index mitten in der Migration);
-- 2. vor der Obergrenze der Bots: höhere Ausgabegrenzen auf 200 000 setzen;
-- 3. danach: Startwert der Token-Grenze je Lauf aus der höchsten Ausgabegrenze.

ALTER TABLE "public"."conversation_events" DROP CONSTRAINT "conversation_events_type_werte";--> statement-breakpoint
DROP INDEX "public"."conversation_events_aufraeumen_idx";--> statement-breakpoint
ALTER TABLE "public"."settings" ADD COLUMN "max_steps_per_run" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."settings" ADD COLUMN "max_tool_calls_per_step" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."settings" ADD COLUMN "max_tool_calls_per_run" integer DEFAULT 16 NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."settings" ADD COLUMN "max_tokens_per_run" integer DEFAULT 60000 NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."settings" ADD COLUMN "tool_result_max_chars" integer DEFAULT 16000 NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."settings" ADD COLUMN "tool_results_max_chars_per_step" integer DEFAULT 24000 NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."messages" ADD COLUMN "step" integer;--> statement-breakpoint
ALTER TABLE "public"."messages" ADD COLUMN "origin" text DEFAULT 'modell' NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD COLUMN "tool_key" text;--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD COLUMN "tool_digest" text;--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD COLUMN "reach" text;--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD COLUMN "foreign_content" boolean;--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD COLUMN "step" integer;--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD COLUMN "untrusted_input" boolean;--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD COLUMN "raw_name" text;--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD COLUMN "output_truncated" boolean;--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD COLUMN "output_chars" integer;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "public"."messages"
    WHERE "role" = 'assistant' AND "run_id" IS NOT NULL
    GROUP BY "run_id" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Update angehalten: Ein Lauf hat mehr als eine Antwort des Bots. Bitte vor dem Update melden; die Datenbank ist unverändert.'
      USING ERRCODE = 'unique_violation';
  END IF;
END
$$;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_eine_antwort_je_lauf" ON "public"."messages" USING btree ("run_id") WHERE "public"."messages"."role" = 'assistant' and "public"."messages"."step" is null and "public"."messages"."run_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_ein_schritt" ON "public"."messages" USING btree ("run_id","step") WHERE "public"."messages"."step" is not null;--> statement-breakpoint
CREATE INDEX "conversation_events_aufraeumen_idx" ON "public"."conversation_events" USING btree ("created_at") WHERE "public"."conversation_events"."type" in ('text.delta', 'draft.delta');--> statement-breakpoint
UPDATE "public"."bots" SET "max_output_tokens" = 200000 WHERE "max_output_tokens" > 200000;--> statement-breakpoint
UPDATE "public"."settings" SET "max_tokens_per_run" = LEAST(500000, GREATEST(60000, COALESCE((SELECT MAX("max_output_tokens") FROM "public"."bots"), 0) + 30000));--> statement-breakpoint
ALTER TABLE "public"."bots" ADD CONSTRAINT "bots_max_output_tokens_hoechstens" CHECK ("public"."bots"."max_output_tokens" <= 200000);--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_max_steps_per_run_bereich" CHECK ("public"."settings"."max_steps_per_run" between 1 and 16);--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_max_tool_calls_per_step_bereich" CHECK ("public"."settings"."max_tool_calls_per_step" between 1 and 16);--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_max_tool_calls_per_run_bereich" CHECK ("public"."settings"."max_tool_calls_per_run" between 1 and 64);--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_max_tokens_per_run_bereich" CHECK ("public"."settings"."max_tokens_per_run" between 1000 and 500000);--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_tool_result_max_chars_bereich" CHECK ("public"."settings"."tool_result_max_chars" between 1000 and 24000);--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_tool_results_max_chars_per_step_bereich" CHECK ("public"."settings"."tool_results_max_chars_per_step" between 1000 and 24000);--> statement-breakpoint
ALTER TABLE "public"."settings" ADD CONSTRAINT "settings_werkzeug_zeichen_passen" CHECK ("public"."settings"."tool_result_max_chars" <= "public"."settings"."tool_results_max_chars_per_step");--> statement-breakpoint
ALTER TABLE "public"."conversation_events" ADD CONSTRAINT "conversation_events_type_werte" CHECK ("public"."conversation_events"."type" in ('message.created', 'run.queued', 'run.started', 'text.delta', 'message.completed', 'run.waiting', 'run.resumed', 'run.cancelled', 'run.failed', 'run.denied', 'tool.requested', 'tool.finished', 'schleuse.blockiert', 'beleg.created', 'tool.started', 'step.finished', 'draft.delta'));--> statement-breakpoint
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_step_nicht_negativ" CHECK ("public"."messages"."step" is null or "public"."messages"."step" >= 0);--> statement-breakpoint
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_origin_werte" CHECK ("public"."messages"."origin" in ('modell', 'fest'));--> statement-breakpoint
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_fest_nur_bot" CHECK ("public"."messages"."origin" <> 'fest' or "public"."messages"."role" = 'assistant');--> statement-breakpoint
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_schritt_nur_bot" CHECK ("public"."messages"."step" is null or ("public"."messages"."role" = 'assistant' and "public"."messages"."run_id" is not null));--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD CONSTRAINT "tool_calls_tool_key_format" CHECK ("public"."tool_calls"."tool_key" is null or (char_length("public"."tool_calls"."tool_key") <= 140 and "public"."tool_calls"."tool_key" ~ '^[a-z][a-z0-9]*(/[a-z0-9][a-z0-9_.-]{0,63}){1,2}$'));--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD CONSTRAINT "tool_calls_tool_digest_format" CHECK ("public"."tool_calls"."tool_digest" is null or "public"."tool_calls"."tool_digest" ~ '^sha256:[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD CONSTRAINT "tool_calls_reach_werte" CHECK ("public"."tool_calls"."reach" is null or "public"."tool_calls"."reach" in ('intern', 'nach_aussen'));--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD CONSTRAINT "tool_calls_step_nicht_negativ" CHECK ("public"."tool_calls"."step" is null or "public"."tool_calls"."step" >= 0);--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD CONSTRAINT "tool_calls_raw_name_laenge" CHECK ("public"."tool_calls"."raw_name" is null or char_length("public"."tool_calls"."raw_name") between 1 and 64);--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD CONSTRAINT "tool_calls_output_chars_nicht_negativ" CHECK ("public"."tool_calls"."output_chars" is null or "public"."tool_calls"."output_chars" >= 0);--> statement-breakpoint
-- Von Hand ergänzt: Regel, Trigger, Ereignisse.
INSERT INTO "rules" ("id", "version", "action", "effect", "stage", "conditions", "priority", "source", "enabled", "title", "reason")
VALUES
  (
    'R-010', 1, 'werkzeug.aufrufen', 'allow', 'execute',
    '[{"fact":"akteur","op":"eq","value":"bot"},{"fact":"botOfConversation","op":"eq","value":true},{"fact":"toolKey","op":"eq","value":"eingebaut/doku.nachschlagen"},{"fact":"toolSource","op":"eq","value":"eingebaut"},{"fact":"toolKind","op":"eq","value":"lesen"},{"fact":"toolReach","op":"eq","value":"intern"}]'::jsonb,
    90, 'standard', true,
    'Bot liest in der Doku seiner Version',
    'In der mitgelieferten Doku nachschlagen ändert nichts und geht nicht nach außen.'
  )
ON CONFLICT ("id", "version") DO NOTHING;
--> statement-breakpoint
-- Werkzeug-Aufrufe: beginnen als angefragt mit allen Pflicht-Angaben; Eingabe, Werkzeug und
-- Kennzeichen bleiben danach gleich; nur diese Wege: angefragt → läuft | abgelehnt | abgebrochen,
-- läuft → erledigt | gescheitert | abgebrochen. Kein Weg nach „wartet auf Freigabe“ oder „freigegeben“.
CREATE FUNCTION paibot_tool_calls_regeln() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'requested' THEN
      RAISE EXCEPTION 'Ein Werkzeug-Aufruf beginnt immer als angefragt.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.tool_key IS NULL OR NEW.tool_digest IS NULL OR NEW.reach IS NULL
      OR NEW.foreign_content IS NULL OR NEW.step IS NULL OR NEW.untrusted_input IS NULL THEN
      RAISE EXCEPTION 'Ein Werkzeug-Aufruf braucht Kennung, Abdruck, Wirkung, Herkunft, Schritt und Kennzeichen.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.input IS DISTINCT FROM OLD.input
    OR NEW.args_digest IS DISTINCT FROM OLD.args_digest
    OR NEW.name IS DISTINCT FROM OLD.name
    OR NEW.raw_name IS DISTINCT FROM OLD.raw_name
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.server IS DISTINCT FROM OLD.server
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.tool_key IS DISTINCT FROM OLD.tool_key
    OR NEW.tool_digest IS DISTINCT FROM OLD.tool_digest
    OR NEW.reach IS DISTINCT FROM OLD.reach
    OR NEW.foreign_content IS DISTINCT FROM OLD.foreign_content
    OR NEW.step IS DISTINCT FROM OLD.step
    OR NEW.untrusted_input IS DISTINCT FROM OLD.untrusted_input THEN
    RAISE EXCEPTION 'Diese Angaben eines Werkzeug-Aufrufs sind nach dem Anlegen unveränderlich.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT ((OLD.status = 'requested' AND NEW.status IN ('running', 'denied', 'cancelled'))
       OR (OLD.status = 'running' AND NEW.status IN ('succeeded', 'failed', 'cancelled'))) THEN
    RAISE EXCEPTION 'Dieser Zustandswechsel eines Werkzeug-Aufrufs ist nicht erlaubt.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER tool_calls_regeln
BEFORE INSERT OR UPDATE ON "tool_calls"
FOR EACH ROW EXECUTE FUNCTION paibot_tool_calls_regeln();
--> statement-breakpoint
-- Nachrichten: Schritt, Herkunft, Rolle, Lauf und Unterhaltung bleiben nach dem Anlegen gleich.
CREATE FUNCTION paibot_messages_unveraenderlich() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.step IS DISTINCT FROM OLD.step
    OR NEW.origin IS DISTINCT FROM OLD.origin
    OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW.run_id IS DISTINCT FROM OLD.run_id
    OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
    RAISE EXCEPTION 'Schritt, Herkunft, Rolle, Lauf und Unterhaltung einer Nachricht sind nach dem Anlegen unveränderlich.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER messages_unveraenderlich
BEFORE UPDATE ON "messages"
FOR EACH ROW EXECUTE FUNCTION paibot_messages_unveraenderlich();
--> statement-breakpoint
-- Läufe: in dieser Fassung kommt kein Lauf in den Zustand „wartet auf Freigabe“ (weder beim
-- Anlegen noch durch einen Wechsel). Alles andere bleibt wie bisher.
CREATE FUNCTION paibot_runs_regeln() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'waiting_approval'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'waiting_approval') THEN
    RAISE EXCEPTION 'In dieser Fassung wartet kein Lauf auf eine Freigabe.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER runs_regeln
BEFORE INSERT OR UPDATE ON "runs"
FOR EACH ROW EXECUTE FUNCTION paibot_runs_regeln();
--> statement-breakpoint
-- Ereignisse: gelöscht werden nur text.delta und draft.delta (vorläufiger Text eines Schritts)
-- oder alles zusammen mit der Unterhaltung.
CREATE OR REPLACE FUNCTION paibot_ereignisse_nur_anhaengen() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Ereignisse sind unveränderlich: UPDATE ist nicht erlaubt.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.type IN ('text.delta', 'draft.delta')
    OR NOT EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = OLD.conversation_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Ereignisse dürfen nur zusammen mit ihrer Unterhaltung gelöscht werden (Ausnahme: text.delta und draft.delta).'
    USING ERRCODE = 'restrict_violation';
END;
$$;
