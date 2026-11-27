/**
 * PaiBot – feste Beleg-Kette vom Stand mit Tor-Fassung 4 (`testdaten/kette-f4.jsonl`) bleibt
 * überall „vertrauenswürdig“: über den Export (`parseJsonl` + `verifyChain`) und über den Befehl
 * `belege:pruefen`. Jede Entscheidung trägt Fassung 4 und wird nach Fassung 4 nachgerechnet, auch
 * nachdem das Tor auf eine spätere Fassung umgeschaltet ist.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

import { readFileSync } from "node:fs";
import type { ReceiptBody } from "@paibot/shared/belege";
import { STANDARD_RULE_VERSIONS } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { CLI_EXIT, runCli } from "./cli";
import { parseJsonl } from "./jsonl";
import { decisionFormat, reevaluate } from "./nachrechnen";
import { verifyChain } from "./verify";

/*
 * Herkunft der Datei: erzeugt mit `testdaten/kette-f4-erzeugen.ts` (Befehl und Stand im Kopf dort)
 * auf Stand 96f706f, mit dem echten Tor und dem echten Beleg-Schreiber gegen eine Datenbank im
 * Speicher, exportiert wie in der App (`exportHeader` + `exportJsonl`). Die Datei wird nie neu
 * erzeugt oder angepasst.
 */
const TEXT = readFileSync(new URL("./testdaten/kette-f4.jsonl", import.meta.url), "utf8");
const RULES = STANDARD_RULE_VERSIONS.map((rule, index) => ({ ...rule, seq: index + 1 }));

/**
 * Alle Aktionen, die die Datenbank auf dem Stand mit Tor-Fassung 4 speichert. Bewusst fest
 * geschrieben und nicht aus `STORED_ACTION_TYPES` gebildet: Spätere Fassungen bringen neue
 * Aktionen, die in dieser Kette nie vorkommen.
 */
const AKTIONEN_F4 = [
  "einrichtung.abschliessen",
  "zugang.anmelden",
  "zugang.abmelden",
  "zugang.alle_abmelden",
  "zugang.passwort_aendern",
  "anbieter.speichern",
  "anbieter.loeschen",
  "modell.waehlen",
  "bot.aendern",
  "schleuse.umschalten",
  "einstellung.aendern",
  "unterhaltung.anlegen",
  "unterhaltung.umbenennen",
  "unterhaltung.loeschen",
  "nachricht.senden",
  "modell.anfragen",
  "lauf.abbrechen",
  "belege.exportieren",
  "werkzeug.aufrufen",
  "geraet.hinzufuegen",
  "geraet.entfernen",
  "geraet.bestaetigen",
  "notaus.umschalten",
  "unterhaltung.exportieren",
  "antwort.neu_erzeugen",
  "app.verbinden",
  "app.werkzeuge_bestaetigen",
  "app.zugriff_setzen",
  "app.trennen",
  "bot.anlegen",
  "bot.loeschen",
  "bot.pausieren",
  "team.anlegen",
  "team.aendern",
  "team.loeschen",
  "bot.team_setzen",
  "team.entwurf_erstellen",
  "team.entwurf_verwerfen",
  "team.entwurf_anlegen",
  "team.entwurf_zuruecknehmen",
  "faden.anlegen",
  "einstellung.stabschef_setzen",
] as const;

/** Belege in der Kette: Start, Schlüsselwechsel und je Aktion Entscheidung und Ergebnis. */
const BELEGE = 114;
const ENTSCHEIDUNGEN = 56;

type Decided = Extract<ReceiptBody, { type: "decision" }>;
type Resulted = Extract<ReceiptBody, { type: "result" }>;

function bodies(): ReceiptBody[] {
  return parseJsonl(TEXT).entries.map((entry) => entry.body);
}

