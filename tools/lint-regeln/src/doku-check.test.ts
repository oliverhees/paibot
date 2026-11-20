/**
 * PaiBot – Test, dass `pnpm doku:check` jede Lücke in der Doku erkennt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = path.join(ROOT, "scripts", "doku-check.mjs");

interface Meldung {
  file: string;
  problem: string;
  fix: string;
}
interface Ergebnis {
  fehler: Meldung[];
  warnungen: Meldung[];
  uebergang: string[];
}
const { pruefeDoku } = (await import(pathToFileURL(SCRIPT).href)) as {
  pruefeDoku: (optionen: { wurzel: string; streng?: boolean }) => Ergebnis;
};

const VORLAGE = [
  "# <Name>",
  "",
  "## Wofür",
  "",
  "## So benutzt du es",
  "",
  "1. <Schritt>",
  "",
  "## So sieht es aus",
  "",
  "![<Alt>](assets/screenshots/<name>.png)",
  "",
  "## Grenzen",
  "",
].join("\n");

const SEITE = [
  "# Beispiel",
  "",
  "## Wofür",
  "",
  "Zum Testen.",
  "",
  "## So benutzt du es",
  "",
  "1. Öffnen",
  "2. Klicken",
  "",
  "## So sieht es aus",
  "",
  "![Beispiel](assets/screenshots/beispiel.png)",
  "",
  "## Grenzen",
  "",
  "- keine",
  "",
].join("\n");

type Dateien = Record<string, string>;

/** Ein vollständiges, fehlerfreies Beispiel-Projekt. */
function grundstock(): Dateien {
  return {
    "README.md": "# Projekt\n\n![Banner](docs/assets/banner.png)\n\n[Doku](docs/README.md)\n",
    "docs/README.md":
      "# Doku\n\n- [Beispiel](funktion-beispiel.md)\n- [Vorlage](VORLAGE-funktion.md)\n",
    "docs/VORLAGE-funktion.md": VORLAGE,
    "docs/funktion-beispiel.md": SEITE,
    "docs/screenshots.json": JSON.stringify({ aufnahmen: [{ name: "beispiel", pfad: "/" }] }),
    "docs/assets/banner.png": "png",
    "docs/assets/screenshots/beispiel.png": "png",
  };
}

