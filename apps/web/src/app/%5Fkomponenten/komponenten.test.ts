/**
 * PaiBot – Tests der Komponenten über ihr gerendertes HTML.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  AntwortZeile,
  AppShell,
  Avatar,
  ChatEingabe,
  ErrorState,
  Footer,
  Markdown,
  PruefErgebnis,
  StatusChip,
  Switch,
} from "@paibot/ui";
import { type FunctionComponent, createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BLOCK_TEXTE, navigation, SHELL_TEXTE } from "./daten";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

/** Element mit Kindern; die Kinder-Pflicht der Props prüft hier nicht der Typ. */
const mitKindern = <P extends object>(
  typ: FunctionComponent<P>,
  props: Omit<P, "children">,
  kind: ReactNode,
) => h(typ as FunctionComponent<object>, props, kind);

describe("Markdown der Antworten", () => {
  const md = (text: string) => html(h(Markdown, { text, blockTexte: BLOCK_TEXTE }));

  it("Linktexte und Code zeigen keine Steuerzeichen der Schreibrichtung", () => {
    const aus = md("[harmlos\u202Egnp.exe](https://example.org/datei) `rm\u2066 -rf`");
    expect(aus).toContain(">harmlosgnp.exe</a>");
    expect(aus).toContain("rm -rf");
    expect(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/.test(aus)).toBe(false);
  });

  it("zeigt Bild-Markdown als Link und lädt nie ein Bild", () => {
    const aus = md("![Logo der Musterfirma](https://example.org/logo.png)");
    expect(aus).not.toContain("<img");
    expect(aus).toContain('href="https://example.org/logo.png"');
    expect(aus).toContain("Logo der Musterfirma");
  });

  it("zeigt Bilder mit unsicherer Adresse nur als Text", () => {
    const aus = md("![Bild](javascript:alert(1)) ![Daten](data:image/png;base64,AAAA)");
    expect(aus).not.toContain("<img");
    expect(aus).not.toContain("javascript:");
    expect(aus).not.toContain("data:");
  });

  it("gibt Links rel=noopener noreferrer nofollow, zeigt das Ziel und lässt nur http/https zu", () => {
    const aus = md("[gut](https://paibot.de) [böse](javascript:alert(1)) [relativ](/belege)");
    expect(aus).toContain(
      '<a href="https://paibot.de/" target="_blank" rel="noopener noreferrer nofollow">gut</a>',
    );
    expect(aus).toContain("(paibot.de)");
    expect(aus).not.toContain("javascript:");
    expect(aus).not.toContain('href="/belege"');
    expect(aus).toContain("<span>böse</span>");
  });

  it("verbirgt das Ziel nicht hinter Linktext oder Bild-Beschriftung", () => {
    const aus = md(
      "[Deine Bank](https://example.org/abholen?daten=geheim) ![Logo](https://example.org/a.png) https://paibot.de/doku",
    );
    expect(aus).toContain("(example.org/abholen…)");
    expect(aus).toContain("(example.org/a.png)");
    // Steht das Ziel schon im Text, kommt es nicht doppelt.
    expect(aus).not.toContain("(paibot.de/doku)");
  });

  it("zeigt kein rohes HTML", () => {
    const aus = md('Hallo <script>alert(1)</script><img src="x" onerror="alert(1)"> <b>fett</b>');
    expect(aus).not.toContain("<script");
    expect(aus).not.toContain("<img");
    expect(aus).not.toContain("onerror");
    expect(aus).not.toContain("<b>");
  });

  it("macht aus Code-Blöcken einen Block mit „Kopieren“", () => {
    const aus = md("```\nHallo Herr Mustermann\n```");
    expect(aus).toContain("Kopieren");
    expect(aus).toContain("Hallo Herr Mustermann");
  });
});

