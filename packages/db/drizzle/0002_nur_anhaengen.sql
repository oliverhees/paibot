-- PaiBot – Trigger: Belege sind unveränderlich, der Ereignis-Strom wird nur angehängt,
-- die Installations-ID bleibt nach dem Setzen fest.
--
-- Autor:     Oliver Hees
-- Website:   https://paibot.de
-- Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
-- Lizenz:    PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
-- Seit:      2026-11-20

CREATE FUNCTION paibot_belege_unveraenderlich() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Belege sind unveränderlich: % ist nicht erlaubt.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER belege_kein_update_delete
BEFORE UPDATE OR DELETE ON "belege"
FOR EACH ROW EXECUTE FUNCTION paibot_belege_unveraenderlich();
--> statement-breakpoint
CREATE TRIGGER belege_kein_truncate
BEFORE TRUNCATE ON "belege"
FOR EACH STATEMENT EXECUTE FUNCTION paibot_belege_unveraenderlich();
--> statement-breakpoint
CREATE FUNCTION paibot_ereignisse_nur_anhaengen() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Ereignisse sind unveränderlich: UPDATE ist nicht erlaubt.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.type = 'text.delta'
    OR NOT EXISTS (SELECT 1 FROM "conversations" WHERE "id" = OLD.conversation_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Ereignisse dürfen nur zusammen mit ihrer Unterhaltung gelöscht werden (Ausnahme: text.delta).'
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ereignisse_nur_anhaengen
BEFORE UPDATE OR DELETE ON "conversation_events"
FOR EACH ROW EXECUTE FUNCTION paibot_ereignisse_nur_anhaengen();
--> statement-breakpoint
CREATE FUNCTION paibot_installation_id_fest() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.installation_id IS NOT NULL AND NEW.installation_id IS DISTINCT FROM OLD.installation_id THEN
    RAISE EXCEPTION 'Die Installations-ID lässt sich nach dem Setzen nicht mehr ändern.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER settings_installation_id_fest
BEFORE UPDATE ON "settings"
FOR EACH ROW EXECUTE FUNCTION paibot_installation_id_fest();
