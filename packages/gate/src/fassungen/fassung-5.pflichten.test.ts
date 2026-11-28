/**
 * PaiBot – Zusagen der Tor-Fassung 5 „Zusammenarbeit“, je Zusage ein Test über die festen Fälle
 * (`fassung-5.korpus.json`) und die Fehlercodes. Jeder Test wird rot, wenn die Prüfung in
 * `fassung-5.ts` fehlt, die die Zusage trägt (Gegenproben im Entwickler-Text `docs/entwickler/tor.md`).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

import type { Decision, RuleDefinition } from "@paibot/shared/tor";
import { OWN_RULE_PRIORITY } from "@paibot/shared/tor";
import { STANDARD_RULES_5 } from "@paibot/shared/tor-fassung-5";
import { describe, expect, it } from "vitest";
import { GATE_FORMAT_5 } from "./fassung-5";
import korpus from "./fassung-5.korpus.json";

interface Fall5 {
  name: string;
  action: { type: string; actor: string; target: Record<string, unknown> };
  facts: Record<string, unknown>;
  rules: string;
}

const KORPUS_5 = korpus as unknown as {
  ruleSets: Record<string, RuleDefinition[]>;
  cases: Fall5[];
};

function fall(name: string): Fall5 {
  const gefunden = KORPUS_5.cases.find((entry) => entry.name === name);
  if (gefunden === undefined) throw new Error(`Fall fehlt: ${name}`);
  return gefunden;
}

function regeln(satz: string): RuleDefinition[] {
  const liste = KORPUS_5.ruleSets[satz];
  if (liste === undefined) throw new Error(satz);
  return liste;
}

/** Entscheidung für einen Fall, wahlweise mit geänderten Fakten oder einem anderen Regel-Satz. */
function entscheide(
  name: string,
  aenderung: Record<string, unknown> = {},
  satz?: string,
): ReturnType<typeof GATE_FORMAT_5.evaluate> & Decision {
  const entry = fall(name);
  return GATE_FORMAT_5.evaluate(
    entry.action as never,
    { ...entry.facts, ...aenderung } as never,
    regeln(satz ?? entry.rules),
  ) as Decision;
}

function code(name: string, aenderung: Record<string, unknown> = {}, satz?: string): string {
  const entry = fall(name);
  const decision = entscheide(name, aenderung, satz);
  return GATE_FORMAT_5.denialCode?.(decision, { ...entry.facts, ...aenderung }) ?? "";
}

function verletzt(decision: Decision): string[] {
  return [...decision.preconditions, ...decision.limits]
    .filter((check) => check.result === "verletzt")
    .map((check) => check.name);
}

const VERBOTENE_WEGE = KORPUS_5.cases
  .map((entry) => entry.name)
  .filter((name) => name.startsWith("V-40 verboten"));

const LEITUNG = "aktion auftrag.uebergeben: Leitung gibt einem Mitglied Arbeit (R-015)";
const BITTE = "aktion auftrag.uebergeben: Mitglied bittet einen Kollegen (R-019)";
const PAI = "aktion auftrag.uebergeben: Pai gibt der Leitung eines Teams einen Auftrag (R-017)";

