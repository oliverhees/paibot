/**
 * PaiBot – Tests der Datenschleuse aus Sicht der Web-App: Zustand, Standard über das Tor
 * (Vorbedingung „eingerichtet“) und das Ergebnis der letzten geschützten Anfrage aus den Belegen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import type { ReceiptEntry } from "@paibot/shared/belege";
import { describe, expect, it, vi } from "vitest";
import { belegeSeit, eingerichtet, letzteNummer } from "../modelle/testing";
import { anfrage, Keksdose } from "../zugang/testing";
import { workerAnzeige } from "./ansicht";
import { eingerichtetAus, letzterLaufAus, VERALTET_NACH_MS, workerMeldungAus } from "./schleuse";

vi.setConfig({ testTimeout: 60_000 });

describe("GET /api/datenschleuse", () => {
  it("nicht eingerichtet, Standard aus, noch kein Lauf", async () => {
    const e = await eingerichtet();
    const r = await e.rufe(e.r.schleuse, "GET", "/api/datenschleuse");
    expect(r.status).toBe(200);
    expect(r.body.daten).toEqual({ eingerichtet: false, standard: "off" });
  });

  it("eingerichtet laut Umgebung der Web-App", async () => {
    const e = await eingerichtet({ schleuseInstalliert: true });
    const r = await e.rufe(e.r.schleuse, "GET", "/api/datenschleuse");
    expect(r.body.daten).toMatchObject({ eingerichtet: true });
  });

  it("weist ohne Sitzung ab", async () => {
    const e = await eingerichtet();
    const r = await anfrage(e.u, e.r.schleuse, "GET", "/api/datenschleuse", {
      dose: new Keksdose(),
    });
    expect(r.status).toBe(401);
  });
});

describe("PUT /api/datenschleuse/standard", () => {
  it("„An“ ohne eingerichtete Datenschleuse: das Tor lehnt ab, mit Grund und Belegen", async () => {
    const e = await eingerichtet();
    const vorher = await letzteNummer(e.u);
    const r = await e.rufe(e.r.schleuseStandard, "PUT", "/api/datenschleuse/standard", {
      koerper: { mode: "on" },
    });
    expect(r.status).toBe(409);
    expect(r.body.fehler).toMatchObject({ code: "schleuse_nicht_installiert" });
    expect((await repo.settings.get(e.u.db))?.schleuseModeDefault).toBe("off");
    const belege = await belegeSeit(e.u, vorher);
    expect(belege.map((b) => [b.typ, b.aktion])).toEqual([
      ["decision", "schleuse.umschalten"],
      ["result", "schleuse.umschalten"],
    ]);
    expect(belege[0]?.body).toMatchObject({
      decision: { outcome: "deny" },
      facts: { mode: "on", schleuseInstalled: false, scope: "standard" },
    });
  });

  it("eingerichtet: an und wieder aus, je zwei Belege", async () => {
    const e = await eingerichtet({ schleuseInstalliert: true });
    const vorher = await letzteNummer(e.u);
    const an = await e.rufe(e.r.schleuseStandard, "PUT", "/api/datenschleuse/standard", {
      koerper: { mode: "on" },
    });
    expect(an.status).toBe(200);
    expect((await repo.settings.get(e.u.db))?.schleuseModeDefault).toBe("on");
    const aus = await e.rufe(e.r.schleuseStandard, "PUT", "/api/datenschleuse/standard", {
      koerper: { mode: "off" },
    });
    expect(aus.status).toBe(200);
    expect((await repo.settings.get(e.u.db))?.schleuseModeDefault).toBe("off");
    const belege = await belegeSeit(e.u, vorher);
    expect(belege).toHaveLength(4);
    expect(belege[2]?.body).toMatchObject({ facts: { mode: "off", previousMode: "on" } });
  });

  it("„Aus“ geht auch ohne eingerichtete Datenschleuse", async () => {
    const e = await eingerichtet();
    const r = await e.rufe(e.r.schleuseStandard, "PUT", "/api/datenschleuse/standard", {
      koerper: { mode: "off" },
    });
    expect(r.status).toBe(200);
  });

  it("ungültiger Modus und fehlendes Prüfzeichen", async () => {
    const e = await eingerichtet({ schleuseInstalliert: true });
    const falsch = await e.rufe(e.r.schleuseStandard, "PUT", "/api/datenschleuse/standard", {
      koerper: { mode: "auto" },
    });
    expect(falsch.status).toBe(400);
    const ohne = await e.rufe(e.r.schleuseStandard, "PUT", "/api/datenschleuse/standard", {
      koerper: { mode: "on" },
      pruefzeichen: null,
    });
    expect(ohne.status).toBe(403);
  });
});

describe("letzte Anfrage über die Datenschleuse (aus Belegen)", () => {
  let seq = 100;
  function entscheidung(
    actionId: string,
    fakten: Record<string, unknown>,
    outcome: "allow" | "deny" = "allow",
  ): ReceiptEntry {
    seq -= 1;
    return {
      seq,
      body: {
        type: "decision",
        time: `2026-11-21T10:${String(seq).padStart(2, "0")}:00.000Z`,
        action: { actionId, type: "modell.anfragen" },
        decision: { outcome },
        facts: fakten,
      },
    } as unknown as ReceiptEntry;
  }
  function ergebnis(actionId: string, status: string, code?: string): ReceiptEntry {
    seq -= 1;
    return {
      seq,
      body: {
        type: "result",
        time: "2026-11-21T10:00:00.000Z",
        action: { actionId, type: "modell.anfragen" },
        result: { status, ...(code === undefined ? {} : { code }) },
      },
    } as unknown as ReceiptEntry;
  }

  it("keine geschützte Anfrage: nichts", () => {
    expect(letzterLaufAus([entscheidung("a1", { requestedMode: "off" })])).toBeUndefined();
  });

  it("bereit, gestoppt, nicht bereit, Anbieter-Fehler", () => {
    expect(
      letzterLaufAus([
        ergebnis("a1", "ok"),
        entscheidung("a1", { requestedMode: "on", schleuseReachable: true }),
      ]),
    ).toMatchObject({ art: "bereit" });
    expect(
      letzterLaufAus([
        ergebnis("a2", "error", "schleuse_blockiert"),
        entscheidung("a2", { requestedMode: "on", schleuseReachable: true }),
      ]),
    ).toMatchObject({ art: "blockiert" });
    expect(
      letzterLaufAus([
        ergebnis("a3", "denied", "abgelehnt"),
        entscheidung("a3", { requestedMode: "on", schleuseReachable: false }, "deny"),
      ]),
    ).toMatchObject({ art: "nicht_bereit" });
    expect(
      letzterLaufAus([
        ergebnis("a4", "error", "schluessel_ungueltig"),
        entscheidung("a4", { requestedMode: "on", schleuseReachable: true }),
      ]),
    ).toMatchObject({ art: "anbieter", code: "schluessel_ungueltig" });
  });

  it("nimmt die neueste geschützte Anfrage, ältere zählen nicht", () => {
    const liste = [
      entscheidung("b2", { requestedMode: "off" }),
      ergebnis("b1", "ok"),
      entscheidung("b1", { requestedMode: "on", schleuseReachable: true }),
      entscheidung("b0", { requestedMode: "on", schleuseReachable: false }),
    ];
    expect(letzterLaufAus(liste)).toMatchObject({ art: "bereit" });
  });
});

describe("Zustand vom Worker", () => {
  const jetzt = new Date("2026-11-21T10:00:00.000Z");
  const vor = (ms: number) => new Date(jetzt.getTime() - ms);

  it("ohne Meldung kein Zustand; eine alte Meldung gilt als veraltet", () => {
    expect(workerMeldungAus(undefined, jetzt)).toBeUndefined();
    expect(workerMeldungAus({ state: "bereit", checkedAt: vor(60_000) }, jetzt)).toEqual({
      zustand: "bereit",
      geprueft: vor(60_000).toISOString(),
      veraltet: false,
    });
    expect(
      workerMeldungAus({ state: "bereit", checkedAt: vor(VERALTET_NACH_MS + 1) }, jetzt)?.veraltet,
    ).toBe(true);
  });

  it("eingerichtet, sobald der Worker etwas anderes als „aus“ meldet, oder laut eigener Umgebung", () => {
    const m = (zustand: "aus" | "bereit" | "nicht_erreichbar" | "schluessel_falsch") => ({
      zustand,
      geprueft: jetzt.toISOString(),
      veraltet: false,
    });
    expect(eingerichtetAus(false, undefined)).toBe(false);
    expect(eingerichtetAus(false, m("aus"))).toBe(false);
    expect(eingerichtetAus(false, m("bereit"))).toBe(true);
    expect(eingerichtetAus(false, m("nicht_erreichbar"))).toBe(true);
    expect(eingerichtetAus(false, m("schluessel_falsch"))).toBe(true);
    expect(eingerichtetAus(true, undefined)).toBe(true);
  });

  it("die Anzeige nennt jeden Zustand mit Ausweg, veraltet geht vor", () => {
    const zeit = "21.11.2026, 11:00";
    const a = (
      zustand: "aus" | "bereit" | "nicht_erreichbar" | "schluessel_falsch",
      veraltet = false,
    ) => workerAnzeige({ zustand, geprueft: jetzt.toISOString(), veraltet }, zeit);
    expect(a("bereit")).toMatchObject({ art: "ok", marke: "bereit" });
    expect(a("bereit").ausweg).toBeUndefined();
    expect(a("nicht_erreichbar")).toMatchObject({ art: "fehler" });
    expect(a("nicht_erreichbar").ausweg).toContain("docker compose ps");
    expect(a("schluessel_falsch").ausweg).toContain("SCHLEUSE_KEY");
    expect(a("bereit", true)).toMatchObject({ art: "warn", marke: "Worker meldet sich nicht" });
    expect(a("bereit", true).text).toContain(zeit);
    for (const z of ["aus", "bereit", "nicht_erreichbar", "schluessel_falsch"] as const) {
      expect(a(z).geprueft).toContain(zeit);
    }
  });

  it("GET zeigt die Meldung des Workers; die Web-App selbst kennt keine Datenschleuse", async () => {
    const e = await eingerichtet();
    await repo.schleuse.report(e.u.db, { state: "schluessel_falsch" });
    const r = await e.rufe(e.r.schleuse, "GET", "/api/datenschleuse");
    expect(r.status).toBe(200);
    expect(r.body.daten).toMatchObject({
      eingerichtet: true,
      worker: { zustand: "schluessel_falsch", veraltet: false },
    });
  });

  it("meldet der Worker „aus“, bleibt es „nicht eingerichtet“, und das Tor lehnt „An“ ab", async () => {
    const e = await eingerichtet();
    await repo.schleuse.report(e.u.db, { state: "aus" });
    const r = await e.rufe(e.r.schleuseStandard, "PUT", "/api/datenschleuse/standard", {
      koerper: { mode: "on" },
    });
    expect(r.status).toBe(409);
    expect(r.body.fehler).toMatchObject({ code: "schleuse_nicht_installiert" });
  });

  it("meldet der Worker die Datenschleuse, lässt sich der Standard einschalten (Fakt für das Tor)", async () => {
    const e = await eingerichtet();
    await repo.schleuse.report(e.u.db, { state: "bereit" });
    const vorher = await letzteNummer(e.u);
    const r = await e.rufe(e.r.schleuseStandard, "PUT", "/api/datenschleuse/standard", {
      koerper: { mode: "on" },
    });
    expect(r.status).toBe(200);
    expect((await repo.settings.get(e.u.db))?.schleuseModeDefault).toBe("on");
    const belege = await belegeSeit(e.u, vorher);
    expect(belege[0]?.body).toMatchObject({
      decision: { outcome: "allow" },
      facts: { schleuseInstalled: true, scope: "standard" },
    });
  });
});
