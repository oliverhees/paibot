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
import { t } from "@paibot/shared/texte";
import { describe, expect, it } from "vitest";

// Die Seite wird hier als Quelltext geprüft, weil die Test-Einstellungen der App kein JSX übersetzen.
// Aussehen und Konsole prüft der Test im Produktions-Build.
const seite = readFileSync(new URL("./not-found.tsx", import.meta.url), "utf8");

describe("404-Seite", () => {
  it("sagt auf Deutsch, dass es die Seite nicht gibt, und führt zur Startseite", () => {
    expect(seite).toContain('t("nicht_gefunden.titel")');
    expect(seite).toContain('t("nicht_gefunden.link")');
    expect(t("nicht_gefunden.titel")).toBe("Diese Seite gibt es nicht");
    expect(t("nicht_gefunden.link")).toBe("Zur Startseite");
    expect(seite).toMatch(/<Link href="\/"/);
  });

  it("braucht weder Inline-Stil noch Inline-Skript (strenge Content-Security-Policy)", () => {
    expect(seite).not.toMatch(/\sstyle=/);
    expect(seite).not.toMatch(/<style|<script|dangerouslySetInnerHTML/);
  });

  it("im App-Rahmen gibt es nur einen Hauptbereich: die Seite dort hat kein eigenes <main>", () => {
    const imRahmen = readFileSync(new URL("./(app)/not-found.tsx", import.meta.url), "utf8");
    expect(imRahmen).not.toMatch(/<main/);
    expect(imRahmen).toContain('t("nicht_gefunden.titel")');
    // Die Seite der Wurzel hat ihn, weil dort kein Rahmen darum liegt.
    expect(seite).toMatch(/<main/);
  });
});
