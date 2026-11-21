/**
 * PaiBot – Tests der Fassungen des Startbereichs über ihr gerendertes HTML.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { AvatarLebendig, Startbereich, type StartDaten, type StartFassung } from "@paibot/ui";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const FASSUNGEN: StartFassung[] = ["begruessung", "startbrett", "stille"];

const VOLL: StartDaten = {
  avatar: h(AvatarLebendig, { farbe: "limette", groesse: 112, still: true }),
  botName: "Pai",
  modell: "Beispiel-Modell Allrounder",
  herkunft: "local",
  schleuseAn: false,
  notAus: false,
  belege: 23,
  unterhaltungen: [
    { id: "u1", titel: "Antwort an Max Mustermann", zeit: "heute" },
    { id: "u2", titel: "Wochenplan sortieren", zeit: "gestern" },
    { id: "u3", titel: "Ideen für den Newsletter", zeit: "16.11." },
  ],
  tageszeit: "abend",
  onAnfang: () => {},
  onUnterhaltung: () => {},
};

const LEER: StartDaten = { avatar: VOLL.avatar, onAnfang: () => {} };

const zeige = (fassung: StartFassung, daten: Partial<StartDaten> = {}, voll = true) =>
  renderToStaticMarkup(
    h(Startbereich, {
      fassung,
      ...(voll ? VOLL : LEER),
      ...daten,
      sitz: { eingabe: null, leer: true },
    }),
  );

describe("Startbereich: jede Fassung rendert", () => {
  for (const fassung of FASSUNGEN) {
    it(`${fassung} mit allen Angaben`, () => {
      const html = zeige(fassung);
      expect(html).toContain(`data-fassung="${fassung}"`);
      expect(html).toContain("<h1");
      expect(html).toContain("Beispiel-Modell Allrounder");
      expect(html).toContain("lokal");
    });

    it(`${fassung} ohne jede optionale Angabe, ohne Fehler und ohne erfundene Werte`, () => {
      const html = zeige(fassung, {}, false);
      expect(html).toContain(`data-fassung="${fassung}"`);
      expect(html).not.toContain("Pai");
      expect(html).not.toContain("Allrounder");
      expect(html).not.toContain("Guten ");
      expect(html).not.toContain("undefined");
      expect(html).not.toContain("NaN");
      expect(html).not.toContain("null");
    });

    it(`${fassung} lädt nichts nach und setzt keine eingebetteten Stile`, () => {
      const html = zeige(fassung);
      expect(html).not.toMatch(/https?:\/\//);
      expect(html).not.toContain("<img");
      expect(html).not.toContain("<script");
      expect(html).not.toContain("<link");
      // Ein Avatar bringt eigene Maße mit; sonst darf der Baustein selbst kein style-Attribut setzen.
      const ohneAvatar = html.replace(
        /<span[^>]*class="[^"]*avatar[^"]*"[\s\S]*?<\/svg><\/span>/g,
        "",
      );
      expect(ohneAvatar).not.toContain("style=");
    });

    it(`${fassung} zeigt keinen gestrichelten Kasten`, () => {
      expect(zeige(fassung)).not.toMatch(/dashed|gestrichelt/);
    });
  }
});

describe("Gruß", () => {
  it("nennt die Tageszeit der Eingabe", () => {
    expect(zeige("begruessung", { tageszeit: "morgen" })).toContain("Guten Morgen.");
    expect(zeige("begruessung", { tageszeit: "tag" })).toContain("Guten Tag.");
    expect(zeige("begruessung", { tageszeit: "abend" })).toContain("Guten Abend.");
    expect(zeige("begruessung", { tageszeit: "spaet" })).toContain("Hallo zu später Stunde.");
    expect(zeige("startbrett", { tageszeit: "abend" })).toContain("Guten Abend! Was machen wir?");
  });

  it("ohne Tageszeit steht ein neutrales „Hallo“, nie eine geratene Tageszeit", () => {
    const html = zeige("begruessung", { tageszeit: undefined });
    expect(html).toContain("Hallo.");
    expect(html).not.toMatch(/Guten (Morgen|Tag|Abend)/);
  });
});

describe("Fehlende Angabe: Zeile weg", () => {
  it("Begrüßung: ohne Modell fehlt „Antwortet mit“, ohne Datenschleuse fehlt ihre Angabe", () => {
    const ohneModell = zeige("begruessung", { modell: undefined, herkunft: undefined });
    expect(ohneModell).not.toContain("Antwortet mit");
    expect(ohneModell).toContain("Datenschleuse");
    const ohneSchleuse = zeige("begruessung", { schleuseAn: undefined });
    expect(ohneSchleuse).toContain("Antwortet mit");
    expect(ohneSchleuse).not.toContain("Datenschleuse");
    const nichts = zeige("begruessung", {
      modell: undefined,
      herkunft: undefined,
      schleuseAn: undefined,
    });
    expect(nichts).not.toContain("_stand_");
    // Die ganze Stand-Zeile fehlt, auch ihre Beschriftung.
    expect(nichts).not.toContain("So antwortet");
  });

  it("Begrüßung: die Datenschleuse steht als „an“ oder „aus“", () => {
    expect(zeige("begruessung", { schleuseAn: true })).toMatch(/Datenschleuse <b[^>]*>an<\/b>/);
    expect(zeige("begruessung", { schleuseAn: false })).toMatch(/Datenschleuse <b[^>]*>aus<\/b>/);
  });

  it("Startbrett: jede Zeile von „So arbeitet Pai“ fehlt, wenn ihre Angabe fehlt", () => {
    const zeile = (html: string, name: string) => html.includes(`<dt>${name}</dt>`);
    const voll = zeige("startbrett");
    for (const name of ["Modell", "Herkunft", "Datenschleuse", "Not-Aus", "Belege"]) {
      expect(zeile(voll, name), name).toBe(true);
    }
    expect(zeile(zeige("startbrett", { modell: undefined }), "Modell")).toBe(false);
    expect(zeile(zeige("startbrett", { herkunft: undefined }), "Herkunft")).toBe(false);
    expect(zeile(zeige("startbrett", { schleuseAn: undefined }), "Datenschleuse")).toBe(false);
    expect(zeile(zeige("startbrett", { notAus: undefined }), "Not-Aus")).toBe(false);
    expect(zeile(zeige("startbrett", { belege: undefined }), "Belege")).toBe(false);
  });

  it("Startbrett: die Zahl der Belege steht nur, wenn sie übergeben wird (auch die 0)", () => {
    expect(zeige("startbrett", { belege: 23 })).toMatch(/>23<\/span> in der Kette/);
    expect(zeige("startbrett", { belege: 0 })).toMatch(/>0<\/span> in der Kette/);
    const ohne = zeige("startbrett", { belege: undefined });
    expect(ohne).not.toContain("in der Kette");
    expect(ohne).not.toMatch(/Belege<\/(span|dt)>/);
  });

  it("Startbrett: ohne Unterhaltungen fehlt die Karte „Zuletzt“, mit zeigt sie höchstens drei", () => {
    expect(zeige("startbrett", { unterhaltungen: [] })).not.toContain("Zuletzt");
    expect(zeige("startbrett", { unterhaltungen: undefined })).not.toContain("Zuletzt");
    const viele = zeige("startbrett", {
      unterhaltungen: [1, 2, 3, 4, 5].map((n) => ({
        id: `u${n}`,
        titel: `Chat ${n}`,
        zeit: "heute",
      })),
    });
    expect(viele).toContain("Chat 3");
    expect(viele).not.toContain("Chat 4");
  });

  it("Startbrett: ohne Stand und ohne Zuletzt gibt es beide Karten nicht", () => {
    const html = zeige("startbrett", {
      modell: undefined,
      herkunft: undefined,
      schleuseAn: undefined,
      notAus: undefined,
      belege: undefined,
      unterhaltungen: undefined,
    });
    expect(html).not.toContain("So arbeitet");
    expect(html).not.toContain("Zuletzt");
    expect(html).toContain('data-variante="keine"');
  });

  it("Stille: ohne Modell fehlt die Zeile darunter", () => {
    expect(zeige("stille")).toContain("Pai antwortet mit");
    const ohne = zeige("stille", { modell: undefined });
    expect(ohne).not.toContain("antwortet mit");
  });

  it("zeigt nur das Wort der Herkunft, das die App überall nutzt", () => {
    expect(zeige("begruessung", { herkunft: "eu" })).toContain(">EU<");
    expect(zeige("begruessung", { herkunft: "non_eu" })).toContain(">außerhalb der EU<");
    expect(zeige("begruessung", { herkunft: "local" })).toContain(">lokal<");
  });
});

describe("Not-Aus", () => {
  for (const fassung of FASSUNGEN) {
    it(`${fassung}: klarer Hinweis, keine Anfänge, keine Einladung`, () => {
      const html = zeige(fassung, { notAus: true });
      expect(html).toContain("Alle Bots sind angehalten.");
      expect(html).toContain("Pai nimmt keine Nachrichten an, bis du fortsetzt.");
      expect(html).toContain("data-notaus");
      expect(html).not.toContain("<button");
      expect(html).not.toContain("Schreib unten los");
      expect(html).not.toContain("Womit fangen wir an");
      expect(html).not.toContain("Was machen wir");
    });
  }

  it("Startbrett nennt zusätzlich, dass Unterhaltungen und Belege sichtbar bleiben", () => {
    expect(zeige("startbrett", { notAus: true })).toContain(
      "Deine Unterhaltungen und Belege kannst du weiter ansehen.",
    );
    expect(zeige("begruessung", { notAus: true })).not.toContain("Belege kannst du");
  });

  it("nimmt für den angehaltenen Zustand den eigenen Avatar", () => {
    const html = zeige("begruessung", {
      notAus: true,
      avatar: h("i", { id: "normal" }),
      avatarNotAus: h("i", { id: "halt" }),
    });
    expect(html).toContain('id="halt"');
    expect(html).not.toContain('id="normal"');
  });

  it("ohne Namen steht ein Satz ohne Namen", () => {
    expect(zeige("begruessung", { notAus: true, botName: undefined })).toContain(
      "Kein Bot nimmt Nachrichten an, bis du fortsetzt.",
    );
  });
});

describe("Anfänge als echte Knöpfe", () => {
  it("jeder Anfang ist ein <button type=button>, in jeder Fassung mit Text für das Feld", () => {
    const zahl = (html: string) => (html.match(/<button type="button"/g) ?? []).length;
    expect(zahl(zeige("begruessung"))).toBe(6);
    // Startbrett: 7 Anfänge + 3 Unterhaltungen
    expect(zahl(zeige("startbrett"))).toBe(10);
    expect(zahl(zeige("startbrett", { unterhaltungen: [] }))).toBe(7);
    // Stille: 4 Anfänge sitzen über dem Feld, auch wenn sie noch verborgen sind
    const stille = zeige("stille");
    expect(zahl(stille)).toBe(4);
    expect(stille).toMatch(/<section[^>]*hidden=""/);
  });

  it("Stille: ohne Fokus ist die Sprechblase da, die Anfänge sind verborgen", () => {
    const html = zeige("stille");
    expect(html).toContain("Klick ins Feld, dann zeig ich dir ein paar Anfänge.");
    expect(html).not.toMatch(/<p class="[^"]*tipp[^"]*" hidden/);
  });

  it("Stille: ohne Sitz (Seite setzt ihn selbst) fehlen Avatar und Anfänge im Baustein", () => {
    const html = renderToStaticMarkup(h(Startbereich, { fassung: "stille", ...VOLL }));
    expect(html).not.toContain("Klick ins Feld");
    expect(html).not.toContain("<button");
  });
});
