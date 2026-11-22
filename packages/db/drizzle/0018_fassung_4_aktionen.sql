-- PaiBot – Datenbank für die Tor-Fassung 4: Die 13 Aktionen der Fassung (Bots, Teams, Entwürfe,
-- Fäden, Stabschef) sind in den Werten der Regeln und der Belege erlaubt.
--
-- Autor:     Oliver Hees
-- Website:   https://paibot.de
-- Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
-- Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
-- Seit:      2026-11-22
--
-- Vom Werkzeug erzeugt. Diese Migration steht getrennt von 0017 (Teams A), weil sie mit dem Stand
-- des Tors zusammengehört: Die Liste der gespeicherten Aktionen im Code (`STORED_ACTION_TYPES`)
-- und die Werte hier müssen gleich sein, und das Tor darf erst mit Fassung 4 entscheiden
-- (`GATE_FORMAT = 4`), wenn die Datenbank deren Aktionen kennt. Beides kommt im selben Schritt.
-- Kein Zurück auf eine ältere Version nach dieser Migration: Belege mit diesen Aktionen kennt der
-- alte Stand nicht. Vor dem Update eine Sicherung anlegen.

ALTER TABLE "public"."belege" DROP CONSTRAINT "belege_action_werte";--> statement-breakpoint
ALTER TABLE "public"."rules" DROP CONSTRAINT "rules_action_werte";--> statement-breakpoint
ALTER TABLE "public"."belege" ADD CONSTRAINT "belege_action_werte" CHECK ("public"."belege"."action" is null or "public"."belege"."action" in ('einrichtung.abschliessen', 'zugang.anmelden', 'zugang.abmelden', 'zugang.alle_abmelden', 'zugang.passwort_aendern', 'anbieter.speichern', 'anbieter.loeschen', 'modell.waehlen', 'bot.aendern', 'schleuse.umschalten', 'einstellung.aendern', 'unterhaltung.anlegen', 'unterhaltung.umbenennen', 'unterhaltung.loeschen', 'nachricht.senden', 'modell.anfragen', 'lauf.abbrechen', 'belege.exportieren', 'werkzeug.aufrufen', 'geraet.hinzufuegen', 'geraet.entfernen', 'geraet.bestaetigen', 'notaus.umschalten', 'unterhaltung.exportieren', 'antwort.neu_erzeugen', 'app.verbinden', 'app.werkzeuge_bestaetigen', 'app.zugriff_setzen', 'app.trennen', 'bot.anlegen', 'bot.loeschen', 'bot.pausieren', 'team.anlegen', 'team.aendern', 'team.loeschen', 'bot.team_setzen', 'team.entwurf_erstellen', 'team.entwurf_verwerfen', 'team.entwurf_anlegen', 'team.entwurf_zuruecknehmen', 'faden.anlegen', 'einstellung.stabschef_setzen'));--> statement-breakpoint
ALTER TABLE "public"."rules" ADD CONSTRAINT "rules_action_werte" CHECK ("public"."rules"."action" in ('*', 'einrichtung.abschliessen', 'zugang.anmelden', 'zugang.abmelden', 'zugang.alle_abmelden', 'zugang.passwort_aendern', 'anbieter.speichern', 'anbieter.loeschen', 'modell.waehlen', 'bot.aendern', 'schleuse.umschalten', 'einstellung.aendern', 'unterhaltung.anlegen', 'unterhaltung.umbenennen', 'unterhaltung.loeschen', 'nachricht.senden', 'modell.anfragen', 'lauf.abbrechen', 'belege.exportieren', 'werkzeug.aufrufen', 'geraet.hinzufuegen', 'geraet.entfernen', 'geraet.bestaetigen', 'notaus.umschalten', 'unterhaltung.exportieren', 'antwort.neu_erzeugen', 'app.verbinden', 'app.werkzeuge_bestaetigen', 'app.zugriff_setzen', 'app.trennen', 'bot.anlegen', 'bot.loeschen', 'bot.pausieren', 'team.anlegen', 'team.aendern', 'team.loeschen', 'bot.team_setzen', 'team.entwurf_erstellen', 'team.entwurf_verwerfen', 'team.entwurf_anlegen', 'team.entwurf_zuruecknehmen', 'faden.anlegen', 'einstellung.stabschef_setzen'));