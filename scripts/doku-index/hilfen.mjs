/**
 * PaiBot – Hilfen für den Doku-Index: Bereinigung, Zerlegung in Abschnitte, Prüfmuster.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Gemeinsam benutzt von scripts/doku-index.mjs (Index bauen) und scripts/doku-check.mjs (Doku
// prüfen). Nur Node-Bordmittel.

/** Unsichtbares, Bidi- und Steuerzeichen (außer Zeilenumbruch und Tabulator)? */
export function istUnsichtbar(zeichen) {
  const cp = zeichen.codePointAt(0);
  if (cp === undefined) return false;
  if (cp === 0x0a || cp === 0x09) return false;
  return (
    cp < 0x20 ||
    (cp >= 0x7f && cp <= 0x9f) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069) ||
    cp === 0xfeff
  );
}

/** Zeilenenden vereinheitlichen. */
export function normalisiere(text) {
  return text.replace(/\r\n?/g, "\n");
}

/** Fundstellen unsichtbarer Zeichen: [{ zeile, code }] (code z. B. "U+202E"). */
export function findeUnsichtbares(text) {
  const funde = [];
  let zeile = 1;
  for (const zeichen of normalisiere(text)) {
    if (zeichen === "\n") zeile += 1;
    else if (istUnsichtbar(zeichen)) {
      const hex = zeichen.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
      funde.push({ zeile, code: `U+${hex}` });
    }
  }
  return funde;
}

/** Entfernt unsichtbare Zeichen, Bidi- und Steuerzeichen. */
export function entferneUnsichtbares(text) {
  let aus = "";
  for (const zeichen of text) if (!istUnsichtbar(zeichen)) aus += zeichen;
  return aus;
}

/** Entfernt alle HTML-Kommentare; ein nicht geschlossener gilt bis zum Ende als Kommentar. */
export function entferneKommentare(text) {
  return text.replace(/<!--[\s\S]*?(?:-->|$)/g, "");
}

const BILD = /!\[(?:[^[\]]|\[[^\]]*\])*\]\(\s*<?[^)\s>]*>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const LINK = /\[((?:[^[\]]|\[[^\]]*\])*)\]\(\s*<?[^)\s>]*>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const TAG = /<\/?[A-Za-z][^<>\n]*>/g;

/** Bereinigt Fließtext einer Zeile (ohne Code in Backticks): Bilder, Links zu ihrem Text, Tags. */
function bereinigeProsa(text) {
  return text.replace(BILD, "").replace(LINK, "$1").replace(TAG, "");
}

/** Bereinigt eine Zeile außerhalb eines Codeblocks; Code in Backticks bleibt unverändert. */
export function bereinigeZeile(zeile) {
  let aus = "";
  let rest = zeile;
  for (;;) {
    const treffer = /`[^`\n]*`/.exec(rest);
    if (!treffer) return aus + bereinigeProsa(rest);
    aus += bereinigeProsa(rest.slice(0, treffer.index)) + treffer[0];
    rest = rest.slice(treffer.index + treffer[0].length);
  }
}

/** Anker im Stil von GitHub: klein, ohne Satzzeichen, Leerzeichen zu „-“. */
export function ankerVon(titel) {
  return titel
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, "")
    .trim()
    .replace(/ /g, "-");
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const UEBERSCHRIFT = /^(#{1,3})[ \t]+(.+?)[ \t]*#*[ \t]*$/;

/**
 * Zerlegt eine Seite in Abschnitte: Text unter der Überschrift erster Ebene (falls vorhanden) und je
 * eine Überschrift zweiter und dritter Ebene. Der Text ist bereinigt (siehe `bereinige`).
 * Rückgabe: [{ anker, titel, text }] ohne Abschnitte, die keinen Text oder keine Überschrift haben.
 */
export function zerlege(roh) {
  const text = entferneUnsichtbares(entferneKommentare(normalisiere(roh)));
  const abschnitte = [];
  let aktuell = null;
  let zaun = null;
  const neu = (titel) => {
    aktuell = { titel, zeilen: [] };
    abschnitte.push(aktuell);
  };
  for (const zeile of text.split("\n")) {
    const marke = FENCE.exec(zeile);
    if (zaun) {
      if (
        marke &&
        marke[1][0] === zaun[0] &&
        marke[1].length >= zaun.length &&
        !/\S/.test(zeile.slice(marke[0].length))
      ) {
        zaun = null;
      }
      aktuell?.zeilen.push(zeile);
      continue;
    }
    if (marke) {
      zaun = marke[1];
      aktuell?.zeilen.push(zeile);
      continue;
    }
    const kopf = UEBERSCHRIFT.exec(zeile);
    if (kopf) {
      neu(bereinigeZeile(kopf[2]).trim());
      continue;
    }
    aktuell?.zeilen.push(bereinigeZeile(zeile));
  }
  // Zeilen innerhalb von Codeblöcken bleiben unverändert; alles andere ist bereinigt.
  return abschnitte
    .map((a) => ({
      titel: a.titel,
      anker: ankerVon(a.titel),
      text: a.zeilen
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
    }))
    .filter((a) => a.titel !== "" && a.anker !== "" && a.text !== "");
}

/**
 * Formen, die wie eingeschleuste Anweisungen an ein Sprachmodell aussehen. Eine Stichprobe, kein
 * Schutz: Sie fängt nur bekannte Formulierungen. Beispiel und Gegenbeispiel stehen im Test.
 */
export const EINSCHLEUSE_FORMEN = [
  ["„ignorier…“ und „Anweisung“ im selben Satz", /ignorier\w*[^.!?]*\banweisung(?:en)?\b/i],
  ["„Anweisung“ und „ignorier…“ im selben Satz", /\banweisung(?:en)?\b[^.!?]*ignorier\w*/i],
  [
    "„vorherigen/bisherigen/obigen Anweisungen“",
    /\b(?:vorherigen|bisherigen|obigen)\s+anweisungen\b/i,
  ],
  [
    "„ignore (all) previous/prior/above instructions“",
    /\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions\b/i,
  ],
  ["„du bist jetzt“ / „du bist ab sofort“", /\bdu\s+bist\s+(?:jetzt|ab\s+sofort)\b/i],
  ["„you are now“", /\byou\s+are\s+now\b/i],
  ["eine Zeile, die mit „SYSTEM:“ beginnt", /^[ \t]*SYSTEM:/im],
  ["„rufe … das Werkzeug … auf“", /\brufe\b[^.!?]*\bdas\s+werkzeug\b[^.!?]*\bauf\b/i],
];

/** Findet Einschleuse-Formen in einem Text (auch in Code): [{ form, zeile }]. */
export function findeEinschleusung(text) {
  const normal = normalisiere(text);
  const funde = [];
  for (const [form, muster] of EINSCHLEUSE_FORMEN) {
    const treffer = muster.exec(normal);
    if (treffer) funde.push({ form, zeile: normal.slice(0, treffer.index).split("\n").length });
  }
  return funde;
}
