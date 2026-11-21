/**
 * PaiBot – Tests des Farbkontrasts nach WCAG für dunkles und helles Design.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Kontrast nach WCAG 2.2 (Stufe AA) für die Farben, die die Oberfläche wirklich zusammen benutzt.
// Die Farbwerte kommen aus tokens.css (dunkles und helles Design), die Paare aus den Stilen der
// Bausteine und Seiten: Jede Regel wird gelesen, und was sie an Text-, Flächen-, Fokus- und
// Kantenfarben setzt, wird geprüft.

const UI = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(UI, "../../../apps/web/src");

/** Mindestwerte: Fließtext 4,5:1; Bedienelemente, Fokus und Zustandsanzeigen 3:1. */
const TEXT = 4.5;
const BEDIENUNG = 3;

/** Flächen, auf denen Text ohne eigenen Hintergrund stehen kann. */
const GRUNDFLAECHEN = ["--bg", "--surface", "--surface-raised", "--surface-sunken"] as const;

// ---------------------------------------------------------------- Farben lesen und rechnen

/** Variablen eines Blocks, der mit `kopf` beginnt. */
function block(css: string, kopf: string): Map<string, string> {
  const start = css.indexOf(kopf);
  if (start < 0) throw new Error(`Block fehlt: ${kopf}`);
  const auf = css.indexOf("{", start + kopf.length - 1);
  let tiefe = 0;
  let ende = auf;
  for (let i = auf; i < css.length; i++) {
    if (css[i] === "{") tiefe++;
    if (css[i] === "}" && --tiefe === 0) {
      ende = i;
      break;
    }
  }
  const werte = new Map<string, string>();
  for (const m of css.slice(auf, ende).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    werte.set(m[1] as string, (m[2] as string).trim());
  }
  return werte;
}

const TOKENS = readFileSync(path.join(UI, "tokens.css"), "utf8");
const DUNKEL = block(TOKENS, ":root {");
const HELL = new Map([...DUNKEL, ...block(TOKENS, ':root[data-theme="light"]')]);
const THEMEN = { dunkel: DUNKEL, hell: HELL } as const;
type Thema = keyof typeof THEMEN;

