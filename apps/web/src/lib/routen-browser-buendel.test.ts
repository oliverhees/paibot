/**
 * PaiBot – Test: Was die Client-Teile der Seite „Apps“ und die Pfade der Web-App im Browser
 * mitbringen. Der Test baut die Einstiege (siehe `EINSTIEGE`) mit esbuild für den Browser (`bundle`,
 * `platform: "browser"`, mit dem Alias `@/`) und prüft die Liste der eingebundenen Dateien: Weder
 * Server-, Tor- noch Datenbank-Code, weder die Token-Verschlüsselung noch die MCP-Schicht noch
 * `node:*` dürfen darin stecken. Anders als die Suche in `routen-browser.test.ts`, die nur
 * relative Importe verfolgt, folgt er auch dem Alias und weitergereichten Importen aus Paketen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type BuildOptions, build } from "esbuild";
import { describe, expect, it } from "vitest";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HIER, "..");
const WURZEL = path.resolve(SRC, "../../..");

// `node:module` lädt die Web-App sonst nicht (Prüfregel); der Test braucht nur die Liste der Namen.
const { builtinModules } = process.getBuiltinModule("node:module");

/** Module von Node, mit und ohne Vorsilbe `node:`. */
const NODE_MODULE = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

/**
 * Einstiege, die im Browser laufen, relativ zu `apps/web/src`: die Dateien mit `"use client"` unter
 * `app/(app)/apps/` (`AppsAnsicht.tsx`, `error.tsx`) und die Dateien der Web-App, die der Browser
 * lädt. `page.tsx` und `loading.tsx` laufen auf dem Server und gehören nicht dazu. Kommt eine
 * weitere Client-Datei oder Ansicht dazu, gehört sie hierher.
 */
const EINSTIEGE = [
  "lib/routen.ts",
  "lib/sse/client-kern.ts",
  "app/(app)/apps/AppsAnsicht.tsx",
  "app/(app)/apps/error.tsx",
  "lib/apps/ansicht.ts",
  "lib/apps/pfade.ts",
  // Die Vorschau eines Team-Entwurfs prüft ihren Inhalt und rechnet den Abdruck im Browser. Sie
  // darf dafür das Format mitbringen (nur Web Crypto), aber nicht den Lader der Vorlagen und
  // nichts aus der Datenbank.
  "app/(app)/team-entwurf/TeamEntwurfSeite.tsx",
];

/** Dateien (relativ zur Wurzel des Repos), die nie im Browser-Bündel stehen dürfen. */
const VERBOTENE_DATEIEN: readonly RegExp[] = [
  // Server-, Tor-, Datenbank- und Lauf-Pakete, Token-Verschlüsselung, MCP-Schicht
  /^packages\/(?:agents|crypto|db|gate|jobs|llm|mcp|receipts|stub)\//,
  /^apps\/worker\//,
  // Bibliotheken des Servers
  /(?:^|\/)node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:postgres|drizzle-orm|@ai-sdk|pg-boss)(?:\/|$)/,
  // Teile der Apps, die mit Adresse, Token, Datenbank oder Sperre arbeiten, und das Verzeichnis
  // fertiger Apps (nur für den Server)
  /^apps\/web\/src\/lib\/apps\/(?:abgleich|adresse|dienste|seite|sperre|token|verwaltung|vorlagen)\.ts$/,
  // Lader der Team-Vorlagen: liest Dateien aus dem Image (nur für den Server)
  /^apps\/web\/src\/lib\/team\/entwurf\/vorlagen\.ts$/,
  // Tor und Datenbank der Web-App
  /^apps\/web\/src\/lib\/(?:datenbank|gate|speicher|warteschlange)\.ts$/,
];

interface Ergebnis {
  fehler: string[];
  dateien: string[];
  verboten: string[];
  nodeImporte: string[];
}

const OPTIONEN: BuildOptions = {
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false,
  metafile: true,
  logLevel: "silent",
  absWorkingDir: SRC,
  alias: { "@": SRC },
  jsx: "automatic",
  loader: { ".css": "local-css" },
  // CSS-Module brauchen einen Ausgabeort, geschrieben wird nichts (`write: false`).
  outdir: path.join(tmpdir(), "paibot-browser-buendel"),
  // Das Gerüst der Oberfläche gehört nicht zur Prüfung; Module von Node bleiben als Import sichtbar.
  external: ["react", "react/*", "react-dom", "react-dom/*", "next", "next/*", ...NODE_MODULE],
};

async function buendeln(einstieg: BuildOptions): Promise<Ergebnis> {
  let result: Awaited<ReturnType<typeof build>>;
  try {
    result = await build({ ...OPTIONEN, ...einstieg });
  } catch (error) {
    const fehler = (error as { errors?: { text: string }[] }).errors?.map((e) => e.text);
    return { fehler: fehler ?? [String(error)], dateien: [], verboten: [], nodeImporte: [] };
  }
  const meta = result.metafile as NonNullable<typeof result.metafile>;
  const dateien = Object.keys(meta.inputs)
    .map((datei) => path.relative(WURZEL, path.resolve(SRC, datei)).split(path.sep).join("/"))
    .sort();
  const nodeImporte = Object.values(meta.outputs)
    .flatMap((ausgabe) => ausgabe.imports)
    .filter((import_) => import_.external && NODE_MODULE.has(import_.path))
    .map((import_) => import_.path);
  return {
    fehler: result.errors.map((e) => e.text),
    dateien,
    verboten: dateien.filter((datei) => VERBOTENE_DATEIEN.some((muster) => muster.test(datei))),
    nodeImporte: [...new Set(nodeImporte)],
  };
}

