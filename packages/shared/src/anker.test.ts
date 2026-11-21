/**
 * PaiBot – Tests: Anker der Beleg-Kette und Urteil des Prüfers.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import {
  CHAIN_PROBLEMS,
  type ChainAnchor,
  chainTrustLevel,
  chainVerdictSchema,
  encodeAnchor,
  parseAnchor,
  receiptExportHeaderSchema,
} from "./receipts";

const anchor: ChainAnchor = {
  format: "pb-anker",
  v: 1,
  installationId: "ins_06f8k2m9qz3w7x1c4b5n8p0r2t" as ChainAnchor["installationId"],
  seq: 42,
  hash: `sha256:${"1f".repeat(32)}`,
  keyId: "sch_06f8k2m9qz3w7x1c4b5n8p0r2v" as ChainAnchor["keyId"],
  startKeyId: "sch_06f8k2m9qz3w7x1c4b5n8p0r2t" as ChainAnchor["startKeyId"],
  startPublicKey: `${"Q".repeat(42)}A`,
  time: "2026-11-20T10:00:00.000Z",
};

describe("Anker", () => {
  it("geht als eine Zeile in fester Reihenfolge hin und zurück", () => {
    const text = encodeAnchor(anchor);
    expect(text).not.toContain("\n");
    expect(Object.keys(JSON.parse(text))).toEqual([
      "format",
      "v",
      "installationId",
      "seq",
      "hash",
      "keyId",
      "startKeyId",
      "startPublicKey",
      "time",
    ]);
    expect(parseAnchor(`  ${text}\n`)).toEqual(anchor);
  });

  it("weist unvollständige, fremde und erweiterte Anker ab", () => {
    expect(() => parseAnchor("kein json")).toThrow();
    expect(() => parseAnchor(JSON.stringify({ ...anchor, format: "pb-belege" }))).toThrow();
    expect(() => parseAnchor(JSON.stringify({ ...anchor, seq: 0 }))).toThrow();
    expect(() => parseAnchor(JSON.stringify({ ...anchor, extra: 1 }))).toThrow();
    const { startPublicKey: _, ...ohneStart } = anchor;
    expect(() => parseAnchor(JSON.stringify(ohneStart))).toThrow();
  });

  it("steht optional in der Kopfzeile des Exports", () => {
    const header = {
      format: "pb-belege",
      v: 1,
      installationId: anchor.installationId,
      publicKeys: [
        {
          keyId: anchor.startKeyId,
          publicKey: anchor.startPublicKey,
          fingerprint: "3f9c-2ab1-77d0-e4c5",
        },
      ],
    };
    expect(receiptExportHeaderSchema.safeParse(header).success).toBe(true);
    expect(receiptExportHeaderSchema.safeParse({ ...header, anchor }).success).toBe(true);
  });
});

describe("Urteil über die Kette", () => {
  it("ungültig vor gebrochenem Vertrauen vor vertrauenswürdig", () => {
    expect(chainTrustLevel([], true)).toBe("vertrauenswuerdig");
    expect(chainTrustLevel([], false)).toBe("ungueltig");
    expect(chainTrustLevel([{ problem: "schluesselwechsel_nicht_beglaubigt" }], true)).toBe(
      "vertrauen_gebrochen",
    );
    expect(
      chainTrustLevel(
        [{ problem: "schluesselwechsel_nicht_beglaubigt" }, { problem: "kette_kuerzer_als_anker" }],
        true,
      ),
    ).toBe("ungueltig");
  });

  it("jedes Problem außer dem unbeglaubigten Wechsel und der unbekannten Fassung macht die Kette ungültig", () => {
    for (const problem of CHAIN_PROBLEMS) {
      const level = chainTrustLevel([{ problem }], true);
      const expected =
        problem === "schluesselwechsel_nicht_beglaubigt"
          ? "vertrauen_gebrochen"
          : problem === "fassung_unbekannt"
            ? "nicht_pruefbar"
            : "ungueltig";
      expect(level).toBe(expected);
    }
  });

  it("Rangfolge: ungültig vor nicht prüfbar vor gebrochen vor vertrauenswürdig", () => {
    const gebrochen = { problem: "schluesselwechsel_nicht_beglaubigt" } as const;
    const unbekannt = { problem: "fassung_unbekannt" } as const;
    const unpassend = { problem: "fassung_unpassend" } as const;
    expect(chainTrustLevel([], true)).toBe("vertrauenswuerdig");
    expect(chainTrustLevel([gebrochen], true)).toBe("vertrauen_gebrochen");
    expect(chainTrustLevel([gebrochen, unbekannt], true)).toBe("nicht_pruefbar");
    expect(chainTrustLevel([unbekannt, gebrochen], true)).toBe("nicht_pruefbar");
    expect(chainTrustLevel([unbekannt, unpassend], true)).toBe("ungueltig");
    expect(chainTrustLevel([unbekannt], false)).toBe("ungueltig");
  });

  it("das Urteil nennt, ob ein Anker geprüft wurde", () => {
    const verdict = {
      level: "vertrauen_gebrochen",
      findings: [{ problem: "schluesselwechsel_nicht_beglaubigt", seq: 9, keyId: anchor.keyId }],
      anchor: "fehlt",
    };
    expect(chainVerdictSchema.parse(verdict)).toEqual(verdict);
    expect(chainVerdictSchema.safeParse({ ...verdict, anchor: "ja" }).success).toBe(false);
  });
});
