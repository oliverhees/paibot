/**
 * PaiBot – Tests zur Fassung des Tors in Belegen: Schreiben nur in der aktuellen Fassung, Lesen
 * nach der Form, Inhalt je Fassung in der Ketten-Prüfung, Urteil „nicht prüfbar“, Hinweis
 * „Rückschritt“ und Ausgang 4 des Befehls.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { isPaiBotError } from "@paibot/shared/fehler";
import { newId } from "@paibot/shared/ids";
import { t } from "@paibot/shared/texte";
import { GATE_FORMAT } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { buildReceipt, type ReceiptDraft } from "./build";
import { CLI_EXIT, runCli } from "./cli";
import { parseJsonl } from "./jsonl";
import { reevaluate } from "./nachrechnen";
import {
  FASSUNG_RULES,
  ketteNeuereFassung,
  ketteUnbekanntesFeld,
  neuereFassung,
  neueresErgebnis,
  TestKette,
  unbekannteAktion,
} from "./testdaten/fassung-ketten";
import { sendAction, sendFacts, testDecision } from "./testhilfen";
import { verifyChain, verifyReceipt } from "./verify";

function link() {
  return {
    id: newId("receipt"),
    seq: 2,
    time: "2026-11-21T10:00:00.000Z",
    prev: `sha256:${"ab".repeat(32)}`,
    keyId: newId("key"),
  };
}

function draftWith(gateFormat: number | undefined): ReceiptDraft {
  const action = sendAction();
  const facts = sendFacts();
  const { gateFormat: _, ...decision } = testDecision(action, facts);
  return {
    type: "decision",
    action,
    decision: (gateFormat === undefined ? decision : { ...decision, gateFormat }) as never,
    facts,
  };
}

async function cli(text: string): Promise<{ exit: number; out: string[] }> {
  const out: string[] = [];
  const exit = await runCli(["kette.jsonl"], {
    readFile: async () => text,
    out: (line) => out.push(line),
    err: (line) => out.push(line),
  });
  return { exit, out };
}

describe("Schreiben: nur die aktuelle Fassung", () => {
  it("buildReceipt weist eine Entscheidung ab, deren Fassung nicht GATE_FORMAT ist", () => {
    for (const format of [undefined, 0, 2, 99]) {
      let caught: unknown;
      try {
        buildReceipt(draftWith(format), link());
      } catch (error) {
        caught = error;
      }
      expect(isPaiBotError(caught) && caught.code, String(format)).toBe("eingabe_ungueltig");
    }
  });

  it("Fassung 1 steht nicht im Beleg", () => {
    const body = buildReceipt(draftWith(GATE_FORMAT), link());
    expect(GATE_FORMAT).toBe(1);
    expect(body.type).toBe("decision");
    expect(Object.hasOwn((body as { decision: object }).decision, "gateFormat")).toBe(false);
  });
});

describe("Lesen: Form statt Inhalt", () => {
  it("ein Export mit Belegen einer neueren Fassung wird gelesen, Urteil nicht prüfbar", async () => {
    const kette = await ketteNeuereFassung();
    const { entries } = parseJsonl(await kette.text());
    expect(entries).toHaveLength(3);
    const report = await verifyChain(entries, { rules: FASSUNG_RULES });
    expect(report.verdict.level).toBe("nicht_pruefbar");
    expect(report.verdict.findings).toEqual([{ problem: "fassung_unbekannt", seq: 2 }]);
    expect(report.ok).toBe(false);
    expect(report.firstFailure).toBeUndefined();
  });

  it("Befehl: dieselbe Kette ergibt Ausgang 4 und den Text zum Urteil", async () => {
    const kette = await ketteNeuereFassung();
    const { exit, out } = await cli(await kette.text());
    expect(exit).toBe(CLI_EXIT.nichtPruefbar);
    expect(exit).toBe(4);
    expect(out).toContain(t("belege.urteil.nicht_pruefbar"));
    expect(out.join("\n")).toContain("Beleg aus einer neueren PaiBot-Fassung");
  });
});

describe("Inhalt je Fassung", () => {
  it("gateFormat 99: Problem fassung_unbekannt, Stufe nicht_pruefbar, nie vertrauenswürdig", async () => {
    const kette = await TestKette.neu();
    const action = await kette.decision(sendAction(), (body) => {
      (body.decision as Record<string, unknown>).gateFormat = 99;
    });
    await kette.result(action);
    const report = await verifyChain(kette.entries, { rules: FASSUNG_RULES });
    expect(report.verdict.level).toBe("nicht_pruefbar");
    expect(report.verdict.findings).toEqual([{ problem: "fassung_unbekannt", seq: 2 }]);
    const decision = await verifyReceipt(kette.entries[1] as never, kette.entries[0] as never, [], {
      rules: FASSUNG_RULES,
    });
    expect(decision.find((c) => c.check === "entscheidung")).toMatchObject({
      status: "nicht_pruefbar",
      problem: "fassung_unbekannt",
    });
    expect(t("belege.urteil.nicht_pruefbar")).toBe(
      "Diese Kette enthält Belege aus einer neueren PaiBot-Fassung. Diese Fassung kann sie nicht vollständig prüfen. Prüfe mit derselben oder einer neueren Fassung. Hast du PaiBot nie auf eine neuere Fassung aktualisiert, ist das ein Warnzeichen.",
    );
  });

  it("ohne Feld, aber mit einer Aktion außerhalb von Fassung 1: fassung_unpassend, ungültig", async () => {
    const kette = await TestKette.neu();
    const action = await kette.decision(sendAction(), unbekannteAktion);
    await kette.result(action, { status: "ok" }, unbekannteAktion);
    const report = await verifyChain(kette.entries, { rules: FASSUNG_RULES });
    expect(report.verdict.level).toBe("ungueltig");
    expect(report.verdict.findings).toContainEqual({ problem: "fassung_unpassend", seq: 2 });
    expect(reevaluate(kette.entries[1] as never, FASSUNG_RULES)).toMatchObject({
      status: "fehler",
      problem: "fassung_unpassend",
    });
  });

  it("unbekanntes Feld in einer Entscheidung der Fassung 1: ungültig, auch neben Fassung 99", async () => {
    for (const auchNeuere of [false, true]) {
      const kette = await ketteUnbekanntesFeld(auchNeuere);
      const report = await verifyChain(kette.entries, { rules: FASSUNG_RULES });
      expect(report.verdict.level, String(auchNeuere)).toBe("ungueltig");
      expect(report.verdict.findings).toContainEqual({ problem: "fassung_unpassend", seq: 2 });
      expect(report.firstFailure?.seq).toBe(2);
    }
  });

  it("gateFormat 1 ausdrücklich im Beleg ist Fassung 1 und in Ordnung", async () => {
    const kette = await TestKette.neu();
    const action = await kette.decision(sendAction(), (body) => {
      (body.decision as Record<string, unknown>).gateFormat = 1;
    });
    await kette.result(action);
    const report = await verifyChain(kette.entries, { rules: FASSUNG_RULES });
    expect(report.verdict).toEqual({ level: "vertrauenswuerdig", findings: [], anchor: "fehlt" });
  });

  it("ungültige Angaben der Fassung (0, negativ, Text, zu groß) passen zu keiner Fassung", async () => {
    for (const value of [0, -1, "1", 1001]) {
      const kette = await TestKette.neu();
      const action = await kette.decision(sendAction(), (body) => {
        (body.decision as Record<string, unknown>).gateFormat = value;
      });
      await kette.result(action);
      const report = await verifyChain(kette.entries, { rules: FASSUNG_RULES });
      expect(report.verdict.level, String(value)).toBe("ungueltig");
      expect(report.verdict.findings).toContainEqual({ problem: "fassung_unpassend", seq: 2 });
    }
  });
});

describe("Ergebnis nach der Fassung seiner Entscheidung", () => {
  it("unbekanntes Feld zu Fassung 1: ungültig; zu Fassung 99: nicht prüfbar", async () => {
    const alt = await TestKette.neu();
    const a = await alt.decision();
    await alt.result(a, { status: "ok" }, neueresErgebnis);
    const altReport = await verifyChain(alt.entries, { rules: FASSUNG_RULES });
    expect(altReport.verdict.level).toBe("ungueltig");
    expect(altReport.verdict.findings).toEqual([{ problem: "fassung_unpassend", seq: 3 }]);

    const neu = await TestKette.neu();
    const b = await neu.decision(sendAction(), neuereFassung);
    await neu.result(b, { status: "ok" }, neueresErgebnis);
    const neuReport = await verifyChain(neu.entries, { rules: FASSUNG_RULES });
    expect(neuReport.verdict.level).toBe("nicht_pruefbar");
    expect(neuReport.verdict.findings).toEqual([{ problem: "fassung_unbekannt", seq: 2 }]);
  });

  it("ein Ergebnis mit unbekanntem Code zu Fassung 1 ist ungültig", async () => {
    const kette = await TestKette.neu();
    const action = await kette.decision();
    await kette.result(action, { status: "ok" }, (body) => {
      (body.result as Record<string, unknown>).code = "werkzeug_zeitlimit";
    });
    const report = await verifyChain(kette.entries, { rules: FASSUNG_RULES });
    expect(report.verdict.findings).toEqual([{ problem: "fassung_unpassend", seq: 3 }]);
  });
});

describe("Hinweis Rückschritt", () => {
  it("Entscheidung ohne Feld nach einer mit gateFormat 1: Hinweis, Urteil unverändert", async () => {
    const kette = await TestKette.neu();
    const a = await kette.decision(sendAction(), (body) => {
      (body.decision as Record<string, unknown>).gateFormat = 1;
    });
    await kette.result(a);
    const b = await kette.decision();
    await kette.result(b);
    const report = await verifyChain(kette.entries, { rules: FASSUNG_RULES });
    expect(report.verdict).toEqual({
      level: "vertrauenswuerdig",
      findings: [],
      anchor: "fehlt",
      notes: [{ note: "fassung_rueckschritt", seq: 4 }],
    });
    const { exit, out } = await cli(await kette.text());
    expect(exit).toBe(CLI_EXIT.gueltig);
    expect(out.join("\n")).toContain(t("belege.hinweis.fassung_rueckschritt"));
  });

  it("ohne Feld in jeder Entscheidung: kein Hinweis", async () => {
    const kette = await TestKette.neu();
    const a = await kette.decision();
    await kette.result(a);
    const report = await verifyChain(kette.entries, { rules: FASSUNG_RULES });
    expect(report.verdict.notes).toBeUndefined();
  });
});

describe("Befehl belege:pruefen", () => {
  it("nicht prüfbar ist Ausgang 4, nie 0 oder 1; die Hilfe nennt ihn", async () => {
    const kette = await ketteNeuereFassung();
    const { exit } = await cli(await kette.text());
    expect(exit).toBe(4);
    const hilfe: string[] = [];
    const usage = await runCli([], {
      readFile: async () => "",
      out: (line) => hilfe.push(line),
      err: (line) => hilfe.push(line),
    });
    expect(usage).toBe(CLI_EXIT.fehler);
    expect(hilfe.join("\n")).toMatch(/4 mit dieser Fassung nicht prüfbar/);
  });

  it("Anker ausgeben bei nicht prüfbarer Kette: Ausgang 4, kein Anker", async () => {
    const kette = await ketteNeuereFassung();
    const out: string[] = [];
    const exit = await runCli(["anker", "kette.jsonl"], {
      readFile: async () => kette.text(),
      out: (line) => out.push(line),
      err: (line) => out.push(line),
    });
    expect(exit).toBe(4);
    expect(out.some((line) => line.startsWith('{"format":"pb-anker"'))).toBe(false);
  });
});
