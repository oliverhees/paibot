/**
 * PaiBot – Test der Verdrahtung der echten App-Dienste: Jeder Abruf baut eine eigene Ausgangs-Hülle
 * mit genau einem Ziel (Ziel-Vergleich, Namen der eigenen Dienste gesperrt) und reicht genau diese
 * Hülle an die MCP-Schicht weiter. Die Hülle und die Schicht sind hier Beobachter, nicht die echten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { egressTargetOf, INTERNAL_SERVICE_HOSTS } from "@paibot/llm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { echteAppDienste } from "./dienste";

const beobachter = vi.hoisted(() => ({
  huellen: [] as { argumente: unknown[]; huelle: typeof fetch }[],
  schicht: [] as { fetch: unknown; adresse: unknown; token: unknown; appKurzname: unknown }[],
}));

vi.mock("@paibot/llm", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@paibot/llm")>();
  return {
    ...echt,
    createEgressFetch: (...argumente: unknown[]) => {
      const huelle = (async () => new Response("{}")) as unknown as typeof fetch;
      beobachter.huellen.push({ argumente, huelle });
      return huelle;
    },
  };
});

vi.mock("@paibot/mcp", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@paibot/mcp")>();
  return {
    ...echt,
    holeWerkzeuge: async (optionen: {
      fetch: unknown;
      adresse: unknown;
      token: unknown;
      appKurzname: unknown;
    }) => {
      beobachter.schicht.push(optionen);
      return { werkzeuge: [], serverName: "x", seiten: 1, abgeschnitten: false };
    },
  };
});

beforeEach(() => {
  beobachter.huellen.length = 0;
  beobachter.schicht.length = 0;
});

const ADRESSE = "https://mcp.beispiel.de/mcp";

describe("echteAppDienste", () => {
  it("baut je Abruf eine eigene Hülle mit genau einem Ziel, den Namen der eigenen Dienste gesperrt, ohne eigenes fetch", async () => {
    await echteAppDienste().werkzeugeAbrufen({
      adresse: ADRESSE,
      appKurzname: "beispiel",
      bekannteNamen: new Map(),
    });
    await echteAppDienste().werkzeugeAbrufen({
      adresse: ADRESSE,
      appKurzname: "beispiel",
      bekannteNamen: new Map(),
    });
    expect(beobachter.huellen).toHaveLength(2);
    expect(beobachter.huellen[0]?.huelle).not.toBe(beobachter.huellen[1]?.huelle);
    // Genau ein Ziel (Protokoll, Host, Port der App), `denyAddressesOf` mit den Namen der Dienste,
    // und keine weiteren Argumente: kein `fetch` darunter, keine Optionen.
    expect(beobachter.huellen[0]?.argumente).toEqual([
      [{ ...egressTargetOf(ADRESSE), denyAddressesOf: INTERNAL_SERVICE_HOSTS }],
    ]);
    expect(egressTargetOf(ADRESSE)).toMatchObject({ protocol: "https:", host: "mcp.beispiel.de" });
  });

  it("reicht genau diese Hülle, die Adresse und den Zugang an die Schicht weiter", async () => {
    await echteAppDienste().werkzeugeAbrufen({
      adresse: ADRESSE,
      appKurzname: "beispiel",
      bekannteNamen: new Map(),
      token: "tok-0123456789abcdef",
    });
    expect(beobachter.schicht).toHaveLength(1);
    expect(beobachter.schicht[0]?.fetch).toBe(beobachter.huellen[0]?.huelle);
    expect(beobachter.schicht[0]).toMatchObject({
      adresse: ADRESSE,
      token: "tok-0123456789abcdef",
      appKurzname: "beispiel",
    });
  });
});
