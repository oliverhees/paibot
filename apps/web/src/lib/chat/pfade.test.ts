/**
 * PaiBot – prüft die Pfade der Chat-Routen im Browser gegen den Routen-Vertrag.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { newId } from "@paibot/shared/ids";
import { describe, expect, it } from "vitest";
import { routenPfad } from "../routen";
import { CHAT_PFADE } from "./pfade";

describe("CHAT_PFADE", () => {
  it("entsprechen den Pfaden des Vertrags", () => {
    const id = newId("conversation");
    const laufId = newId("run");
    expect(CHAT_PFADE.unterhaltungen()).toBe(routenPfad("unterhaltungen", {}));
    expect(CHAT_PFADE.unterhaltung(id)).toBe(routenPfad("unterhaltung", { id }));
    expect(CHAT_PFADE.nachrichten(id)).toBe(routenPfad("nachrichtSenden", { id }));
    expect(CHAT_PFADE.schleuse(id)).toBe(routenPfad("unterhaltungSchleuse", { id }));
    expect(CHAT_PFADE.abbrechen(id, laufId)).toBe(routenPfad("laufAbbrechen", { id, laufId }));
  });
});
