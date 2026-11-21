-- PaiBot – Chat-Ergänzungen: neue Aktionen „Unterhaltung als Datei gesichert“ und „Antwort neu
-- erzeugt“ für Regeln und Belege. Die Tabellen selbst ändern sich nicht.
--
-- Autor:     Oliver Hees
-- Website:   https://paibot.de
-- Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
-- Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
-- Seit:      2026-11-21

ALTER TABLE "public"."belege" DROP CONSTRAINT "belege_action_werte";--> statement-breakpoint
ALTER TABLE "public"."rules" DROP CONSTRAINT "rules_action_werte";--> statement-breakpoint
ALTER TABLE "public"."belege" ADD CONSTRAINT "belege_action_werte" CHECK ("public"."belege"."action" is null or "public"."belege"."action" in ('einrichtung.abschliessen', 'zugang.anmelden', 'zugang.abmelden', 'zugang.alle_abmelden', 'zugang.passwort_aendern', 'anbieter.speichern', 'anbieter.loeschen', 'modell.waehlen', 'bot.aendern', 'schleuse.umschalten', 'einstellung.aendern', 'unterhaltung.anlegen', 'unterhaltung.umbenennen', 'unterhaltung.loeschen', 'nachricht.senden', 'modell.anfragen', 'lauf.abbrechen', 'belege.exportieren', 'werkzeug.aufrufen', 'geraet.hinzufuegen', 'geraet.entfernen', 'geraet.bestaetigen', 'notaus.umschalten', 'unterhaltung.exportieren', 'antwort.neu_erzeugen'));--> statement-breakpoint
ALTER TABLE "public"."rules" ADD CONSTRAINT "rules_action_werte" CHECK ("public"."rules"."action" in ('*', 'einrichtung.abschliessen', 'zugang.anmelden', 'zugang.abmelden', 'zugang.alle_abmelden', 'zugang.passwort_aendern', 'anbieter.speichern', 'anbieter.loeschen', 'modell.waehlen', 'bot.aendern', 'schleuse.umschalten', 'einstellung.aendern', 'unterhaltung.anlegen', 'unterhaltung.umbenennen', 'unterhaltung.loeschen', 'nachricht.senden', 'modell.anfragen', 'lauf.abbrechen', 'belege.exportieren', 'werkzeug.aufrufen', 'geraet.hinzufuegen', 'geraet.entfernen', 'geraet.bestaetigen', 'notaus.umschalten', 'unterhaltung.exportieren', 'antwort.neu_erzeugen'));