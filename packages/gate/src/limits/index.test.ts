/**
 * PaiBot – Tests der Grenzen G-01 bis G-05 und G-16 bis G-18.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { ACTIONS, type ActionRequest, type Facts } from "@paibot/shared/aktionen";
import { LIMIT_NAMES, limitCheckSchema } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { DECIDED_ACTIONS as ACTION_TYPES, sampleAction, sampleFacts } from "../testdaten";
import {
  checkLimits,
  LIMIT_FUNCTIONS,
  limitAnbieterRegion,
  limitLaenge,
  limitLaufAufrufe,
  limitLaufSchritte,
  limitLaufToken,
  limitNotAus,
  limitSchleuseGefordert,
  limitTagesbudget,
} from "./index";

const ask = sampleAction("modell.anfragen");
const send = sampleAction("nachricht.senden");

function askFacts(change: Partial<Facts<"modell.anfragen">>): Facts {
  return { ...sampleFacts("modell.anfragen"), ...change } as Facts;
}
function sendFacts(change: Partial<Facts<"nachricht.senden">>): Facts {
  return { ...sampleFacts("nachricht.senden"), ...change } as Facts;
}

describe("G-01 schleuse_gefordert", () => {
  it.each([
    [{ requestedMode: "on", route: "schleuse", schleuseReachable: true }, "ok", "schleuse"],
    [{ requestedMode: "on", route: "direct", schleuseReachable: true }, "verletzt", "direct"],
    [{ requestedMode: "on", route: "schleuse", schleuseReachable: false }, "verletzt", "schleuse"],
    [{ requestedMode: "on", route: "direct", schleuseReachable: false }, "verletzt", "direct"],
    [{ requestedMode: "off", route: "direct", schleuseReachable: false }, "ok", "direct"],
    [{ requestedMode: "off", route: "schleuse", schleuseReachable: true }, "ok", "schleuse"],
  ] as const)("%o → %s", (change, result, value) => {
    expect(limitSchleuseGefordert(ask, askFacts(change))).toEqual({
      name: "schleuse_gefordert",
      result,
      value,
    });
  });

  it("fehlt der Modus, wird die Datenschleuse verlangt", () => {
    const { requestedMode: _, ...facts } = sampleFacts("modell.anfragen");
    const direct = { ...facts, route: "direct" } as unknown as Facts;
    expect(limitSchleuseGefordert(ask, direct).result).toBe("verletzt");
  });
});

describe("G-02 anbieter_region", () => {
  it.each([
    [{ region: "eu", providerEnabled: true }, "ok"],
    [{ region: "local", providerEnabled: true }, "ok"],
    [{ region: "non_eu", providerEnabled: true }, "verletzt"],
    [{ region: "eu", providerEnabled: false }, "verletzt"],
    [{ region: "local", providerEnabled: false }, "verletzt"],
  ] as const)("%o → %s", (change, result) => {
    expect(limitAnbieterRegion(ask, askFacts(change))).toEqual({
      name: "anbieter_region",
      result,
      value: change.region,
    });
  });
});

describe("G-03 laenge", () => {
  it.each([
    [{ inputChars: 32000, maxInputChars: 32000 }, "ok"],
    [{ inputChars: 0, maxInputChars: 1 }, "ok"],
    [{ inputChars: 32001, maxInputChars: 32000 }, "verletzt"],
  ] as const)("nachricht.senden %o → %s", (change, result) => {
    expect(limitLaenge(send, sendFacts(change))).toEqual({
      name: "laenge",
      result,
      value: change.inputChars,
    });
  });

  it.each([
    [{ inputChars: 32000, maxOutputTokens: 2048, botMaxOutputTokens: 2048 }, "ok"],
    [{ inputChars: 32001, maxOutputTokens: 1024, botMaxOutputTokens: 2048 }, "verletzt"],
    [{ inputChars: 10, maxOutputTokens: 2049, botMaxOutputTokens: 2048 }, "verletzt"],
  ] as const)("modell.anfragen %o → %s", (change, result) => {
    expect(limitLaenge(ask, askFacts(change))).toEqual({
      name: "laenge",
      result,
      value: change.inputChars,
    });
  });
});

describe("G-04 tagesbudget", () => {
  it.each([
    [{ tokensToday: 0, dailyTokenBudget: 1 }, "ok"],
    [{ tokensToday: 99999, dailyTokenBudget: 100000 }, "ok"],
    [{ tokensToday: 100000, dailyTokenBudget: 100000 }, "verletzt"],
    [{ tokensToday: 100001, dailyTokenBudget: 100000 }, "verletzt"],
  ] as const)("%o → %s", (change, result) => {
    expect(limitTagesbudget(ask, askFacts(change))).toEqual({
      name: "tagesbudget",
      result,
      value: change.tokensToday,
    });
  });

  it("ohne Budget entfällt die Grenze", () => {
    const { dailyTokenBudget: _, ...facts } = sampleFacts("modell.anfragen");
    expect(limitTagesbudget(ask, { ...facts, tokensToday: 10 ** 9 } as Facts)).toEqual({
      name: "tagesbudget",
      result: "entfaellt",
    });
  });
});

describe("G-05 not_aus", () => {
  it.each([
    [ask, askFacts({ killSwitch: true }), "verletzt", true],
    [ask, askFacts({ killSwitch: false }), "ok", false],
    [send, sendFacts({ killSwitch: true }), "verletzt", true],
    [send, sendFacts({ killSwitch: false }), "ok", false],
  ] as const)("%#", (action, facts, result, value) => {
    expect(limitNotAus(action, facts)).toEqual({ name: "not_aus", result, value });
  });

  it("fehlt der Schalter bei einer betroffenen Aktion, gilt er als an", () => {
    const { killSwitch: _, ...facts } = sampleFacts("modell.anfragen");
    expect(limitNotAus(ask, facts as unknown as Facts).result).toBe("verletzt");
  });

  it("betrifft genau die Aktionen, deren Fakten den Schalter kennen", () => {
    for (const type of ACTION_TYPES) {
      const knows = Object.hasOwn(ACTIONS[type].facts.shape, "killSwitch");
      const action = sampleAction(type) as ActionRequest;
      const { killSwitch: _, ...without } = sampleFacts(type) as Record<string, unknown>;
      expect(limitNotAus(action, without as Facts).result, type).toBe(
        knows ? "verletzt" : "entfaellt",
      );
    }
  });

  it("werkzeug.aufrufen: Not-Aus an → verletzt, aus → ok; die übrigen Grenzen entfallen", () => {
    const tool = sampleAction("werkzeug.aufrufen") as ActionRequest;
    const on = { ...sampleFacts("werkzeug.aufrufen"), killSwitch: true } as Facts;
    expect(limitNotAus(tool, on)).toEqual({ name: "not_aus", result: "verletzt", value: true });
    const checks = checkLimits(tool, sampleFacts("werkzeug.aufrufen") as Facts);
    expect(checks.map((c) => c.result)).toEqual([
      "entfaellt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      "ok",
      "entfaellt",
      "ok",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      // Fassung 4: G-15 gilt auch beim Werkzeug-Aufruf (Bot nicht pausiert), die übrigen entfallen.
      "ok",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      // Fassung 5: nur G-42 (Werkzeuge nur ohne Auftrag) gilt beim Werkzeug-Aufruf.
      "entfaellt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      "ok",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
    ]);
  });
});

describe("fehlende oder falsche Fakten lassen nichts durch", () => {
  it("modell.anfragen ohne Fakten verletzt alle zutreffenden Grenzen", () => {
    const checks = checkLimits(ask, {} as Facts);
    expect(checks.map((c) => c.result)).toEqual([
      "verletzt",
      "verletzt",
      "verletzt",
      "entfaellt",
      "verletzt",
      "verletzt",
      "entfaellt",
      "verletzt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      // Fassung 4: ohne den Fakt `botPaused` ist G-15 verletzt, die anderen neuen entfallen.
      "verletzt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      // Fassung 5: ohne `auftragArt` gelten Budget und Zeit des Baums (G-11, G-12) und sind
      // verletzt; die übrigen neuen entfallen.
      "entfaellt",
      "entfaellt",
      "verletzt",
      "verletzt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
      "entfaellt",
    ]);
  });

  it("Text statt Zahl bei der Länge ist verletzt", () => {
    const facts = { ...sampleFacts("nachricht.senden"), inputChars: "10" } as unknown as Facts;
    expect(limitLaenge(send, facts)).toEqual({ name: "laenge", result: "verletzt" });
  });

  it("Werte aus dem Prototyp zählen nicht", () => {
    const facts = Object.create({ killSwitch: false }) as Facts;
    expect(limitNotAus(send, facts).result).toBe("verletzt");
  });
});

/**
 * Aktionen der Fassungen 4 und 5 mit einer eigenen Grenze (G-03 für den Zettel, G-32 bis G-34,
 * G-05, die Grenzen eines Auftrags).
 */
