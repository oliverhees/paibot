/**
 * PaiBot – Tests: Antwort der Regel-Liste streng lesen. Gelesen wird genau die belegte Form; Zusatzfelder
 * und Kennungen des Kontos kommen nie ins Ergebnis, Freitext zählt nicht, unbekannte Werte werden
 * nicht übernommen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import { rulePolicySchema } from "./grundtypen";
import { deutetAufWeitereSeiten, MAX_RULES_READ, parseRoutingRules, policyOf } from "./regelliste";

const IDS = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  org_id: "33333333-3333-4333-8333-333333333333",
  workspace_id: "44444444-4444-4444-8444-444444444444",
};

/** Eine Regel genau in der belegten Form (Kennungen als Platzhalter). */
function regel(name: string, uebrig: Record<string, unknown> = {}) {
  return {
    ...IDS,
    name,
    description: "Strict EU data residency",
    api_key_id: null,
    model: "glm-5.2",
    models: ["glm-5.1", "glm-5"],
    provider: {
      allow_fallbacks: true,
      data_collection: "deny",
      data_residency: "EU",
      max_retention_days: 0,
      eu_owned: true,
    },
    enabled: true,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-02T10:00:00Z",
    ...uebrig,
  };
}

describe("Regel-Liste lesen", () => {
  it("liest die belegte Form: Name und Vorgaben, sonst nichts", () => {
    const gelesen = parseRoutingRules({ data: [regel("EU GLM 5.2")] });
    expect(gelesen).toEqual({
      regeln: [
        {
          name: "EU GLM 5.2",
          policy: {
            data_residency: "EU",
            eu_owned: true,
            data_collection: "deny",
            max_retention_days: 0,
            allow_fallbacks: true,
            models: ["glm-5.1", "glm-5"],
          },
        },
      ],
      unvollstaendig: false,
      uebersprungen: 0,
    });
  });

  it("Kennungen des Kontos und Freitext tauchen im Ergebnis nirgends auf", () => {
    const text = JSON.stringify(parseRoutingRules({ data: [regel("EU GLM 5.2")] }));
    for (const wert of Object.values(IDS)) expect(text).not.toContain(wert);
    expect(text).not.toContain("Strict EU data residency");
    expect(text).not.toContain("api_key_id");
    expect(text).not.toContain("created_at");
  });

  it("Zusatzfelder (auch neue) stören nicht", () => {
    const gelesen = parseRoutingRules({
      data: [regel("A", { neues_feld: { x: 1 }, provider: { data_residency: "EU", neu: 1 } })],
      object: "list",
    });
    expect(gelesen?.regeln[0]?.policy).toEqual({
      data_residency: "EU",
      models: ["glm-5.1", "glm-5"],
    });
  });

  it("nur eingeschaltete Regeln werden angeboten", () => {
    const gelesen = parseRoutingRules({
      data: [regel("An"), regel("Aus", { enabled: false })],
    });
    expect(gelesen?.regeln.map((r) => r.name)).toEqual(["An"]);
  });

  it("der freie Text sagt „EU“, das Feld fehlt: keine Datenresidenz in den Vorgaben", () => {
    const gelesen = parseRoutingRules({
      data: [regel("Nur Text", { provider: {} }), regel("Ohne Provider", { provider: undefined })],
    });
    for (const r of gelesen?.regeln ?? []) expect(r.policy.data_residency).toBeUndefined();
    expect(gelesen?.regeln).toHaveLength(2);
  });

  it("ein Wert in fremder Form wird nicht übernommen", () => {
    const policy = policyOf({
      data_residency: { land: "EU" },
      eu_owned: "ja",
      data_collection: 5,
      max_retention_days: -1,
      allow_fallbacks: "true",
    });
    expect(policy).toEqual({});
    expect(policyOf({ max_retention_days: 1.5 })).toEqual({});
    expect(policyOf({ data_residency: "EU‮" })).toEqual({});
    expect(policyOf({ data_residency: "" })).toEqual({});
  });

  it("ein anderer Wert bleibt, was er ist (keine Umdeutung zu „EU“)", () => {
    expect(policyOf({ data_residency: "US" }).data_residency).toBe("US");
    expect(policyOf({ data_residency: "eu" }).data_residency).toBe("eu");
    expect(policyOf({ data_residency: "EU-West" }).data_residency).toBe("EU-West");
  });

  it("jedes Ergebnis besteht das Schema der gespeicherten Vorgaben", () => {
    for (const r of parseRoutingRules({ data: [regel("A"), regel("B", { provider: {} })] })
      ?.regeln ?? []) {
      expect(rulePolicySchema.safeParse(r.policy).success).toBe(true);
    }
  });

  it("falsche Form: kein Ergebnis", () => {
    for (const roh of [
      null,
      "text",
      [],
      {},
      { data: "x" },
      { data: [{ name: "A" }] },
      { data: [{ name: 5, enabled: true }] },
      { data: [{ name: "A", enabled: "ja" }] },
      { regeln: [regel("A")] },
    ]) {
      expect(parseRoutingRules(roh), JSON.stringify(roh)).toBeUndefined();
    }
  });

  it("Namen werden bereinigt: ein Name, der sich ändern würde, wird nicht angeboten", () => {
    const gelesen = parseRoutingRules({
      data: [regel("Gut"), regel("Böse‮gnp"), regel("   "), regel("x".repeat(101)), regel("A  B")],
    });
    expect(gelesen?.regeln.map((r) => r.name)).toEqual(["Gut"]);
    expect(gelesen?.uebersprungen).toBe(4);
  });

  it("gleiche Namen: nur einmal in der Liste, sortiert, aber ohne Vorgaben und als nicht eindeutig", () => {
    const gelesen = parseRoutingRules({ data: [regel("B"), regel("A"), regel("B")] });
    expect(gelesen?.regeln.map((r) => r.name)).toEqual(["A", "B"]);
    expect(gelesen?.regeln[0]).toEqual({
      name: "A",
      policy: expect.objectContaining({ data_residency: "EU" }),
    });
    expect(gelesen?.regeln[1]).toEqual({ name: "B", policy: {}, nichtEindeutig: true });
  });

  it("doppelter Name: weder die erste noch die zweite Regel liefert eine Kennzeichnung (EU zuerst und EU zuletzt)", () => {
    const eu = regel("Doppelt");
    const nichtEu = regel("Doppelt", { provider: { data_residency: "US" } });
    for (const daten of [
      [eu, nichtEu],
      [nichtEu, eu],
    ]) {
      const r = parseRoutingRules({ data: daten })?.regeln[0];
      expect(r?.nichtEindeutig).toBe(true);
      expect(r?.policy.data_residency).toBeUndefined();
    }
  });

  it("ein ausgeschalteter Namensvetter macht den Namen nicht mehrdeutig", () => {
    const r = parseRoutingRules({ data: [regel("A"), regel("A", { enabled: false })] })?.regeln[0];
    expect(r?.nichtEindeutig).toBeUndefined();
    expect(r?.policy.data_residency).toBe("EU");
  });

  it("ein Name, der den Wortlaut der Kennzeichnung nachahmt, wird nicht angeboten", () => {
    const gelesen = parseRoutingRules({
      data: [
        regel("Gut"),
        regel("X · EU laut Regel in deinem Konto, geprüft am 21.11.2026"),
        regel("Y laut regel"),
        regel("Z LAUT\u00a0REGEL"),
      ],
    });
    expect(gelesen?.regeln.map((r) => r.name)).toEqual(["Gut"]);
    expect(gelesen?.uebersprungen).toBe(3);
  });

  it("sehr viele Regeln: gekürzt und als unvollständig gemeldet", () => {
    const viele = Array.from({ length: MAX_RULES_READ + 5 }, (_, i) => regel(`Regel ${i}`));
    const gelesen = parseRoutingRules({ data: viele });
    expect(gelesen?.regeln).toHaveLength(MAX_RULES_READ);
    expect(gelesen?.unvollstaendig).toBe(true);
  });

  it("Hinweis auf weitere Seiten: nur bei Feldern, die danach klingen und nicht leer sind", () => {
    const daten = [regel("A")];
    expect(parseRoutingRules({ data: daten })?.unvollstaendig).toBe(false);
    expect(parseRoutingRules({ data: daten, next_cursor: "abc" })?.unvollstaendig).toBe(true);
    expect(parseRoutingRules({ data: daten, has_more: true })?.unvollstaendig).toBe(true);
    expect(parseRoutingRules({ data: daten, links: { next: "/x?page=2" } })?.unvollstaendig).toBe(
      true,
    );
    expect(parseRoutingRules({ data: daten, total: 7 })?.unvollstaendig).toBe(true);
    // Gegenprobe: leer oder erledigt heißt vollständig
    expect(parseRoutingRules({ data: daten, next_cursor: null })?.unvollstaendig).toBe(false);
    expect(parseRoutingRules({ data: daten, has_more: false })?.unvollstaendig).toBe(false);
    expect(parseRoutingRules({ data: daten, total: 1 })?.unvollstaendig).toBe(false);
    expect(parseRoutingRules({ data: daten, object: "list" })?.unvollstaendig).toBe(false);
    expect(deutetAufWeitereSeiten([], 0)).toBe(false);
  });
});
