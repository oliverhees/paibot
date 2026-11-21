/**
 * PaiBot – Tests der Datei-Antwort des API-Rahmens: sichere Kopfzeilen, nur einfache Dateinamen,
 * Zusatz-Kopfzeilen nur `X-Pb-…` und ohne Zeilenumbruch.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import { dateinameAus } from "./client";
import { dateiAntwort } from "./route";

describe("Datei-Antwort", () => {
  it("setzt Name, Typ und die sicheren Kopfzeilen; Inhalt unverändert", async () => {
    const antwort = dateiAntwort(
      {
        name: "beispiel-2026-11-21.jsonl",
        typ: "application/x-ndjson",
        inhalt: '{"a":1}\n',
        kopf: { "X-Pb-Eintraege": "1" },
      },
      ["pb_test=1; Path=/"],
    );
    expect(antwort.status).toBe(200);
    expect(Object.fromEntries(antwort.headers)).toMatchObject({
      "cache-control": "no-store",
      "content-type": "application/x-ndjson",
      "content-disposition": 'attachment; filename="beispiel-2026-11-21.jsonl"',
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "x-pb-eintraege": "1",
    });
    expect(antwort.headers.getSetCookie()).toEqual(["pb_test=1; Path=/"]);
    expect(await antwort.text()).toBe('{"a":1}\n');
    expect(dateinameAus(antwort.headers.get("content-disposition"))).toBe(
      "beispiel-2026-11-21.jsonl",
    );
  });

  it.each([
    ['a"b.txt', "text/plain"],
    ["../geheim", "text/plain"],
    ["", "text/plain"],
    ["ok.txt", "text/plain; x=1"],
    ["ok.txt", "Text/Plain"],
  ])("lehnt Name %j oder Typ %j ab", (name, typ) => {
    expect(() => dateiAntwort({ name, typ, inhalt: "" })).toThrow();
  });

  it("lehnt fremde oder mehrzeilige Zusatz-Kopfzeilen ab", () => {
    const basis = { name: "a.txt", typ: "text/plain", inhalt: "" };
    expect(() => dateiAntwort({ ...basis, kopf: { "X-Pb-A": "1\r\nSet-Cookie: x=1" } })).toThrow();
    expect(() =>
      dateiAntwort({
        ...basis,
        kopf: { "Set-Cookie": "x=1" } as unknown as Record<`X-Pb-${string}`, string>,
      }),
    ).toThrow();
  });

  it("Dateiname aus der Kopfzeile nur in einfacher Form", () => {
    expect(dateinameAus(null)).toBeUndefined();
    expect(dateinameAus('attachment; filename="../x"')).toBeUndefined();
    expect(dateinameAus('attachment; filename="paibot.jsonl"')).toBe("paibot.jsonl");
  });
});