const MIT_EIGENER_GRENZE: readonly string[] = [
  "bot.anlegen",
  "team.entwurf_erstellen",
  "team.entwurf_anlegen",
  "faden.anlegen",
  "auftrag.uebergeben",
  "auftrag.melden",
  "auftrag.zurueckgeben",
  "auftrag.zettel_aendern",
  "auftrag.budget_erhoehen",
];

describe("checkLimits", () => {
  it.each(ACTION_TYPES)(
    "%s: je Grenze ein gültiger Eintrag in der Reihenfolge der Fassung",
    (type) => {
      const checks = checkLimits(sampleAction(type) as ActionRequest, sampleFacts(type) as Facts);
      expect(checks.map((c) => c.name)).toEqual([...LIMIT_NAMES]);
      for (const check of checks) {
        expect(limitCheckSchema.safeParse(check).success).toBe(true);
        expect(check.result).not.toBe("verletzt");
      }
    },
  );

  it.each(
    ACTION_TYPES.filter(
      (t) =>
        t !== "modell.anfragen" &&
        t !== "nachricht.senden" &&
        t !== "werkzeug.aufrufen" &&
        t !== "werkzeug.ausfuehren" &&
        // Neu erzeugen führt zu einem Lauf des Bots: der Not-Aus (G-05) gilt.
        t !== "antwort.neu_erzeugen" &&
        // Fassung 4: diese Aktionen des Besitzers haben je eine eigene Grenze (unten).
        !MIT_EIGENER_GRENZE.includes(t),
    ),
  )("%s: keine Grenze betrifft die Verwaltungsaktion", (type) => {
    const checks = checkLimits(sampleAction(type) as ActionRequest, sampleFacts(type) as Facts);
    expect(checks.every((c) => c.result === "entfaellt")).toBe(true);
  });

  it.each([
    ["bot.anlegen", { bots_gesamt: "ok" }],
    ["team.entwurf_erstellen", { entwuerfe_je_tag: "ok", not_aus: "ok" }],
    ["team.entwurf_anlegen", { entwurf_umfang: "ok", bots_gesamt: "ok", not_aus: "ok" }],
    ["faden.anlegen", { laenge: "ok" }],
    [
      "auftrag.uebergeben",
      {
        laenge: "ok",
        not_aus: "ok",
        bot_bereit: "ok",
        auftrag_tiefe: "ok",
        auftrag_anzahl: "ok",
        auftrag_zeit: "ok",
        kein_kreis: "ok",
        uebergaben_je_lauf: "ok",
        auftrag_breite: "ok",
        auftraege_je_mitglied: "ok",
      },
    ],
    ["auftrag.melden", { not_aus: "ok" }],
    ["auftrag.zurueckgeben", { laenge: "ok", not_aus: "ok" }],
    ["auftrag.zettel_aendern", { laenge: "ok" }],
    ["auftrag.budget_erhoehen", { zuschlaege_je_baum: "ok" }],
  ] as const)("%s: nur die eigenen Grenzen gelten, die übrigen entfallen", (type, erwartet) => {
    const checks = checkLimits(sampleAction(type) as ActionRequest, sampleFacts(type) as Facts);
    const gelten = Object.fromEntries(
      checks.filter((c) => c.result !== "entfaellt").map((c) => [c.name, c.result]),
    );
    expect(gelten).toEqual(erwartet);
  });

  it("Antwort neu erzeugen: Not-Aus (G-05) greift, sonst keine Grenze", () => {
    const type = "antwort.neu_erzeugen";
    const ok = checkLimits(sampleAction(type) as ActionRequest, sampleFacts(type) as Facts);
    expect(ok.find((c) => c.name === "not_aus")?.result).toBe("ok");
    expect(ok.filter((c) => c.name !== "not_aus").every((c) => c.result === "entfaellt")).toBe(
      true,
    );
    const aus = checkLimits(
      sampleAction(type) as ActionRequest,
      {
        ...sampleFacts(type),
        killSwitch: true,
      } as Facts,
    );
    expect(aus.find((c) => c.name === "not_aus")?.result).toBe("verletzt");
  });

  it("jede Grenze liefert ihren eigenen Namen", () => {
    for (const [name, fn] of Object.entries(LIMIT_FUNCTIONS)) {
      expect(fn(ask, sampleFacts("modell.anfragen") as Facts).name).toBe(name);
    }
  });
});

