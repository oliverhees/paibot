/**
 * PaiBot – Tests der Teams-Vorschau-Seite: kein Abruf, Quelltext der Bausteine, Vorlage aus dem Repository.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  beispielDaten,
  EntwurfVorschau,
  TEAMS_SZENEN,
  TeamsAnsicht,
  type TeamsSzene,
  type Vorlage,
} from "@paibot/ui";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ladeVorlage } from "./teams/vorlage";

let vorlage: Vorlage;
beforeAll(async () => {
  vorlage = await ladeVorlage();
});
afterEach(() => vi.unstubAllGlobals());

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const zeige = (start: TeamsSzene, startBot?: string) =>
  renderToStaticMarkup(
    h(TeamsAnsicht, { daten: beispielDaten(vorlage), start, ...(startBot ? { startBot } : {}) }),
  );
const entwurf = (notAus: boolean, status: "offen" | "angelegt" = "offen") =>
  renderToStaticMarkup(
    h(EntwurfVorschau, {
      vorlage,
      status,
      notAus,
      onAnlegen: () => {},
      onRueckgaengig: () => {},
      onVerwerfen: () => {},
      onWiederOeffnen: () => {},
    }),
  );
const alle = TEAMS_SZENEN.map((s) => s.id);

describe("Teams-Vorschau: fünf Szenen, nur Beispiel-Daten", () => {
  it("es gibt genau fünf Szenen", () => {
    expect(alle).toEqual(["seitenleiste", "bot", "team", "entwurf", "uebersicht"]);
  });

  for (const id of alle) {
    it(`Szene „${id}“ rendert, auch wenn jeder Abruf wirft`, () => {
      const fetchWirft = vi.fn(() => {
        throw new Error("kein Server in der Vorschau");
      });
      vi.stubGlobal("fetch", fetchWirft);
      const html = zeige(id);
      expect(html).toContain('data-baustein="teams-ansicht"');
      expect(html).toContain('data-baustein="seitenleiste"');
      expect(fetchWirft).not.toHaveBeenCalled();
    });
  }

  it("Gegenprobe: ein Baustein, der abrufen würde, wäre rot", () => {
    const quelle = 'await fetch("/api/teams")';
    expect(/\bfetch\s*\(/.test(quelle)).toBe(true);
  });

  it("der Quelltext der Bausteine ruft nichts ab und importiert nichts vom Server", () => {
    const ordner = join(__dirname, "../../../../../packages/ui/src/teams");
    const dateien = readdirSync(ordner).filter((f) => /\.(tsx?|css)$/.test(f));
    expect(dateien.length).toBeGreaterThan(8);
    for (const d of dateien) {
      const text = readFileSync(join(ordner, d), "utf8");
      expect(text, d).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/);
      expect(text, d).not.toMatch(/from "(next|@paibot\/(db|jobs|agents|gate))/);
      expect(text, d).not.toMatch(/\b[SQ]-\d{3}\b|PAIBOT-\d|P-TZ/);
    }
  });
});

describe("Teams-Vorschau: Wortlaut der echten Vorlage", () => {
  it("der Entwurf zeigt die Anweisung jedes Bots im vollen Wortlaut", () => {
    const html = entwurf(false);
    expect(vorlage.bots).toHaveLength(4);
    for (const b of vorlage.bots) expect(html, b.name).toContain(esc(b.anweisung));
  });

  it("Gegenprobe: ein gekürzter Wortlaut wird nicht als voll erkannt", () => {
    const b = vorlage.bots[0];
    if (!b) throw new Error("Vorlage leer");
    expect(entwurf(false)).not.toContain(esc(`${b.anweisung}x`));
  });
});

describe("Vorlage laden", () => {
  it("liest das Content-Team aus dem Repository", () => {
    expect(vorlage.team.name).toBe("Content");
    expect(vorlage.team.leitung.name).toBe("Redaktion");
    expect(vorlage.bots.map((b) => b.name)).toEqual(["Redaktion", "Ideen", "Entwurf", "Lektorat"]);
  });

  it("eine Datei in falscher Form wird abgelehnt", async () => {
    await expect(ladeVorlage(join(__dirname, "../../../package.json"))).rejects.toThrow(
      "nicht die erwartete Form",
    );
  });
});