describe("feste Kette vom Stand mit Tor-Fassung 4", () => {
  it("enthält Start, Schlüsselwechsel, jede gespeicherte Aktion und die Sonderfälle", () => {
    const all = bodies();
    expect(all).toHaveLength(BELEGE);
    expect(all[0]?.type).toBe("start");
    expect(all[1]?.type).toBe("key_change");
    const decisions = all.filter((b): b is Decided => b.type === "decision");
    const results = all.filter((b): b is Resulted => b.type === "result");
    expect(decisions).toHaveLength(ENTSCHEIDUNGEN);
    expect(results).toHaveLength(ENTSCHEIDUNGEN);
    expect(new Set(decisions.map((b) => b.action.type))).toEqual(new Set(AKTIONEN_F4));
    // Der erste Durchlauf: jede Aktion einmal, in fester Reihenfolge, jede erlaubt und ausgeführt.
    const ersteRunde = decisions.slice(0, AKTIONEN_F4.length);
    expect(ersteRunde.map((b) => b.action.type)).toEqual([...AKTIONEN_F4]);
    for (const body of ersteRunde) {
      expect(body.decision.outcome, body.action.type).toBe("allow");
    }
    for (const body of results.slice(0, AKTIONEN_F4.length)) {
      expect(body.result.status, body.action.type).toBe("ok");
    }
    // Bot-Aktionen kommen vom Bot, alle anderen vom Besitzer.
    for (const body of decisions) {
      const vomBot =
        body.action.type === "modell.anfragen" || body.action.type === "werkzeug.aufrufen";
      expect(body.action.actor.startsWith("bot:"), body.action.type).toBe(vomBot);
    }
    const verletzt = new Set(
      decisions.flatMap((b) =>
        b.decision.limits.filter((l) => l.result === "verletzt").map((l) => l.name),
      ),
    );
    expect([...verletzt].sort()).toEqual(
      [
        "anbieter_region",
        "bot_bereit",
        "bots_gesamt",
        "laenge",
        "not_aus",
        "schleuse_gefordert",
        "tagesbudget",
      ].sort(),
    );
    const vorbedingungen = decisions.flatMap((b) =>
      b.decision.preconditions.filter((p) => p.result === "verletzt").map((p) => p.name),
    );
    expect(vorbedingungen.sort()).toEqual(["kein_lauf_aktiv", "standard_bot_bleibt"]);
    expect(
      decisions
        .filter((b) => b.decision.rules.some((r) => r.id === "R-006"))
        .map((b) => [b.action.type, b.decision.outcome]),
    ).toEqual([["bot.aendern", "deny"]]);
    expect(results.filter((b) => b.result.status === "error").map((b) => b.result.code)).toEqual([
      "anbieter_nicht_erreichbar",
    ]);
    const modellOk = results.filter(
      (b) => b.action.type === "modell.anfragen" && b.result.status === "ok",
    );
    expect(modellOk.map((b) => b.result.servedBy)).toEqual([
      { provider: "tensorix", model: "mistral-small-3.2" },
    ]);
    const werkzeug = decisions.filter((b) => b.action.type === "werkzeug.aufrufen");
    expect(werkzeug.map((b) => [b.decision.outcome, b.decision.rules.map((r) => r.id)])).toEqual([
      ["allow", ["R-010"]],
    ]);
    const notaus = decisions.filter((b) => b.action.type === "notaus.umschalten");
    expect(notaus.map((b) => [b.facts.on, b.decision.outcome])).toEqual([
      [true, "allow"],
      [false, "allow"],
    ]);
    expect(decisions.filter((b) => b.decision.outcome === "ask")).toEqual([]);
    for (const body of decisions) {
      expect(body.decision.gateFormat, String(body.seq)).toBe(4);
    }
  });

  it("Export: gelesen, jede Prüfung ok, Urteil vertrauenswürdig, keine Hinweise", async () => {
    const { header, entries } = parseJsonl(TEXT);
    const report = await verifyChain(entries, {
      publicKeys: header.publicKeys,
      rules: RULES,
      ...(header.anchor === undefined ? {} : { anchor: header.anchor }),
    });
    expect(header.anchor).toBeDefined();
    expect(header.publicKeys).toHaveLength(2);
    expect(report.firstFailure).toBeUndefined();
    expect(report.verdict).toStrictEqual({
      level: "vertrauenswuerdig",
      findings: [],
      anchor: "geprueft",
    });
    expect(report.ok).toBe(true);
    expect(report.checked).toBe(BELEGE);
  });

  it("jede Entscheidung wird nach Fassung 4 nachgerechnet", () => {
    const { entries } = parseJsonl(TEXT);
    let count = 0;
    for (const entry of entries) {
      if (entry.body.type !== "decision") continue;
      expect(decisionFormat(entry.body), String(entry.seq)).toStrictEqual({
        status: "passt",
        format: 4,
      });
      expect(reevaluate(entry, RULES).status, String(entry.seq)).toBe("ok");
      count++;
    }
    expect(count).toBe(ENTSCHEIDUNGEN);
  });

  it("Befehl belege:pruefen: Ausgang 0", async () => {
    const out: string[] = [];
    const err: string[] = [];
    const exit = await runCli(["kette.jsonl"], {
      readFile: async () => TEXT,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    });
    expect(err).toEqual([]);
    expect(exit).toBe(CLI_EXIT.gueltig);
  });
});
