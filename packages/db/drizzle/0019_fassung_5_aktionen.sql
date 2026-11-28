-- PaiBot – Datenbank für die Tor-Fassung 5 „Zusammenarbeit“: Die 7 Aktionen der Fassung
-- (Übergaben und Meldungen der Bots, Aufträge des Besitzers) sind in den Werten der Regeln und der
-- Belege erlaubt, und die Standard-Regeln R-009 und R-015 bis R-019 stehen im Regelstand.
--
-- Autor:     Oliver Hees
-- Website:   https://paibot.de
-- Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
-- Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
-- Seit:      2026-11-27
--
-- Vom Werkzeug erzeugt; von Hand ergänzt ist der Teil nach dem letzten erzeugten Befehl (die
-- Standard-Regeln, Inhalt wie `STANDARD_RULES_5` im Code). Die Migration gehört mit dem Stand des
-- Tors zusammen: Die Liste der gespeicherten Aktionen im Code (`STORED_ACTION_TYPES`) und die Werte
-- hier müssen gleich sein, und das Tor darf erst mit Fassung 5 entscheiden (`GATE_FORMAT = 5`),
-- wenn die Datenbank deren Aktionen und Regeln kennt. Beides kommt im selben Schritt. Die Tabellen
-- für Aufträge kommen mit einer eigenen, späteren Migration.
-- Kein Zurück auf eine ältere Version nach dieser Migration: Belege mit diesen Aktionen kennt der
-- alte Stand nicht. Vor dem Update eine Sicherung anlegen.

