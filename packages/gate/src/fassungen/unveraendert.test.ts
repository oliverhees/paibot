/**
 * PaiBot – eingefrorene Dateien bleiben Byte für Byte gleich: die Fassungen 1 bis 4 des Tors, ihre
 * festen Fälle (auch die der Fassung 5), die festen Beleg-Ketten und die Lese-Schemata der alten
 * Stände. Jede Änderung, auch an Leerzeichen oder Kommentaren, macht diesen Test rot.
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
  // Fassung 2: zum zweiten Mal neu am 2026-11-22; der Name einer Grenze steht jetzt fest in der
  // Datei statt aus den lebenden Verträgen (nur Typ; Ausgabe ohne Typen Byte für Byte gleich).
  // Fassung 1 und 2: Prüfsummen einmalig neu am 2026-11-22, nur weil ihre Liste der Aktionen seitdem
  // als fester Typ in der Datei steht (Ausnahme am Typ; Ausgabe ohne Typen und feste Fälle gleich).
  "./fassung-1.ts": "5e83a38a610ad1be5ecbae62e9497a497081f88d2599f06101241775ecc77363",
  "./fassung-1.korpus.json": "51e1e509336dca9eb0fe5505c1bc0bd4afbd45c5ba956cd2d3b2e3a944e80338",
  "./fassung-2.ts": "3d91d31bbcdc0f7ce06bc742cbc38d76fe38aea963d90be484f3c620bd274292",
  "./fassung-2.korpus.json": "41263028e1219cd4ee01a8778544a9697f379a66471f9ea1ec44bf94ee727653",
  "./fassung-3.ts": "2160046e50c9262cccb12419a5e7a36405ac7f21f7fca202c27c49b7582196fd",
  "./fassung-3.korpus.json": "2f345c2787ca57684601959c4ea11002b2888b98045c5d82cfc3f2ec1bbee84a",
  // Fassung 4: eingefroren mit dem Inkraftsetzen (Migration 0018, `GATE_FORMAT = 4`).
  "./fassung-4.ts": "0222d6f8cdef34a330308d22b1610e322f6ebbbe6371b992e1e50322371b09bf",
  "./fassung-4.korpus.json": "99cb57cadaf96489ac077967ee72ac25645b7cd55a34b46e3e50021d7577bf75",
  // Fassung 5: feste Fälle eingefroren vor der Auswertung (die Auswertung selbst kommt danach).
  "./fassung-5.korpus.json": "070be5f461d51ee7d880f99c41222b471fb3ca6950681abd89f13b1dd90cc2c9",
  "../../../receipts/src/testdaten/kette-vor-fassung.jsonl":
    "9ad3e785369d054078213238428d7cbfbda5212758d66ec39c093cfba100b295",
  "../../../receipts/src/testdaten/kette-l1.jsonl":
    "a06bd6d41f2f4f40615fa39d231482bef2be10fe8333e3993114ecf7fe780a4b",
  // Feste Kette vom Stand mit Tor-Fassung 4, erzeugt vor dem Umschalten auf Fassung 5.
  "../../../receipts/src/testdaten/kette-f4.jsonl":
    "f1f03926ff90bc52eaf25fd94d1d7f94e01bce8198db20dc5c2248338e68f751",
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