describe("Fassung 5: Wege der Übergabe (V-40)", () => {
  it("jeder verbotene Weg ist deny über V-40, nie ask, auch mit Regel für alles und ohne Regeln", () => {
    expect(VERBOTENE_WEGE.length).toBeGreaterThanOrEqual(80);
    for (const name of VERBOTENE_WEGE) {
      for (const satz of ["standard", "alles-erlaubt", "leer"]) {
        const decision = entscheide(name, {}, satz);
        expect(decision.outcome, `${name} (${satz})`).toBe("deny");
        expect(verletzt(decision), `${name} (${satz})`).toContain("uebergabe_weg_erlaubt");
      }
    }
  });

  it("ein erlaubter Weg mit Schalter aus fragt (R-009), mit Schalter an erlaubt die Regel", () => {
    expect(entscheide(LEITUNG, { zusammenarbeit: "aus" }).outcome).toBe("ask");
    expect(entscheide(LEITUNG, { zusammenarbeit: "aus" }).matchedRules).toEqual([
      { id: "R-009", version: 1 },
    ]);
    expect(entscheide(LEITUNG).outcome).toBe("allow");
    expect(entscheide(PAI, { stabschefErlaubt: false }).matchedRules).toEqual([
      { id: "R-009", version: 1 },
    ]);
    expect(entscheide(BITTE, { zusammenarbeit: "aus" }).outcome).toBe("ask");
  });

  it("eigene Regeln (ab 1000) lockern und verschärfen auftrag.uebergeben für Bots nicht (Vertrag)", () => {
    const standard = regeln("standard");
    // Standard-Regeln der Fassung 4 aus dem Korpus, die neuen aus dem Vertrag.
    const neu = new Set<string>(STANDARD_RULES_5.map((rule) => rule.id));
    const basis = [
      ...standard.filter((rule) => !neu.has(rule.id)),
      ...(STANDARD_RULES_5 as unknown as RuleDefinition[]),
    ];
    const eigene = (id: string, action: string, effect: "allow" | "deny"): RuleDefinition =>
      ({
        id,
        version: 1,
        action,
        effect,
        stage: "execute",
        conditions: [{ fact: "akteur", op: "eq", value: "bot" }],
        priority: OWN_RULE_PRIORITY.min,
        source: "owner",
        enabled: true,
        title: "Eigene Regel",
        reason: "Vom Besitzer angelegt.",
      }) as unknown as RuleDefinition;
    const mit = (regel: RuleDefinition) => [...basis, regel];
    const erlaubtUebergabe = mit(
      eigene("reg_01m7zempyycccccccccccccccc", "auftrag.uebergeben", "allow"),
    );
    const erlaubtAlles = mit(eigene("reg_01m7zempyydddddddddddddddd", "*", "allow"));
    const verbietet = mit(eigene("reg_01m7zempyyeeeeeeeeeeeeeeee", "auftrag.uebergeben", "deny"));
    const mitRegeln = (
      name: string,
      aenderung: Record<string, unknown>,
      liste: RuleDefinition[],
    ) => {
      const entry = fall(name);
      return GATE_FORMAT_5.evaluate(
        entry.action as never,
        { ...entry.facts, ...aenderung } as never,
        liste,
      ) as Decision;
    };
    for (const liste of [erlaubtUebergabe, erlaubtAlles, verbietet]) {
      const leitung = mitRegeln(LEITUNG, { zusammenarbeit: "aus" }, liste);
      expect(leitung.outcome).toBe("ask");
      expect(leitung.matchedRules).toEqual([{ id: "R-009", version: 1 }]);
      const pai = mitRegeln(PAI, { stabschefErlaubt: false }, liste);
      expect(pai.outcome).toBe("ask");
      expect(pai.matchedRules).toEqual([{ id: "R-009", version: 1 }]);
    }
    expect(mitRegeln(LEITUNG, {}, verbietet).outcome).toBe("allow");
    expect(mitRegeln(PAI, {}, verbietet).outcome).toBe("allow");
  });

  it("Code: Ziel in einem anderen Team eigener Code; Bot ohne Team, Pai und sich selbst nicht", () => {
    const anderesTeam = [
      "V-40 verboten: Bitte an ein Mitglied eines anderen Teams",
      "V-40 verboten: Leitung an ein Mitglied eines anderen Teams",
      "V-40 verboten: Leitung an die Leitung eines anderen Teams",
      "V-40 verboten: Rückgabe an ein Mitglied eines anderen Teams",
      // `@Team …:` eines Mitglieds geht an die Leitung eines anderen Teams.
      "V-40 verboten: Mitglied gibt einem Team einen Auftrag (@Team)",
    ];
    for (const name of anderesTeam) expect(code(name), name).toBe("ziel_in_anderem_team");
    for (const name of [
      "V-40 verboten: Bitte an einen Bot ohne Team",
      "V-40 verboten: Pai an einen Bot ohne Team",
      "V-40 verboten: Leitung an einen Bot ohne Team",
      "V-40 verboten: Bitte an Pai",
      "V-40 verboten: Bitte an sich selbst",
      "V-40 verboten: Pai an ein Mitglied eines Teams",
    ]) {
      expect(code(name), name).toBe("weg_nicht_erlaubt");
    }
    // Erst die Vorbedingung, dann der Code: Ein erlaubter Weg im selben Team hat keinen V-40-Code.
    expect(code(LEITUNG, { untrustedInput: true })).toBe("nach_fremden_inhalten");
  });

  it("Übergabe nie an Pai, an sich selbst, an einen Bot ohne Team oder in ein anderes Team", () => {
    for (const zielRolle of ["stabschef", "selbst", "ohne_team"]) {
      expect(entscheide(LEITUNG, { zielRolle }, "alles-erlaubt").outcome, zielRolle).toBe("deny");
      expect(entscheide(BITTE, { zielRolle }, "alles-erlaubt").outcome, zielRolle).toBe("deny");
    }
    expect(entscheide(LEITUNG, { sameTeam: false }, "alles-erlaubt").outcome).toBe("deny");
    expect(entscheide(BITTE, { sameTeam: false }, "alles-erlaubt").outcome).toBe("deny");
    // An einen Vorfahren: G-13.
    expect(verletzt(entscheide(LEITUNG, { zielImPfad: true }, "alles-erlaubt"))).toEqual([
      "kein_kreis",
    ]);
  });

  it("Übergabe nur mit Zusammenarbeit „Leitung führt“; ein Mitglied ohne Stab verteilt nicht", () => {
    expect(entscheide(LEITUNG, { zusammenarbeit: "aus" }).outcome).not.toBe("allow");
    for (const art of ["uebergabe", "rueckgabe"]) {
      const d = entscheide(LEITUNG, { geberRolle: "mitglied", art }, "alles-erlaubt");
      expect(d.outcome, art).toBe("deny");
    }
  });
});

