-- PaiBot – zuletzt geprüfter Zustand der Datenschleuse (eine Zeile). Der Worker schreibt ihn, die
-- Web-App liest ihn, weil sie selbst keinen Netz-Weg zur Datenschleuse hat.
--
-- Autor:     Oliver Hees
-- Website:   https://paibot.de
-- Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
-- Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
-- Seit:      2026-11-21

CREATE TABLE "public"."schleuse_zustand" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"state" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "schleuse_zustand_nur_eine_zeile" CHECK ("public"."schleuse_zustand"."id" = 'singleton'),
	CONSTRAINT "schleuse_zustand_state_werte" CHECK ("public"."schleuse_zustand"."state" in ('aus', 'nicht_erreichbar', 'schluessel_falsch', 'bereit'))
);
