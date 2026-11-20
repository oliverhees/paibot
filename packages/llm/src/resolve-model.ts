/**
 * PaiBot – Modell-Zugang für einen Lauf bauen, nur gegen eine Berechtigung des Tors.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { DerivedKey } from "@paibot/crypto";
import type { GatePermit } from "@paibot/gate";
import type { ConversationId, ModelId, ProviderId } from "@paibot/shared/ids";
import type { ResolvedModel } from "@paibot/shared/motor";
import type { Region } from "@paibot/shared/objekte";
import { notImplemented } from "@paibot/stub";
import type { SchleuseConnection } from "./schleuse";

/** Gewählter Anbieter und gewähltes Modell, wie sie in der Datenbank stehen. */
export interface ModelChoice {
  provider: {
    id: ProviderId;
    /** Schlüssel der Vorlage, z. B. `eurouter`; für den Modellnamen in der Datenschleuse. */
    templateKey: string;
    baseUrl: string;
    region: Region;
    /** Verschlüsselter Schlüssel (`v1:…`); fehlt, wenn keiner gesetzt ist. */
    apiKeyEnc?: string;
  };
  model: { id: ModelId; slug: string; displayName: string };
  conversationId: ConversationId;
}

export interface ResolveModelDeps {
  /** Schlüssel zum Entschlüsseln der Anbieter-Schlüssel. */
  secretsKey: DerivedKey<"secrets-v1">;
  /** Verbindung zur Datenschleuse; nötig, wenn die Berechtigung die Route `schleuse` nennt. */
  schleuse?: SchleuseConnection;
  /** Grund-`fetch` unter der Ausgangs-Liste (für Tests). */
  baseFetch?: typeof fetch;
}

/**
 * Baut den Zugang zu einem Modell für genau einen Lauf.
 *
 * - Route aus `permit.facts.route`: `direct` → Basis-URL und entschlüsselter Schlüssel des
 *   Anbieters; `schleuse` → Basis-URL und Schlüssel der Datenschleuse, Modellname
 *   `schleuseModelName(...)` und Kopfzeile `SCHLEUSE_SESSION_HEADER` mit der ID der Unterhaltung.
 * - `fetch` ist eine Ausgangs-Liste (`createEgressFetch`) nur für dieses eine Ziel.
 *
 * Zusagen: Ohne echte Berechtigung (`isGatePermit(permit, "modell.anfragen")`) entsteht nie ein
 * Zugang. Es entsteht nie eine Text-Kennung für ein Modell; der Motor bekommt ausschließlich
 * dieses Objekt.
 *
 * Fehler: `PaiBotError("abgelehnt")`, wenn die Berechtigung fehlt oder nicht zu `choice` passt
 * (Unterhaltung, Modell, Anbieter); `schleuse_nicht_installiert` bei Route `schleuse` ohne
 * Verbindung; `schluessel_ungueltig`, wenn der Schlüssel fehlt oder sich nicht entschlüsseln lässt.
 */
export function resolveModel(
  permit: GatePermit<"modell.anfragen">,
  choice: ModelChoice,
  deps: ResolveModelDeps,
): ResolvedModel {
  return notImplemented("llm.resolveModel", permit, choice, deps);
}
