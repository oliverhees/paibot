/**
 * PaiBot – Tests der Design-Tokens.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

/** Variablen eines Blocks, der mit `kopf` beginnt. */
function block(kopf: string): Map<string, string> {
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

const PFLICHT = [
  "--bg",
  "--surface",
  "--surface-raised",
  "--surface-sunken",
  "--ink",
  "--ink-soft",
  "--line",
  "--line-strong",
  "--accent",
  "--on-accent",
  "--accent-text",
  "--accent-soft",
  "--on-accent-soft",
  "--eu",
  "--eu-soft",
  "--on-eu-soft",
  "--ok",
  "--warn",
  "--danger",
  "--focus",
  "--bot-limette",
  "--bot-blau",
  "--bot-gruen",
  "--bot-violett",
  "--bot-pink",
  "--bot-tuerkis",
  "--bot-gelb",
  "--bot-orange",
  "--bot-gesicht",
  "--bot-gesicht-dunkel",
  "--font-sans",
  "--font-brand",
  "--font-mono",
  "--text-body",
  "--text-small",
  "--text-label",
  "--space-1",
  "--space-7",
  "--radius-sm",
  "--radius-md",
  "--radius-blase",
  "--radius-lg",
  "--radius-pill",
  "--shadow-card",
  "--dauer-kurz",
  "--kurve-sprung",
  "--fokus-breite",
  "--fokus-abstand",
  "--layout-leiste",
  "--layout-inhalt",
];

describe("Design-Tokens", () => {
  const dunkel = block(":root {");
  const hellSystem = block(':root:not([data-theme="dark"])');
  const hellAttribut = block(':root[data-theme="light"]');

  it("enthält alle Grund-Tokens im dunklen Design", () => {
    for (const name of PFLICHT) expect(dunkel.has(name), name).toBe(true);
    expect(dunkel.get("--bg")).toBe("#0e0e10");
    expect(dunkel.get("--accent")).toBe("#c8f250");
    expect(dunkel.get("--radius-blase")).toBe("17.5px");
  });

  it("überschreibt im hellen Design jede Farbe des dunklen", () => {
    const farben = [...dunkel.entries()].filter(
      ([name, wert]) => /^#|^rgba/.test(wert) && !name.startsWith("--bot-"),
    );
    for (const [name] of farben) {
      expect(hellSystem.has(name), name).toBe(true);
    }
  });

  it("hat das helle Design für System und Attribut gleich", () => {
    expect([...hellAttribut.entries()]).toEqual([...hellSystem.entries()]);
  });

  it("nimmt im hellen Design einen dunkleren Akzent für Text", () => {
    expect(hellSystem.get("--accent-text")).toBe("#4f6b00");
  });
});
