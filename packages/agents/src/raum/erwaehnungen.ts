/**
 * PaiBot – Erwähnungen im Teamchat erkennen
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/**
 * Erwähnungen (`@Name`) in der Nachricht der Person erkennen. Reine Funktion: kein Zugriff auf
 * Datenbank oder Uhr. Gelesen wird nur ein `@` aus ASCII; Code, Zitate und E-Mail-Adressen zählen
 * nicht, und ein Name gilt nur bei exakt gleicher Schreibweise (Groß/Klein und Unicode-Form egal).
 */

import { aehnlichkeitsForm, type RaumBot, vergleichsName } from "./namen";

/** Höchstzahl gültiger Erwähnungen je Nachricht, wenn nichts anderes eingestellt ist. */
export const STANDARD_MAX_ERWAEHNUNGEN = 6;
/** Erlaubter Bereich der Höchstzahl. */
export const MAX_ERWAEHNUNGEN_BEREICH = { min: 1, max: 12 } as const;
/** Längster Text, der nach Erwähnungen durchsucht wird; der Rest wird nicht gelesen. */
export const MAX_SUCH_ZEICHEN = 20_000;

/** Warum eine Erwähnung keinen Bot ruft. */
export type ErwaehnungsGrund =
  | "pausiert"
  | "nicht_im_team"
  | "unbekannt"
  | "aehnlicher_name"
  | "mehrdeutig";

export interface ErwaehnungsHinweis {
  readonly grund: ErwaehnungsGrund;
  /** Der Name, wie er in der Nachricht stand (gekürzt auf 60 Zeichen). */
  readonly geschrieben: string;
  /** Der betroffene Bot, wenn es genau einen gibt. */
  readonly botId?: string;
}

export interface ErwaehnungsErgebnis {
  /** Gerufene Bots: Mitglieder, nicht pausiert, jeder höchstens einmal, in Reihenfolge des ersten Auftretens. */
  readonly gueltig: readonly RaumBot[];
  readonly hinweise: readonly ErwaehnungsHinweis[];
  /** Mehr gültige Erwähnungen als erlaubt: die Nachricht darf so nicht gesendet werden. */
  readonly zuViele: boolean;
  /** Der Text war länger als `MAX_SUCH_ZEICHEN`; nur der Anfang wurde gelesen. */
  readonly textGekuerzt: boolean;
}

export interface ErwaehnungsOptionen {
  /** Bots, die nicht zum Team gehören; nur um sagen zu können „gehört nicht zum Team“. */
  readonly andereBots?: readonly RaumBot[];
  readonly hoechstens?: number;
}

/** Entfernt Zitatzeilen, Codeblöcke und Code-Stücke; ersetzt sie durch Leerzeichen bzw. Zeilenumbruch. */
export function ohneCodeUndZitate(text: string): string {
  const zeilen = text.split(/\r\n|\r|\n/u);
  const absaetze: string[][] = [[]];
  let zaun: { zeichen: string; laenge: number } | null = null;
  for (const zeile of zeilen) {
    if (zaun) {
      const zu = /^ {0,3}(`{3,}|~{3,})[ \t]*$/u.exec(zeile)?.[1];
      if (zu && zu[0] === zaun.zeichen && zu.length >= zaun.laenge) zaun = null;
      continue;
    }
    const auf = /^ {0,3}(`{3,}|~{3,})/u.exec(zeile)?.[1];
    if (auf) {
      zaun = { zeichen: auf[0] as string, laenge: auf.length };
      absaetze.push([]);
      continue;
    }
    if (/^ {0,3}>/u.test(zeile)) {
      absaetze.push([]);
      continue;
    }
    if (zeile.trim() === "") {
      absaetze.push([]);
      continue;
    }
    (absaetze[absaetze.length - 1] as string[]).push(zeile);
  }
  return absaetze
    .filter((a) => a.length > 0)
    .map((a) => ohneCodeStuecke(a.join("\n")))
    .join("\n\n");
}

/** Entfernt `…`-Stücke (gleich lange Backtick-Folgen öffnen und schließen); offene bleiben Text. */
function ohneCodeStuecke(text: string): string {
  let ergebnis = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "`") {
      ergebnis += text[i];
      i += 1;
      continue;
    }
    let n = 0;
    while (text[i + n] === "`") n += 1;
    // passende schließende Folge der gleichen Länge suchen
    let j = i + n;
    let ende = -1;
    while (j < text.length) {
      if (text[j] !== "`") {
        j += 1;
        continue;
      }
      let m = 0;
      while (text[j + m] === "`") m += 1;
      if (m === n) {
        ende = j + m;
        break;
      }
      j += m;
    }
    if (ende === -1) {
      ergebnis += text.slice(i, i + n);
      i += n;
    } else {
      ergebnis += " ";
      i = ende;
    }
  }
  return ergebnis;
}

