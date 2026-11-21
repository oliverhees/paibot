-- PaiBot – Grund des Widerrufs je Gerät (abgemeldet, entfernt, verdrängt, alle beendet, Passwort
-- geändert), damit die übrigen Geräte Entfernen und Verdrängen im Hinweis sehen.
--
-- Autor:     Oliver Hees
-- Website:   https://paibot.de
-- Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
-- Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
-- Seit:      2026-11-21

ALTER TABLE "public"."geraete" ADD COLUMN "revoke_reason" text;--> statement-breakpoint
ALTER TABLE "public"."geraete" ADD CONSTRAINT "geraete_revoke_reason_werte" CHECK ("public"."geraete"."revoke_reason" in ('abgemeldet', 'entfernt', 'verdraengt', 'alle', 'passwort'));--> statement-breakpoint
ALTER TABLE "public"."geraete" ADD CONSTRAINT "geraete_revoke_reason_mit_widerruf" CHECK ("public"."geraete"."revoke_reason" is null or "public"."geraete"."revoked_at" is not null);