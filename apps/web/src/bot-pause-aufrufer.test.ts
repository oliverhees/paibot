/**
 * PaiBot – Quelltext-Test: Jede Stelle, die eine Anfrage `modell.anfragen`, `nachricht.senden`
 * oder `werkzeug.aufrufen` ans Tor stellt, füllt den Fakt `botPaused` (Grenze G-15). Der Test sucht
 * alle solchen Stellen im Quelltext (Web-App, Worker, alle Pakete, ohne Tests) und vergleicht sie mit
 * einer festen Liste: Eine neue Stelle (etwa im Teamchat oder in einer Automation) fällt hier auf, bis
 * sie in der Liste steht und den Fakt füllt. Die Typen allein reichen nicht, weil Fakten auch aus
 * Teilen zusammengesetzt werden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WURZEL = fileURLToPath(new URL("../../..", import.meta.url));
const ORDNER = ["apps/web/src", "apps/worker/src", "packages"];

/** Die Aktionen, an denen G-15 gilt. */
const AKTIONEN = ["modell.anfragen", "nachricht.senden", "werkzeug.aufrufen"] as const;

/**
 * Alle Stellen, die eine solche Anfrage bilden, und die Datei, in der ihre Fakten stehen. Wer eine
 * neue Stelle anlegt, trägt sie hier ein und füllt \`botPaused\` aus dem Stand des Bots (frisch gelesen).
 */
const AUFRUFER: Record<string, { aktion: (typeof AKTIONEN)[number]; fakten: string }> = {
  "apps/web/src/lib/chat/aktionen.ts": {
    aktion: "nachricht.senden",
    fakten: "apps/web/src/lib/chat/aktionen.ts",
  },
  "packages/agents/src/run/schleife.ts": {
    aktion: "modell.anfragen",
    fakten: "packages/agents/src/run/kontext.ts",
  },
  "packages/agents/src/run/aufruf.ts": {
    aktion: "werkzeug.aufrufen",
    fakten: "packages/agents/src/run/aufruf.ts",
  },
};

function quelltexte(ordner: string): string[] {
  const liste: string[] = [];
  const voll = path.join(WURZEL, ordner);
  if (!existsSync(voll)) return liste;
  const gehe = (pfad: string) => {
    for (const eintrag of readdirSync(pfad)) {
      if (["node_modules", "dist", ".next", "testdaten", "testing", "korpus"].includes(eintrag)) {
        continue;
      }
      const p = path.join(pfad, eintrag);
      if (statSync(p).isDirectory()) gehe(p);
      else if (
        /\.(ts|tsx|mts)$/.test(eintrag) &&
        !/\.test\.(ts|tsx)$/.test(eintrag) &&
        !/(^|\/)(testing|testhilfe|testhilfen|testdaten)\.ts$/.test(p)
      ) {
        liste.push(path.relative(WURZEL, p).split(path.sep).join("/"));
      }
    }
  };
  gehe(voll);
  return liste;
}

const ohneKommentare = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** Aktionen, die eine Datei als Anfrage ans Tor bildet: `type: "<aktion>"` im Quelltext. */
function gebildeteAnfragen(text: string): string[] {
  const code = ohneKommentare(text);
  return AKTIONEN.filter((aktion) => new RegExp(`\\btype:\\s*"${aktion}"`).test(code));
}

describe("botPaused: alle Aufrufer des Tors füllen den Fakt", () => {
  const dateien = ORDNER.flatMap(quelltexte).filter((d) => !d.startsWith("packages/gate/"));

  it("es gibt genau die Aufrufer der Liste, keinen weiteren (Teamchat, Automation, Hilfen)", () => {
    expect(dateien.length).toBeGreaterThan(100);
    const gefunden: Record<string, string[]> = {};
    for (const datei of dateien) {
      const anfragen = gebildeteAnfragen(readFileSync(path.join(WURZEL, datei), "utf8"));
      if (anfragen.length > 0) gefunden[datei] = anfragen;
    }
    expect(gefunden).toEqual(
      Object.fromEntries(Object.entries(AUFRUFER).map(([datei, a]) => [datei, [a.aktion]])),
    );
  });

  it("die Fakten jedes Aufrufers tragen botPaused", () => {
    for (const [datei, a] of Object.entries(AUFRUFER)) {
      const text = ohneKommentare(readFileSync(path.join(WURZEL, a.fakten), "utf8"));
      expect(/\bbotPaused:/.test(text), `${datei} (${a.aktion}) in ${a.fakten}`).toBe(true);
    }
  });

  it("der Pausen-Stand kommt aus der Datenbank, nicht aus dem Lauf-Start: frisch je Schritt und je Aufruf", () => {
    const lies = (d: string) => readFileSync(path.join(WURZEL, d), "utf8");
    expect(lies("packages/agents/src/run/schleife.ts")).toMatch(/readBotPaused\(db, run\.botId\)/);
    expect(lies("packages/agents/src/run/aufruf.ts")).toMatch(/readBotPaused\(db, run\.botId\)/);
    expect(lies("apps/web/src/lib/chat/aktionen.ts")).toMatch(/repo\.bots\.get\(k\.db, /);
  });

  // Gegenprobe: das Muster erkennt jede der drei Anfragen, und Kommentare zählen nicht.
  it("erkennt die drei Anfragen im Text", () => {
    expect(gebildeteAnfragen('const a = { type: "modell.anfragen", target: 1 };')).toEqual([
      "modell.anfragen",
    ]);
    expect(
      gebildeteAnfragen('{ type: "nachricht.senden" } // und { type: "modell.anfragen" }'),
    ).toEqual(["nachricht.senden"]);
    expect(
      gebildeteAnfragen(
        'const x: ActionRequest<"werkzeug.aufrufen"> = { type: "werkzeug.aufrufen" }',
      ),
    ).toEqual(["werkzeug.aufrufen"]);
    expect(gebildeteAnfragen('export const A = ["modell.anfragen"];')).toEqual([]);
  });
});