const NAMENSZEICHEN = /[\p{L}\p{N}\p{M}_-]/u;

function istBegrenzung(zeichen: string | undefined): boolean {
  return zeichen === undefined || !NAMENSZEICHEN.test(zeichen);
}

function kuerze(text: string): string {
  const stuecke = Array.from(text.slice(0, 200));
  return stuecke.slice(0, 60).join("");
}

interface Kandidat {
  readonly bot: RaumBot;
  readonly name: string;
  readonly imTeam: boolean;
}

/**
 * Findet die Erwähnungen in `text` gegen die Mitglieder des Teams. Nur ein Name aus `mitglieder`
 * ruft einen Bot; wer pausiert ist, nicht zum Team gehört, nur ähnlich aussieht oder bei dem zwei
 * Bots gleich heißen, wird nicht gerufen und steht als Hinweis im Ergebnis.
 */
export function erkenneErwaehnungen(
  text: string,
  mitglieder: readonly RaumBot[],
  optionen: ErwaehnungsOptionen = {},
): ErwaehnungsErgebnis {
  const hoechstens = optionen.hoechstens ?? STANDARD_MAX_ERWAEHNUNGEN;
  if (
    !Number.isInteger(hoechstens) ||
    hoechstens < MAX_ERWAEHNUNGEN_BEREICH.min ||
    hoechstens > MAX_ERWAEHNUNGEN_BEREICH.max
  ) {
    throw new RangeError("Höchstzahl der Erwähnungen außerhalb des erlaubten Bereichs");
  }
  const textGekuerzt = text.length > MAX_SUCH_ZEICHEN;
  const gelesen = ohneCodeUndZitate(textGekuerzt ? text.slice(0, MAX_SUCH_ZEICHEN) : text);

  const kandidaten: Kandidat[] = [
    ...mitglieder.map((bot) => ({ bot, name: vergleichsName(bot.name), imTeam: true })),
    ...(optionen.andereBots ?? []).map((bot) => ({
      bot,
      name: vergleichsName(bot.name),
      imTeam: false,
    })),
  ].filter((k) => k.name !== "");
  const laengster = kandidaten.reduce((m, k) => Math.max(m, k.name.length), 0);
  const fenster = laengster * 4 + 16;
  const nachLaenge = [...kandidaten].sort((a, b) => b.name.length - a.name.length);

  const gueltig: RaumBot[] = [];
  const hinweise: ErwaehnungsHinweis[] = [];
  const gesehen = new Set<string>();
  const hinweisSchluessel = new Set<string>();
  const merke = (h: ErwaehnungsHinweis) => {
    const schluessel = `${h.grund}\u0000${vergleichsName(h.geschrieben)}`;
    if (hinweisSchluessel.has(schluessel)) return;
    hinweisSchluessel.add(schluessel);
    hinweise.push(h);
  };

  for (let i = 0; i < gelesen.length; i++) {
    if (gelesen[i] !== "@") continue;
    const davor = i === 0 ? undefined : gelesen[i - 1];
    if (davor !== undefined && (NAMENSZEICHEN.test(davor) || davor === "@")) continue;
    const danach = gelesen[i + 1];
    if (danach === undefined || /\s/u.test(danach)) continue; // „@ Name“ ruft niemanden
    const rest = vergleichsName(gelesen.slice(i + 1, i + 1 + fenster));
    const wort = /^[\p{L}\p{N}\p{M}_-]+/u.exec(rest)?.[0] ?? "";
    const treffer = nachLaenge.find(
      (k) => rest.startsWith(k.name) && istBegrenzung(rest[k.name.length]),
    );
    if (!treffer) {
      if (wort === "") continue;
      const form = aehnlichkeitsForm(wort);
      const aehnlich = kandidaten.find((k) => aehnlichkeitsForm(k.name) === form);
      merke({
        grund: aehnlich ? "aehnlicher_name" : "unbekannt",
        geschrieben: kuerze(wort),
        ...(aehnlich ? { botId: aehnlich.bot.id } : {}),
      });
      continue;
    }
    const gleichnamig = kandidaten.filter((k) => k.name === treffer.name);
    if (gleichnamig.length > 1) {
      merke({ grund: "mehrdeutig", geschrieben: kuerze(treffer.name) });
      continue;
    }
    if (!treffer.imTeam) {
      merke({ grund: "nicht_im_team", geschrieben: kuerze(treffer.name), botId: treffer.bot.id });
      continue;
    }
    if (treffer.bot.pausiert) {
      merke({ grund: "pausiert", geschrieben: kuerze(treffer.name), botId: treffer.bot.id });
      continue;
    }
    if (gesehen.has(treffer.bot.id)) continue;
    gesehen.add(treffer.bot.id);
    gueltig.push(treffer.bot);
  }

  return { gueltig, hinweise, zuViele: gueltig.length > hoechstens, textGekuerzt };
}