describe("Komponenten", () => {
  it("Schalter hat role=switch, Zustand und vollen Namen", () => {
    const aus = html(
      mitKindern(
        Switch,
        { an: true, onAendern: () => {}, label: "Datenschleuse für diese Unterhaltung" },
        "Datenschleuse",
      ),
    );
    expect(aus).toContain('role="switch"');
    expect(aus).toContain('aria-checked="true"');
    expect(aus).toContain('aria-label="Datenschleuse für diese Unterhaltung"');
  });

  it("Status steht immer mit Wort da", () => {
    expect(html(mitKindern(StatusChip, { art: "ok" }, "gültig"))).toContain("gültig");
  });

  it("Fehler nennt immer einen Ausweg", () => {
    const aus = html(h(ErrorState, { code: "kein_modell" }));
    expect(aus).toContain("Für deinen Bot ist kein Modell gewählt.");
    expect(aus).toContain("Wähle ein Modell.");
    expect(aus).toContain('role="alert"');
    // Ohne Code gilt der allgemeine Ausweg.
    expect(html(h(ErrorState, { titel: "Hoppla" }))).toContain("schau ins Log");
  });

  it("Prüf-Ergebnis nennt die Stelle", () => {
    expect(html(h(PruefErgebnis, { zustand: "ungueltig", seq: 7 }))).toContain(
      "ungültig bei Eintrag 7",
    );
    expect(html(h(PruefErgebnis, { zustand: "gueltig" }))).toContain("gültig");
  });

  it("Fußzeile verlinkt PaiBot und HR CodeLabs sicher", () => {
    const aus = html(h(Footer));
    const sichtbar = aus.replace(/<span class="[^"]*nurLesbar[^"]*">[^<]*<\/span>/g, "");
    expect(sichtbar.replace(/<[^>]+>/g, "")).toBe("Powered by PaiBot · entwickelt von HR CodeLabs");
    expect(aus).toMatch(
      /<a href="https:\/\/paibot\.de" target="_blank" rel="noopener noreferrer">PaiBot<span[^>]*> \(öffnet in einem neuen Tab\)<\/span><\/a>/,
    );
    expect(aus).toMatch(
      /<a href="https:\/\/hr-codelabs\.de" target="_blank" rel="noopener noreferrer">HR CodeLabs<span/,
    );
    // Die frühere Adresse wird hier nicht ausgeschrieben, damit sie nirgends im Projekt steht.
    expect(aus).not.toMatch(new RegExp(["hr", "applab"].join("-"), "i"));
  });

  it("Zeile unter der Antwort enthält Beleg, Datenschleuse und Modell mit Herkunft", () => {
    const aus = html(
      h(AntwortZeile, {
        beleg: { kennung: "B-0142", zustand: "gueltig" },
        schleuse: { modus: "direkt" },
        modell: { name: "Beispiel-Modell Groß", region: "eu" },
      }),
    );
    expect(aus).toContain("B-0142");
    // Ohne eigenen Text nur der Weg; die Region kommt aus der Angabe am Modell (hier Beispiel-Daten).
    expect(aus).toContain("direkt an den Anbieter");
    expect(aus).toContain("Beispiel-Modell Groß");
    expect(aus).toContain("EU");
    expect(aus).toContain('aria-expanded="false"');
  });

  it("Eingabe hat ein Label und einen Senden-Knopf", () => {
    const aus = html(
      h(ChatEingabe, { onSenden: () => {}, schleuseAn: false, onSchleuse: () => {} }),
    );
    expect(aus).toContain(">Nachricht</label>");
    expect(aus).toContain('aria-label="Senden"');
    expect(aus).not.toContain('aria-label="Stopp"');
    const laeuft = html(
      h(ChatEingabe, { onSenden: () => {}, laeuft: true, schleuseAn: false, onSchleuse: () => {} }),
    );
    expect(laeuft).toContain('aria-label="Stopp"');
  });

  it("Avatar ist ohne Titel Schmuck und mit Titel ein Bild", () => {
    expect(html(h(Avatar, { farbe: "pink" }))).toContain('aria-hidden="true"');
    expect(html(h(Avatar, { farbe: "pink", titel: "Pai" }))).toContain('aria-label="Pai"');
  });

  it("AppShell zeigt Navigation, Bot-Rolle ungekürzt und Fußzeile", () => {
    const nav = navigation("u1");
    const aus = html(mitKindern(AppShell, { navigation: nav, texte: SHELL_TEXTE }, "Inhalt"));
    expect(aus).toContain('aria-label="Navigation"');
    expect(aus).toContain(nav.bot.rolle);
    expect(aus).toContain('aria-current="page"');
    for (const w of nav.werkzeuge) expect(aus).toContain(w.text);
    expect(aus).toContain("HR CodeLabs");
    expect(aus).toContain("<main");
  });
});
