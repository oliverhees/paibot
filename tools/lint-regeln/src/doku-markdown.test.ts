/**
 * PaiBot – Test: Doku-Seiten werden mit dem Markdown-Parser gelesen (Verborgenes, Abschnitte, Worte).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

interface Fund {
  zeile: number;
  art: string;
  meldung: string;
}
interface Teil {
  titel: string;
  pfad: string[];
  anker: string;
  text: string;
}
const { leseSeite, pruefeWorte, ERLAUBTE_SPRACHEN, ERLAUBTE_TAGS } = (await import(
  pathToFileURL(path.join(ROOT, "scripts", "doku-index", "markdown.mjs")).href
)) as {
  leseSeite: (roh: string) => { funde: Fund[]; abschnitte: Teil[]; sichtbar: string };
  pruefeWorte: (a: Teil[], sichtbar: string) => { wort: string; titel: string } | null;
  ERLAUBTE_SPRACHEN: string[];
  ERLAUBTE_TAGS: string[];
};

const KOPF = "<!--\n * PaiBot – Test\n-->\n\n";
const arten = (roh: string) => leseSeite(KOPF + roh).funde.map((f) => f.art);
const abschnitte = (roh: string) => leseSeite(KOPF + roh).abschnitte;

describe("Verborgenes finden", () => {
  it("der Urheber-Kopf am Anfang ist kein Fund", () => {
    expect(leseSeite(`${KOPF}# Titel\n\nText.\n`).funde).toEqual([]);
  });

  it("ein zweiter Kommentar nach dem Kopf ist ein Fund (html)", () => {
    expect(arten("# T\n\n<!-- x -->\n\nText.\n")).toContain("html");
  });

  it("ein Kommentar, der im Kopf-Kommentar weiterläuft (zwei Enden), ist ein Fund", () => {
    const roh = "<!-- a --> GEHEIM <!-- b -->\n\n# T\n\nText.\n";
    expect(leseSeite(roh).funde.map((f) => f.art)).toContain("html");
  });

  it("ein Kopf, der nicht in Zeile 1 beginnt, ist ein Fund", () => {
    expect(leseSeite("\n<!-- a -->\n\n# T\n").funde.map((f) => f.art)).toContain("html");
  });

  it.each([
    ["ein Tag im Fließtext", "Vorher <span hidden>GEHEIM</span> nachher.\n"],
    ["ein Kommentar im Fließtext mit Zeilenschutz", "Vor <!-- a --> GEHEIM nach.\n"],
    ["eine Erklärung <!x …>", "<!x GEHEIM>\n"],
    ["ein HTML-Block", "<div hidden>\nGEHEIM\n</div>\n"],
    ["Code mit Backtick in der Sprache und danach ein Tag", "``` x`y\n<div hidden>GEHEIM</div>\n"],
    ["Backticks, die nicht schließen", "` <span hidden>GEHEIM</span> ``\n"],
    ["ein mit Backslash maskiertes Backtick-Paar", "\\`<span hidden>GEHEIM</span>\\`\n"],
  ])("%s ist ein Fund (html)", (_name, inhalt) => {
    expect(arten(`# T\n\n${inhalt}`)).toContain("html");
  });

  it.each([
    ["Kommentar-Definition", "[//]: # (GEHEIM)\n"],
    ["Definition mit Titel", '[x]: https://example.org "GEHEIM"\n'],
    ["Definition mit leerer Adresse", "[comment]: <> (GEHEIM)\n"],
  ])("%s ist ein Fund (definition)", (_name, inhalt) => {
    expect(arten(`# T\n\nText.\n\n${inhalt}`)).toContain("definition");
  });

  it("ein Bild über eine Definition ist ein Fund (referenz und definition)", () => {
    const gefunden = arten("# T\n\n![GEHEIM][ref]\n\n[ref]: a.png\n");
    expect(gefunden).toContain("referenz");
    expect(gefunden).toContain("definition");
  });

  it("ein Link über eine Definition ist ein Fund (referenz)", () => {
    expect(arten("# T\n\n[Text][ref]\n\n[ref]: https://example.org\n")).toContain("referenz");
  });

  it("Fußnoten sind ein Fund, mit und ohne Verweis", () => {
    expect(arten("# T\n\nText[^1]\n\n[^1]: GEHEIM\n")).toContain("fussnote");
    expect(arten("# T\n\nText.\n\n[^1]: GEHEIM\n")).toContain("fussnote");
  });

  it.each([
    ["dezimal", "a&#65;b"],
    ["hexadezimal mit Tag-Zeichen", "&#xE0047;&#xE0045;"],
    ["weiches Trennzeichen", "a&shy;b"],
    ["ein unbekannter Name", "a&gibtesnicht;b"],
  ])("eine Zeichenreferenz (%s) im Fließtext ist ein Fund", (_name, inhalt) => {
    expect(arten(`# T\n\n${inhalt}\n`)).toContain("zeichenreferenz");
  });

  it("eine Zeichenreferenz in Code ist kein Fund", () => {
    expect(arten("# T\n\nCode `&#x41;` und\n\n```text\n&amp;\n```\n")).toEqual([]);
  });

  it("ein unsichtbares Zeichen ist ein Fund, auch im Code", () => {
    expect(arten("# T\n\nEn​de.\n")).toContain("unsichtbar");
    expect(arten("# T\n\n```text\nEn‮de\n```\n")).toContain("unsichtbar");
  });

  it("ein Zusatz hinter der Sprache eines Zauns ist ein Fund", () => {
    expect(arten("# T\n\n```bash GEHEIM\nls\n```\n")).toContain("zaun-zusatz");
  });

  it("eine Sprache außerhalb der Liste ist ein Fund; ohne Sprache und aus der Liste nicht", () => {
    expect(arten("# T\n\n```geheim\nls\n```\n")).toContain("zaun-sprache");
    expect(arten("# T\n\n```\nls\n```\n")).toEqual([]);
    for (const sprache of ERLAUBTE_SPRACHEN) {
      expect(arten(`# T\n\n\`\`\`${sprache}\nx\n\`\`\`\n`), sprache).toEqual([]);
    }
  });

  it("im Diagramm sind Kommentare und Screenreader-Texte ein Fund, mit der Zeile", () => {
    const roh =
      "# T\n\n```mermaid\nflowchart LR\n  A --> B\n  %% GEHEIM\n  accDescr: GEHEIM\n```\n";
    const funde = leseSeite(KOPF + roh).funde.filter((f) => f.art === "mermaid");
    expect(funde.map((f) => f.zeile)).toEqual([10, 11]);
    expect(arten("# T\n\n```mermaid\nflowchart LR\n  A --> B\n```\n")).toEqual([]);
  });

  it("Formen, die auf der Seite sichtbar sind, sind kein Fund", () => {
    const gut = [
      "| a | b |\n| - | - |\n| 1 | 2 |\n",
      "Code `<b>` und `&#x41;` im Text.\n",
      "Siehe [Link](https://example.org) und ![Bild](a.png).\n",
      "Adresse <https://example.org> und <a@example.org>.\n",
      "```text\n<div hidden>GEHEIM</div>\n```\n",
      "~~~bash\nls\n~~~\n",
      "1. Schritt\n\n   ```bash\n   ls\n   ```\n",
      "Vorher:\n\n    eingerückter Code <b>\n",
      "Wert 1 < 2 und a > b.\n",
      "Sichtbar: \\<span hidden>Text\\</span>.\n",
      "> Zitat\n>\n> ```text\n> x\n> ```\n",
      "![Bild](a.png (Titel))\n",
    ];
    for (const inhalt of gut) expect(arten(`# T\n\n${inhalt}`), inhalt).toEqual([]);
  });

  it("die Liste erlaubter Tags ist leer; ein Tag ist deshalb immer ein Fund", () => {
    expect(ERLAUBTE_TAGS).toEqual([]);
    expect(arten("# T\n\n<br>\n")).toContain("html");
  });

  it("die Zeilen stimmen auch bei Windows-Zeilenenden", () => {
    const roh = `${KOPF}# T\n\nText\n\nVorher <span hidden>x</span>\n`.replace(/\n/g, "\r\n");
    const html = leseSeite(roh).funde.find((f) => f.art === "html");
    // Kopf: 3 Zeilen + Leerzeile, dann Zeile 5 „# T“, 7 „Text“, 9 „Vorher …“
    expect(html?.zeile).toBe(9);
    const ohneKopf = leseSeite("# T\r\n\r\n[//]: # (x)\r\n").funde.find(
      (f) => f.art === "definition",
    );
    expect(ohneKopf?.zeile).toBe(3);
  });
});

describe("Abschnitte schneiden", () => {
  it("Titel, Pfad, Anker und Text", () => {
    const a = abschnitte(
      "# Seite\n\nEinleitung.\n\n## Erst\n\nA.\n\n### Tief\n\nB.\n\n## Zweit\n\nC.\n",
    );
    expect(a.map((x) => [x.titel, x.anker, x.pfad, x.text])).toEqual([
      ["Seite", "seite", ["Seite"], "Einleitung."],
      ["Erst", "erst", ["Seite", "Erst"], "A."],
      ["Tief", "tief", ["Seite", "Erst", "Tief"], "B."],
      ["Zweit", "zweit", ["Seite", "Zweit"], "C."],
    ]);
  });

  it("der Urheber-Kopf steht in keinem Abschnitt", () => {
    expect(JSON.stringify(abschnitte("# T\n\nText.\n"))).not.toContain("PaiBot – Test");
  });

  it("Bild, auch in einem Link, fällt mit Alt-Text und Titel ganz weg", () => {
    const a = abschnitte(
      "# T\n\nVor ![BILD-ALT](a.png (GEHEIM)) und [![BILD-ALT](b.png)](c.md) nach.\n",
    );
    expect(a[0]?.text).toBe("Vor  und  nach.");
  });

  it("ein Link wird zu seinem Text, ein Link mit Code im Text zu diesem Code", () => {
    const a = abschnitte(
      '# T\n\nSiehe [`deploy/README.md`](../deploy/README.md) und [Text *fett*](https://x.de "Titel").\n',
    );
    expect(a[0]?.text).toBe("Siehe `deploy/README.md` und Text *fett*.");
  });

  it("ein Adress-Verweis wird zu seiner Adresse; Web und E-Mail", () => {
    const a = abschnitte("# T\n\nQuelle <https://example.org/x> und <hi@example.org>.\n");
    expect(a[0]?.text).toBe("Quelle https://example.org/x und hi@example.org.");
  });

  it("ein mehrzeiliger Link bleibt als sein Text stehen", () => {
    const a = abschnitte("# T\n\nSiehe [erste Zeile\nzweite Zeile](x.md) Ende.\n");
    expect(a[0]?.text).toBe("Siehe erste Zeile\nzweite Zeile Ende.");
  });

  it("Setext-Überschriften und Überschriften mit Einzug schneiden", () => {
    const a = abschnitte("Seite\n=====\n\nA.\n\nZweit\n-----\n\nB.\n\n   ## Dritt\n\nC.\n");
    expect(a.map((x) => x.titel)).toEqual(["Seite", "Zweit", "Dritt"]);
    expect(a.map((x) => x.text)).toEqual(["A.", "B.", "C."]);
  });

  it("ein # im Codeblock ist keine Überschrift; Überschrift im Zitat und in Listen schneidet nicht", () => {
    const a = abschnitte("# T\n\n```bash\n# Kommentar\n```\n\n> ## Im Zitat\n\n- ## In Liste\n");
    expect(a).toHaveLength(1);
    expect(a[0]?.text).toContain("# Kommentar");
    expect(a[0]?.text).toContain("Im Zitat");
  });

  it("Überschriften der Ebene 4 schneiden nicht", () => {
    const a = abschnitte("# T\n\n#### Klein\n\nText.\n");
    expect(a).toHaveLength(1);
    expect(a[0]?.text).toContain("#### Klein");
  });

  it("Code bleibt Zeichen für Zeichen, auch mit Tag- und Link-Schreibweise", () => {
    const a = abschnitte(
      "# T\n\nCode `<platzhalter>` und `[a](b)` und\n\n```bash\n<x> ![y](z)\n```\n",
    );
    expect(a[0]?.text).toContain("`<platzhalter>`");
    expect(a[0]?.text).toContain("`[a](b)`");
    expect(a[0]?.text).toContain("```bash\n<x> ![y](z)\n```");
  });

  it("ein Diagramm-Block kommt nicht in den Abschnitt, samt Zaun-Zeilen", () => {
    const a = abschnitte("# T\n\nVor.\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nNach.\n");
    expect(a[0]?.text).toBe("Vor.\n\nNach.");
  });

  it("Abschnitte ohne Text oder Titel fallen weg; Pfad ohne leeren Titel", () => {
    const a = abschnitte("# T\n\n## Leer\n\n## Voll\n\nText.\n\n##\n\nOhne Titel.\n");
    expect(a.map((x) => x.titel)).toEqual(["Voll"]);
  });

  it("Tabellen bleiben mit ihren Strichen im Text", () => {
    const a = abschnitte("# T\n\n| a | b |\n| - | - |\n| 1 | 2 |\n");
    expect(a[0]?.text).toBe("| a | b |\n| - | - |\n| 1 | 2 |");
  });
});

describe("Wort-Gegenprobe", () => {
  it("ein sauber geschnittener Text besteht", () => {
    const seite = leseSeite(
      `${KOPF}# T\n\nWörter ![BILD-ALT](a.png) und [Link](x.md) und <https://example.org> hier.\n\n\`\`\`bash\nls\n\`\`\`\n`,
    );
    expect(pruefeWorte(seite.abschnitte, seite.sichtbar)).toBeNull();
  });

  it("ein Wort, das nur im Alt-Text steht, im Abschnitt aber vorkommt, wird gefunden", () => {
    const seite = leseSeite(`${KOPF}# T\n\nHier ![BILD-ALT](a.png) steht es.\n`);
    const fehler = [{ ...(seite.abschnitte[0] as Teil), text: "Hier BILD-ALT steht es." }];
    expect(pruefeWorte(fehler, seite.sichtbar)).toEqual({ wort: "BILD", titel: "T" });
  });

  it("Nummern geordneter Listen zählen als sichtbar", () => {
    const seite = leseSeite(`${KOPF}# T\n\n100. Eins\n101. Zwei\n`);
    expect(pruefeWorte(seite.abschnitte, seite.sichtbar)).toBeNull();
  });
});
