/**
 * PaiBot – Tests des lebendigen Avatars über sein gerendertes HTML (alle Formen und Zustände).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { AVATAR_SHAPES } from "@paibot/shared/objekte";
import {
  AVATAR_AUSDRUECKE,
  AVATAR_LEBENDIG_ZUSTAENDE,
  AvatarLebendig,
  AvatarLebendigVorschau,
} from "@paibot/ui";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("Lebendiger Avatar", () => {
  it("rendert alle Formen in allen Zuständen und Größen ohne Fehler", () => {
    for (const form of AVATAR_SHAPES) {
      for (const zustand of AVATAR_LEBENDIG_ZUSTAENDE) {
        for (const groesse of [24, 32, 128]) {
          const aus = html(h(AvatarLebendig, { farbe: "limette", form, zustand, groesse }));
          expect(aus, `${form} ${zustand} ${groesse}`).toContain(`data-zustand="${zustand}"`);
          expect(aus).toContain(`data-form="${form}"`);
          expect(aus).toContain("<svg");
        }
      }
    }
  });

  it("ist ohne Titel Schmuck und mit Titel ein Bild mit genau diesem Text", () => {
    const schmuck = html(h(AvatarLebendig, { farbe: "pink" }));
    expect(schmuck).toContain('aria-hidden="true"');
    expect(schmuck).not.toContain("<title>");
    const bild = html(h(AvatarLebendig, { farbe: "pink", titel: "Pai denkt nach" }));
    expect(bild).toContain('role="img"');
    expect(bild).toContain('aria-label="Pai denkt nach"');
    expect(bild).not.toContain('aria-hidden="true"');
  });

  it("zeigt Arbeits-Mimik nur in den Arbeits-Zuständen", () => {
    for (const zustand of AVATAR_LEBENDIG_ZUSTAENDE) {
      const aus = html(h(AvatarLebendig, { farbe: "limette", zustand }));
      const arbeit = zustand === "denkt" || zustand === "schreibt";
      expect(aus, zustand).toContain(`data-arbeit="${arbeit ? 1 : 0}"`);
    }
  });

  it("zeichnet beim Zeichnen weder Atmen, Blinzeln noch Regung; das setzt erst der Takt im Browser", () => {
    const aus = html(h(AvatarLebendig, { farbe: "limette", zustand: "ruhig" }));
    expect(aus).not.toContain("data-atem");
    expect(aus).not.toContain("data-blink");
    expect(aus).not.toContain("data-regung");
  });

  it("markiert `still` und die vereinfachte Mimik bei 24 Pixeln", () => {
    expect(html(h(AvatarLebendig, { farbe: "limette", still: true }))).toContain('data-still="1"');
    expect(html(h(AvatarLebendig, { farbe: "limette" }))).not.toContain("data-still");
    const klein = html(h(AvatarLebendig, { farbe: "limette", groesse: 24 }));
    const gross = html(h(AvatarLebendig, { farbe: "limette", groesse: 48 }));
    expect(klein).toMatch(/class="[^"]*klein/);
    expect(gross).not.toMatch(/class="[^"]*klein/);
  });

  it("braucht weder Inline-Skript noch Inline-Stil-Element (strenge Content-Security-Policy)", () => {
    const aus = html(h(AvatarLebendig, { farbe: "limette", zustand: "wartet" }));
    expect(aus).not.toMatch(/<script|<style/);
    expect(aus).not.toMatch(/\son[a-z]+=/);
  });

  it("nennt keine Netz-Adressen", () => {
    const aus = html(h(AvatarLebendig, { farbe: "limette", titel: "x" }));
    expect(aus).not.toMatch(/https?:\/\//);
  });

  it("zeigt in der Vorschau jede Form in jedem Zustand und jeden Ausdruck", () => {
    const aus = html(h(AvatarLebendigVorschau));
    for (const form of AVATAR_SHAPES) {
      for (const zustand of AVATAR_LEBENDIG_ZUSTAENDE) {
        expect(aus).toContain(`data-zelle="${form}-${zustand}"`);
      }
    }
    for (const a of AVATAR_AUSDRUECKE) expect(aus).toContain(`data-ausdruck-knopf="${a}"`);
  });
});
