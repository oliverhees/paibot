/**
 * PaiBot – Test der 404-Seite: deutscher Text, Link zur Startseite, kein Inline-Stil und kein Inline-Skript.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Die Seite wird hier als Quelltext geprüft, weil die Test-Einstellungen der App kein JSX übersetzen.
// Aussehen und Konsole prüft der Test im Produktions-Build.
const seite = readFileSync(new URL("./not-found.tsx", import.meta.url), "utf8");

describe("404-Seite", () => {
  it("sagt auf Deutsch, dass es die Seite nicht gibt, und führt zur Startseite", () => {
    expect(seite).toContain("Diese Seite gibt es nicht");
    expect(seite).toContain("Zur Startseite");
    expect(seite).toMatch(/<Link href="\/"/);
  });

  it("braucht weder Inline-Stil noch Inline-Skript (strenge Content-Security-Policy)", () => {
    expect(seite).not.toMatch(/\sstyle=/);
    expect(seite).not.toMatch(/<style|<script|dangerouslySetInnerHTML/);
  });
});
