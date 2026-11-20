/**
 * PaiBot – Erfundene Beispiel-Daten und Standardtexte für die Beispielseiten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

"use client";

import { t } from "@paibot/shared/texte";
import type { AppShellNavigation, AppShellTexte, EntwurfTexte } from "@paibot/ui";

/*
 * Erfundene Beispiel-Daten und Texte für die Beispielseiten. Texte, für die es in
 * @paibot/shared noch keinen Schlüssel gibt, stehen hier als deutsche Standardtexte.
 */

export const SHELL_TEXTE: AppShellTexte = {
  laeuftAuf: "Läuft auf:",
  modelle: "Modelle:",
  deinBot: "Dein Bot",
  navigation: "Navigation",
  unterhaltungen: "Unterhaltungen von Pai",
  menueOeffnen: "Menü öffnen",
  menueSchliessen: "Menü schließen",
  flaeche: "Arbeitsfläche",
  flaecheZeigen: "Arbeitsfläche zeigen",
  flaecheSchliessen: "Arbeitsfläche schließen",
};

export const BLOCK_TEXTE: EntwurfTexte = {
  etikett: "Entwurf",
  kopieren: "Kopieren",
  kopiert: "Kopiert",
};

export function navigation(aktiv: string): AppShellNavigation {
  return {
    ort: "dein Server",
    modelle: t("modelle.region.eu"),
    neu: { href: "#neu" },
    bot: {
      name: "Pai",
      rolle: "schreibt Entwürfe und Antworten, fasst lange Texte zusammen und plant deine Woche",
      farbe: "violett",
      href: "#bot",
      unterhaltungen: [
        { id: "u1", titel: "Antwort an Max Mustermann", href: "#u1", aktiv: aktiv === "u1" },
        { id: "u2", titel: "Wochenplan sortieren", href: "#u2", aktiv: aktiv === "u2" },
        {
          id: "u3",
          titel: "Einladung zum Sommerfest der Musterfirma mit langem Titel",
          href: "#u3",
          aktiv: aktiv === "u3",
        },
      ],
    },
    werkzeuge: [
      {
        id: "belege",
        text: t("seite.belege"),
        href: "#belege",
        icon: "beleg",
        aktiv: aktiv === "belege",
      },
      { id: "regeln", text: "Regeln", href: "#regeln", icon: "regeln", aktiv: aktiv === "regeln" },
      {
        id: "datenschleuse",
        text: t("seite.datenschleuse"),
        href: "#datenschleuse",
        icon: "schleuse",
        aktiv: aktiv === "datenschleuse",
      },
      {
        id: "einstellungen",
        text: t("seite.einstellungen"),
        href: "#einstellungen",
        icon: "zahnrad",
        aktiv: aktiv === "einstellungen",
      },
      { id: "info", text: t("seite.info"), href: "#info", icon: "info", aktiv: aktiv === "info" },
    ],
  };
}

export const ANTWORT_MARKDOWN = `Gern. Hier ist ein Vorschlag:

\`\`\`
Hallo Herr Mustermann,

danke für Ihre Nachricht. Donnerstag um 14 Uhr passt mir gut.

Viele Grüße
\`\`\`

Soll ich den Ton **lockerer** machen oder eine Alternative vorschlagen?`;

export const MARKDOWN_PROBE = `Ein Link: [Doku](https://paibot.de/doku), ein unsicherer: [Klick](javascript:alert(1)).

Ein Bild wird nie geladen: ![Logo der Musterfirma](https://example.org/logo.png)

<b>Rohes HTML wird nicht gezeigt.</b>

| Tag | Termin |
| --- | --- |
| Donnerstag | 14 Uhr |

- Punkt eins
- Punkt zwei mit \`Code\``;

export type BelegBeispiel = {
  kennung: string;
  aktion: string;
  zeit: string;
  zustand: "gueltig" | "offen";
};

export const BELEGE: BelegBeispiel[] = [
  { kennung: "B-0142", aktion: t("aktion.modell.anfragen"), zeit: "14:32", zustand: "offen" },
  { kennung: "B-0141", aktion: t("aktion.nachricht.senden"), zeit: "14:31", zustand: "gueltig" },
  { kennung: "B-0140", aktion: t("aktion.schleuse.umschalten"), zeit: "13:48", zustand: "gueltig" },
  { kennung: "B-0139", aktion: t("aktion.modell.waehlen"), zeit: "11:06", zustand: "gueltig" },
];
