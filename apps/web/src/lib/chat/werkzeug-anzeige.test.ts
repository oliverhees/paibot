/**
 * PaiBot – Tests der Projektion von Werkzeug-Aufrufen für die Anzeige: Fundstellen nur aus dem
 * gespeicherten Ergebnis, nie das Ergebnis im Ganzen, nie Texte von Abschnitten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { newId } from "@paibot/shared/ids";
import type { ToolCallRecord } from "@paibot/shared/objekte";
import { describe, expect, it } from "vitest";
import {
  AUFRUFE_JE_LAUF,
  EINGABE_GRENZE,
  NAME_GRENZE,
  QUELLEN_GRENZE,
  WERKZEUG_DOKU,
  werkzeugAnzeige,
  werkzeugeAnzeigen,
} from "./werkzeug-anzeige";

const runId = newId("run");

function aufruf(teil: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return {
    actionId: newId("action"),
    conversationId: newId("conversation"),
    runId,
    messageId: newId("message"),
    position: 0,
    callId: "c1",
    name: "doku_nachschlagen",
    source: "eingebaut",
    kind: "lesen",
    input: { frage: "Tagesbudget einstellen" },
    argsDigest: `hmac-sha256:${"0".repeat(64)}` as never,
    status: "succeeded",
    toolKey: WERKZEUG_DOKU,
    step: 0,
    createdAt: "2026-11-22T10:00:00.000Z",
    updatedAt: "2026-11-22T10:00:01.000Z",
    ...teil,
  } as ToolCallRecord;
}

function huelle(inhalt: unknown, status = "ok") {
  return { paibot: "werkzeug-ergebnis", werkzeug: WERKZEUG_DOKU, art: "daten", status, inhalt };
}

const ABSCHNITT = (n: number) => ({
  id: `a${n}`,
  seite: `seite-${n}.md`,
  anker: `anker-${n}`,
  titel: `Titel ${n}`,
  text: `GEHEIMER-ABSCHNITTSTEXT-${n}`,
});

describe("Projektion eines Aufrufs", () => {
  it("Quellen nur aus dem gespeicherten Ergebnis: Seite, Anker, Titel; nie der Text", () => {
    const z = aufruf({
      output: huelle({
        status: "gefunden",
        stand: "1.0",
        abschnitte: [ABSCHNITT(1), ABSCHNITT(2)],
      }),
    });
    const a = werkzeugAnzeige(z);
    expect(a.quellen).toEqual([
      { seite: "seite-1.md", anker: "anker-1", titel: "Titel 1" },
      { seite: "seite-2.md", anker: "anker-2", titel: "Titel 2" },
    ]);
    expect(a.status).toBe("fertig");
    expect(JSON.stringify(a)).not.toContain("GEHEIMER-ABSCHNITTSTEXT");
    expect(JSON.stringify(a)).not.toContain("argsDigest");
    expect(a).not.toHaveProperty("output");
    expect(a).not.toHaveProperty("input");
  });

  it("eine gekürzte Hülle trägt nur die gesendeten Abschnitte", () => {
    const z = aufruf({
      output: {
        ...huelle({ status: "gefunden", stand: "1.0", abschnitte: [ABSCHNITT(1), ABSCHNITT(2)] }),
        gekuerzt: true,
      },
    });
    expect(werkzeugAnzeige(z).quellen).toHaveLength(2);
  });

  it("nichts gefunden: keine Quellen, dafür das Zeichen", () => {
    const z = aufruf({
      output: huelle({
        status: "nichts_gefunden",
        stand: "1.0",
        quelle: "Doku von PaiBot",
        gefunden: 0,
      }),
    });
    const a = werkzeugAnzeige(z);
    expect(a.nichtsGefunden).toBe(true);
    expect(a.quellen).toBeUndefined();
  });

  it("Zeichen im Antworttext oder in einer anderen Hülle erzeugen keine Quellen", () => {
    const text = aufruf({ output: "Quelle: funktion-x.md" });
    expect(werkzeugAnzeige(text).quellen).toBeUndefined();
    const fehler = aufruf({
      status: "failed",
      output: huelle({ status: "gefunden", stand: "1", abschnitte: [ABSCHNITT(1)] }, "fehler"),
    });
    expect(werkzeugAnzeige(fehler).quellen).toBeUndefined();
    const fremd = aufruf({
      toolKey: "mcp/server/werkzeug" as never,
      output: huelle({ status: "gefunden", stand: "1", abschnitte: [ABSCHNITT(1)] }),
    });
    expect(werkzeugAnzeige(fremd).quellen).toBeUndefined();
  });

  it("höchstens zehn Quellen; Abschnitte ohne Text-Felder fallen weg", () => {
    const viele = Array.from({ length: 14 }, (_, i) => ABSCHNITT(i));
    const z = aufruf({
      output: huelle({ status: "gefunden", stand: "1", abschnitte: [{ id: "x" }, ...viele] }),
    });
    expect(werkzeugAnzeige(z).quellen).toHaveLength(QUELLEN_GRENZE);
  });

  it("Frage gekürzt; nur beim Nachschlagen; Name vom Modell nur aus dem rohen Namen", () => {
    const lang = "ä".repeat(EINGABE_GRENZE + 30);
    const a = werkzeugAnzeige(aufruf({ input: { frage: lang } }));
    expect([...(a.eingabeKurz ?? "")]).toHaveLength(EINGABE_GRENZE);
    const fremd = werkzeugAnzeige(
      aufruf({ toolKey: "mcp/x/y" as never, input: { frage: "geheim" } }),
    );
    expect(fremd.eingabeKurz).toBeUndefined();
    const roh = werkzeugAnzeige(aufruf({ rawName: "n".repeat(NAME_GRENZE + 10) }));
    expect(roh.nameVomModell).toHaveLength(NAME_GRENZE);
    expect(werkzeugAnzeige(aufruf()).nameVomModell).toBeUndefined();
  });

  it("Zustand aus dem gespeicherten Status; Belege und Code", () => {
    const entscheidung = newId("receipt");
    const ergebnis = newId("receipt");
    const faelle: [ToolCallRecord["status"], string][] = [
      ["requested", "laeuft"],
      ["running", "laeuft"],
      ["succeeded", "fertig"],
      ["failed", "fehlgeschlagen"],
      ["denied", "abgelehnt"],
      ["cancelled", "abgebrochen"],
    ];
    for (const [status, wort] of faelle) {
      expect(werkzeugAnzeige(aufruf({ status })).status).toBe(wort);
    }
    const a = werkzeugAnzeige(
      aufruf({
        status: "failed",
        errorCode: "werkzeug_zeitgrenze" as never,
        decisionReceiptId: entscheidung,
        resultReceiptId: ergebnis,
      }),
    );
    expect(a).toMatchObject({
      code: "werkzeug_zeitgrenze",
      entscheidungBelegId: entscheidung,
      belegId: ergebnis,
    });
    expect(werkzeugAnzeige(aufruf({ decisionReceiptId: entscheidung })).belegId).toBe(entscheidung);
  });

  it("höchstens so viele Aufrufe je Lauf", () => {
    const viele = Array.from({ length: AUFRUFE_JE_LAUF + 5 }, (_, i) => aufruf({ position: i }));
    expect(werkzeugeAnzeigen(viele)).toHaveLength(AUFRUFE_JE_LAUF);
  });
});
