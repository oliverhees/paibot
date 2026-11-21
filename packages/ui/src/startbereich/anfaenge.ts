/**
 * PaiBot – Anfänge der drei Fassungen (nur Text-Chat, ohne Werkzeuge).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";

export type AnfangGruppe = "schreiben" | "planen" | "verstehen";

export interface Anfang {
  id: string;
  /** Beschriftung des Knopfs. */
  label: string;
  /** Text, der ins Eingabefeld kommt. */
  text: string;
}

export interface AnfangGruppeMitTexten {
  gruppe: AnfangGruppe;
  titel: string;
  anfaenge: Anfang[];
}

/** Fassung „begruessung“: drei Gruppen mit je zwei Anfängen. */
export function anfaengeBegruessung(): AnfangGruppeMitTexten[] {
  return [
    {
      gruppe: "schreiben",
      titel: t("startbereich.gruppe.schreiben"),
      anfaenge: [
        { id: "absage", label: t("startbereich.a.absage"), text: t("startbereich.anfang.absage") },
        {
          id: "kuerzen",
          label: t("startbereich.a.kuerzen"),
          text: t("startbereich.anfang.kuerzen"),
        },
      ],
    },
    {
      gruppe: "planen",
      titel: t("startbereich.gruppe.planen"),
      anfaenge: [
        { id: "woche", label: t("startbereich.a.woche"), text: t("startbereich.anfang.woche") },
        {
          id: "sortieren",
          label: t("startbereich.a.sortieren"),
          text: t("startbereich.anfang.sortieren"),
        },
      ],
    },
    {
      gruppe: "verstehen",
      titel: t("startbereich.gruppe.verstehen"),
      anfaenge: [
        {
          id: "erklaeren",
          label: t("startbereich.a.erklaeren"),
          text: t("startbereich.anfang.erklaeren"),
        },
        {
          id: "abwaegen",
          label: t("startbereich.a.abwaegen"),
          text: t("startbereich.anfang.abwaegen"),
        },
      ],
    },
  ];
}

/** Fassung „startbrett“: drei, zwei und zwei Anfänge; der erste trägt den ganzen Satz. */
export function anfaengeStartbrett(): AnfangGruppeMitTexten[] {
  return [
    {
      gruppe: "schreiben",
      titel: t("startbereich.gruppe.schreiben"),
      anfaenge: [
        {
          id: "absage",
          label: t("startbereich.anfang.absage"),
          text: t("startbereich.anfang.absage"),
        },
        {
          id: "kuerzen",
          label: t("startbereich.b.kuerzen"),
          text: t("startbereich.anfang.kuerzen"),
        },
        {
          id: "hoeflicher",
          label: t("startbereich.b.hoeflicher"),
          text: t("startbereich.anfang.hoeflicher"),
        },
      ],
    },
    {
      gruppe: "planen",
      titel: t("startbereich.gruppe.planen"),
      anfaenge: [
        { id: "woche", label: t("startbereich.b.woche"), text: t("startbereich.anfang.woche") },
        {
          id: "sortieren",
          label: t("startbereich.b.sortieren"),
          text: t("startbereich.anfang.sortieren_kurz"),
        },
      ],
    },
    {
      gruppe: "verstehen",
      titel: t("startbereich.gruppe.verstehen"),
      anfaenge: [
        {
          id: "erklaeren",
          label: t("startbereich.b.erklaeren"),
          text: t("startbereich.anfang.erklaeren"),
        },
        {
          id: "abwaegen",
          label: t("startbereich.b.abwaegen"),
          text: t("startbereich.anfang.abwaegen"),
        },
      ],
    },
  ];
}

export interface KurzAnfang extends Anfang {
  gruppeTitel: string;
}

/** Fassung „stille“: vier Anfänge, je mit dem Wort der Gruppe davor. */
export function anfaengeStille(): KurzAnfang[] {
  return [
    {
      id: "absage",
      gruppeTitel: t("startbereich.gruppe.schreiben"),
      label: t("startbereich.c.absage"),
      text: t("startbereich.anfang.absage"),
    },
    {
      id: "kuerzen",
      gruppeTitel: t("startbereich.gruppe.schreiben"),
      label: t("startbereich.c.kuerzen"),
      text: t("startbereich.anfang.kuerzen"),
    },
    {
      id: "woche",
      gruppeTitel: t("startbereich.gruppe.planen"),
      label: t("startbereich.c.woche"),
      text: t("startbereich.anfang.woche"),
    },
    {
      id: "erklaeren",
      gruppeTitel: t("startbereich.gruppe.verstehen"),
      label: t("startbereich.c.erklaeren"),
      text: t("startbereich.anfang.erklaeren"),
    },
  ];
}
