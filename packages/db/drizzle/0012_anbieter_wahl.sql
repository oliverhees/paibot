-- PaiBot – Anbieter-Wahl: Vorlage „mistral“, wer laut Antwort geantwortet hat (Nachrichten),
-- Platz für einen zweiten Schlüssel je Anbieter und für die Vorgaben einer Routing-Regel (beides
-- vorbereitet, noch ungenutzt). Nur neue Spalten und geänderte Prüfungen; nichts wird gelöscht.
--
-- Autor:     Oliver Hees
-- Website:   https://paibot.de
-- Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
-- Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
-- Seit:      2026-11-21

ALTER TABLE "public"."providers" DROP CONSTRAINT "providers_template_key_werte";--> statement-breakpoint
ALTER TABLE "public"."models" ADD COLUMN "rule_policy" jsonb;--> statement-breakpoint
ALTER TABLE "public"."models" ADD COLUMN "rule_policy_source" text;--> statement-breakpoint
ALTER TABLE "public"."models" ADD COLUMN "rule_policy_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "public"."providers" ADD COLUMN "management_key_enc" text;--> statement-breakpoint
ALTER TABLE "public"."messages" ADD COLUMN "served_provider" text;--> statement-breakpoint
ALTER TABLE "public"."messages" ADD COLUMN "served_model" text;--> statement-breakpoint
ALTER TABLE "public"."models" ADD CONSTRAINT "models_rule_policy_vollstaendig" CHECK (("public"."models"."rule_policy" is null and "public"."models"."rule_policy_source" is null and "public"."models"."rule_policy_checked_at" is null) or ("public"."models"."rule_policy" is not null and "public"."models"."rule_policy_source" is not null and "public"."models"."rule_policy_checked_at" is not null));--> statement-breakpoint
ALTER TABLE "public"."models" ADD CONSTRAINT "models_rule_policy_source_werte" CHECK ("public"."models"."rule_policy_source" is null or "public"."models"."rule_policy_source" in ('verwaltungsschluessel'));--> statement-breakpoint
ALTER TABLE "public"."providers" ADD CONSTRAINT "providers_management_key_format" CHECK ("public"."providers"."management_key_enc" is null or "public"."providers"."management_key_enc" ~ '^(v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+|v2:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+)$');--> statement-breakpoint
ALTER TABLE "public"."providers" ADD CONSTRAINT "providers_template_key_werte" CHECK ("public"."providers"."template_key" in ('eurouter', 'mistral', 'eigener'));--> statement-breakpoint
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_served_provider_format" CHECK ("public"."messages"."served_provider" is null or "public"."messages"."served_provider" ~ '^[a-z0-9][a-z0-9._-]{0,63}$');--> statement-breakpoint
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_served_model_format" CHECK ("public"."messages"."served_model" is null or "public"."messages"."served_model" ~ '^[!-~]{1,200}$');