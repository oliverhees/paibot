/**
 * PaiBot – Bereinigung fremden Texts (Namen, Beschreibungen, Feld-Texte, Ergebnisse): ohne Steuer-,
 * Umkehr- und unsichtbare Zeichen, ohne Markdown-Bilder, auf eine feste Länge gekürzt. Fremder Text
 * ist nie eine Anweisung; diese Bereinigung nimmt ihm nur die Mittel, sich zu verstecken.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

/** Ergebnis einer Bereinigung. */
export interface BereinigterText {
  text: string;
  /** Es wurde etwas entfernt oder ersetzt (Zeichen, Bild, Zeilenenden). */
  veraendert: boolean;
  /** Der Text wurde auf die Höchstlänge gekürzt. */
  gekuerzt: boolean;
}

export interface BereinigenOptionen {
  /** Höchstzahl der Zeichen nach der Bereinigung. */
  maxZeichen: number;
  /** Zeilenumbrüche behalten (Beschreibungen, Ergebnisse) oder zu Leerzeichen machen (Namen, Felder). */
  zeilenumbrueche: boolean;
  /** Marke, die bei einer Kürzung angehängt wird (zählt zur Höchstlänge). */
  kuerzungsMarke?: string;
}

/**
 * Bereiche (Code-Punkte), die entfernt werden: Steuerzeichen (außer Zeilenumbruch und Tab, die extra
 * behandelt werden), Zeichen ohne Breite, Umkehr-Zeichen (Bidi), Unicode-Tags, Variationsauswahl,
 * Füllzeichen und unsichtbare Formatzeichen.
 */
