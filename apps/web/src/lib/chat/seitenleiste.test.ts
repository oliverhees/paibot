/**
 * PaiBot – Tests der Unterhaltungen in der Seitenleiste: Reihenfolge, und dass die Zuordnung zum
 * Bot kein Update verliert. Gegenprobe zum Befund „Unterhaltung verschwindet nach dem Senden oder
 * Umbenennen aus der Seitenleiste“: Die Liste gruppiert nach `botId`, also muss jede Änderung die
 * Kennung des Bots behalten – auch wenn der Aufrufer sie nicht mitschickt. Zweite Sicherung ist
 * der Vertrag selbst: `unterhaltungMerken` nimmt `UnterhaltungUpdate`, dort ist `botId` Pflicht
 * (darf leer sein), also fällt ein Aufruf ohne Zuordnung schon im Typecheck auf.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { describe, expect, it } from "vitest";
import { merken, neuesteZuerst, unterhaltungenVon } from "./seitenleiste";
import type { UnterhaltungUpdate } from "./typen";

const PAI = "bot_pai";
const MILA = "bot_mila";

// Wie ein Live-Update aus dem Browser: `botId` steht immer da, auch leer (`UnterhaltungUpdate`).
const u = (id: string, zuletzt: string, botId?: string): UnterhaltungUpdate => ({
  id,
  titel: `Titel ${id}`,
  zuletzt,
  botId,
});

describe("Unterhaltungen der Seitenleiste", () => {
  it("sortiert neueste zuerst und lässt die Vorlage unberührt", () => {
    const liste = [u("a", "2026-11-01T10:00:00Z"), u("b", "2026-11-02T10:00:00Z")];
    expect(neuesteZuerst(liste).map((x) => x.id)).toEqual(["b", "a"]);
    expect(liste.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("nimmt eine neue Unterhaltung mit ihrem Bot auf; sie steht unter diesem Bot", () => {
    const vorher = [u("alt", "2026-11-01T10:00:00Z", PAI)];
    const nachher = merken(vorher, u("neu", "2026-11-03T10:00:00Z", MILA));
    expect(nachher.map((x) => x.id)).toEqual(["neu", "alt"]);
    expect(unterhaltungenVon(nachher, MILA).map((x) => x.id)).toEqual(["neu"]);
    expect(unterhaltungenVon(nachher, PAI).map((x) => x.id)).toEqual(["alt"]);
  });

  // Gegenprobe zum Befund: ersetzt `merken` den Eintrag einfach, fällt die Unterhaltung aus ihrer
  // Gruppe und verschwindet aus der Seitenleiste, bis die Seite neu geladen wird.
  it("ein Update ohne Bot behält den Bot des bisherigen Eintrags", () => {
    const vorher = [u("x", "2026-11-01T10:00:00Z", PAI)];
    const nachher = merken(vorher, u("x", "2026-11-04T10:00:00Z"));
    expect(nachher[0]).toMatchObject({ id: "x", botId: PAI, zuletzt: "2026-11-04T10:00:00Z" });
    expect(unterhaltungenVon(nachher, PAI).map((x) => x.id)).toEqual(["x"]);
  });

  it("ein Update mit Bot gewinnt gegen den bisherigen Eintrag", () => {
    const nachher = merken(
      [u("x", "2026-11-01T10:00:00Z", PAI)],
      u("x", "2026-11-04T10:00:00Z", MILA),
    );
    expect(nachher[0]).toMatchObject({ id: "x", botId: MILA });
  });

  it("die Unterhaltung steht genau einmal in der Liste, auch nach mehreren Updates", () => {
    let liste = merken([], u("x", "2026-11-01T10:00:00Z", PAI));
    liste = merken(liste, u("x", "2026-11-02T10:00:00Z"));
    liste = merken(liste, u("x", "2026-11-03T10:00:00Z"));
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ botId: PAI, zuletzt: "2026-11-03T10:00:00Z" });
  });

  it("ohne Bot (Faden eines Teams) und ohne gefragten Bot bleibt die Auswahl leer", () => {
    const liste = [u("faden", "2026-11-01T10:00:00Z"), u("mit", "2026-11-02T10:00:00Z", PAI)];
    expect(unterhaltungenVon(liste, undefined)).toEqual([]);
    expect(unterhaltungenVon(liste, MILA)).toEqual([]);
    expect(unterhaltungenVon(liste, PAI).map((x) => x.id)).toEqual(["mit"]);
  });
});