describe("Fassung 5: Pai als Stabschef", () => {
  it("Pai gibt nur aus deinem Direkt-Chat, nur auf deine Nachricht, nur ohne Auftrag einer Leitung Arbeit", () => {
    expect(entscheide(PAI).outcome).toBe("allow");
    for (const auftragArt of ["rueckmeldung", "sammeln", "wurzel", "uebergabe", "faecher"]) {
      const d = entscheide(PAI, { auftragArt }, "alles-erlaubt");
      expect(d.outcome, auftragArt).toBe("deny");
      expect(verletzt(d), auftragArt).toContain("uebergabe_weg_erlaubt");
    }
    expect(entscheide(PAI, { trigger: "automation" }, "alles-erlaubt").outcome).toBe("deny");
    expect(entscheide(PAI, { conversationKind: "faden" }, "alles-erlaubt").outcome).toBe("deny");
    expect(entscheide(PAI, { zielRolle: "mitglied" }, "alles-erlaubt").outcome).toBe("deny");
  });

  it("Pais Rückmeldungs-Lauf beauftragt kein Team und ruft keine Werkzeuge", () => {
    const d = entscheide("V-40 verboten: Pai aus seinem Rückmeldungs-Lauf");
    expect(d.outcome).toBe("deny");
    expect(code("V-40 verboten: Pai aus seinem Rückmeldungs-Lauf")).toBe("weg_nicht_erlaubt");
    const werkzeug = entscheide(
      "G-42: Pais Rückmeldungs-Lauf liest in einer App (R-014 passt): abgelehnt",
    );
    expect(werkzeug.outcome).toBe("deny");
    expect(verletzt(werkzeug)).toEqual(["werkzeug_im_auftrag"]);
    expect(code("G-42: Pais Rückmeldungs-Lauf liest in einer App (R-014 passt): abgelehnt")).toBe(
      "werkzeug_im_auftrag",
    );
  });
});

