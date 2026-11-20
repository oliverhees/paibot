CREATE TABLE "tool_calls" (
	"action_id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"run_id" text NOT NULL,
	"message_id" text NOT NULL,
	"position" integer NOT NULL,
	"call_id" text NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"server" text,
	"kind" text NOT NULL,
	"input" jsonb NOT NULL,
	"args_digest" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"decision_receipt_id" text,
	"result_receipt_id" text,
	"result_status" text,
	"output" jsonb,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "tool_calls_stelle_eindeutig" UNIQUE("message_id","position"),
	CONSTRAINT "tool_calls_call_id_eindeutig" UNIQUE("message_id","call_id"),
	CONSTRAINT "tool_calls_decision_receipt_id_eindeutig" UNIQUE("decision_receipt_id"),
	CONSTRAINT "tool_calls_result_receipt_id_eindeutig" UNIQUE("result_receipt_id"),
	CONSTRAINT "tool_calls_action_id_format" CHECK ("tool_calls"."action_id" ~ '^akt_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "tool_calls_position_nicht_negativ" CHECK ("tool_calls"."position" >= 0),
	CONSTRAINT "tool_calls_call_id_laenge" CHECK (char_length("tool_calls"."call_id") between 1 and 200),
	CONSTRAINT "tool_calls_name_format" CHECK ("tool_calls"."name" ~ '^[A-Za-z0-9_-]{1,64}$'),
	CONSTRAINT "tool_calls_source_werte" CHECK ("tool_calls"."source" in ('eingebaut', 'mcp')),
	CONSTRAINT "tool_calls_server_nur_bei_mcp" CHECK (("tool_calls"."server" is null) = ("tool_calls"."source" <> 'mcp') and ("tool_calls"."server" is null or "tool_calls"."server" ~ '^[a-z0-9][a-z0-9_-]{0,63}$')),
	CONSTRAINT "tool_calls_kind_werte" CHECK ("tool_calls"."kind" in ('lesen', 'schreiben')),
	CONSTRAINT "tool_calls_args_digest_format" CHECK ("tool_calls"."args_digest" ~ '^hmac-sha256:[0-9a-f]{64}$'),
	CONSTRAINT "tool_calls_status_werte" CHECK ("tool_calls"."status" in ('requested', 'waiting_approval', 'approved', 'running', 'succeeded', 'failed', 'denied', 'cancelled')),
	CONSTRAINT "tool_calls_decision_receipt_id_format" CHECK ("tool_calls"."decision_receipt_id" is null or "tool_calls"."decision_receipt_id" ~ '^blg_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "tool_calls_result_receipt_id_format" CHECK ("tool_calls"."result_receipt_id" is null or "tool_calls"."result_receipt_id" ~ '^blg_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "tool_calls_entscheidung_nach_dem_tor" CHECK ("tool_calls"."status" = 'requested' or "tool_calls"."status" = 'cancelled' or "tool_calls"."decision_receipt_id" is not null),
	CONSTRAINT "tool_calls_result_status_werte" CHECK ("tool_calls"."result_status" is null or "tool_calls"."result_status" in ('ok', 'error', 'denied')),
	CONSTRAINT "tool_calls_ergebnis_nur_wenn_erledigt" CHECK (("tool_calls"."result_status" is not null) = ("tool_calls"."status" in ('succeeded', 'failed', 'denied', 'cancelled')) and ("tool_calls"."finished_at" is not null) = ("tool_calls"."status" in ('succeeded', 'failed', 'denied', 'cancelled'))),
	CONSTRAINT "tool_calls_error_code_format" CHECK ("tool_calls"."error_code" is null or "tool_calls"."error_code" ~ '^[a-z]+(_[a-z]+)*$')
);
--> statement-breakpoint
ALTER TABLE "providers" DROP CONSTRAINT "providers_api_key_format";--> statement-breakpoint
ALTER TABLE "belege" DROP CONSTRAINT "belege_action_werte";--> statement-breakpoint
ALTER TABLE "installation_keys" DROP CONSTRAINT "installation_keys_private_key_format";--> statement-breakpoint
ALTER TABLE "rules" DROP CONSTRAINT "rules_action_werte";--> statement-breakpoint
ALTER TABLE "conversation_events" DROP CONSTRAINT "conversation_events_type_werte";--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "template_key" text DEFAULT 'eigener' NOT NULL;--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "seq" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "rules_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_decision_receipt_id_belege_id_fk" FOREIGN KEY ("decision_receipt_id") REFERENCES "public"."belege"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_result_receipt_id_belege_id_fk" FOREIGN KEY ("result_receipt_id") REFERENCES "public"."belege"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tool_calls_run_id_idx" ON "tool_calls" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "tool_calls_wartend_idx" ON "tool_calls" USING btree ("conversation_id") WHERE "tool_calls"."status" = 'waiting_approval';--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_seq_eindeutig" UNIQUE("seq");--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_template_key_werte" CHECK ("providers"."template_key" in ('eurouter', 'eigener'));--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_api_key_format" CHECK ("providers"."api_key_enc" is null or "providers"."api_key_enc" ~ '^(v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+|v2:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+)$');--> statement-breakpoint
ALTER TABLE "belege" ADD CONSTRAINT "belege_spalten_aus_koerper" CHECK ("belege"."body"->'seq' = to_jsonb("belege"."seq") and "belege"."action_id" is not distinct from "belege"."body"->'action'->>'actionId' and "belege"."action" is not distinct from "belege"."body"->'action'->>'type' and "belege"."actor" is not distinct from "belege"."body"->'action'->>'actor' and "belege"."conversation_id" is not distinct from "belege"."body"->'action'->'target'->>'conversationId');--> statement-breakpoint
ALTER TABLE "belege" ADD CONSTRAINT "belege_action_werte" CHECK ("belege"."action" is null or "belege"."action" in ('einrichtung.abschliessen', 'zugang.anmelden', 'zugang.abmelden', 'zugang.alle_abmelden', 'zugang.passwort_aendern', 'anbieter.speichern', 'anbieter.loeschen', 'modell.waehlen', 'bot.aendern', 'schleuse.umschalten', 'einstellung.aendern', 'unterhaltung.anlegen', 'unterhaltung.umbenennen', 'unterhaltung.loeschen', 'nachricht.senden', 'modell.anfragen', 'lauf.abbrechen', 'belege.exportieren', 'werkzeug.aufrufen'));--> statement-breakpoint
ALTER TABLE "installation_keys" ADD CONSTRAINT "installation_keys_private_key_format" CHECK ("installation_keys"."private_key_enc" ~ '^(v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+|v2:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+)$');--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_action_werte" CHECK ("rules"."action" in ('*', 'einrichtung.abschliessen', 'zugang.anmelden', 'zugang.abmelden', 'zugang.alle_abmelden', 'zugang.passwort_aendern', 'anbieter.speichern', 'anbieter.loeschen', 'modell.waehlen', 'bot.aendern', 'schleuse.umschalten', 'einstellung.aendern', 'unterhaltung.anlegen', 'unterhaltung.umbenennen', 'unterhaltung.loeschen', 'nachricht.senden', 'modell.anfragen', 'lauf.abbrechen', 'belege.exportieren', 'werkzeug.aufrufen'));--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_type_werte" CHECK ("conversation_events"."type" in ('message.created', 'run.queued', 'run.started', 'text.delta', 'message.completed', 'run.waiting', 'run.resumed', 'run.cancelled', 'run.failed', 'run.denied', 'tool.requested', 'tool.finished', 'schleuse.blockiert', 'beleg.created'));--> statement-breakpoint
-- Vorlage der vorhandenen Anbieter: EUrouter an seiner Basis-URL, alles andere ist ein eigener Anbieter.
UPDATE "providers" SET "template_key" = 'eurouter' WHERE "base_url" = 'https://api.eurouter.ai/v1';
--> statement-breakpoint
-- Regeln sind unveränderlich: eine Änderung ist eine neue Fassung (neue Zeile).
CREATE FUNCTION paibot_regeln_unveraenderlich() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Regeln sind unveränderlich: % ist nicht erlaubt, eine Änderung ist eine neue Fassung.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER regeln_kein_update_delete
BEFORE UPDATE OR DELETE ON "rules"
FOR EACH ROW EXECUTE FUNCTION paibot_regeln_unveraenderlich();
--> statement-breakpoint
CREATE TRIGGER regeln_kein_truncate
BEFORE TRUNCATE ON "rules"
FOR EACH STATEMENT EXECUTE FUNCTION paibot_regeln_unveraenderlich();
--> statement-breakpoint
-- Schlüssel der Installation: nur anhängen; ändern darf sich allein retired_at, einmal von leer auf einen Wert.
CREATE FUNCTION paibot_schluessel_nur_anhaengen() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.retired_at IS NULL
    AND NEW.retired_at IS NOT NULL
    AND NEW.id = OLD.id
    AND NEW.purpose = OLD.purpose
    AND NEW.public_key = OLD.public_key
    AND NEW.private_key_enc = OLD.private_key_enc
    AND NEW.fingerprint = OLD.fingerprint
    AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Schlüssel der Installation sind unveränderlich: % ist nicht erlaubt (nur Ausmustern).', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER schluessel_nur_anhaengen
BEFORE UPDATE OR DELETE ON "installation_keys"
FOR EACH ROW EXECUTE FUNCTION paibot_schluessel_nur_anhaengen();
--> statement-breakpoint
CREATE TRIGGER schluessel_kein_truncate
BEFORE TRUNCATE ON "installation_keys"
FOR EACH STATEMENT EXECUTE FUNCTION paibot_schluessel_nur_anhaengen();
--> statement-breakpoint
-- Weitere Standard-Regeln: Nachweis je Aktion und Werkzeug-Aufrufe. Wiederholbar.
INSERT INTO "rules" ("id", "version", "action", "effect", "stage", "conditions", "priority", "source", "enabled", "title", "reason")
VALUES
  (
    'R-003', 1, 'einrichtung.abschliessen', 'allow', 'execute',
    '[{"fact":"akteur","op":"eq","value":"besitzer"},{"fact":"credential","op":"eq","value":"einrichtungs_code"}]'::jsonb,
    50, 'standard', true,
    'Einrichtung mit Einrichtungs-Code',
    'Der Einrichtungs-Code gilt nur, um die Einrichtung abzuschließen.'
  ),
  (
    'R-004', 1, 'zugang.anmelden', 'allow', 'execute',
    '[{"fact":"akteur","op":"eq","value":"besitzer"},{"fact":"credential","op":"eq","value":"passwort"}]'::jsonb,
    50, 'standard', true,
    'Anmelden mit Passwort',
    'Das Passwort gilt nur, um sich anzumelden.'
  ),
  (
    'R-005', 1, 'werkzeug.aufrufen', 'ask', 'ask',
    '[{"fact":"akteur","op":"eq","value":"bot"},{"fact":"botOfConversation","op":"eq","value":true}]'::jsonb,
    100, 'standard', true,
    'Bot fragt vor Werkzeugen',
    'Bevor der Bot ein Werkzeug benutzt, fragt PaiBot dich.'
  ),
  (
    'R-006', 1, '*', 'deny', 'execute',
    '[{"fact":"akteur","op":"eq","value":"besitzer"},{"fact":"credential","op":"ne","value":"sitzung"}]'::jsonb,
    60, 'standard', true,
    'Nachweis passt nicht zur Aktion',
    'Für diese Aktion gilt nur eine Anmeldung mit Sitzung.'
  )
ON CONFLICT ("id", "version") DO NOTHING;
