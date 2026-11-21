/**
 * PaiBot – eingefrorene Dateien bleiben Byte für Byte gleich: Fassung 1 des Tors, die festen Fälle
 * der Fassungen und die festen Beleg-Ketten. Jede Änderung, auch an Leerzeichen oder Kommentaren,
 * macht diesen Test rot.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";

/*
 * Das Tor-Paket kennt die Typen von Node nicht (es läuft ohne Datei- und Netzzugriff). Nur dieser
 * Test liest Dateien, deshalb holt er `node:fs` über `process.getBuiltinModule` mit einem
 * eigenen, kleinen Typ; die Prüfsumme rechnet Web Crypto.
 */
interface NodeFs {
  readFileSync(path: URL): Uint8Array<ArrayBuffer>;
}
const nodeFs = (
  globalThis as unknown as { process: { getBuiltinModule(id: "node:fs"): NodeFs } }
).process.getBuiltinModule("node:fs");

const MELDUNG = "Eine Fassung wird nie geändert; lege eine neue an.";

/** SHA-256 (Hex) je eingefrorener Datei, Pfad relativ zu diesem Ordner. */
const EINGEFROREN: Readonly<Record<string, string>> = {
  "./fassung-1.ts": "c308478cd290fd5b6f2919924971f54581a7e8c05df9ff65d564d18356c77c98",
  "./fassung-1.korpus.json": "51e1e509336dca9eb0fe5505c1bc0bd4afbd45c5ba956cd2d3b2e3a944e80338",
  "./fassung-2.korpus.json": "41263028e1219cd4ee01a8778544a9697f379a66471f9ea1ec44bf94ee727653",
  "../../../receipts/src/testdaten/kette-vor-fassung.jsonl":
    "9ad3e785369d054078213238428d7cbfbda5212758d66ec39c093cfba100b295",
  "../../../receipts/src/testdaten/kette-l1.jsonl":
    "a06bd6d41f2f4f40615fa39d231482bef2be10fe8333e3993114ecf7fe780a4b",
};

async function sha256(pfad: string): Promise<string> {
  const bytes = nodeFs.readFileSync(new URL(pfad, import.meta.url));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("eingefrorene Dateien", () => {
  for (const [pfad, summe] of Object.entries(EINGEFROREN)) {
    it(`${pfad} ist unverändert`, async () => {
      expect(await sha256(pfad), `${pfad}: ${MELDUNG}`).toBe(summe);
    });
  }
});