/** Farbe eines Tokens als #rrggbb; `null` für transparent. */
function farbe(thema: Thema, name: string): string | null {
  const wert = THEMEN[thema].get(name);
  if (wert === undefined) throw new Error(`Token fehlt: ${name}`);
  if (wert === "transparent") return null;
  if (!/^#[0-9a-f]{6}$/i.test(wert)) throw new Error(`${name} ist keine volle Farbe: ${wert}`);
  return wert;
}

/** Relative Leuchtdichte nach WCAG. */
function leuchtdichte(hex: string): number {
  const kanal = (i: number) => {
    const c = Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanal(0) + 0.7152 * kanal(1) + 0.0722 * kanal(2);
}

/** Kontrastverhältnis zweier Farben, z. B. 21 für Schwarz auf Weiß. */
function kontrast(a: string, b: string): number {
  const [hell, dunkel] = [leuchtdichte(a), leuchtdichte(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hell + 0.05) / (dunkel + 0.05);
}

/** Kontrast zweier Tokens in einem Design; 0, wenn eines transparent ist. */
function tokenKontrast(thema: Thema, vorne: string, hinten: string): number {
  const a = farbe(thema, vorne);
  const b = farbe(thema, hinten);
  return a && b ? kontrast(a, b) : 0;
}

// ---------------------------------------------------------------- Stile lesen

interface Regel {
  ort: string;
  selektor: string;
  werte: Map<string, string>;
}

function cssDateien(ordner: string): string[] {
  return readdirSync(ordner, { recursive: true, encoding: "utf8" })
    .filter((d) => d.endsWith(".css") && !d.endsWith("tokens.css"))
    .map((d) => path.join(ordner, d));
}

/** Innerste Regeln einer Datei (auch in @media); Kommentare entfernt. */
function regeln(datei: string): Regel[] {
  const css = readFileSync(datei, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const ort = path.relative(path.resolve(UI, "../../.."), datei);
  return [...css.matchAll(/([^{};]+)\{([^{}]*)\}/g)].flatMap((m) => {
    const werte = new Map<string, string>();
    for (const d of (m[2] as string).split(";")) {
      const i = d.indexOf(":");
      if (i > 0) werte.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
    // Selektor-Listen („.a:hover, .a[data-zustand]“) als einzelne Regeln.
    return (m[1] as string)
      .split(",")
      .map((s) => ({ ort, selektor: s.trim().replace(/\s+/g, " "), werte }));
  });
}

const REGELN = [...cssDateien(UI), ...cssDateien(WEB)].flatMap(regeln);

/** Token in einem Wert der Form `var(--x)`; sonst `null`. */
function nurToken(wert: string | undefined): string | null {
  return wert?.match(/^var\((--[a-z0-9-]+)\)$/)?.[1] ?? null;
}

function hintergrund(r: Regel): string | null {
  return nurToken(r.werte.get("background") ?? r.werte.get("background-color"));
}

/** Gesperrte Bedienelemente sind nach WCAG ausgenommen. */
const gesperrt = (r: Regel) => /:disabled|\[aria-disabled|\[disabled/.test(r.selektor);

/** Erste Klasse des Selektors ohne Zustand, z. B. `.leise` aus `.leise:hover`. */
function grundKlasse(selektor: string): string | null {
  return selektor.match(/^\.[A-Za-z0-9_-]+/)?.[0] ?? null;
}

// ---------------------------------------------------------------- Paare ableiten

interface Paar {
  vorne: string;
  hinten: string;
  mindest: number;
  wo: string;
}

function paarSchluessel(p: Paar): string {
  return `${p.vorne} auf ${p.hinten}`;
}

function textPaare(): Paar[] {
  const paare: Paar[] = [];
  for (const r of REGELN) {
    if (gesperrt(r) || r.selektor.includes("::placeholder")) continue;
    const vorne = nurToken(r.werte.get("color"));
    const hinten = hintergrund(r);
    const wo = `${r.ort} ${r.selektor}`;
    if (vorne && hinten) {
      paare.push({ vorne, hinten, mindest: TEXT, wo });
    } else if (vorne) {
      for (const g of GRUNDFLAECHEN) paare.push({ vorne, hinten: g, mindest: TEXT, wo });
    } else if (hinten) {
      // Fläche eines Zustands (z. B. :hover): Text kommt aus der Grundregel derselben Klasse.
      const klasse = grundKlasse(r.selektor);
      const grund = REGELN.find(
        (g) => g.ort === r.ort && g.selektor === klasse && nurToken(g.werte.get("color")),
      );
      const text = grund && nurToken(grund.werte.get("color"));
      // Nur Zustände desselben Elements (kein Kind, kein ::before/::after: dort steht kein Text).
      const selbes = klasse !== r.selektor && !/\s|::/.test(r.selektor);
      if (text && selbes) paare.push({ vorne: text, hinten, mindest: TEXT, wo });
    }
  }
  return paare;
}

function pruefe(paare: Paar[]): string[] {
  const fehler: string[] = [];
  for (const p of paare) {
    for (const thema of ["dunkel", "hell"] as const) {
      const wert = tokenKontrast(thema, p.vorne, p.hinten);
      if (wert < p.mindest) {
        fehler.push(
          `${paarSchluessel(p)} (${thema}): ${wert.toFixed(2)}:1 < ${p.mindest}:1 – ${p.wo}`,
        );
      }
    }
  }
  return fehler;
}

// ---------------------------------------------------------------- Tests

describe("WCAG-Rechnung", () => {
  it("stimmt mit bekannten Werten überein", () => {
    expect(kontrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(kontrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // Grenzfall der WCAG-Beispiele: #767676 auf Weiß knapp über 4,5:1, #777777 knapp darunter.
    expect(kontrast("#767676", "#ffffff")).toBeGreaterThan(4.5);
    expect(kontrast("#777777", "#ffffff")).toBeLessThan(4.5);
    expect(kontrast("#ffffff", "#777777")).toBe(kontrast("#777777", "#ffffff"));
  });
});

describe("Kontrast der Farben (dunkel und hell)", () => {
  it("liest genug Regeln aus den Stilen (Bausteine und Seiten)", () => {
    expect(REGELN.length).toBeGreaterThan(300);
    expect(REGELN.some((r) => r.ort.startsWith("packages/ui/src/felder/"))).toBe(true);
    expect(REGELN.some((r) => r.ort.startsWith("apps/web/src/app/"))).toBe(true);
  });

  it("Text auf seiner Fläche: mindestens 4,5:1", () => {
    const paare = textPaare();
    expect(paare.length).toBeGreaterThan(100);
    expect(pruefe(paare)).toEqual([]);
  });

  it("Status- und Akzentfarben als Text: mindestens 4,5:1 auf jeder Grundfläche und ihrer hellen Fläche", () => {
    const paare: Paar[] = [];
    for (const vorne of [
      "--ink",
      "--ink-soft",
      "--accent-text",
      "--ok",
      "--warn",
      "--danger",
      "--eu",
    ]) {
      for (const hinten of GRUNDFLAECHEN)
        paare.push({ vorne, hinten, mindest: TEXT, wo: "Grundfläche" });
    }
    for (const [vorne, hinten] of [
      ["--ok", "--ok-soft"],
      ["--warn", "--warn-soft"],
      ["--danger", "--danger-soft"],
      ["--on-eu-soft", "--eu-soft"],
      ["--on-accent-soft", "--accent-soft"],
      ["--on-accent", "--accent"],
    ] as const) {
      paare.push({ vorne, hinten, mindest: TEXT, wo: "Statusfläche" });
    }
    expect(pruefe(paare)).toEqual([]);
  });

  it("Fokus-Ring: jede Umrandung nutzt --focus, mindestens 3:1 auf jeder Grundfläche", () => {
    const umrandungen = REGELN.filter((r) => {
      const o = r.werte.get("outline");
      return o !== undefined && !/^(none|0)$/.test(o);
    });
    expect(umrandungen.length).toBeGreaterThan(20);
    const fremd = umrandungen
      .filter((r) => !(r.werte.get("outline") as string).includes("var(--focus)"))
      .map((r) => `${r.ort} ${r.selektor}: ${r.werte.get("outline")}`);
    expect(fremd).toEqual([]);
    const paare = GRUNDFLAECHEN.map((hinten) => ({
      vorne: "--focus",
      hinten,
      mindest: BEDIENUNG,
      wo: "Fokus-Ring",
    }));
    expect(pruefe(paare)).toEqual([]);
  });

  it("Kanten von Bedienelementen (--line-strong): mindestens 3:1 auf jeder Grundfläche", () => {
    const nutzer = REGELN.filter((r) =>
      [...r.werte.entries()].some(
        ([name, wert]) => /^(border|box-shadow)/.test(name) && wert.includes("var(--line-strong)"),
      ),
    );
    expect(nutzer.some((r) => r.ort.endsWith("Switch.module.css"))).toBe(true);
    expect(nutzer.some((r) => r.ort.endsWith("Button.module.css"))).toBe(true);
    const paare = GRUNDFLAECHEN.map((hinten) => ({
      vorne: "--line-strong",
      hinten,
      mindest: BEDIENUNG,
      wo: "Kante",
    }));
    expect(pruefe(paare)).toEqual([]);
  });

  it("Kante von Eingabefeldern in Ruhe: mindestens 3:1 gegen eigene Fläche und jede Grundfläche", () => {
    // Textfeld, Auswahl, Textbereich und Suchfeld (Feld.module.css), Chat-Eingabe und die
    // Felder der Belege-Seite. Ohne kräftige Kante verschwindet das Feld vor dem Hintergrund.
    const FELDER = [
      ["packages/ui/src/felder/Feld.module.css", ".eingabe"],
      ["packages/ui/src/chat/ChatEingabe.module.css", ".eingabe"],
      ["packages/ui/src/belege/AnkerKasten.module.css", ".anker"],
      ["apps/web/src/app/(app)/belege/belege.module.css", ".auswahl"],
      ["apps/web/src/app/(app)/belege/belege.module.css", ".json"],
    ] as const;
    const paare: Paar[] = [];
    for (const [datei, selektor] of FELDER) {
      const regel = REGELN.find(
        (r) => r.ort === path.normalize(datei) && r.selektor === selektor && r.werte.has("border"),
      );
      expect(regel, `${datei} ${selektor}`).toBeDefined();
      const kante = (regel?.werte.get("border") ?? "").match(/var\((--[a-z0-9-]+)\)/)?.[1];
      expect(kante, `${datei} ${selektor}: Kante als Token`).toBeDefined();
      const flaechen = new Set<string>([...GRUNDFLAECHEN]);
      const eigene = regel ? hintergrund(regel) : null;
      if (eigene) flaechen.add(eigene);
      for (const hinten of flaechen) {
        paare.push({
          vorne: kante as string,
          hinten,
          mindest: BEDIENUNG,
          wo: `${datei} ${selektor}`,
        });
      }
    }
    expect(pruefe(paare)).toEqual([]);
  });

  it("Feld-Zustände bleiben unterscheidbar: Darüber, Fokus, Fehler und Gesperrt anders als Ruhe", () => {
    const werte = (selektor: string) =>
      REGELN.filter((r) => r.ort.endsWith("Feld.module.css") && r.selektor === selektor).flatMap(
        (r) => [...r.werte.entries()].map(([k, v]) => `${k}: ${v}`),
      );
    const ruhe = werte(".eingabe").find((w) => w.startsWith("border:")) ?? "";
    const ruheToken = ruhe.match(/var\((--[a-z0-9-]+)\)/)?.[1] ?? "";
    for (const zustand of [
      '.eingabe[data-zustand="hover"]',
      '.eingabe[data-zustand="fokus"]',
      '.eingabe[aria-invalid="true"]',
      ".eingabe:disabled",
    ]) {
      const farbe = werte(zustand).find((w) => w.startsWith("border-color:")) ?? "";
      expect(farbe, zustand).not.toBe("");
      expect(farbe.includes(`var(${ruheToken})`), zustand).toBe(false);
    }
    // Gesperrt zusätzlich gestrichelt, Fokus zusätzlich mit Ring.
    expect(werte(".eingabe:disabled")).toContain("border-style: dashed");
    expect(werte('.eingabe[data-zustand="fokus"]').some((w) => w.startsWith("outline:"))).toBe(
      true,
    );
  });

  it("Akzent-Flächen (Hauptknopf, Schalter an): Fläche oder Kante mindestens 3:1", () => {
    const fehler: string[] = [];
    for (const thema of ["dunkel", "hell"] as const) {
      for (const g of GRUNDFLAECHEN) {
        const wert = Math.max(
          tokenKontrast(thema, "--accent", g),
          tokenKontrast(thema, "--accent-kante", g),
        );
        if (wert < BEDIENUNG) fehler.push(`--accent auf ${g} (${thema}): ${wert.toFixed(2)}:1`);
      }
    }
    expect(fehler).toEqual([]);
    // Wo die Fläche allein nicht reicht (hell), tragen Hauptknopf und Schalter die Kante.
    for (const [datei, selektor] of [
      ["Button.module.css", ".primaer"],
      ["Switch.module.css", '.schalter[aria-checked="true"] .bahn'],
      ["IconButton.module.css", ".rund-akzent"],
    ] as const) {
      const kanten = REGELN.filter((x) => x.ort.endsWith(datei) && x.selektor === selektor).map(
        (x) => x.werte.get("box-shadow") ?? "",
      );
      expect(
        kanten.some((k) => k.includes("var(--accent-kante)")),
        `${datei} ${selektor}`,
      ).toBe(true);
    }
  });
});