const ENTFERNEN: readonly (readonly [number, number])[] = [
  [0x0000, 0x0008],
  [0x000b, 0x000c],
  [0x000e, 0x001f],
  [0x007f, 0x009f],
  [0x00ad, 0x00ad],
  [0x034f, 0x034f],
  [0x061c, 0x061c],
  [0x115f, 0x1160],
  [0x17b4, 0x17b5],
  [0x180b, 0x180f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x206f],
  [0x2800, 0x2800],
  [0x3164, 0x3164],
  [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
  [0xfff9, 0xfffc],
  [0x1d173, 0x1d17a],
  [0x13430, 0x1345f],
  [0xe0000, 0xe007f],
  [0xe0100, 0xe01ef],
  // einzelne Ersatz-Hälften ohne Gegenstück
  [0xd800, 0xdfff],
];

/**
 * Zusätzlich nach Unicode-Kategorie: Formatzeichen (`Cf`), Zeichen für den privaten Gebrauch (`Co`),
 * nicht zugewiesene Code-Punkte und Nicht-Zeichen (`Cn`) und einzelne Ersatz-Hälften (`Cs`).
 */
const UNERWUENSCHTE_KATEGORIE = /^[\p{Cf}\p{Co}\p{Cn}\p{Cs}]$/u;
const KOMBINATIONSZEICHEN = /^\p{M}$/u;

/** Höchstzahl von Kombinationszeichen hintereinander an einem Grundzeichen; weitere entfallen. */
export const MAX_KOMBINATIONSZEICHEN = 4;

/** Leerzeichen-Arten, die zu einem normalen Leerzeichen werden (Code-Punkte). */
const LEERZEICHEN: readonly (readonly [number, number])[] = [
  [0x0009, 0x0009],
  [0x00a0, 0x00a0],
  [0x1680, 0x1680],
  [0x2000, 0x200a],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
];

/** Zeilenende-Arten, die zu einem Zeilenumbruch werden (Code-Punkte; `\r` wird gesondert behandelt). */
const ZEILENENDEN: readonly number[] = [0x2028, 0x2029, 0x0085];

function inBereich(codePunkt: number, bereiche: readonly (readonly [number, number])[]): boolean {
  for (const [von, bis] of bereiche) {
    if (codePunkt >= von && codePunkt <= bis) return true;
  }
  return false;
}

/** Entfernt unerwünschte Zeichen, vereinheitlicht Leerzeichen und Zeilenenden. In einem Durchgang. */
function saeubereZeichen(text: string): { text: string; veraendert: boolean } {
  const ausgabe: string[] = [];
  let veraendert = false;
  let vorherCr = false;
  let kombinationen = 0;
  for (const zeichen of text) {
    const codePunkt = zeichen.codePointAt(0) as number;
    if (codePunkt === 0x0d) {
      ausgabe.push("\n");
      veraendert = true;
      vorherCr = true;
      continue;
    }
    const warCr = vorherCr;
    vorherCr = false;
    if (codePunkt === 0x0a) {
      if (warCr) continue; // \r\n wurde schon als ein Umbruch geschrieben
      ausgabe.push("\n");
      continue;
    }
    if (ZEILENENDEN.includes(codePunkt)) {
      // 0x0085 liegt im Bereich der Steuerzeichen; hier wird es vorher zum Umbruch.
      ausgabe.push("\n");
      veraendert = true;
      continue;
    }
    if (inBereich(codePunkt, ENTFERNEN) || UNERWUENSCHTE_KATEGORIE.test(zeichen)) {
      veraendert = true;
      continue;
    }
    if (KOMBINATIONSZEICHEN.test(zeichen)) {
      kombinationen += 1;
      if (kombinationen > MAX_KOMBINATIONSZEICHEN) {
        veraendert = true;
        continue;
      }
    } else {
      kombinationen = 0;
    }
    if (inBereich(codePunkt, LEERZEICHEN)) {
      ausgabe.push(" ");
      if (codePunkt !== 0x20) veraendert = true;
      continue;
    }
    ausgabe.push(zeichen);
  }
  return { text: ausgabe.join(""), veraendert };
}

const BILD_ANFANG = "![";

/**
 * Entfernt Markdown-Bilder (`![Text](Adresse)` und `![Text][Name]`) in einem Durchgang. Läuft in
 * linearer Zeit: Fehlt hinter einer Stelle das schließende Zeichen, wird es nicht noch einmal gesucht.
 */
export function entferneMarkdownBilder(text: string): { text: string; entfernt: boolean } {
  if (!text.includes(BILD_ANFANG)) return { text, entfernt: false };
  const teile: string[] = [];
  let position = 0;
  let entfernt = false;
  let naechsteEckKlammer = -2; // zuletzt gefundene Stelle von "]" (-1 = keine mehr im Text)
  let keineRundKlammerMehr = false;
  let keineEckKlammerNachBild = false;

  while (position < text.length) {
    const anfang = text.indexOf(BILD_ANFANG, position);
    if (anfang === -1) break;
    // "]" suchen: ein früherer Fund hinter `anfang` gilt weiter.
    if (
      naechsteEckKlammer === -2 ||
      (naechsteEckKlammer !== -1 && naechsteEckKlammer < anfang + 2)
    ) {
      naechsteEckKlammer = text.indexOf("]", anfang + 2);
    }
    if (naechsteEckKlammer === -1) break;
    const zu = naechsteEckKlammer;
    const folgezeichen = text[zu + 1];
    let ende = -1;
    if (folgezeichen === "(" && !keineRundKlammerMehr) {
      const rund = text.indexOf(")", zu + 2);
      if (rund === -1) keineRundKlammerMehr = true;
      else ende = rund + 1;
    } else if (folgezeichen === "[" && !keineEckKlammerNachBild) {
      const eck = text.indexOf("]", zu + 2);
      if (eck === -1) keineEckKlammerNachBild = true;
      else ende = eck + 1;
    }
    if (ende === -1) {
      // kein Bild: das Zeichen "!" bleibt, es geht hinter "![" weiter
      teile.push(text.slice(position, anfang + 2));
      position = anfang + 2;
      continue;
    }
    teile.push(text.slice(position, anfang));
    position = ende;
    entfernt = true;
  }
  if (!entfernt) return { text, entfernt: false };
  teile.push(text.slice(position));
  return { text: teile.join(""), entfernt: true };
}

/**
 * Macht aus jedem `![` ein `! [`. Damit kann kein Rest ein Bild einleiten, auch keines, das erst
 * durch das Entfernen anderer Bilder entsteht (`!![a](b)[c](d)`), keines mit verschachtelten
 * Klammern und keine Kurz-Form (`![r]` mit einer Verweis-Definition). Ein Durchgang genügt: Das
 * eingefügte Leerzeichen trennt `!` und `[` für immer, es kann dabei nie ein neues `![` entstehen.
 * Läuft in linearer Zeit.
 */
export function entschaerfeBildAnfaenge(text: string): { text: string; entschaerft: boolean } {
  if (!text.includes(BILD_ANFANG)) return { text, entschaerft: false };
  return { text: text.replaceAll(BILD_ANFANG, "! ["), entschaerft: true };
}

/**
 * Bereinigt fremden Text. Reihenfolge: auf das Doppelte der Höchstlänge begrenzen (damit nichts
 * Langes verarbeitet wird), unsichtbare Zeichen entfernen, Bilder entfernen und Bild-Anfänge entschärfen, Zeilenenden und
 * Leerzeichen vereinheitlichen, kürzen.
 */
export function bereinigeText(roh: string, optionen: BereinigenOptionen): BereinigterText {
  const max = Math.max(1, Math.floor(optionen.maxZeichen));
  let veraendert = false;
  let text = roh;
  // Bearbeitet wird höchstens das Dreifache der Höchstlänge (Entferntes kann dahinter nachrücken).
  const arbeitsGrenze = max * 3 + 16;
  let gekuerzt = false;
  if (text.length > arbeitsGrenze) {
    text = text.slice(0, arbeitsGrenze);
    gekuerzt = true;
  }
  const gesaeubert = saeubereZeichen(text);
  if (gesaeubert.veraendert) veraendert = true;
  text = gesaeubert.text;

  const ohneBilder = entferneMarkdownBilder(text);
  if (ohneBilder.entfernt) veraendert = true;
  text = ohneBilder.text;
  // Was die Suche nach vollständigen Bildern nicht erfasst, bekommt keinen Bild-Anfang mehr.
  const entschaerft = entschaerfeBildAnfaenge(text);
  if (entschaerft.entschaerft) veraendert = true;
  text = entschaerft.text;

  if (optionen.zeilenumbrueche) {
    text = text
      .split("\n")
      .map((zeile) => zeile.replace(/ +$/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } else {
    text = text.replace(/\s+/g, " ").trim();
  }

  if (text.length > max) {
    const marke = optionen.kuerzungsMarke ?? "";
    let schnitt = Math.max(0, max - marke.length);
    // keine halbe Ersatz-Paarung am Ende
    const letztes = text.charCodeAt(schnitt - 1);
    if (schnitt > 0 && letztes >= 0xd800 && letztes <= 0xdbff) schnitt -= 1;
    text = `${text.slice(0, schnitt).trimEnd()}${marke}`;
    gekuerzt = true;
  }
  return { text, veraendert, gekuerzt };
}
