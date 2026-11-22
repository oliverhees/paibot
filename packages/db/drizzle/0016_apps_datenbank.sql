-- PaiBot – Datenbank für Apps: Tabellen für verbundene Apps, ihre Werkzeuge (nur anhängen) und den
-- Zugriff der Bots (nur anhängen), die Kennzeichnung „fremder Inhalt“ an Nachrichten, App-Angaben an
-- Werkzeug-Aufrufen, die vier Aktionen für Apps in den Werten der Regeln und Belege, die Standard-
-- Regel R-014 und die Trigger, die das alles schützen.
--
-- Autor:     Oliver Hees
-- Website:   https://paibot.de
-- Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
-- Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
-- Seit:      2026-11-22
--
-- Vom Werkzeug erzeugt; von Hand ergänzt ist der Teil nach dem letzten erzeugten Befehl (Regel,
-- Funktionen und Trigger). Kein Zurück auf eine ältere Version nach dieser Migration.

CREATE TABLE "public"."app_tools" (
	"tool_id" text NOT NULL,
	"version" integer NOT NULL,
	"app_id" text NOT NULL,
	"original_name" text NOT NULL,
	"model_name" text NOT NULL,
	"tool_key" text NOT NULL,
	"tool_digest" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"input_schema" jsonb NOT NULL,
	"hint_read_only" boolean,
	"hint_destructive" boolean,
	"status" text NOT NULL,
	"tool_class" text NOT NULL,
	"action_id" text,
	"seen_digest" text,
	"target_digest" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_tools_tool_id_version_pk" PRIMARY KEY("tool_id","version"),
	CONSTRAINT "app_tools_tool_id_format" CHECK ("public"."app_tools"."tool_id" ~ '^wzg_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "app_tools_version_positiv" CHECK ("public"."app_tools"."version" >= 1),
	CONSTRAINT "app_tools_original_name_laenge" CHECK (char_length("public"."app_tools"."original_name") between 1 and 256),
	CONSTRAINT "app_tools_model_name_format" CHECK ("public"."app_tools"."model_name" ~ '^[A-Za-z0-9_-]{1,64}$'),
	CONSTRAINT "app_tools_tool_key_format" CHECK (char_length("public"."app_tools"."tool_key") <= 140 and "public"."app_tools"."tool_key" ~ '^mcp(/[a-z0-9][a-z0-9_.-]{0,63}){2}$'),
	CONSTRAINT "app_tools_tool_digest_format" CHECK ("public"."app_tools"."tool_digest" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "app_tools_description_laenge" CHECK (char_length("public"."app_tools"."description") <= 2000),
	CONSTRAINT "app_tools_input_schema_objekt" CHECK (jsonb_typeof("public"."app_tools"."input_schema") = 'object'),
	CONSTRAINT "app_tools_status_werte" CHECK ("public"."app_tools"."status" in ('neu', 'bestaetigt', 'geaendert', 'entfernt', 'gesperrt')),
	CONSTRAINT "app_tools_tool_class_werte" CHECK ("public"."app_tools"."tool_class" in ('lesen', 'schreiben', 'gesperrt')),
	CONSTRAINT "app_tools_einstufung_passt_zum_stand" CHECK (("public"."app_tools"."status" in ('neu', 'geaendert', 'entfernt') and "public"."app_tools"."tool_class" = 'schreiben') or ("public"."app_tools"."status" = 'bestaetigt' and "public"."app_tools"."tool_class" in ('lesen', 'schreiben')) or ("public"."app_tools"."status" = 'gesperrt' and "public"."app_tools"."tool_class" = 'gesperrt')),
	CONSTRAINT "app_tools_beweis_nur_bei_einstufung" CHECK (("public"."app_tools"."status" in ('bestaetigt', 'gesperrt')) = ("public"."app_tools"."action_id" is not null and "public"."app_tools"."seen_digest" is not null and "public"."app_tools"."target_digest" is not null) and ("public"."app_tools"."status" in ('bestaetigt', 'gesperrt') or ("public"."app_tools"."action_id" is null and "public"."app_tools"."seen_digest" is null and "public"."app_tools"."target_digest" is null))),
	CONSTRAINT "app_tools_action_id_format" CHECK ("public"."app_tools"."action_id" is null or "public"."app_tools"."action_id" ~ '^akt_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "app_tools_gesehener_abdruck_format" CHECK ("public"."app_tools"."seen_digest" is null or "public"."app_tools"."seen_digest" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "app_tools_ziel_abdruck_format" CHECK ("public"."app_tools"."target_digest" is null or "public"."app_tools"."target_digest" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "public"."apps" (
	"id" text PRIMARY KEY NOT NULL,
	"short_name" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"auth_kind" text NOT NULL,
	"token_enc" text,
	"state" text DEFAULT 'verbunden' NOT NULL,
	"connection_no" integer DEFAULT 1 NOT NULL,
	"server_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone,
	CONSTRAINT "apps_short_name_eindeutig" UNIQUE("short_name"),
	CONSTRAINT "apps_id_format" CHECK ("public"."apps"."id" ~ '^app_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "apps_short_name_format" CHECK ("public"."apps"."short_name" ~ '^[a-z0-9][a-z0-9_-]{0,63}$' and not ("public"."apps"."short_name" ~ '__')),
	CONSTRAINT "apps_name_laenge" CHECK (char_length("public"."apps"."name") between 1 and 100),
	CONSTRAINT "apps_url_format" CHECK (char_length("public"."apps"."url") <= 2000 and "public"."apps"."url" ~ '^[!-~]+$' and "public"."apps"."url" ~ '^https://[^/?#@\s"\\]+(/[^?#\s"\\]*)?$' and not ("public"."apps"."url" ~ '/$')),
	CONSTRAINT "apps_auth_kind_werte" CHECK ("public"."apps"."auth_kind" in ('keine', 'token')),
	CONSTRAINT "apps_state_werte" CHECK ("public"."apps"."state" in ('verbunden', 'getrennt')),
	CONSTRAINT "apps_token_format" CHECK ("public"."apps"."token_enc" is null or "public"."apps"."token_enc" ~ '^v2:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'),
	CONSTRAINT "apps_token_nur_mit_anmeldung" CHECK ("public"."apps"."token_enc" is null or ("public"."apps"."auth_kind" = 'token' and "public"."apps"."state" = 'verbunden')),
	CONSTRAINT "apps_token_bei_verbunden" CHECK ("public"."apps"."auth_kind" <> 'token' or "public"."apps"."state" <> 'verbunden' or "public"."apps"."token_enc" is not null),
	CONSTRAINT "apps_connection_no_positiv" CHECK ("public"."apps"."connection_no" >= 1),
	CONSTRAINT "apps_server_version_laenge" CHECK ("public"."apps"."server_version" is null or char_length("public"."apps"."server_version") between 1 and 100),
	CONSTRAINT "apps_getrennt_gesetzt" CHECK (("public"."apps"."state" = 'getrennt') = ("public"."apps"."disconnected_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "public"."bot_app_grants" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "public"."bot_app_grants_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"app_id" text NOT NULL,
	"bot_id" text NOT NULL,
	"access" text NOT NULL,
	"connection_no" integer NOT NULL,
	"action_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bot_app_grants_entscheidung_einmal" UNIQUE("action_id"),
	CONSTRAINT "bot_app_grants_bot_id_format" CHECK ("public"."bot_app_grants"."bot_id" ~ '^bot_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "bot_app_grants_action_id_format" CHECK ("public"."bot_app_grants"."action_id" ~ '^akt_[0-7][0-9a-hjkmnp-tv-z]{25}$'),
	CONSTRAINT "bot_app_grants_access_werte" CHECK ("public"."bot_app_grants"."access" in ('keiner', 'lesen')),
	CONSTRAINT "bot_app_grants_connection_no_positiv" CHECK ("public"."bot_app_grants"."connection_no" >= 1)
);
--> statement-breakpoint
ALTER TABLE "public"."belege" DROP CONSTRAINT "belege_action_werte";--> statement-breakpoint
ALTER TABLE "public"."rules" DROP CONSTRAINT "rules_action_werte";--> statement-breakpoint
ALTER TABLE "public"."messages" ADD COLUMN "untrusted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD COLUMN "app_id" text;--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD COLUMN "app_tool_id" text;--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD COLUMN "tool_version" integer;--> statement-breakpoint
ALTER TABLE "public"."app_tools" ADD CONSTRAINT "app_tools_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."bot_app_grants" ADD CONSTRAINT "bot_app_grants_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_tools_modell_name_eindeutig" ON "public"."app_tools" USING btree ("model_name") WHERE "public"."app_tools"."version" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX "app_tools_kennung_je_app_eindeutig" ON "public"."app_tools" USING btree ("app_id","tool_key") WHERE "public"."app_tools"."version" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX "app_tools_original_name_je_app_eindeutig" ON "public"."app_tools" USING btree ("app_id","original_name") WHERE "public"."app_tools"."version" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX "app_tools_entscheidung_einmal" ON "public"."app_tools" USING btree ("action_id") WHERE "public"."app_tools"."action_id" is not null;--> statement-breakpoint
CREATE INDEX "app_tools_app_idx" ON "public"."app_tools" USING btree ("app_id","tool_id","version");--> statement-breakpoint
CREATE INDEX "bot_app_grants_stand_idx" ON "public"."bot_app_grants" USING btree ("app_id","bot_id","seq");--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD CONSTRAINT "tool_calls_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."belege" ADD CONSTRAINT "belege_action_werte" CHECK ("public"."belege"."action" is null or "public"."belege"."action" in ('einrichtung.abschliessen', 'zugang.anmelden', 'zugang.abmelden', 'zugang.alle_abmelden', 'zugang.passwort_aendern', 'anbieter.speichern', 'anbieter.loeschen', 'modell.waehlen', 'bot.aendern', 'schleuse.umschalten', 'einstellung.aendern', 'unterhaltung.anlegen', 'unterhaltung.umbenennen', 'unterhaltung.loeschen', 'nachricht.senden', 'modell.anfragen', 'lauf.abbrechen', 'belege.exportieren', 'werkzeug.aufrufen', 'geraet.hinzufuegen', 'geraet.entfernen', 'geraet.bestaetigen', 'notaus.umschalten', 'unterhaltung.exportieren', 'antwort.neu_erzeugen', 'app.verbinden', 'app.werkzeuge_bestaetigen', 'app.zugriff_setzen', 'app.trennen'));--> statement-breakpoint
ALTER TABLE "public"."rules" ADD CONSTRAINT "rules_action_werte" CHECK ("public"."rules"."action" in ('*', 'einrichtung.abschliessen', 'zugang.anmelden', 'zugang.abmelden', 'zugang.alle_abmelden', 'zugang.passwort_aendern', 'anbieter.speichern', 'anbieter.loeschen', 'modell.waehlen', 'bot.aendern', 'schleuse.umschalten', 'einstellung.aendern', 'unterhaltung.anlegen', 'unterhaltung.umbenennen', 'unterhaltung.loeschen', 'nachricht.senden', 'modell.anfragen', 'lauf.abbrechen', 'belege.exportieren', 'werkzeug.aufrufen', 'geraet.hinzufuegen', 'geraet.entfernen', 'geraet.bestaetigen', 'notaus.umschalten', 'unterhaltung.exportieren', 'antwort.neu_erzeugen', 'app.verbinden', 'app.werkzeuge_bestaetigen', 'app.zugriff_setzen', 'app.trennen'));--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD CONSTRAINT "tool_calls_app_id_format" CHECK ("public"."tool_calls"."app_id" is null or "public"."tool_calls"."app_id" ~ '^app_[0-7][0-9a-hjkmnp-tv-z]{25}$');--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD CONSTRAINT "tool_calls_app_tool_id_format" CHECK ("public"."tool_calls"."app_tool_id" is null or "public"."tool_calls"."app_tool_id" ~ '^wzg_[0-7][0-9a-hjkmnp-tv-z]{25}$');--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD CONSTRAINT "tool_calls_tool_version_positiv" CHECK ("public"."tool_calls"."tool_version" is null or "public"."tool_calls"."tool_version" >= 1);--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD CONSTRAINT "tool_calls_app_angaben_zusammen" CHECK (("public"."tool_calls"."app_id" is null) = ("public"."tool_calls"."app_tool_id" is null) and ("public"."tool_calls"."app_id" is null) = ("public"."tool_calls"."tool_version" is null));--> statement-breakpoint
ALTER TABLE "public"."tool_calls" ADD CONSTRAINT "tool_calls_app_nur_bei_mcp" CHECK ("public"."tool_calls"."app_id" is null or "public"."tool_calls"."source" = 'mcp');

--> statement-breakpoint
-- Von Hand ergänzt: Standard-Regel R-014 „Bot liest in Apps mit Lese-Zugriff“ (Fassung 3 des Tors).
INSERT INTO "rules" ("id", "version", "action", "effect", "stage", "conditions", "priority", "source", "enabled", "title", "reason")
VALUES
  (
    'R-014', 1, 'werkzeug.aufrufen', 'allow', 'execute',
    '[{"fact":"akteur","op":"eq","value":"bot"},{"fact":"botOfConversation","op":"eq","value":true},{"fact":"trigger","op":"eq","value":"chat"},{"fact":"toolSource","op":"eq","value":"mcp"},{"fact":"toolKind","op":"eq","value":"lesen"},{"fact":"appAccess","op":"eq","value":"lesen"},{"fact":"toolStatus","op":"eq","value":"bestaetigt"}]'::jsonb,
    90, 'standard', true,
    'Bot liest in Apps mit Lese-Zugriff',
    'Du hast dieses Werkzeug als lesend bestätigt und dem Bot Lese-Zugriff auf die App gegeben.'
  )
ON CONFLICT ("id", "version") DO NOTHING;
--> statement-breakpoint
-- Abdruck des Ziels einer App (wie `appTargetDigestInput` im Code): „sha256:“ und Hex von SHA-256
-- über den Präfix, eine neue Zeile und das JSON mit Kennung und Adresse. Die Adresse der Tabelle
-- besteht nur aus sichtbaren ASCII-Zeichen und enthält nirgends, auch nicht im Host, ein
-- Anführungszeichen oder einen Rückstrich (CHECK `apps_url_format`); das JSON braucht also keine
-- Maskierung.
CREATE FUNCTION paibot_app_ziel_abdruck(app_id text, url text) RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN 'sha256:' || pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(
      'pb-appziel/v1' || pg_catalog.chr(10) || '{"appId":"' || app_id || '","url":"' || url || '"}',
      'UTF8')),
    'hex');
END;
$$;
--> statement-breakpoint
-- Apps: Kennung, Kurzname und Anlegezeit bleiben; Verbindungsnummer nur beim erneuten Verbinden
-- nach dem Trennen um eins höher; Art der Anmeldung nur zusammen damit.
CREATE FUNCTION paibot_apps_regeln() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.short_name IS DISTINCT FROM OLD.short_name
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Kennung, Kurzname und Anlegezeit einer App sind unveränderlich.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state = 'getrennt' AND NEW.state = 'verbunden' THEN
    IF NEW.connection_no <> OLD.connection_no + 1 THEN
      RAISE EXCEPTION 'Beim erneuten Verbinden steigt die Verbindungsnummer um eins.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  ELSIF NEW.connection_no IS DISTINCT FROM OLD.connection_no THEN
    RAISE EXCEPTION 'Die Verbindungsnummer ändert sich nur beim erneuten Verbinden einer getrennten App.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.auth_kind IS DISTINCT FROM OLD.auth_kind AND NEW.connection_no = OLD.connection_no THEN
    RAISE EXCEPTION 'Die Art der Anmeldung ändert sich nur beim erneuten Verbinden einer getrennten App.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state = 'getrennt' AND NEW.state = 'getrennt'
    AND (NEW.url IS DISTINCT FROM OLD.url OR NEW.token_enc IS NOT NULL) THEN
    RAISE EXCEPTION 'Eine getrennte App hat keinen Zugang und ändert ihre Adresse erst beim erneuten Verbinden.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER apps_regeln
BEFORE UPDATE ON "apps"
FOR EACH ROW EXECUTE FUNCTION paibot_apps_regeln();
--> statement-breakpoint
-- Ändern sich Adresse, Zugang oder Verbindungsnummer einer verbundenen App, fallen alle ihre
-- Werkzeuge zurück auf „neu“ (eine neue Fassung je Werkzeug). Das gilt auch für Werkzeuge, die der
-- Besitzer bestätigt oder gesperrt hat: Jede Einstufung gilt nur für die Adresse und den Zugang,
-- für die sie gegeben wurde.
CREATE FUNCTION paibot_apps_aenderung() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.state = 'verbunden'
    AND (NEW.url IS DISTINCT FROM OLD.url
      OR NEW.token_enc IS DISTINCT FROM OLD.token_enc
      OR NEW.connection_no IS DISTINCT FROM OLD.connection_no) THEN
    INSERT INTO public.app_tools (
      tool_id, version, app_id, original_name, model_name, tool_key, tool_digest, description,
      input_schema, hint_read_only, hint_destructive, status, tool_class)
    SELECT t.tool_id, t.version + 1, t.app_id, t.original_name, t.model_name, t.tool_key,
      t.tool_digest, t.description, t.input_schema, t.hint_read_only, t.hint_destructive,
      'neu', 'schreiben'
    FROM public.app_tools t
    WHERE t.app_id = NEW.id
      AND t.status IN ('bestaetigt', 'geaendert', 'gesperrt')
      AND t.version = (SELECT max(m.version) FROM public.app_tools m WHERE m.tool_id = t.tool_id);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER apps_aenderung
AFTER UPDATE ON "apps"
FOR EACH ROW EXECUTE FUNCTION paibot_apps_aenderung();
--> statement-breakpoint
-- Nur anhängen: Werkzeuge der Apps und Zugriff der Bots lassen sich weder ändern noch löschen
-- noch leeren, auch nicht vom Besitzer der Tabelle.
CREATE FUNCTION paibot_apps_nur_anhaengen() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION '% ist nur zum Anhängen: % ist nicht erlaubt.', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER app_tools_nur_anhaengen
BEFORE UPDATE OR DELETE ON "app_tools"
FOR EACH ROW EXECUTE FUNCTION paibot_apps_nur_anhaengen();
--> statement-breakpoint
CREATE TRIGGER app_tools_kein_truncate
BEFORE TRUNCATE ON "app_tools"
FOR EACH STATEMENT EXECUTE FUNCTION paibot_apps_nur_anhaengen();
--> statement-breakpoint
CREATE TRIGGER bot_app_grants_nur_anhaengen
BEFORE UPDATE OR DELETE ON "bot_app_grants"
FOR EACH ROW EXECUTE FUNCTION paibot_apps_nur_anhaengen();
--> statement-breakpoint
CREATE TRIGGER bot_app_grants_kein_truncate
BEFORE TRUNCATE ON "bot_app_grants"
FOR EACH STATEMENT EXECUTE FUNCTION paibot_apps_nur_anhaengen();
--> statement-breakpoint
-- Werkzeuge der Apps: Jede neue Fassung folgt der vorigen (Nummer, gleiche Kennungen) und ändert
-- den Stand nur auf erlaubten Wegen. „bestätigt“ und „gesperrt“ gibt es nur mit der Entscheidung des
-- Besitzers im Beleg-Protokoll (Aktion `app.werkzeuge_bestaetigen`, erlaubt, genau dieses Werkzeug,
-- genau dieser Abdruck, genau diese Adresse); alles andere legt der Worker an (neu, geändert,
-- entfernt). Die Einstufung „liest“ gibt es nur auf diesem Weg.
CREATE FUNCTION paibot_app_tools_regeln() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  app public.apps%ROWTYPE;
  prev public.app_tools%ROWTYPE;
  gleich boolean;
BEGIN
  -- Die App-Zeile wird gesperrt, bis diese Transaktion endet: Ändert eine andere Verbindung
  -- gleichzeitig Adresse, Zugang oder Verbindungsnummer, wartet sie, und ihr Trigger sieht danach
  -- die hier angelegte Fassung (und setzt sie auf „neu“).
  SELECT * INTO app FROM public.apps WHERE id = NEW.app_id FOR SHARE;
  IF NOT FOUND OR app.state <> 'verbunden' THEN
    RAISE EXCEPTION 'Werkzeuge gibt es nur für eine verbundene App.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF octet_length(NEW.input_schema::text) > 65536 THEN
    RAISE EXCEPTION 'Das Eingabe-Schema eines Werkzeugs ist zu groß.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO prev FROM public.app_tools
    WHERE tool_id = NEW.tool_id ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN
    IF NEW.version <> 1 OR NEW.status <> 'neu' THEN
      RAISE EXCEPTION 'Ein Werkzeug wird zuerst als „neu“ in Fassung 1 angelegt.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF left(NEW.model_name, length(app.short_name) + 2) <> app.short_name || '__'
      OR left(NEW.tool_key, length(app.short_name) + 5) <> 'mcp/' || app.short_name || '/' THEN
      RAISE EXCEPTION 'Modell-Name und Kennung des Werkzeugs beginnen mit dem Kurznamen der App.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.version <> prev.version + 1 THEN
    RAISE EXCEPTION 'Die Fassung eines Werkzeugs zählt lückenlos um eins hoch.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.app_id <> prev.app_id OR NEW.original_name <> prev.original_name
    OR NEW.model_name <> prev.model_name OR NEW.tool_key <> prev.tool_key THEN
    RAISE EXCEPTION 'App, Name und Kennung eines Werkzeugs bleiben nach dem ersten Anlegen gleich.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  gleich := NEW.tool_digest = prev.tool_digest;
  IF NEW.status IN ('bestaetigt', 'gesperrt') THEN
    IF NOT gleich OR prev.status = 'entfernt'
      OR NEW.description IS DISTINCT FROM prev.description
      OR NEW.input_schema IS DISTINCT FROM prev.input_schema
      OR NEW.hint_read_only IS DISTINCT FROM prev.hint_read_only
      OR NEW.hint_destructive IS DISTINCT FROM prev.hint_destructive
      OR NEW.seen_digest IS DISTINCT FROM prev.tool_digest
      OR NEW.target_digest IS DISTINCT FROM paibot_app_ziel_abdruck(app.id, app.url) THEN
      RAISE EXCEPTION 'Eingestuft wird nur die gespeicherte, unveränderte Fassung, die der Besitzer gesehen hat, für die jetzige Adresse.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.belege b
      WHERE b.action_id = NEW.action_id AND b.entry_type = 'decision'
        AND b.action = 'app.werkzeuge_bestaetigen' AND b.actor = 'besitzer'
        AND b.body -> 'decision' ->> 'outcome' = 'allow'
        AND b.body -> 'action' -> 'target' ->> 'appId' = NEW.app_id
        AND b.body -> 'action' -> 'target' ->> 'toolId' = NEW.tool_id
        AND b.body -> 'facts' ->> 'toolClass' = NEW.tool_class
        AND b.body -> 'facts' ->> 'toolDigest' = NEW.tool_digest
        AND b.body -> 'facts' ->> 'seenToolDigest' = NEW.seen_digest
        AND b.body -> 'facts' ->> 'targetDigest' = NEW.target_digest
        AND b.body -> 'facts' ->> 'toolStatus' = prev.status
        AND (b.body -> 'facts' ->> 'toolVersion')::integer = prev.version) THEN
      RAISE EXCEPTION 'Zu dieser Einstufung gibt es keine passende Entscheidung des Besitzers.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  ELSIF NEW.status = 'entfernt' THEN
    IF NOT gleich OR prev.status = 'entfernt'
      OR NEW.description IS DISTINCT FROM prev.description
      OR NEW.input_schema IS DISTINCT FROM prev.input_schema THEN
      RAISE EXCEPTION 'Ein entferntes Werkzeug behält seine letzte Fassung.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status = 'geaendert' THEN
    IF gleich OR prev.status NOT IN ('bestaetigt', 'gesperrt', 'geaendert') THEN
      RAISE EXCEPTION '„Geändert“ gibt es nur, wenn sich der Abdruck eines eingestuften Werkzeugs ändert.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status = 'neu' THEN
    IF NOT ((NOT gleich AND prev.status IN ('neu', 'entfernt'))
        OR (gleich AND prev.status IN ('bestaetigt', 'geaendert', 'gesperrt', 'entfernt'))) THEN
      RAISE EXCEPTION 'Dieser Wechsel auf „neu“ ist nicht erlaubt.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF gleich AND (NEW.description IS DISTINCT FROM prev.description
        OR NEW.input_schema IS DISTINCT FROM prev.input_schema) THEN
      RAISE EXCEPTION 'Beim Zurücksetzen auf „neu“ bleibt der Inhalt gleich.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER app_tools_regeln
BEFORE INSERT ON "app_tools"
FOR EACH ROW EXECUTE FUNCTION paibot_app_tools_regeln();
--> statement-breakpoint
-- Zugriff der Bots: nur mit der Entscheidung des Besitzers (Aktion `app.zugriff_setzen`, erlaubt,
-- genau diese App, genau dieser Bot, genau dieser Zugriff), für eine verbundene App und ihre
-- jetzige Verbindungsnummer.
CREATE FUNCTION paibot_bot_app_grants_regeln() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  app public.apps%ROWTYPE;
  hoechste bigint;
BEGIN
  -- Die Nummer vergibt die Datenbank und sie steigt immer (wie bei den Regeln): Sonst könnte eine
  -- selbst gesetzte hohe Nummer für immer gelten und ein späterer Widerruf bliebe wirkungslos.
  IF NEW.seq IS DISTINCT FROM pg_catalog.currval('public.bot_app_grants_seq_seq'::pg_catalog.regclass) THEN
    RAISE EXCEPTION 'Die Nummer eines Zugriffs vergibt die Datenbank.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT pg_catalog.max(g.seq) INTO hoechste FROM public.bot_app_grants g;
  IF hoechste IS NOT NULL AND NEW.seq <= hoechste THEN
    RAISE EXCEPTION 'Die Nummer eines Zugriffs muss höher sein als jede vorhandene.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO app FROM public.apps WHERE id = NEW.app_id;
  IF NOT FOUND OR app.state <> 'verbunden' OR NEW.connection_no <> app.connection_no THEN
    RAISE EXCEPTION 'Zugriff gibt es nur für eine verbundene App und ihre jetzige Verbindung.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bots WHERE id = NEW.bot_id) THEN
    RAISE EXCEPTION 'Diesen Bot gibt es nicht.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.belege b
    WHERE b.action_id = NEW.action_id AND b.entry_type = 'decision'
      AND b.action = 'app.zugriff_setzen' AND b.actor = 'besitzer'
      AND b.body -> 'decision' ->> 'outcome' = 'allow'
      AND b.body -> 'action' -> 'target' ->> 'appId' = NEW.app_id
      AND b.body -> 'action' -> 'target' ->> 'botId' = NEW.bot_id
      AND b.body -> 'facts' ->> 'access' = NEW.access) THEN
    RAISE EXCEPTION 'Zu diesem Zugriff gibt es keine passende Entscheidung des Besitzers.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN object_not_in_prerequisite_state THEN
    RAISE EXCEPTION 'Die Nummer eines Zugriffs vergibt die Datenbank.'
      USING ERRCODE = 'check_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER bot_app_grants_regeln
BEFORE INSERT ON "bot_app_grants"
FOR EACH ROW EXECUTE FUNCTION paibot_bot_app_grants_regeln();
--> statement-breakpoint
-- Nachrichten: wie bisher; dazu darf das Kennzeichen „fremder Inhalt“ nur gesetzt, nie
-- zurückgenommen werden.
CREATE OR REPLACE FUNCTION paibot_messages_unveraenderlich() RETURNS trigger
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
  IF OLD.untrusted AND NOT NEW.untrusted THEN
    RAISE EXCEPTION 'Das Kennzeichen „fremder Inhalt“ lässt sich nicht zurücknehmen.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Eine neue Nachricht eines Laufs erbt das Kennzeichen „fremder Inhalt“, sobald eine andere
-- Nachricht desselben Laufs es trägt.
CREATE FUNCTION paibot_messages_erben() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.run_id IS NOT NULL AND NOT NEW.untrusted AND EXISTS (
    SELECT 1 FROM public.messages m WHERE m.run_id = NEW.run_id AND m.untrusted) THEN
    NEW.untrusted := true;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER messages_erben
BEFORE INSERT ON "messages"
FOR EACH ROW EXECUTE FUNCTION paibot_messages_erben();
--> statement-breakpoint
-- Werkzeug-Aufrufe: wie in 0015; dazu gehört ein Aufruf einer App immer zu einer gespeicherten
-- Fassung eines Werkzeugs dieser App, und die Angaben zur App bleiben danach gleich.
CREATE OR REPLACE FUNCTION paibot_tool_calls_regeln() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF octet_length(NEW.input::text) > 65536 OR octet_length(NEW.output::text) > 262144 THEN
    RAISE EXCEPTION 'Eingabe oder Ergebnis eines Werkzeug-Aufrufs ist zu groß.'
      USING ERRCODE = 'check_violation';
  END IF;
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
    IF NEW.decision_receipt_id IS NOT NULL OR NEW.result_receipt_id IS NOT NULL
      OR NEW.result_status IS NOT NULL OR NEW.output IS NOT NULL OR NEW.finished_at IS NOT NULL THEN
      RAISE EXCEPTION 'Ein neuer Werkzeug-Aufruf hat noch keine Belege und kein Ergebnis.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.source = 'mcp' THEN
      IF NEW.app_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.app_tools t
        WHERE t.app_id = NEW.app_id AND t.tool_id = NEW.app_tool_id
          AND t.version = NEW.tool_version AND t.tool_key = NEW.tool_key) THEN
        RAISE EXCEPTION 'Ein Aufruf einer App gehört zu einer gespeicherten Fassung eines Werkzeugs dieser App.'
          USING ERRCODE = 'check_violation';
      END IF;
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
    OR NEW.untrusted_input IS DISTINCT FROM OLD.untrusted_input
    OR NEW.app_id IS DISTINCT FROM OLD.app_id
    OR NEW.app_tool_id IS DISTINCT FROM OLD.app_tool_id
    OR NEW.tool_version IS DISTINCT FROM OLD.tool_version THEN
    RAISE EXCEPTION 'Diese Angaben eines Werkzeug-Aufrufs sind nach dem Anlegen unveränderlich.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  -- Einmal gesetzte Kennungen der Belege bleiben gleich.
  IF (OLD.decision_receipt_id IS NOT NULL
      AND NEW.decision_receipt_id IS DISTINCT FROM OLD.decision_receipt_id)
    OR (OLD.result_receipt_id IS NOT NULL
      AND NEW.result_receipt_id IS DISTINCT FROM OLD.result_receipt_id) THEN
    RAISE EXCEPTION 'Die Belege eines Werkzeug-Aufrufs lassen sich nicht austauschen.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  -- Ein abgebrochener Aufruf bekommt beim Aufräumen nur noch seinen Ergebnis-Beleg.
  IF OLD.status = 'cancelled' AND NEW.status = 'cancelled' THEN
    IF OLD.result_receipt_id IS NOT NULL OR NEW.result_receipt_id IS NULL
      OR NEW.result_status IS DISTINCT FROM OLD.result_status
      OR NEW.output IS DISTINCT FROM OLD.output
      OR NEW.error_code IS DISTINCT FROM OLD.error_code
      OR NEW.finished_at IS DISTINCT FROM OLD.finished_at
      OR NEW.output_truncated IS DISTINCT FROM OLD.output_truncated
      OR NEW.output_chars IS DISTINCT FROM OLD.output_chars THEN
      RAISE EXCEPTION 'Dieser Zustandswechsel eines Werkzeug-Aufrufs ist nicht erlaubt.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  ELSIF NOT ((OLD.status = 'requested' AND NEW.status IN ('running', 'denied', 'cancelled'))
       OR (OLD.status = 'running' AND NEW.status IN ('succeeded', 'failed', 'cancelled'))) THEN
    RAISE EXCEPTION 'Dieser Zustandswechsel eines Werkzeug-Aufrufs ist nicht erlaubt.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  -- Entscheidung: nur ein Beleg „Entscheidung“ genau dieser Aktion; „läuft“ nur mit „erlaubt“,
  -- „abgelehnt“ nur ohne „erlaubt“.
  IF NEW.decision_receipt_id IS NOT NULL
    AND NEW.decision_receipt_id IS DISTINCT FROM OLD.decision_receipt_id
    AND NOT EXISTS (
      SELECT 1 FROM public.belege b
      WHERE b.id = NEW.decision_receipt_id AND b.entry_type = 'decision'
        AND b.action_id = NEW.action_id) THEN
    RAISE EXCEPTION 'Die Entscheidung gehört nicht zu diesem Werkzeug-Aufruf.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.status = 'running' AND NOT EXISTS (
      SELECT 1 FROM public.belege b
      WHERE b.id = NEW.decision_receipt_id AND b.entry_type = 'decision'
        AND b.action_id = NEW.action_id
        AND b.body -> 'decision' ->> 'outcome' = 'allow') THEN
    RAISE EXCEPTION 'Ein Werkzeug-Aufruf läuft nur nach der Entscheidung „erlaubt“.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.status = 'denied' AND NOT EXISTS (
      SELECT 1 FROM public.belege b
      WHERE b.id = NEW.decision_receipt_id AND b.entry_type = 'decision'
        AND b.action_id = NEW.action_id
        AND b.body -> 'decision' ->> 'outcome' <> 'allow') THEN
    RAISE EXCEPTION 'Ein Werkzeug-Aufruf wird nur nach einer ablehnenden Entscheidung abgelehnt.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  -- Ergebnis: nur ein Beleg „Ergebnis“ genau dieser Aktion; erledigt nur mit ihm. Geprüft wird bei
  -- jeder Änderung einer Zeile mit Ergebnis-Beleg, nicht nur, wenn sich die Kennung ändert.
  IF NEW.status IN ('succeeded', 'failed') AND NEW.result_receipt_id IS NULL THEN
    RAISE EXCEPTION 'Ein erledigter Werkzeug-Aufruf braucht seinen Ergebnis-Beleg.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.result_receipt_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.belege b
      WHERE b.id = NEW.result_receipt_id AND b.entry_type = 'result'
        AND b.action_id = NEW.action_id) THEN
    RAISE EXCEPTION 'Das Ergebnis gehört nicht zu diesem Werkzeug-Aufruf.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
