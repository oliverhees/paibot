-- PaiBot – Regeln nur aus Migrationen und mit festen Bändern, Belege je Aktion genau einmal und in
-- der Reihenfolge Entscheidung vor Ergebnis, fester Suchpfad für alle Trigger-Funktionen.
--
-- Autor:     Oliver Hees
-- Website:   https://paibot.de
-- Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
-- Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
-- Seit:      2026-11-20

-- Eigene Regeln (reg_…) und Vorschläge sind in dieser Fassung nie aktiv. Sobald Regeln vom Besitzer
-- angelegt werden können, ist das eine eigene Aktion durch das Tor; eine spätere Migration lockert
-- „rules_eigene_nur_aus“ dann nur für Zeilen, die auf den Beleg dieser Aktion verweisen.

CREATE UNIQUE INDEX "belege_aktion_einmal" ON "belege" USING btree ("action_id","entry_type") WHERE "belege"."action_id" is not null;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_seq_ab_eins" CHECK ("rules"."seq" >= 1);--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_kennung_passt_zur_quelle" CHECK (("rules"."id" ~ '^R-[0-9]{3}$') = ("rules"."source" = 'standard'));--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_vorschlag_nie_aktiv" CHECK ("rules"."source" <> 'proposal' or "rules"."enabled" = false);--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_eigene_nur_aus" CHECK ("rules"."source" = 'standard' or "rules"."enabled" = false);--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_prioritaet_je_quelle" CHECK (("rules"."source" = 'standard') = ("rules"."priority" <= 999 or "rules"."priority" = 1000000));
--> statement-breakpoint
-- Nummer im Regel-Protokoll: immer der gerade gezogene Wert der Sequenz und höher als jede vorhandene.
-- Ein selbst gesetzter Wert (OVERRIDING SYSTEM VALUE) wird abgewiesen.
CREATE FUNCTION paibot_regeln_nummer() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  hoechste bigint;
BEGIN
  IF NEW.seq IS DISTINCT FROM pg_catalog.currval('public.rules_seq_seq'::pg_catalog.regclass) THEN
    RAISE EXCEPTION 'Die Nummer einer Regel vergibt die Datenbank.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT pg_catalog.max(r.seq) INTO hoechste FROM public.rules r;
  IF hoechste IS NOT NULL AND NEW.seq <= hoechste THEN
    RAISE EXCEPTION 'Die Nummer einer Regel muss höher sein als jede vorhandene.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN object_not_in_prerequisite_state THEN
    RAISE EXCEPTION 'Die Nummer einer Regel vergibt die Datenbank.'
      USING ERRCODE = 'check_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER regeln_nummer
BEFORE INSERT ON "rules"
FOR EACH ROW EXECUTE FUNCTION paibot_regeln_nummer();
--> statement-breakpoint
-- Ein Ergebnis folgt genau einer Entscheidung derselben Aktion, mit derselben Aktion, demselben
-- Akteur und derselben Unterhaltung. „ok“, „error“ und „cancelled“ nur nach „allow“, „denied“ nur
-- nach einer anderen Entscheidung.
CREATE FUNCTION paibot_belege_ergebnis_nach_entscheidung() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  entscheidung record;
  erlaubt boolean;
BEGIN
  IF NEW.entry_type <> 'result' THEN
    RETURN NEW;
  END IF;
  SELECT b.action, b.actor, b.conversation_id, b.body->'decision'->>'outcome' AS outcome
    INTO entscheidung
    FROM public.belege b
    WHERE b.action_id = NEW.action_id AND b.entry_type = 'decision' AND b.seq < NEW.seq;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ein Ergebnis braucht vorher die Entscheidung derselben Aktion.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF entscheidung.action IS DISTINCT FROM NEW.action
    OR entscheidung.actor IS DISTINCT FROM NEW.actor
    OR entscheidung.conversation_id IS DISTINCT FROM NEW.conversation_id THEN
    RAISE EXCEPTION 'Ergebnis und Entscheidung gehören nicht zur selben Aktion.'
      USING ERRCODE = 'check_violation';
  END IF;
  erlaubt := entscheidung.outcome = 'allow';
  IF erlaubt = ((NEW.body->'result'->>'status') = 'denied') THEN
    RAISE EXCEPTION 'Das Ergebnis passt nicht zur Entscheidung.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER belege_ergebnis_nach_entscheidung
BEFORE INSERT ON "belege"
FOR EACH ROW EXECUTE FUNCTION paibot_belege_ergebnis_nach_entscheidung();
--> statement-breakpoint
-- Trigger-Funktionen hängen nicht vom Suchpfad der aufrufenden Verbindung ab.
CREATE OR REPLACE FUNCTION paibot_ereignisse_nur_anhaengen() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Ereignisse sind unveränderlich: UPDATE ist nicht erlaubt.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.type = 'text.delta'
    OR NOT EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = OLD.conversation_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Ereignisse dürfen nur zusammen mit ihrer Unterhaltung gelöscht werden (Ausnahme: text.delta).'
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
ALTER FUNCTION paibot_belege_unveraenderlich() SET search_path = pg_catalog, public;
--> statement-breakpoint
ALTER FUNCTION paibot_installation_id_fest() SET search_path = pg_catalog, public;
--> statement-breakpoint
ALTER FUNCTION paibot_regeln_unveraenderlich() SET search_path = pg_catalog, public;
--> statement-breakpoint
ALTER FUNCTION paibot_schluessel_nur_anhaengen() SET search_path = pg_catalog, public;
