/**
 * PaiBot – prüft die Browser-Module des Chats: Sie laden weder Zod noch Eingabe-Schemas noch den
 * Routen-Vertrag (strenge Content-Security-Policy), und Zod läuft im Browser ohne Code-Auswertung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MODULE = [
  "../../app/(app)/AppRahmen.tsx",
  "../../app/(app)/chat/ChatSeite.tsx",
  "../../app/(app)/chat/BelegeFlaeche.tsx",
  "./ansicht.ts",
  "./anzeige.ts",
  "./pfade.ts",
  "./rahmen-kontext.tsx",
  "../speicher.ts",
  "../navigation.ts",
].map((datei) => ({ datei, text: readFileSync(new URL(datei, import.meta.url), "utf8") }));

describe("Browser-Module des Chats", () => {
  it.each(MODULE)(
    "$datei lädt weder Zod noch Eingabe-Schemas noch den Routen-Vertrag",
    ({ text }) => {
      const importe = [...text.matchAll(/^import (?!type )[^;]*?from "([^"]+)";/gms)].map(
        (m) => m[1],
      );
      for (const modul of importe) {
        expect(modul).not.toBe("zod");
        expect(modul).not.toMatch(
          /^@paibot\/shared(\/(eingaben|api|aktionen|objekte|tor|belege))?$/,
        );
        expect(modul).not.toMatch(/(^|\/)routen$/);
        expect(modul).not.toMatch(/(^|\/)(laden|aktionen)$/);
      }
    },
  );

  it("die Einstiege des Chats schalten Zod als Erstes auf „ohne Code-Auswertung“", () => {
    for (const datei of ["../../app/(app)/AppRahmen.tsx", "../../app/(app)/chat/ChatSeite.tsx"]) {
      const text = readFileSync(new URL(datei, import.meta.url), "utf8");
      const erster = text.match(/^import [^;]*;/m)?.[0];
      expect(erster, datei).toMatch(/^import "[./]+lib\/ohne-auswertung";$/);
    }
  });
});