const ordner: string[] = [];
afterEach(() => {
  for (const dir of ordner.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function anlegen(dateien: Dateien): string {
  const dir = mkdtempSync(path.join(tmpdir(), "paibot-doku-check-"));
  ordner.push(dir);
  for (const [rel, inhalt] of Object.entries(dateien)) {
    const file = path.join(dir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, inhalt);
  }
  return dir;
}

/** Prüft im selben Prozess; `ausgabe` hat dieselben Zeilen wie der Befehl. */
function pruefe(dateien: Dateien, streng = false) {
  const ergebnis = pruefeDoku({ wurzel: anlegen(dateien), streng });
  const zeilen = [
    ...ergebnis.warnungen.map((m) => `WARNUNG ${m.file}: ${m.problem}`),
    ...ergebnis.fehler.map((m) => `FEHLER  ${m.file}: ${m.problem}`),
  ];
  return {
    code: ergebnis.fehler.length > 0 ? 1 : 0,
    ausgabe: zeilen.join("\n"),
    ergebnis,
  };
}

/** Ruft den Befehl wirklich auf (Exit-Code und Ausgabe). */
function befehl(dateien: Dateien, ...extra: string[]) {
  const result = spawnSync(process.execPath, [SCRIPT, "--wurzel", anlegen(dateien), ...extra], {
    encoding: "utf8",
  });
  return { code: result.status, ausgabe: `${result.stdout}${result.stderr}` };
}

function mit(aenderung: Dateien, ohne: string[] = []): Dateien {
  const dateien = { ...grundstock(), ...aenderung };
  for (const rel of ohne) delete dateien[rel];
  return dateien;
}

describe("doku:check", () => {
  it("ein vollständiges Projekt besteht ohne Warnung", () => {
    const { code, ergebnis } = pruefe(grundstock(), true);
    expect(ergebnis.fehler).toEqual([]);
    expect(ergebnis.warnungen).toEqual([]);
    expect(code).toBe(0);
  });

  it("a) fehlender Pflicht-Abschnitt ist ein Fehler", () => {
    const { code, ausgabe } = pruefe(
      mit({ "docs/funktion-beispiel.md": SEITE.replace("## Grenzen", "## Sonstiges") }),
    );
    expect(code).toBe(1);
    expect(ausgabe).toMatch(/FEHLER +docs\/funktion-beispiel\.md: .*„## Grenzen“ fehlt/);
  });

  it("a) falsche Reihenfolge der Abschnitte ist ein Fehler", () => {
    const vertauscht = SEITE.replace("## Wofür", "## TAUSCH")
      .replace("## Grenzen", "## Wofür")
      .replace("## TAUSCH", "## Grenzen");
    const { code, ausgabe } = pruefe(mit({ "docs/funktion-beispiel.md": vertauscht }));
    expect(code).toBe(1);
    expect(ausgabe).toContain("falschen Reihenfolge");
  });

  it("a) eigene Abschnitte zwischen den Pflicht-Abschnitten sind erlaubt", () => {
    const seite = SEITE.replace("## Grenzen", "## Extra\n\nMehr.\n\n## Grenzen");
    expect(pruefe(mit({ "docs/funktion-beispiel.md": seite }), true).code).toBe(0);
  });

  it("a) die Abschnitte kommen aus der Vorlage, nicht aus dem Skript", () => {
    const vorlage = VORLAGE.replace("## Grenzen", "## Grenzen\n\n## Fehlerbehebung");
    const { code, ausgabe } = pruefe(mit({ "docs/VORLAGE-funktion.md": vorlage }));
    expect(code).toBe(1);
    expect(ausgabe).toContain("„## Fehlerbehebung“ fehlt");
  });

  it("a) „So benutzt du es“ ohne nummerierte Schritte ist ein Fehler", () => {
    const seite = SEITE.replace("1. Öffnen\n2. Klicken", "Einfach machen.");
    const { code, ausgabe } = pruefe(mit({ "docs/funktion-beispiel.md": seite }));
    expect(code).toBe(1);
    expect(ausgabe).toContain("Schritt-für-Schritt-Anleitung");
  });

  it("b) „So sieht es aus“ ohne Bild und ohne Vermerk ist ein Fehler", () => {
    const seite = SEITE.replace("![Beispiel](assets/screenshots/beispiel.png)", "Kommt später.");
    const { code, ausgabe } = pruefe(mit({ "docs/funktion-beispiel.md": seite }));
    expect(code).toBe(1);
    expect(ausgabe).toContain("weder ein Screenshot noch ein Vermerk");
  });

  it("b) „Ohne Oberfläche.“ zählt als erfüllt", () => {
    const seite = SEITE.replace(
      "![Beispiel](assets/screenshots/beispiel.png)",
      "Ohne Oberfläche. Die Funktion läuft im Hintergrund.",
    );
    expect(pruefe(mit({ "docs/funktion-beispiel.md": seite }), true).code).toBe(0);
  });

  it("b) „Folgt mit der Oberfläche“ ist eine Warnung, mit --streng ein Fehler", () => {
    const seite = SEITE.replace(
      "![Beispiel](assets/screenshots/beispiel.png)",
      "Folgt mit der Oberfläche.",
    );
    const dateien = mit({ "docs/funktion-beispiel.md": seite });
    const normal = pruefe(dateien);
    expect(normal.code).toBe(0);
    expect(normal.ausgabe).toMatch(/WARNUNG docs\/funktion-beispiel\.md: .*Übergangs-Vermerk/);
    expect(normal.ergebnis.uebergang).toEqual(["docs/funktion-beispiel.md"]);
    const streng = pruefe(dateien, true);
    expect(streng.code).toBe(1);
    expect(streng.ausgabe).toMatch(/FEHLER +docs\/funktion-beispiel\.md: .*Übergangs-Vermerk/);
  });

  it("c) ein fehlendes Bild ist ein Fehler", () => {
    const { code, ausgabe } = pruefe(mit({}, ["docs/assets/screenshots/beispiel.png"]));
    expect(code).toBe(1);
    expect(ausgabe).toContain("Das Bild „assets/screenshots/beispiel.png“ gibt es nicht");
  });

  it("c) ein Screenshot ohne Eintrag in screenshots.json ist ein Fehler", () => {
    const { code, ausgabe } = pruefe(
      mit({ "docs/screenshots.json": JSON.stringify({ aufnahmen: [] }) }),
    );
    expect(code).toBe(1);
    expect(ausgabe).toContain("hat keinen Eintrag in docs/screenshots.json");
  });

  it("c) ein Bild außerhalb von docs/assets/screenshots/ ist ein Fehler", () => {
    const { code, ausgabe } = pruefe(
      mit({
        "docs/bilder/hand.png": "png",
        "README.md": "# Projekt\n\n![Hand](docs/bilder/hand.png)\n\n[Doku](docs/README.md)\n",
      }),
    );
    expect(code).toBe(1);
    expect(ausgabe).toContain("liegt nicht unter docs/assets/screenshots/");
  });

  it("c) auch Bilder in HTML (<img src>) werden geprüft", () => {
    const { code, ausgabe } = pruefe(
      mit({ "README.md": '# P\n\n<img src="docs/assets/screenshots/fehlt.png">\n' }),
    );
    expect(code).toBe(1);
    expect(ausgabe).toContain("docs/assets/screenshots/fehlt.png");
  });

  it("c) ein Eintrag in screenshots.json ohne Datei ist ein Fehler", () => {
    const { code, ausgabe } = pruefe(
      mit({
        "docs/screenshots.json": JSON.stringify({
          aufnahmen: [
            { name: "beispiel", pfad: "/" },
            { name: "verwaist", pfad: "/" },
          ],
        }),
      }),
    );
    expect(code).toBe(1);
    expect(ausgabe).toContain("Zum Eintrag „verwaist“ fehlt die Datei");
  });

  it("d) eine Seite, die nicht in docs/README.md steht, ist eine Warnung, mit --streng ein Fehler", () => {
    const dateien = mit({ "docs/extra.md": "# Extra\n" });
    const normal = pruefe(dateien);
    expect(normal.code).toBe(0);
    expect(normal.ausgabe).toMatch(/WARNUNG docs\/extra\.md: .*nicht in docs\/README\.md verlinkt/);
    expect(pruefe(dateien, true).code).toBe(1);
  });

  it("e) ein toter relativer Link ist ein Fehler, Code und externe Links zählen nicht", () => {
    const readme = [
      "# Projekt",
      "",
      "[Doku](docs/README.md) [extern](https://paibot.de) [Sprung](#projekt)",
      "[weg](docs/gibt-es-nicht.md)",
      "`[im Code](nirgends.md)`",
      "```",
      "[im Block](auch-nicht.md)",
      "```",
    ].join("\n");
    const { code, ausgabe } = pruefe(mit({ "README.md": readme }));
    expect(code).toBe(1);
    expect(ausgabe).toContain("Der Link „docs/gibt-es-nicht.md“ zeigt auf nichts");
    expect(ausgabe).not.toContain("nirgends.md");
    expect(ausgabe).not.toContain("auch-nicht.md");
  });

  it("e) Links mit Sprungmarke auf vorhandene Seiten sind in Ordnung", () => {
    const readme = "# P\n\n[Doku](docs/README.md#doku) <a href='docs/funktion-beispiel.md'>x</a>\n";
    expect(pruefe(mit({ "README.md": readme }), true).code).toBe(0);
  });

  it("der Befehl endet mit 0, wenn alles stimmt, und meldet das", () => {
    const { code, ausgabe } = befehl(grundstock(), "--streng");
    expect(code).toBe(0);
    expect(ausgabe).toContain("Doku-Check bestanden: 0 Fehler, 0 Warnungen (streng).");
  });

  it("der Befehl endet mit 1 und nennt Datei und Ausweg, wenn etwas fehlt", () => {
    const { code, ausgabe } = befehl(mit({}, ["docs/assets/screenshots/beispiel.png"]));
    expect(code).toBe(1);
    expect(ausgabe).toMatch(/FEHLER +docs\/funktion-beispiel\.md: /);
    expect(ausgabe).toContain("Ausweg:");
    expect(ausgabe).toContain("Doku-Check fehlgeschlagen");
  });

  it("unbekannte Angaben brechen mit einer Erklärung ab", () => {
    const { code, ausgabe } = befehl(grundstock(), "--schnell");
    expect(code).toBe(2);
    expect(ausgabe).toContain("Unbekannte Angabe: --schnell");
  });
});
