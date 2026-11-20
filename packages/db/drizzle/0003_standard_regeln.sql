-- PaiBot – Standard-Regeln des Tors (nur lesbar in der Basis). Wiederholbar: vorhandene
-- Fassungen bleiben unverändert.
--
-- Autor:     Oliver Hees
-- Website:   https://paibot.de
-- Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
-- Lizenz:    PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
-- Seit:      2026-11-20

INSERT INTO "rules" ("id", "version", "action", "effect", "stage", "conditions", "priority", "source", "enabled", "title", "reason")
VALUES
  (
    'R-001', 1, '*', 'allow', 'execute',
    '[{"fact":"akteur","op":"eq","value":"besitzer"},{"fact":"credential","op":"in","value":["sitzung","passwort","einrichtungs_code"]}]'::jsonb,
    100, 'standard', true,
    'Besitzer verwaltet seine Installation',
    'Der Besitzer hat sich ausgewiesen und verwaltet seine eigene Installation.'
  ),
  (
    'R-002', 1, 'modell.anfragen', 'allow', 'execute',
    '[{"fact":"akteur","op":"eq","value":"bot"},{"fact":"botOfConversation","op":"eq","value":true}]'::jsonb,
    100, 'standard', true,
    'Bot darf antworten',
    'Der Bot der Unterhaltung darf ein Modell anfragen, wenn alle Grenzen eingehalten sind.'
  ),
  (
    'R-999', 1, '*', 'ask', 'ask',
    '[]'::jsonb,
    1000000, 'standard', true,
    'Ohne passende Regel',
    'Dafür gibt es noch keine Regel.'
  )
ON CONFLICT ("id", "version") DO NOTHING;