describe("G-16 bis G-18: Grenzen eines Laufs", () => {
  it("G-16: Schritt kleiner als die Höchstzahl, sonst verletzt; Wert ist der Schritt", () => {
    expect(limitLaufSchritte(ask, askFacts({ step: 0, maxSteps: 1 }))).toEqual({
      name: "lauf_schritte",
      result: "ok",
      value: 0,
    });
    expect(limitLaufSchritte(ask, askFacts({ step: 1, maxSteps: 1 }))).toEqual({
      name: "lauf_schritte",
      result: "verletzt",
      value: 1,
    });
  });

  it("G-17: Aufrufe des Laufs kleiner als die Höchstzahl, nur bei werkzeug.aufrufen", () => {
    const tool = sampleAction("werkzeug.aufrufen") as ActionRequest;
    const facts = (change: Record<string, unknown>) =>
      ({ ...sampleFacts("werkzeug.aufrufen"), ...change }) as Facts;
    expect(limitLaufAufrufe(tool, facts({ callsInRun: 15 })).result).toBe("ok");
    expect(limitLaufAufrufe(tool, facts({ callsInRun: 16 }))).toEqual({
      name: "lauf_aufrufe",
      result: "verletzt",
      value: 16,
    });
    expect(limitLaufAufrufe(ask, askFacts({})).result).toBe("entfaellt");
  });

  it("G-18: Token des Laufs plus Schätzung höchstens die Höchstzahl; Wert ist die Summe", () => {
    expect(
      limitLaufToken(ask, askFacts({ runTokens: 100, stepTokenEstimate: 400, maxRunTokens: 500 })),
    ).toEqual({ name: "lauf_token", result: "ok", value: 500 });
    expect(
      limitLaufToken(ask, askFacts({ runTokens: 101, stepTokenEstimate: 400, maxRunTokens: 500 })),
    ).toEqual({ name: "lauf_token", result: "verletzt", value: 501 });
  });

  it("fehlender oder nicht ganzzahliger Fakt ist verletzt, nie entfällt", () => {
    const raw = (change: Record<string, unknown>) =>
      ({ ...sampleFacts("modell.anfragen"), ...change }) as unknown as Facts;
    for (const change of [{ step: undefined }, { step: 0.5 }, { maxSteps: "1" }]) {
      expect(limitLaufSchritte(ask, raw(change)).result).toBe("verletzt");
    }
    for (const change of [
      { runTokens: undefined },
      { stepTokenEstimate: 1.5 },
      { maxRunTokens: null },
    ]) {
      expect(limitLaufToken(ask, raw(change)).result).toBe("verletzt");
    }
    const tool = sampleAction("werkzeug.aufrufen") as ActionRequest;
    const { callsInRun: _, ...without } = sampleFacts("werkzeug.aufrufen");
    expect(limitLaufAufrufe(tool, without as unknown as Facts).result).toBe("verletzt");
  });

  it("andere Aktionen: entfällt", () => {
    for (const type of ACTION_TYPES.filter((t) => t !== "modell.anfragen")) {
      const action = sampleAction(type) as ActionRequest;
      expect(limitLaufSchritte(action, sampleFacts(type) as Facts).result, type).toBe("entfaellt");
      expect(limitLaufToken(action, sampleFacts(type) as Facts).result, type).toBe("entfaellt");
    }
  });
});
