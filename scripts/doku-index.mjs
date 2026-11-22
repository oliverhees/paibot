/**
 * PaiBot – baut aus den Anwender-Seiten der Doku einen durchsuchbaren Text-Index fürs Image.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Baut doku-index/doku-index.json aus den Seiten der Liste „in den Index“ (scripts/doku-umfang.mjs).
//
//   pnpm doku:index                          Index im Projektstamm bauen
//   node scripts/doku-index.mjs --wurzel <ordner>   anderen Projektordner nehmen (für Tests)
//
// Der Index enthält je Überschrift (## und ###) einen Abschnitt mit bereinigtem Text: ohne
// HTML-Kommentare, Tags, Bilder und unsichtbare Zeichen, Links als ihr Text; dazu je Abschnitt
// den Pfad der Überschriften von der Seite abwärts bis zur eigenen (`pfad`). Dazu den Stand
// (Version aus package.json und Prüfsumme über die Abschnitte). Die Datei ist erzeugt und gehört
// nicht ins Repo; das Image bekommt sie beim Bau (apps/web/Dockerfile).
//
// Der Bau bricht mit Ausgang 1 ab, wenn eine Seite der Liste fehlt, ein Muster auf keine Datei
// passt, der Index keinen Abschnitt hat, größer als 4 MB ist, eine Kennung doppelt vorkommt oder ein
// Titel bzw. Pfad ein Zeichen enthält, das dort nicht stehen darf (Zeilenumbruch, Tabulator,
// leeres Braille-Zeichen, Zeichen für den privaten Gebrauch).
// Kein Zeitstempel und nichts Zufälliges: zweimal bauen ergibt dieselben Bytes.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findeUnerlaubtImTitel, zerlege } from "./doku-index/hilfen.mjs";
import { IN_DEN_INDEX, passtAuf } from "./doku-umfang.mjs";

const PROJEKT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const AUSGABE = "doku-index/doku-index.json";
export const GRENZE_BYTES = 4 * 1024 * 1024;
/** Fassung des Formats; 2: jeder Abschnitt trägt `pfad` (Überschriften von der Seite abwärts). */
export const FASSUNG = 2;

/** Fehler, der den Bau abbricht; die Meldung sagt, was zu tun ist. */
export class IndexFehler extends Error {}

/** Alle .md-Dateien unter docs/ (rekursiv), als Pfade mit „/“ relativ zur Wurzel. */
function markdownDateien(wurzel, ordner = "docs") {
  const voll = path.join(wurzel, ordner);
  if (!existsSync(voll)) return [];
  const aus = [];
  for (const eintrag of readdirSync(voll, { withFileTypes: true })) {
    const rel = `${ordner}/${eintrag.name}`;
    if (eintrag.isDirectory()) aus.push(...markdownDateien(wurzel, rel));
    else if (eintrag.name.endsWith(".md")) aus.push(rel);
  }
  return aus.sort();
}

/** Die Seiten, die in den Index kommen: je Eintrag der Liste; fehlende Seiten brechen ab. */
export function seitenImIndex(wurzel, liste = IN_DEN_INDEX) {
  const alle = markdownDateien(wurzel);
  const gewaehlt = new Set();
  for (const muster of liste) {
    if (muster.includes("*")) {
      const treffer = alle.filter((datei) => passtAuf(muster, datei));
      if (treffer.length === 0) {
        throw new IndexFehler(
          `Das Muster ${muster} passt auf keine Datei. Liste in scripts/doku-umfang.mjs prüfen.`,
        );
      }
      for (const datei of treffer) gewaehlt.add(datei);
    } else {
      if (!alle.includes(muster)) {
        throw new IndexFehler(
          `Die Seite ${muster} aus der Liste fehlt. Seite anlegen oder die Liste in scripts/doku-umfang.mjs ändern.`,
        );
      }
      gewaehlt.add(muster);
    }
  }
  return [...gewaehlt].sort();
}

/** Prüfsumme über die kanonische JSON-Form der Abschnitte (feste Schlüsselfolge, ohne Leerraum). */
export function pruefsumme(abschnitte) {
  return `sha256:${createHash("sha256").update(JSON.stringify(abschnitte)).digest("hex")}`;
}

/** Breite einer Zeile, ab der die Formatierung des Repos (biome.json, `lineWidth`) umbricht. */
const ZEILENBREITE = 100;

