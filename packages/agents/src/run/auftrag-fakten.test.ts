/**
 * PaiBot – Test: Fakten eines Laufs zu Unterhaltung, Zweck und Auftrag (ab Tor-Fassung 5).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

import { newId } from "@paibot/shared/ids";
import { FUELLWERTE_5 } from "@paibot/shared/tor-fassung-5";
import { describe, expect, it } from "vitest";
import { auftragFakten } from "./auftrag-fakten";

describe("auftragFakten", () => {
  const x = newId("conversation");
  const y = newId("conversation");

  it("ohne Auftrag im Direkt-Chat: genau die Füllwerte der Fassung 5", () => {
    const { conversationKind, zweck, botHatAuftrag, auftragArt } = auftragFakten({
      conversation: { id: y, kind: "direkt" },
    });
    expect({ conversationKind, zweck, botHatAuftrag, auftragArt }).toEqual(
      FUELLWERTE_5["modell.anfragen"],
    );
  });

  // Gegenprobe: `hier` ohne Vergleich der Unterhaltung → botHatAuftrag wird true (rot).
  it("Auftrag aus Faden X, Lauf in Unterhaltung Y: kein Auftrag, keine Art", () => {
    expect(
      auftragFakten({
        conversation: { id: y, kind: "direkt" },
        auftrag: { conversationId: x, art: "uebergabe" },
      }),
    ).toMatchObject({ botHatAuftrag: false, auftragArt: "keiner", conversationKind: "direkt" });
  });

  it("Auftrag in seinem Faden: Auftrag mit seiner Art", () => {
    expect(
      auftragFakten({
        conversation: { id: x, kind: "faden" },
        auftrag: { conversationId: x, art: "uebergabe" },
      }),
    ).toEqual({
      conversationKind: "faden",
      zweck: "chat",
      botHatAuftrag: true,
      auftragArt: "uebergabe",
    });
  });

  // Gegenprobe: Entwurf als `chat` → rot.
  it("ein Entwurf („Team mit Pai entwerfen“) ist für das Tor ein Direkt-Chat mit Zweck team_entwurf", () => {
    expect(auftragFakten({ conversation: { id: y, kind: "entwurf" } })).toMatchObject({
      conversationKind: "direkt",
      zweck: "team_entwurf",
      botHatAuftrag: false,
      auftragArt: "keiner",
    });
  });
});
