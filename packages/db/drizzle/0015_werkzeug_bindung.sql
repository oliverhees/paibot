-- PaiBot – Werkzeug-Aufrufe an ihre Belege binden: Ein Aufruf läuft nur mit der Entscheidung
-- „erlaubt“ genau dieser Aktion, wird nur mit einer Entscheidung dieser Aktion abgelehnt und endet
-- nur mit einem Ergebnis-Beleg dieser Aktion. Einmal gesetzte Kennungen der Belege bleiben gleich.
-- Dazu feste Obergrenzen für Eingabe und Ergebnis eines Aufrufs.
--
-- Autor:     Oliver Hees
-- Website:   https://paibot.de
-- Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
-- Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
-- Seit:      2026-11-22
--
-- Nur von Hand geschrieben (keine Änderung am Schema der Tabellen).

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
  -- Ergebnis: nur ein Beleg „Ergebnis“ genau dieser Aktion; erledigt nur mit ihm.
  IF NEW.status IN ('succeeded', 'failed') AND NEW.result_receipt_id IS NULL THEN
    RAISE EXCEPTION 'Ein erledigter Werkzeug-Aufruf braucht seinen Ergebnis-Beleg.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.result_receipt_id IS NOT NULL
    AND NEW.result_receipt_id IS DISTINCT FROM OLD.result_receipt_id
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