describe("Browser-Bündel der Client-Teile der Seite „Apps“ und der Pfade", () => {
  for (const start of EINSTIEGE) {
    it(`${start}: kein Server-, Tor-, Datenbank- oder Token-Code im Bündel`, async () => {
      const ergebnis = await buendeln({ entryPoints: [path.join(SRC, start)] });
      expect(ergebnis.fehler).toEqual([]);
      expect(ergebnis.verboten).toEqual([]);
      expect(ergebnis.nodeImporte).toEqual([]);
      // Der Test sieht wirklich etwas: die Einstiegsdatei selbst steht im Bündel.
      expect(ergebnis.dateien).toContain(`apps/web/src/${start}`);
    });
  }

  it("die Seite zieht ihre Teile aus `lib/apps` ein, nur die für den Browser", async () => {
    const ergebnis = await buendeln({
      entryPoints: [path.join(SRC, "app/(app)/apps/AppsAnsicht.tsx")],
    });
    const apps = ergebnis.dateien.filter((datei) => datei.startsWith("apps/web/src/lib/apps/"));
    expect(apps).toContain("apps/web/src/lib/apps/ansicht.ts");
    expect(apps).toContain("apps/web/src/lib/apps/pfade.ts");
  });

  // Gegenproben im Test selbst: Dieselbe Prüfung findet Server-Code, auch wenn er über den Alias
  // `@/`, über ein Paket oder über einen weitergereichten Import hereinkommt. Die Suche in
  // `routen-browser.test.ts` sieht davon nichts.
  const PROBEN: Record<string, string> = {
    "Alias auf die Adresse mit Server-Anteilen":
      'import { zielAus } from "@/lib/apps/adresse"; export const x = zielAus;',
    "Alias auf den Token-Pfad": 'import "@/lib/apps/token"; export const x = 1;',
    "Alias auf die Verwaltung der Apps": 'import "@/lib/apps/verwaltung"; export const x = 1;',
    "Alias auf das Tor der Web-App": 'import "@/lib/gate"; export const x = 1;',
    "Alias auf das Verzeichnis fertiger Apps":
      'import { VORLAGEN } from "@/lib/apps/vorlagen"; export const x = VORLAGEN;',
    "Alias auf den Lader der Team-Vorlagen":
      'import { ladeVorlagen } from "@/lib/team/entwurf/vorlagen"; export const x = ladeVorlagen;',
    "Paket mit der Token-Verschlüsselung":
      'import { hashToken } from "@paibot/crypto"; export const x = hashToken;',
    "Paket mit der MCP-Schicht":
      'import { pruefeAdresse } from "@paibot/mcp"; export const x = pruefeAdresse;',
    "Paket mit der Datenbank": 'import { repo } from "@paibot/db"; export const x = repo;',
    "Paket mit dem Tor": 'import "@paibot/gate"; export const x = 1;',
    "Weitergereicht über eine Hilfsdatei der Web-App":
      'import { holeAdresse } from "@/lib/apps/ansicht-weg"; export const x = holeAdresse;',
  };

  /**
   * Die Datei, die eine Probe selbst melden muss. Wer nur prüft, dass „irgendetwas“ verboten ist,
   * bleibt grün, auch wenn die Datei aus der Sperrliste fehlt, weil ein Import von ihr gesperrt ist
   * (`vorlagen.ts` bindet `adresse.ts` ein).
   */
  const ERWARTETE_DATEI: Record<string, string> = {
    "Alias auf das Verzeichnis fertiger Apps": "apps/web/src/lib/apps/vorlagen.ts",
    "Alias auf den Lader der Team-Vorlagen": "apps/web/src/lib/team/entwurf/vorlagen.ts",
  };

  for (const [name, quelle] of Object.entries(PROBEN)) {
    it(`Gegenprobe: ${name}`, async () => {
      const ergebnis = await buendeln({
        entryPoints: undefined,
        stdin: { contents: quelle, resolveDir: SRC, sourcefile: "probe.ts", loader: "ts" },
        plugins: [
          {
            // Die Hilfsdatei gibt es nicht auf der Platte: Sie reicht `adresse` nur weiter.
            name: "weitergereicht",
            setup(b) {
              b.onResolve({ filter: /^@\/lib\/apps\/ansicht-weg$/ }, () => ({
                path: "ansicht-weg",
                namespace: "probe",
              }));
              b.onLoad({ filter: /.*/, namespace: "probe" }, () => ({
                contents: 'export { zielAus as holeAdresse } from "@/lib/apps/adresse";',
                resolveDir: SRC,
                loader: "ts",
              }));
            },
          },
        ],
      });
      expect(ergebnis.verboten.length, `${name}: ${ergebnis.fehler.join("; ")}`).toBeGreaterThan(0);
      const erwartet = ERWARTETE_DATEI[name];
      if (erwartet !== undefined) expect(ergebnis.verboten).toContain(erwartet);
    });
  }

  it("Gegenprobe: `node:*` im Bündel wird gesehen", async () => {
    const ergebnis = await buendeln({
      entryPoints: undefined,
      stdin: {
        contents: 'import { createHash } from "node:crypto"; export const x = createHash;',
        resolveDir: SRC,
        sourcefile: "probe.ts",
        loader: "ts",
      },
    });
    expect(ergebnis.nodeImporte).toEqual(["node:crypto"]);
  });
});
