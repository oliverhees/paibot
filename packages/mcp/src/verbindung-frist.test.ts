/**
 * PaiBot – Test: die eigene Frist der MCP-Schicht gilt auch dann, wenn die Bibliothek keine hat.
 *
 * Die Bibliothek wird hier durch eine Attrappe ersetzt, die jede Zeitgrenze und jedes Signal
 * ignoriert und nie antwortet. Trägt die Schicht ihre eigene Frist nicht, hängt der Aufruf.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpSchichtFehler } from "./fehler";
import { type McpFetch, oeffneVerbindung } from "./verbindung";

const attrappe = vi.hoisted(() => ({
  /** Was `createMCPClient` tut: eine Attrappe liefern oder nie fertig werden. */
  oeffnenHaengt: false,
  /** Was `close` tut. */
  schliessenHaengt: true,
  aufrufe: [] as string[],
}));

vi.mock("@ai-sdk/mcp", () => ({
  createMCPClient: () => {
    attrappe.aufrufe.push("createMCPClient");
    if (attrappe.oeffnenHaengt) return new Promise(() => undefined);
    return Promise.resolve({
      serverInfo: { name: "attrappe" },
      listTools: () => {
        attrappe.aufrufe.push("listTools");
        return new Promise(() => undefined);
      },
      callTool: () => {
        attrappe.aufrufe.push("callTool");
        return new Promise(() => undefined);
      },
      close: () => {
        attrappe.aufrufe.push("close");
        return attrappe.schliessenHaengt ? new Promise(() => undefined) : Promise.resolve();
      },
    });
  },
}));

const BASIS = {
  erlaubeHttp: true,
  appKurzname: "test",
  adresse: "http://127.0.0.1:1/mcp",
  fetch: (async () => {
    throw new Error("Die Attrappe darf kein fetch aufrufen.");
  }) as McpFetch,
} as const;

/** Frist der Tests in Millisekunden; kurz, damit der Test schnell ist, ohne Schranke nach oben. */
const KURZ = { aufrufMs: 150, listeMs: 150, schliessenMs: 150 };

async function fehlerCode(wer: Promise<unknown>): Promise<string> {
  try {
    await wer;
  } catch (fehler) {
    if (fehler instanceof McpSchichtFehler) return fehler.code;
    throw fehler;
  }
  return "kein_fehler";
}

beforeEach(() => {
  attrappe.oeffnenHaengt = false;
  attrappe.schliessenHaengt = true;
  attrappe.aufrufe.length = 0;
});

describe("eigene Frist der Schicht (die Bibliothek hält keine ein)", () => {
  it("der Aufruf eines Werkzeugs endet an der Frist, auch wenn die Bibliothek nie antwortet", async () => {
    const verbindung = await oeffneVerbindung({ ...BASIS, grenzen: KURZ });
    expect(await fehlerCode(verbindung.rufeAuf("w", {}))).toBe("zeit_ueberschritten");
    expect(attrappe.aufrufe).toContain("callTool");
  });

  it("das Holen der Liste endet an der Frist", async () => {
    const verbindung = await oeffneVerbindung({ ...BASIS, grenzen: KURZ });
    expect(await fehlerCode(verbindung.listeRoh())).toBe("zeit_ueberschritten");
    expect(attrappe.aufrufe).toContain("listTools");
  });

  it("das Öffnen endet an der Frist, wenn der Aufbau nie fertig wird", async () => {
    attrappe.oeffnenHaengt = true;
    expect(await fehlerCode(oeffneVerbindung({ ...BASIS, grenzen: KURZ }))).toBe(
      "zeit_ueberschritten",
    );
  });

  it("ein Abbruch von außen endet den Aufruf sofort, auch wenn die Bibliothek das Signal ignoriert", async () => {
    const verbindung = await oeffneVerbindung({ ...BASIS, grenzen: { ...KURZ, aufrufMs: 60_000 } });
    const abbruch = new AbortController();
    const lauf = fehlerCode(verbindung.rufeAuf("w", {}, { signal: abbruch.signal }));
    await vi.waitFor(() => expect(attrappe.aufrufe).toContain("callTool"));
    abbruch.abort();
    expect(await lauf).toBe("abgebrochen");
  });

  it("das Schließen endet an der Frist; danach geht nichts mehr hinaus", async () => {
    const verbindung = await oeffneVerbindung({ ...BASIS, grenzen: KURZ });
    await verbindung.schliesse();
    expect(attrappe.aufrufe).toContain("close");
    expect(await fehlerCode(verbindung.rufeAuf("w", {}))).toBe("verbindung_geschlossen");
    expect(attrappe.aufrufe.filter((a) => a === "callTool")).toEqual([]);
  });
});
