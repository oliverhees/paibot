/**
 * PaiBot – eingefrorene Dateien bleiben Byte für Byte gleich: die Fassungen 1 bis 3 des Tors, ihre
 * festen Fälle, die festen Beleg-Ketten und die Lese-Schemata der alten Stände. Jede Änderung,
 * auch an Leerzeichen oder Kommentaren, macht diesen Test rot.
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
  "./fassung-2.ts": "eae9f14666a075fc1cdbe27de4f643612efd520b8dbb8c321d310e66e40e8f46",
  "./fassung-2.korpus.json": "41263028e1219cd4ee01a8778544a9697f379a66471f9ea1ec44bf94ee727653",
  "./fassung-3.ts": "1760a3839e7eaa170e684055014b6fd5d48de3ec8b78201193bc472151d63186",
  "./fassung-3.korpus.json": "2a0b299bb8053eeea843c63901718b95aa8927a22d418c76ed0fe419854e946d",
  "../../../receipts/src/testdaten/kette-vor-fassung.jsonl":
    "9ad3e785369d054078213238428d7cbfbda5212758d66ec39c093cfba100b295",
  "../../../receipts/src/testdaten/kette-l1.jsonl":
    "a06bd6d41f2f4f40615fa39d231482bef2be10fe8333e3993114ecf7fe780a4b",
  "../../../receipts/src/testdaten/lese-schema-vor-fassung.ts":
    "7c01d573d95816f37e5e15de02a6b71df4ddfbd44697347080b2e4567481c9ec",
  "../../../receipts/src/testdaten/lese-schema-l1.ts":
    "d1e837825bef7828d964a2560d27cd2d573faebfda2c4080a7010dd42e5304a6",
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
