/**
 * PaiBot – Tests der Route `PUT /api/notaus`: Sitzung, CSRF, Eingabe, Einschalten mit Beleg,
 * Aufheben nur mit bestätigtem Passwort, Limit für Passwort-Versuche und die Wirkung auf neue
 * Nachrichten an den Bot.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { describe, expect, it, vi } from "vitest";
import { einrichtungAbschliessen } from "../zugang/einrichtung";
import {
  anfrage,
  type Keksdose,
  TEST_CODE,
  TEST_PASSWORT,
  type TestUmgebung,
  testUmgebung,
  vorabDose,
} from "../zugang/testing";
import { type NotAusGeschaltet, notAusAn, notAusUmschalten } from "./notaus";

vi.setConfig({ testTimeout: 60_000 });

const PFAD = "/api/notaus";

async function eingerichtet(): Promise<{ u: TestUmgebung; dose: Keksdose }> {
  const u = await testUmgebung();
  u.neuerCode(TEST_CODE);
  const abschluss = u.handler("einrichtungAbschliessen", async (k) => ({
    daten: await einrichtungAbschliessen(k),
  }));
  const dose = vorabDose();
  const r = await anfrage(u, abschluss, "POST", "/api/einrichtung", {
    dose,
    koerper: {
      setupCode: TEST_CODE,
      password: TEST_PASSWORT,
      passwordRepeat: TEST_PASSWORT,
      schleuseModeDefault: "off",
      botName: "Pai",
    },
  });
  if (r.status !== 200) throw new Error(`Einrichtung: ${r.status}`);
  return { u, dose };
}

function schalter(u: TestUmgebung) {
  return u.handler("notausUmschalten", async (k) => ({ daten: await notAusUmschalten(k) }));
}

async function umschalten(
  u: TestUmgebung,
  dose: Keksdose | undefined,
  koerper: unknown,
  extra: { pruefzeichen?: null; origin?: string } = {},
) {
  return anfrage(u, schalter(u), "PUT", PFAD, {
    ...(dose === undefined ? {} : { dose }),
    koerper,
    ...extra,
  });
}

async function neueBelege(u: TestUmgebung, vorher: number) {
  return (await repo.belege.listFrom(u.db)).slice(vorher).map((b) => b.body);
}

describe("PUT /api/notaus", () => {
  it("ohne Sitzung: 401, nichts geändert", async () => {
    const { u } = await eingerichtet();
    const r = await umschalten(u, undefined, { on: true });
    expect(r.status).toBe(401);
    expect(await notAusAn(u.db)).toBe(false);
  });

  it("CSRF: ohne Prüfzeichen oder fremde Herkunft 403", async () => {
    const { u, dose } = await eingerichtet();
    expect((await umschalten(u, dose, { on: true }, { pruefzeichen: null })).status).toBe(403);
    expect(
      (await umschalten(u, dose, { on: true }, { origin: "https://boese.example" })).status,
    ).toBe(403);
    expect(await notAusAn(u.db)).toBe(false);
  });

  it.each([
    ["ohne Schalter", {}],
    ["Text statt Schalter", { on: "ja" }],
    ["Passwort beim Einschalten", { on: true, currentPassword: TEST_PASSWORT }],
    ["fremdes Feld", { on: true, killSwitch: true }],
    ["leeres Passwort", { on: false, currentPassword: "" }],
  ])("%s: 400, kein Beleg", async (_name, koerper) => {
    const { u, dose } = await eingerichtet();
    const vorher = (await repo.belege.listFrom(u.db)).length;
    const r = await umschalten(u, dose, koerper);
    expect(r.status).toBe(400);
    expect(r.body.fehler?.code).toBe("eingabe_ungueltig");
    expect(await neueBelege(u, vorher)).toEqual([]);
  });

  it("Einschalten mit Sitzung: Not-Aus an, Belege Entscheidung und Ergebnis", async () => {
    const { u, dose } = await eingerichtet();
    const vorher = (await repo.belege.listFrom(u.db)).length;
    const r = await umschalten(u, dose, { on: true });
    expect(r.status).toBe(200);
    const daten = r.body.daten as NotAusGeschaltet;
    expect(daten.an).toBe(true);
    expect(await notAusAn(u.db)).toBe(true);
    const belege = await neueBelege(u, vorher);
    expect(belege.map((b) => b.type)).toEqual(["decision", "result"]);
    const [entscheidung, ergebnis] = belege;
    if (entscheidung?.type !== "decision" || ergebnis?.type !== "result") throw new Error();
    expect(entscheidung.action).toMatchObject({ type: "notaus.umschalten", actor: "besitzer" });
    expect(entscheidung.facts).toEqual({
      credential: "sitzung",
      on: true,
      wasOn: false,
      currentPasswordVerified: false,
    });
    expect(ergebnis.result).toEqual({ status: "ok" });
    expect(daten.beleg.nummer).toBeGreaterThan(0);
    // Das Passwort steht nirgends in den Belegen.
    expect(JSON.stringify(belege)).not.toContain(TEST_PASSWORT);
  });

  it("Aufheben ohne Passwort: das Tor lehnt ab (V-10), Not-Aus bleibt an", async () => {
    const { u, dose } = await eingerichtet();
    await umschalten(u, dose, { on: true });
    const vorher = (await repo.belege.listFrom(u.db)).length;
    const r = await umschalten(u, dose, { on: false });
    expect(r.status).toBe(401);
    expect(r.body.fehler?.code).toBe("passwort_falsch");
    expect(await notAusAn(u.db)).toBe(true);
    const belege = await neueBelege(u, vorher);
    expect(belege.map((b) => b.type)).toEqual(["decision", "result"]);
    expect(belege[1]).toMatchObject({ result: { status: "denied", code: "passwort_falsch" } });
  });

  it("Aufheben mit falschem Passwort: abgelehnt, Not-Aus bleibt an", async () => {
    const { u, dose } = await eingerichtet();
    await umschalten(u, dose, { on: true });
    const r = await umschalten(u, dose, { on: false, currentPassword: "Falsches-Passwort-1" });
    expect(r.status).toBe(401);
    expect(r.body.fehler?.code).toBe("passwort_falsch");
    expect(await notAusAn(u.db)).toBe(true);
  });

  it("Aufheben mit richtigem Passwort: der Besitzer kann den Not-Aus immer aufheben", async () => {
    const { u, dose } = await eingerichtet();
    await umschalten(u, dose, { on: true });
    expect(await notAusAn(u.db)).toBe(true);
    const r = await umschalten(u, dose, { on: false, currentPassword: TEST_PASSWORT });
    expect(r.status).toBe(200);
    expect((r.body.daten as NotAusGeschaltet).an).toBe(false);
    expect(await notAusAn(u.db)).toBe(false);
  });

  it("Passwort-Versuche zählen: nach fünf falschen 429, Einschalten zählt nie", async () => {
    const { u, dose } = await eingerichtet();
    for (let i = 0; i < 8; i++) expect((await umschalten(u, dose, { on: true })).status).toBe(200);
    for (let i = 0; i < 5; i++) {
      const r = await umschalten(u, dose, { on: false, currentPassword: `Falsch-${i}-abcdef` });
      expect(r.status).toBe(401);
    }
    const sechster = await umschalten(u, dose, { on: false, currentPassword: TEST_PASSWORT });
    expect(sechster.status).toBe(429);
    expect(await notAusAn(u.db)).toBe(true);
  });
});