describe("Fassung 5: fremde Inhalte (D-02)", () => {
  it("nach fremden Inhalten keine Übergabe: deny mit Code nach_fremden_inhalten, auch mit Regel für alles", () => {
    for (const name of [LEITUNG, BITTE, PAI]) {
      for (const satz of ["standard", "alles-erlaubt", "leer"]) {
        const d = entscheide(name, { untrustedInput: true }, satz);
        expect(d.outcome, `${name} (${satz})`).toBe("deny");
        expect(d.caps, `${name} (${satz})`).toEqual([
          { name: "fremd_dann_verboten", result: "gedeckelt" },
        ]);
        expect(code(name, { untrustedInput: true }, satz), name).toBe("nach_fremden_inhalten");
      }
    }
  });

  it("auch ohne die Bedingung untrustedInput in der Regel bleibt es deny (D-02 trägt allein)", () => {
    const ohne = regeln("standard").map((rule) =>
      rule.id === "R-015"
        ? { ...rule, conditions: rule.conditions.filter((c) => c.fact !== "untrustedInput") }
        : rule,
    );
    const entry = fall(LEITUNG);
    const d = GATE_FORMAT_5.evaluate(
      entry.action as never,
      { ...entry.facts, untrustedInput: true } as never,
      ohne,
    );
    expect(d.outcome).toBe("deny");
  });

  it("D-02 gilt nicht für Meldungen", () => {
    expect(
      entscheide("D-02 gilt nicht für auftrag.melden: Meldung nach fremden Inhalten bleibt erlaubt")
        .outcome,
    ).toBe("allow");
  });
});

describe("Fassung 5: Grenzen eines Auftrags", () => {
  it("pausierter Empfänger: deny (G-15) mit Code bot_pausiert", () => {
    for (const name of [
      "auftrag.uebergeben G-15: Empfänger pausiert",
      "G-15: Empfänger pausiert, auch wenn eine Regel alles erlaubt",
      "G-15: Pai an eine pausierte Leitung",
    ]) {
      expect(entscheide(name).outcome, name).toBe("deny");
      expect(verletzt(entscheide(name)), name).toEqual(["bot_bereit"]);
      expect(code(name), name).toBe("bot_pausiert");
    }
  });

  it("höchstens drei Aufträge der Leitung je Mitglied und Wurzel (G-43), Code auftrag_grenze", () => {
    const name = "auftrag.uebergeben G-43: vierter Auftrag der Leitung an dasselbe Mitglied";
    expect(entscheide(name).outcome).toBe("deny");
    expect(code(name)).toBe("auftrag_grenze");
    expect(
      entscheide("auftrag.uebergeben G-43: dritter Auftrag der Leitung an dasselbe Mitglied geht")
        .outcome,
    ).toBe("allow");
  });

  it("Bitte: nur eine je Auftrag (G-45), ein Zulieferer reicht weder weiter noch bittet", () => {
    expect(entscheide("auftrag.uebergeben G-45: zweite Bitte im selben Auftrag").outcome).toBe(
      "deny",
    );
    expect(entscheide("G-45: zweite Bitte, auch wenn eine Regel alles erlaubt").outcome).toBe(
      "deny",
    );
    for (const name of [
      "V-40 verboten: Zulieferer reicht weiter (Bitte aus einer Zulieferung)",
      "V-40 verboten: Zulieferer gibt an ein Team (@Team aus einer Zulieferung)",
      "V-40 verboten: Bitte an die Leitung",
      "V-40 verboten: Bitte an sich selbst",
    ]) {
      expect(entscheide(name, {}, "alles-erlaubt").outcome, name).toBe("deny");
    }
  });

  it("ein Bot mit Auftrag ruft keine Werkzeuge (G-42 bei jeder Art außer keiner)", () => {
    for (const art of [
      "wurzel",
      "uebergabe",
      "bitte",
      "rueckkehr",
      "faecher",
      "sammeln",
      "rueckmeldung",
      "rueckgabe",
    ]) {
      const name = `G-42: Doku im Auftrag der Art ${art}, auch wenn eine Regel alles erlaubt`;
      expect(entscheide(name).outcome, art).toBe("deny");
      expect(verletzt(entscheide(name)), art).toEqual(["werkzeug_im_auftrag"]);
    }
    expect(entscheide("werkzeug.aufrufen: Doku ohne Auftrag (R-010)").outcome).toBe("allow");
  });

  it("Budget erhöhen: nur bei ausgeschöpftem Budget (V-41), höchstens fünf je Baum (G-46), fester Schritt", () => {
    expect(entscheide("aktion auftrag.budget_erhoehen").outcome).toBe("allow");
    expect(
      entscheide("auftrag.budget_erhoehen: V-41: Budget des Baums noch nicht erreicht").outcome,
    ).toBe("deny");
    expect(code("auftrag.budget_erhoehen: V-41: Budget des Baums noch nicht erreicht")).toBe(
      "budget_nicht_ausgeschoepft",
    );
    expect(entscheide("auftrag.budget_erhoehen: G-46: sechster Zuschlag").outcome).toBe("deny");
    expect(code("auftrag.budget_erhoehen: G-46: sechster Zuschlag")).toBe("auftrag_grenze");
    expect(entscheide("auftrag.budget_erhoehen: fünfter Zuschlag geht").outcome).toBe("allow");
    for (const schritt of ["5000", "20000", "0"]) {
      expect(
        entscheide(`auftrag.budget_erhoehen: Schritt ${schritt} statt 10 000 ist ungültig`).outcome,
      ).toBe("deny");
    }
    // Nur der Besitzer.
    expect(entscheide("auftrag.budget_erhoehen Akteur Bot trotz Regel alles erlaubt").outcome).toBe(
      "deny",
    );
  });

  it("G-11 rechnet Grenze und Zuschläge; G-04 und G-18 bleiben unberührt", () => {
    expect(entscheide("G-11: Budget mit Zuschlag noch frei").outcome).toBe("allow");
    expect(entscheide("G-11: Budget mit Zuschlag erreicht").outcome).toBe("deny");
    expect(
      verletzt(entscheide("G-04 bleibt: Tagesbudget erreicht, Zuschlag des Baums hilft nicht")),
    ).toEqual(["tagesbudget"]);
    expect(
      verletzt(
        entscheide("G-18 bleibt: Token je Lauf überschritten, Zuschlag des Baums hilft nicht"),
      ),
    ).toEqual(["lauf_token"]);
  });
});

