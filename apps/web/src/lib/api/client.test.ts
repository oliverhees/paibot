/**
 * PaiBot – prüft die Oberfläche des Zugangs: Browser-Module laden weder Zod noch den Routen-Vertrag
 * (strenge Content-Security-Policy ohne Code-Auswertung), und jeder API-Aufruf steht im Vertrag.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { API_ROUTEN } from "../routen";

const CLIENT = [
  "../../app/einrichtung/Einrichtung.tsx",
  "../../app/anmelden/Anmelden.tsx",
  "../../app/(app)/AppRahmen.tsx",
  "./client.ts",
].map((datei) => ({ datei, text: readFileSync(new URL(datei, import.meta.url), "utf8") }));

describe("Browser-Module des Zugangs", () => {
  it.each(CLIENT)(
    "$datei lädt weder Zod noch Eingabe-Schemas noch den Routen-Vertrag",
    ({ text }) => {
      // Nur Importe mit Wirkung zur Laufzeit zählen; `import type` verschwindet beim Bauen.
      const importe = [...text.matchAll(/^import (?!type )[^;]*?from "([^"]+)";/gms)].map(
        (m) => m[1],
      );
      for (const modul of importe) {
        expect(modul).not.toBe("zod");
        expect(modul).not.toMatch(
          /^@paibot\/shared(\/(eingaben|api|aktionen|objekte|tor|belege))?$/,
        );
        expect(modul).not.toMatch(/(^|\/)routen$/);
      }
    },
  );

  it("jeder Aufruf von apiFetch nennt Methode und Pfad einer Route des Vertrags", () => {
    const aufrufe = CLIENT.flatMap(({ text }) => [
      ...text.matchAll(/apiFetch(?:<[^>]*>)?\(\s*"(GET|POST|PUT|PATCH|DELETE)",\s*"([^"]+)"/g),
    ]);
    expect(aufrufe.length).toBeGreaterThanOrEqual(4);
    for (const [, methode, pfad] of aufrufe) {
      const route = Object.values(API_ROUTEN).find((r) => r.methode === methode && r.pfad === pfad);
      expect(route, `${methode} ${pfad}`).toBeDefined();
    }
  });
});
