/**
 * PaiBot – prüft für jede Route des Vertrags: Sie nutzt den Rahmen `route(…)` (Ausnahmen: Health
 * und Ereignis-Strom mit eigener Prüfung) und weist ohne Sitzung ab; es gibt keine Route außerhalb
 * des Vertrags.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { API_ROUTEN, type RoutenName, routenOrdner } from "../routen";
import { _ersetzeProzessDienste } from "../zugang/dienste";
import { TEST_ORIGIN, testUmgebung } from "../zugang/testing";
import { rahmenVon } from "./route";

// Passwort-Rechnungen (scrypt) und Migrationen brauchen unter Last länger als die Standard-Zeit.
vi.setConfig({ testTimeout: 60_000 });

const APP = fileURLToPath(new URL("../../app", import.meta.url));
/** Routen mit eigener Antwortform, die bewusst nicht über den Rahmen laufen. */
const EIGENE_FORM: readonly RoutenName[] = ["health", "ereignisse"];

function dateiVon(name: RoutenName): string {
  return path.join(APP, routenOrdner(name), "route.ts");
}

beforeAll(async () => {
  const u = await testUmgebung();
  _ersetzeProzessDienste(u.dienste);
});

afterAll(() => _ersetzeProzessDienste(undefined));

describe("Routen-Vertrag", () => {
  const namen = Object.keys(API_ROUTEN) as RoutenName[];

  it.each(namen)("%s: gebaute Route nutzt den Rahmen und weist ohne Sitzung ab", async (name) => {
    const def = API_ROUTEN[name];
    const datei = dateiVon(name);
    if (!existsSync(datei)) return; // noch nicht gebaut: der Proxy weist ohne Sitzung ab (eigener Test)
    const modul = (await import(datei)) as Record<string, unknown>;
    const handler = modul[def.methode] as
      | ((r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Response>)
      | undefined;
    expect(handler, `${name}: ${def.methode} fehlt in ${datei}`).toBeTypeOf("function");
    if (!EIGENE_FORM.includes(name)) expect(rahmenVon(handler)).toBe(name);
    if (def.zugang !== "besitzer" || handler === undefined) return;
    const pfad = def.pfad.replace(/:[A-Za-z]+/g, "unt_06f8k2m9qz3w7x1c4b5n8p0r2t");
    const antwort = await handler(
      new Request(`${TEST_ORIGIN}${pfad}`, {
        method: def.methode,
        headers: { origin: TEST_ORIGIN },
      }),
      { params: Promise.resolve({ id: "unt_06f8k2m9qz3w7x1c4b5n8p0r2t" }) },
    );
    expect(antwort.status).toBe(401);
    expect(await antwort.json()).toMatchObject({ ok: false, fehler: { code: "nicht_angemeldet" } });
  });

  it("jede Datei unter app/api gehört zu einer Route des Vertrags (Methode und Pfad)", () => {
    const dateien: string[] = [];
    const suchen = (ordner: string) => {
      for (const eintrag of readdirSync(ordner)) {
        const voll = path.join(ordner, eintrag);
        if (statSync(voll).isDirectory()) suchen(voll);
        else if (eintrag === "route.ts") dateien.push(voll);
      }
    };
    suchen(path.join(APP, "api"));
    for (const datei of dateien) {
      const ordner = path.relative(APP, path.dirname(datei)).split(path.sep).join("/");
      const quelltext = readFileSync(datei, "utf8");
      const methoden = [
        ...quelltext.matchAll(
          /export (?:const|async function|function) (GET|POST|PUT|PATCH|DELETE)\b/g,
        ),
      ].map((m) => m[1]);
      expect(methoden.length, datei).toBeGreaterThan(0);
      for (const methode of methoden) {
        const passt = namen.some(
          (n) => routenOrdner(n) === ordner && API_ROUTEN[n].methode === methode,
        );
        expect(passt, `${methode} ${ordner} steht nicht im Routen-Vertrag`).toBe(true);
      }
    }
  });
});
