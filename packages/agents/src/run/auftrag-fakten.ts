/**
 * PaiBot – Fakten eines Laufs zu Unterhaltung, Zweck und Auftrag (ab Tor-Fassung 5): Art der
 * Unterhaltung, wofür der Bot antwortet, ob er hier einen Auftrag hat, und dessen Art.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

import type { ConversationId } from "@paibot/shared/ids";
import type { ConversationKind } from "@paibot/shared/objekte";
import type { AuftragArt } from "@paibot/shared/tor-fassung-5";

/** Ein laufender Auftrag des Bots: die Unterhaltung (der Faden), zu der er gehört, und seine Art. */
export interface LaufAuftrag {
  conversationId: ConversationId;
  art: Exclude<AuftragArt, "keiner">;
}

export interface AuftragFakten {
  conversationKind: "direkt" | "faden";
  zweck: "chat" | "team_entwurf";
  botHatAuftrag: boolean;
  auftragArt: AuftragArt;
}

/**
 * Fakten eines Laufs zu Unterhaltung und Auftrag, nur aus der Datenbank.
 *
 * - Art: Ein Faden (`faden`) gehört einem Team; ein Direkt-Chat und ein Entwurf gehören je einem
 *   Bot und sind für das Tor `direkt`. Der Entwurf („Team mit Pai entwerfen“) hat den Zweck
 *   `team_entwurf`, alles andere `chat`.
 * - Ein Auftrag zählt nur in **seiner** Unterhaltung: Hat der Bot einen Auftrag aus Faden X und
 *   läuft in Unterhaltung Y, ist `botHatAuftrag = false` und `auftragArt = keiner` – der Lauf in Y
 *   steht nicht unter dem Auftrag, dort gelten weder R-016 noch die Grenzen des Baums, wohl aber
 *   die Regeln eines Direkt-Chats.
 *
 * Ohne Auftrag (in diesem Stand immer: die Tabellen für Aufträge kommen später) sind das im
 * Direkt-Chat die Füllwerte der Fassung 5: `direkt`, `chat`, `false`, `keiner`.
 */
export function auftragFakten(input: {
  conversation: { id: ConversationId; kind: ConversationKind };
  auftrag?: LaufAuftrag;
}): AuftragFakten {
  const { conversation, auftrag } = input;
  const hier = auftrag !== undefined && auftrag.conversationId === conversation.id;
  return {
    conversationKind: conversation.kind === "faden" ? "faden" : "direkt",
    zweck: conversation.kind === "entwurf" ? "team_entwurf" : "chat",
    botHatAuftrag: hier,
    auftragArt: hier ? auftrag.art : "keiner",
  };
}