ALTER TABLE "public"."belege" DROP CONSTRAINT "belege_action_werte";--> statement-breakpoint
ALTER TABLE "public"."rules" DROP CONSTRAINT "rules_action_werte";--> statement-breakpoint
ALTER TABLE "public"."belege" ADD CONSTRAINT "belege_action_werte" CHECK ("public"."belege"."action" is null or "public"."belege"."action" in ('einrichtung.abschliessen', 'zugang.anmelden', 'zugang.abmelden', 'zugang.alle_abmelden', 'zugang.passwort_aendern', 'anbieter.speichern', 'anbieter.loeschen', 'modell.waehlen', 'bot.aendern', 'schleuse.umschalten', 'einstellung.aendern', 'unterhaltung.anlegen', 'unterhaltung.umbenennen', 'unterhaltung.loeschen', 'nachricht.senden', 'modell.anfragen', 'lauf.abbrechen', 'belege.exportieren', 'werkzeug.aufrufen', 'geraet.hinzufuegen', 'geraet.entfernen', 'geraet.bestaetigen', 'notaus.umschalten', 'unterhaltung.exportieren', 'antwort.neu_erzeugen', 'app.verbinden', 'app.werkzeuge_bestaetigen', 'app.zugriff_setzen', 'app.trennen', 'bot.anlegen', 'bot.loeschen', 'bot.pausieren', 'team.anlegen', 'team.aendern', 'team.loeschen', 'bot.team_setzen', 'team.entwurf_erstellen', 'team.entwurf_verwerfen', 'team.entwurf_anlegen', 'team.entwurf_zuruecknehmen', 'faden.anlegen', 'einstellung.stabschef_setzen', 'auftrag.uebergeben', 'auftrag.melden', 'auftrag.abbrechen', 'auftrag.abnehmen', 'auftrag.zurueckgeben', 'auftrag.zettel_aendern', 'auftrag.budget_erhoehen'));--> statement-breakpoint
ALTER TABLE "public"."rules" ADD CONSTRAINT "rules_action_werte" CHECK ("public"."rules"."action" in ('*', 'einrichtung.abschliessen', 'zugang.anmelden', 'zugang.abmelden', 'zugang.alle_abmelden', 'zugang.passwort_aendern', 'anbieter.speichern', 'anbieter.loeschen', 'modell.waehlen', 'bot.aendern', 'schleuse.umschalten', 'einstellung.aendern', 'unterhaltung.anlegen', 'unterhaltung.umbenennen', 'unterhaltung.loeschen', 'nachricht.senden', 'modell.anfragen', 'lauf.abbrechen', 'belege.exportieren', 'werkzeug.aufrufen', 'geraet.hinzufuegen', 'geraet.entfernen', 'geraet.bestaetigen', 'notaus.umschalten', 'unterhaltung.exportieren', 'antwort.neu_erzeugen', 'app.verbinden', 'app.werkzeuge_bestaetigen', 'app.zugriff_setzen', 'app.trennen', 'bot.anlegen', 'bot.loeschen', 'bot.pausieren', 'team.anlegen', 'team.aendern', 'team.loeschen', 'bot.team_setzen', 'team.entwurf_erstellen', 'team.entwurf_verwerfen', 'team.entwurf_anlegen', 'team.entwurf_zuruecknehmen', 'faden.anlegen', 'einstellung.stabschef_setzen', 'auftrag.uebergeben', 'auftrag.melden', 'auftrag.abbrechen', 'auftrag.abnehmen', 'auftrag.zurueckgeben', 'auftrag.zettel_aendern', 'auftrag.budget_erhoehen'));
--> statement-breakpoint
-- Von Hand ergänzt: Standard-Regeln der Tor-Fassung 5 (R-009 im Band der Standard-Regeln, vor
-- jeder eigenen Regel: Eine eigene Regel kann `auftrag.uebergeben` für Bots weder lockern noch
-- verschärfen).
INSERT INTO "rules" ("id", "version", "action", "effect", "stage", "conditions", "priority", "source", "enabled", "title", "reason")
VALUES
  (
    'R-009', 1, 'auftrag.uebergeben', 'ask', 'ask',
    '[{"fact":"akteur","op":"eq","value":"bot"}]'::jsonb,
    900, 'standard', true,
    'Bot fragt vor Übergaben',
    'Der Weg ist erlaubt, aber dein Schalter für die Zusammenarbeit ist aus.'
  ),
  (
    'R-015', 1, 'auftrag.uebergeben', 'allow', 'execute',
    '[{"fact":"akteur","op":"eq","value":"bot"},{"fact":"geberRolle","op":"eq","value":"leitung"},{"fact":"art","op":"in","value":["uebergabe","rueckgabe"]},{"fact":"zielRolle","op":"eq","value":"mitglied"},{"fact":"sameTeam","op":"eq","value":true},{"fact":"conversationKind","op":"eq","value":"faden"},{"fact":"auftragArt","op":"in","value":["wurzel","uebergabe","rueckkehr","sammeln"]},{"fact":"zusammenarbeit","op":"eq","value":"leitung_fuehrt"},{"fact":"untrustedInput","op":"eq","value":false}]'::jsonb,
    100, 'standard', true,
    'Leitung gibt Arbeit im Team weiter',
    'Die Leitung gibt einem Mitglied ihres Teams Arbeit; du hast die Zusammenarbeit eingeschaltet.'
  ),
  (
    'R-016', 1, 'modell.anfragen', 'allow', 'execute',
    '[{"fact":"akteur","op":"eq","value":"bot"},{"fact":"botHatAuftrag","op":"eq","value":true}]'::jsonb,
    100, 'standard', true,
    'Bot mit gültigem Auftrag darf antworten',
    'Der Bot hat in dieser Unterhaltung einen gültigen, laufenden Auftrag.'
  ),
  (
    'R-017', 1, 'auftrag.uebergeben', 'allow', 'execute',
    '[{"fact":"akteur","op":"eq","value":"bot"},{"fact":"geberRolle","op":"eq","value":"stabschef"},{"fact":"art","op":"eq","value":"team"},{"fact":"zielRolle","op":"eq","value":"leitung"},{"fact":"conversationKind","op":"eq","value":"direkt"},{"fact":"auftragArt","op":"eq","value":"keiner"},{"fact":"trigger","op":"eq","value":"chat"},{"fact":"stabschefErlaubt","op":"eq","value":true},{"fact":"untrustedInput","op":"eq","value":false}]'::jsonb,
    100, 'standard', true,
    'Pai gibt als Stabschef einem Team einen Auftrag',
    'Pai gibt der Leitung eines Teams einen Auftrag aus deinem Chat; du hast es erlaubt.'
  ),
  (
    'R-018', 1, 'auftrag.melden', 'allow', 'execute',
    '[{"fact":"akteur","op":"eq","value":"bot"},{"fact":"botHatAuftrag","op":"eq","value":true},{"fact":"conversationKind","op":"eq","value":"faden"},{"fact":"meldungPasstZurRolle","op":"eq","value":true}]'::jsonb,
    100, 'standard', true,
    'Bot meldet den Stand seines Auftrags',
    'Der Bot meldet den Stand seines eigenen Auftrags in seinem Faden.'
  ),
  (
    'R-019', 1, 'auftrag.uebergeben', 'allow', 'execute',
    '[{"fact":"akteur","op":"eq","value":"bot"},{"fact":"geberRolle","op":"eq","value":"mitglied"},{"fact":"art","op":"eq","value":"bitte"},{"fact":"zielRolle","op":"eq","value":"mitglied"},{"fact":"sameTeam","op":"eq","value":true},{"fact":"conversationKind","op":"eq","value":"faden"},{"fact":"auftragArt","op":"eq","value":"uebergabe"},{"fact":"zusammenarbeit","op":"eq","value":"leitung_fuehrt"},{"fact":"untrustedInput","op":"eq","value":false}]'::jsonb,
    100, 'standard', true,
    'Mitglied bittet einen Kollegen um eine Zulieferung',
    'Ein Mitglied mit Auftrag der Leitung bittet einen Kollegen im selben Faden um eine Zulieferung.'
  )
ON CONFLICT ("id", "version") DO NOTHING;