/**
 * Text der Index-Datei: JSON mit zwei Leerzeichen Einzug, `pfad` in einer Zeile, wenn sie in
 * `ZEILENBREITE` passt – so, wie die Formatierung des Repos sie schreiben würde (`pnpm lint`
 * bleibt grün, auch wenn der Index im Arbeitsordner liegt).
 */
function alsText(index) {
  const roh = JSON.stringify(index, null, 2);
  const kurz = roh.replace(/^( *)"pfad": \[\n([\s\S]*?)\n\1\]/gm, (ganz, einzug, innen) => {
    const teile = innen.split("\n").map((z) => z.trim().replace(/,$/, ""));
    const zeile = `${einzug}"pfad": [${teile.join(", ")}]`;
    return [...zeile].length + 1 <= ZEILENBREITE ? zeile : ganz;
  });
  return `${kurz}\n`;
}

/**
 * Baut den Index im Ordner `wurzel`. Gibt { index, text } zurück, `text` ist der Dateiinhalt.
 * Bricht mit IndexFehler ab (siehe Kopf dieser Datei).
 */
export function baueIndex({
  wurzel = PROJEKT,
  liste = IN_DEN_INDEX,
  grenzeBytes = GRENZE_BYTES,
} = {}) {
  const wurzelPfad = path.resolve(wurzel);
  const abschnitte = [];
  const ids = new Set();
  for (const datei of seitenImIndex(wurzelPfad, liste)) {
    const seite = datei.slice("docs/".length);
    for (const teil of zerlege(readFileSync(path.join(wurzelPfad, datei), "utf8"))) {
      const id = `${seite}#${teil.anker}`;
      for (const feld of [seite, teil.anker, teil.titel, ...teil.pfad]) {
        const code = findeUnerlaubtImTitel(feld);
        if (code !== null) {
          throw new IndexFehler(
            `In ${seite} enthält die Überschrift mit dem Anker „${teil.anker}“ (oder ihr Pfad) das Zeichen ${code}, das in Titeln nicht erlaubt ist. Das Zeichen aus der Überschrift löschen.`,
          );
        }
      }
      if (ids.has(id)) {
        throw new IndexFehler(
          `Die Kennung ${id} kommt doppelt vor: In ${seite} haben zwei Überschriften denselben Anker. Eine umbenennen.`,
        );
      }
      ids.add(id);
      abschnitte.push({
        id,
        seite,
        anker: teil.anker,
        titel: teil.titel,
        pfad: teil.pfad,
        text: teil.text,
      });
    }
  }
  if (abschnitte.length === 0) throw new IndexFehler("Der Index hat keinen Abschnitt.");
  const paket = JSON.parse(readFileSync(path.join(wurzelPfad, "package.json"), "utf8"));
  const index = {
    format: "pb-doku-index",
    v: FASSUNG,
    stand: { version: String(paket.version), pruefsumme: pruefsumme(abschnitte) },
    abschnitte,
  };
  const text = alsText(index);
  const bytes = Buffer.byteLength(text);
  if (bytes > grenzeBytes) {
    throw new IndexFehler(
      `Der Index ist ${bytes} Bytes groß, erlaubt sind höchstens ${grenzeBytes}. Seiten aus der Liste nehmen oder kürzen.`,
    );
  }
  return { index, text };
}

function main(args) {
  let wurzel = PROJEKT;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--wurzel" && args[i + 1]) {
      wurzel = args[i + 1];
      i += 1;
    } else {
      console.error(
        `Unbekannte Angabe: ${args[i]}\nAufruf: node scripts/doku-index.mjs [--wurzel <ordner>]`,
      );
      process.exit(2);
    }
  }
  try {
    const { index, text } = baueIndex({ wurzel });
    const ziel = path.join(path.resolve(wurzel), AUSGABE);
    mkdirSync(path.dirname(ziel), { recursive: true });
    writeFileSync(ziel, text);
    const seiten = new Set(index.abschnitte.map((a) => a.seite));
    console.log(
      `Doku-Index: ${seiten.size} Seiten, ${index.abschnitte.length} Abschnitte, ${Buffer.byteLength(text)} Bytes, ${index.stand.pruefsumme.slice(0, 19)}… -> ${AUSGABE}`,
    );
  } catch (fehler) {
    if (!(fehler instanceof IndexFehler)) throw fehler;
    console.error(`Doku-Index fehlgeschlagen: ${fehler.message}`);
    process.exit(1);
  }
}

// Nur als Befehl ausführen, nicht beim Importieren (z. B. in Tests).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