describe("Fassung 5: Antworten und Meldungen", () => {
  it("antworten nur mit gültigem Auftrag in dieser Unterhaltung (R-016); Auftrag aus Faden X, Lauf in Y: nicht allow", () => {
    expect(
      entscheide("modell.anfragen: Mitglied mit gültigem Auftrag im Faden antwortet (R-016)")
        .outcome,
    ).toBe("allow");
    const xy = entscheide(
      "modell.anfragen: Auftrag aus Faden X, Lauf in Unterhaltung Y: kein gültiger Auftrag (R-999)",
    );
    expect(
      fall(
        "modell.anfragen: Auftrag aus Faden X, Lauf in Unterhaltung Y: kein gültiger Auftrag (R-999)",
      ).facts.botHatAuftrag,
    ).toBe(false);
    expect(xy.outcome).not.toBe("allow");
    expect(
      entscheide("modell.anfragen: Bot ohne Auftrag im Faden antwortet nicht (R-999)").outcome,
    ).not.toBe("allow");
  });

  it("Meldung fertig nur von der Leitung; Zurückgeben geht auch auf eine fertige Wurzel", () => {
    expect(entscheide("aktion auftrag.melden: Leitung meldet fertig (R-018)").outcome).toBe(
      "allow",
    );
    expect(
      entscheide("auftrag.melden: Mitglied meldet fertig: passt nicht zur Rolle (R-999)").outcome,
    ).not.toBe("allow");
    expect(
      entscheide("auftrag.zurueckgeben: auch auf eine fertige Wurzel (keine Vorbedingung V-39)")
        .outcome,
    ).toBe("allow");
  });

  it("widersprüchliche Fakten: Auftrag ohne Art ist ungültig, die Baum-Grenzen lassen sich so nicht umgehen", () => {
    const name = "modell.anfragen: Mitglied mit gültigem Auftrag im Faden antwortet (R-016)";
    const d = entscheide(name, { auftragArt: "keiner" }, "alles-erlaubt");
    expect(d.outcome).toBe("deny");
    expect(d.matchedRules).toEqual([]);
  });

  it("Zuschläge: eine andere Höchstzahl als 5 ist ungültig", () => {
    const d = entscheide("auftrag.budget_erhoehen: fünfter Zuschlag geht", {
      zuschlaege: 7,
      maxZuschlaege: 1000,
    });
    expect(d.outcome).toBe("deny");
    expect(d.matchedRules).toEqual([]);
  });

  it("widersprüchliche Fakten im Faden: ohne Art oder als Bot der Unterhaltung ungültig, auch beim Melden", () => {
    const faden = "modell.anfragen: Mitglied mit gültigem Auftrag im Faden antwortet (R-016)";
    for (const aenderung of [
      { botHatAuftrag: false, auftragArt: "keiner" },
      { botOfConversation: true },
      { botHatAuftrag: false, auftragArt: "keiner", botOfConversation: true },
    ]) {
      const d = entscheide(faden, aenderung, "alles-erlaubt");
      expect(d.outcome, JSON.stringify(aenderung)).toBe("deny");
      expect(d.matchedRules).toEqual([]);
    }
    // Im Direkt-Chat bleibt der Bot der Unterhaltung ohne Auftrag gültig (Füllwerte).
    const direkt = "modell.anfragen: Direkt-Chat mit den Füllwerten wie Fassung 4 (R-002)";
    expect(entscheide(direkt).outcome).toBe("allow");
    const melden = "aktion auftrag.melden: Leitung meldet fertig (R-018)";
    expect(entscheide(melden).outcome).toBe("allow");
    const d = entscheide(melden, { auftragArt: "keiner" }, "alles-erlaubt");
    expect(d.outcome).toBe("deny");
    expect(d.matchedRules).toEqual([]);
  });

  it("Summe der Zuschläge über 5 × 10 000 ist ungültig: G-11 vertraut keinem größeren Wert", () => {
    const frei = "G-11: Budget mit Zuschlag noch frei";
    expect(entscheide(frei, { baumZuschlagTokens: 50000 }).outcome).toBe("allow");
    const zuViel = entscheide(
      frei,
      { baumTokens: 900000, baumZuschlagTokens: 1e9 },
      "alles-erlaubt",
    );
    expect(zuViel.outcome).toBe("deny");
    expect(zuViel.matchedRules).toEqual([]);
    const erhoehen = "auftrag.budget_erhoehen: fünfter Zuschlag geht";
    expect(entscheide(erhoehen, { baumZuschlagTokens: 50001 }).outcome).toBe("deny");
  });

  it("V-39 an der Übergabe: Empfänger mit Auftrag nur bei Rückgabe, Auftrag des Gebers nur mit Auftrag", () => {
    // Erste Übergabe an ein Mitglied: Der Empfänger hat in der Wurzel noch keinen Auftrag.
    expect(entscheide(LEITUNG, { zielHatAuftrag: false }).outcome).toBe("allow");
    expect(entscheide(BITTE, { zielHatAuftrag: false }).outcome).toBe("allow");
    const rueckgabe = entscheide(LEITUNG, { art: "rueckgabe", zielHatAuftrag: false });
    expect(rueckgabe.outcome).toBe("deny");
    expect(verletzt(rueckgabe)).toEqual(["auftrag_offen"]);
    // Pai hat im Direkt-Chat keinen Auftrag, also auch keinen offenen.
    expect(entscheide(PAI, { auftragOffen: false }).outcome).toBe("allow");
    // Mit Auftrag muss er offen sein, für Leitung und Bitte.
    for (const name of [LEITUNG, BITTE]) {
      const d = entscheide(name, { auftragOffen: false }, "alles-erlaubt");
      expect(d.outcome, name).toBe("deny");
      expect(verletzt(d), name).toEqual(["auftrag_offen"]);
    }
  });

  it("Code: Weg erlaubt, Schalter aus → zusammenarbeit_aus (nicht regel_fehlt)", () => {
    expect(code(LEITUNG, { zusammenarbeit: "aus" })).toBe("zusammenarbeit_aus");
    expect(code(BITTE, { zusammenarbeit: "aus" })).toBe("zusammenarbeit_aus");
    expect(code(PAI, { stabschefErlaubt: false })).toBe("zusammenarbeit_aus");
    expect(code("modell.anfragen: Bot ohne Auftrag im Faden antwortet nicht (R-999)")).toBe(
      "regel_fehlt",
    );
  });

  it("Füllwerte sind genau die Werte eines Laufs im Direkt-Chat ohne Auftrag", () => {
    const d = entscheide("modell.anfragen: Direkt-Chat mit den Füllwerten wie Fassung 4 (R-002)");
    expect(d.outcome).toBe("allow");
    expect(d.matchedRules).toEqual([{ id: "R-002", version: 1 }]);
  });
});
