/**
 * PaiBot – prüft die Doku: Pflicht-Abschnitte, Bilder, Einträge im Inhaltsverzeichnis und Links.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

// Prüft, ob die Doku vollständig ist.
//
//   pnpm doku:check                   Fehler brechen ab (Exit-Code 1), Warnungen nicht
//   pnpm doku:check --streng          Warnungen zählen als Fehler (für einen fertigen Stand)
//   node scripts/doku-check.mjs --wurzel <ordner>   anderen Projektordner prüfen (für Tests)
//
// Geprüft wird:
//   a) Jede Seite docs/funktion-*.md hat die Abschnitte (## …) aus docs/VORLAGE-funktion.md in
//      derselben Reihenfolge (eigene Abschnitte dazwischen sind erlaubt). „So benutzt du es“
//      enthält eine nummerierte Schritt-für-Schritt-Anleitung.
//   b) Im Abschnitt „So sieht es aus“ steht mindestens ein Screenshot aus docs/assets/screenshots/
//      oder ein Absatz, der mit einem dieser Vermerke beginnt:
//        „Ohne Oberfläche.“            die Funktion hat keine Oberfläche (zählt als erfüllt)
//        „Folgt mit der Oberfläche“    Übergang, bis die Oberfläche da ist (Warnung)
//   c) Jedes Bild in docs/**/*.md und README.md gibt es; Screenshots liegen unter
//      docs/assets/screenshots/ und haben einen Eintrag in docs/screenshots.json (also per Skript
//      aufgenommen). Grafiken wie das Banner liegen direkt in docs/assets/. Umgekehrt hat jeder
//      Eintrag in docs/screenshots.json seine Datei.
//   d) Jede Seite docs/*.md ist in docs/README.md verlinkt (Warnung).
//   e) Relative Links in docs/**/*.md und README.md zeigen auf vorhandene Dateien.
//   f) docs/screenshots.json ist gültig, wie das Aufnahme-Skript sie liest (Felder wie `zustand`,
//      `anmeldung`, `vorher`, siehe scripts/doku/liste.mjs).
//   g) Kein Wert, der wie ein Geheimnis aussieht (Schlüssel, Token, Passwort in einer Adresse,
//      privater Schlüssel), steht in docs/screenshots.json oder in einem Doku-Text (auch nicht in
//      Codeblöcken). In screenshots.json zusätzlich kein Einrichtungs-Code und keine Zufallswerte
//      bei `tippe`; dafür gibt es die Sonderwerte ($einrichtungs-code, $passwort,
//      $anbieter-schluessel).
//   h) Zu jeder Seite docs/funktion-<name>.md gibt es die Entwickler-Seite docs/entwickler/<name>.md
//      mit den Abschnitten (## …) aus docs/entwickler/VORLAGE.md in derselben Reihenfolge.
//   i) In den Seiten unter docs/entwickler/ zeigt jeder Verweis auf eine Datei im Repo, geschrieben
//      als Code in Backticks (`packages/gate/src/gate.ts`), auf eine vorhandene Datei; ein Ordner
//      endet mit „/“. Mit `pfad/datei.ts#name` muss „name“ zusätzlich in der Datei vorkommen.
//      Codeblöcke zählen nicht; Angaben ohne „/“ oder ohne Dateiendung (`@paibot/db`, `/api/chat`)
//      gelten nicht als Verweis.
//   j) Keine versteckten Teile in docs/**/*.md (Fehler, nicht Warnung): kein rohes HTML und kein
//      Kommentar außer dem Urheber-Kopf ganz am Anfang der Datei, keine Link-Definition, Fußnote
//      oder Verweis über eine Definition, keine Zeichenreferenz (`&#x41;`) außerhalb von Code, kein
//      Zusatz hinter der Sprache eines Zauns und keine Sprache außerhalb der Liste, im Diagramm kein
//      Kommentar und kein Screenreader-Text, kein unsichtbares, Bidi- oder Steuerzeichen. Was Code,
//      Link oder HTML ist, sagt der Parser (scripts/doku-index/markdown.mjs). Die beiden Vorlagen
//      dürfen HTML für ihre Platzhalter tragen, solange sie nicht in den Index kommen.
//   k) Jede Seite docs/**/*.md steht in genau einer der beiden Listen in scripts/doku-umfang.mjs
//      („in den Index“ / „nicht in den Index“).
//   l) In den Seiten der Liste „in den Index“ kommt keine typische Form einer eingeschleusten
//      Anweisung vor (Formen: scripts/doku-index/hilfen.mjs). Das ist eine Stichprobe, kein Schutz.
//
// Zu j) und der Überschriften-Prüfung wird jede Seite mit einem Markdown-Parser gelesen
// (`mdast-util-from-markdown`, Pakete aus der Wurzel-`package.json`, siehe
// scripts/doku-index/markdown.mjs). Die übrigen Prüfungen (a bis i) lesen Markdown weiter mit
// einfachen Mustern: Codeblöcke und Code in Backticks werden vorher entfernt.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SONDERWERTE } from "./doku/lauf.mjs";
import { ListenFehler, pruefeListe } from "./doku/liste.mjs";
import { findeEinschleusung, findeUnerlaubtImTitel } from "./doku-index/hilfen.mjs";
import { leseSeite } from "./doku-index/markdown.mjs";
import { inDenIndex, nichtInDenIndex } from "./doku-umfang.mjs";

const VORLAGE = "docs/VORLAGE-funktion.md";
const ENTWICKLER = "docs/entwickler/";
const ENTWICKLER_VORLAGE = "docs/entwickler/VORLAGE.md";
const INHALT = "docs/README.md";
const LISTE = "docs/screenshots.json";
const SCREENSHOTS = "docs/assets/screenshots/";
const GRAFIKEN = "docs/assets/";
const ANLEITUNG = "So benutzt du es";
const BILDER = "So sieht es aus";
const OHNE_OBERFLAECHE = /^Ohne Oberfläche\./;
const FOLGT_MIT_OBERFLAECHE = /^Folgt mit der Oberfläche\b/;

const PROJEKT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Zustand eines Laufs; pruefeDoku() setzt ihn zu Beginn zurück.
let root = PROJEKT;
let strict = false;
let errors = [];
let warnings = [];
let transitional = [];

/** Meldung mit Datei, Problem und Ausweg. */
function report(list, file, problem, fix) {
  list.push({ file, problem, fix });
}
const error = (file, problem, fix) => report(errors, file, problem, fix);
/** Warnung, die mit --streng zum Fehler wird. */
const warn = (file, problem, fix) => report(strict ? errors : warnings, file, problem, fix);

const abs = (rel) => path.join(root, rel);
const toPosix = (p) => p.split(path.sep).join("/");

function readText(rel) {
  return readFileSync(abs(rel), "utf8");
}

/** Alle .md-Dateien unter docs/ (rekursiv), als Pfade relativ zur Wurzel. */
function docFiles(dir = "docs") {
  if (!existsSync(abs(dir))) return [];
  const out = [];
  for (const entry of readdirSync(abs(dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...docFiles(rel));
    else if (entry.name.endsWith(".md")) out.push(rel);
  }
  return out.sort();
}

/** Entfernt HTML-Kommentare, Codeblöcke und Code in Backticks; Zeilen bleiben erhalten. */
function stripCode(text) {
  const blank = (match) => match.replace(/[^\n]/g, " ");
  return text
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/^(\s*)(```|~~~)[^\n]*\n[\s\S]*?^\s*\2[^\n]*$/gm, blank)
    .replace(/`[^`\n]*`/g, blank);
}

/**
 * Code in Backticks außerhalb von Codeblöcken und HTML-Kommentaren: [{ code, zeile }].
 */
function codeSpans(text) {
  const blank = (match) => match.replace(/[^\n]/g, " ");
  const clean = text
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/^(\s*)(```|~~~)[^\n]*\n[\s\S]*?^\s*\2[^\n]*$/gm, blank);
  const out = [];
  for (const match of clean.matchAll(/`([^`\n]+)`/g)) {
    out.push({ code: match[1].trim(), zeile: clean.slice(0, match.index).split("\n").length });
  }
  return out;
}

/** Pfad im Repo, optional mit #name: Ordner enden mit „/“, Dateien haben eine Endung. */
const REPO_PFAD =
  /^(?![a-z][a-z0-9+.-]*:)(?!\.{0,2}\/)([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.()[\]-]+)*(?:\/|\/[A-Za-z0-9_()[\]-][A-Za-z0-9_.()[\]-]*\.[A-Za-z0-9]+))(?:#([A-Za-z_$][\w$]*))?$/;

/** Abschnitte zweiter Ebene: [{ titel, zeile, text }]. */
function sections(text) {
  const lines = stripCode(text).split("\n");
  const out = [];
  let current = null;
  lines.forEach((line, index) => {
    const match = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (match && !line.startsWith("###")) {
      current = { titel: match[1], zeile: index + 1, zeilen: [] };
      out.push(current);
    } else if (current) current.zeilen.push(line);
  });
  return out.map((s) => ({ titel: s.titel, zeile: s.zeile, text: s.zeilen.join("\n") }));
}

/** Bilder (Markdown und <img>) und Links (Markdown, Referenzen und <a href>). */
function references(text) {
  const clean = stripCode(text);
  const images = [];
  const links = [];
  const md = /(!?)\[((?:[^[\]]|\[[^\]]*\])*)\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
  for (const match of clean.matchAll(md)) {
    (match[1] ? images : links).push(match[3]);
  }
  for (const match of clean.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    images.push(match[1]);
  }
  for (const match of clean.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    links.push(match[1]);
  }
  for (const match of clean.matchAll(/^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/gm)) {
    links.push(match[1]);
  }
  return { images, links };
}

function isExternal(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//");
}

/** Lokales Ziel eines Links relativ zur Wurzel, oder null (extern, nur Sprungmarke). */
function resolveTarget(file, target) {
  if (isExternal(target) || target.startsWith("#")) return null;
  let clean = target.replace(/[?#].*$/, "");
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // ungültige Kodierung: so lassen, die Prüfung auf Existenz meldet es
  }
  if (clean === "") return null;
  const base = clean.startsWith("/") ? root : path.dirname(abs(file));
  return toPosix(path.relative(root, path.join(base, clean.replace(/^\/+/, ""))));
}

function fileExists(rel) {
  return !rel.startsWith("..") && existsSync(abs(rel));
}

/** Muster für Werte, die wie ein Geheimnis aussehen. */
const GEHEIMNIS_MUSTER = [
  ["ein Schlüssel im Format „sk-…“", /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/],
  ["ein GitHub-Token", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ["ein GitLab-Token", /\bglpat-[A-Za-z0-9_-]{20,}/],
  ["ein Slack-Token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["ein AWS-Zugangsschlüssel", /\bAKIA[0-9A-Z]{16}\b/],
  ["ein privater Schlüssel", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["ein JSON Web Token", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  [
    "ein Passwort in einer Datenbank-Adresse",
    /\bpostgres(?:ql)?:\/\/[^:\s/@]+:([^@\s<>{}$]{16,})@/,
  ],
];
/** Name wie KEY/SECRET/TOKEN/PASSWORT, dahinter ein Zufallswert. */
const ZUWEISUNG =
  /\b[A-Za-z_]*(?:key|secret|token|password|passwort|schluessel)[A-Za-z_]*["']?\s*[=:]\s*["']?([A-Za-z0-9+/_=-]{20,})/gi;
const EINRICHTUNGS_CODE = /\b[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}\b/;

/** Sieht ein Wert zufällig aus (Groß- und Kleinbuchstaben und Ziffern gemischt)? */
function siehtZufaelligAus(wert) {
  return /[A-Z]/.test(wert) && /[a-z]/.test(wert) && /\d/.test(wert);
}

/** Kurzer Auszug, der das Geheimnis selbst nicht wiederholt. */
function auszug(wert) {
  return `${wert.slice(0, 4)}…`;
}

/**
 * Findet Werte, die wie ein Geheimnis aussehen. Liefert je Fund { art, auszug, zeile }; der Wert
 * selbst wird nicht wiedergegeben.
 */
export function findeGeheimnisse(text) {
  const funde = [];
  const zeileVon = (index) => text.slice(0, index).split("\n").length;
  for (const [art, muster] of GEHEIMNIS_MUSTER) {
    const global = new RegExp(muster.source, "g");
    for (const treffer of text.matchAll(global)) {
      funde.push({ art, auszug: auszug(treffer[0]), zeile: zeileVon(treffer.index) });
    }
  }
  for (const treffer of text.matchAll(ZUWEISUNG)) {
    if (siehtZufaelligAus(treffer[1])) {
      funde.push({
        art: "ein Zufallswert nach einem Namen wie KEY, SECRET, TOKEN oder PASSWORT",
        auszug: auszug(treffer[1]),
        zeile: zeileVon(treffer.index),
      });
    }
  }
  return funde;
}

function meldeGeheimnisse(file, text) {
  for (const fund of findeGeheimnisse(text)) {
    error(
      file,
      `Zeile ${fund.zeile}: ${fund.art} („${fund.auszug}“) sieht wie ein Geheimnis aus.`,
      "Echte Werte nie in die Doku schreiben: Beispiel-Werte oder Platzhalter wie <dein-schlüssel> nehmen.",
    );
  }
}

/** f) und g) für docs/screenshots.json. */
function checkScreenshotList(raw, text) {
  try {
    pruefeListe(raw);
  } catch (e) {
    if (!(e instanceof ListenFehler)) throw e;
    error(
      LISTE,
      e.message,
      "Eintrag wie im Abschnitt „Screenshots“ von docs/README.md beschrieben anlegen.",
    );
  }
  meldeGeheimnisse(LISTE, text);
  const besuche = (wert, schluessel) => {
    if (typeof wert === "string") {
      if (EINRICHTUNGS_CODE.test(wert)) {
        error(
          LISTE,
          `Bei „${schluessel}“ steht ein Einrichtungs-Code („${auszug(wert)}“).`,
          "Den Sonderwert $einrichtungs-code verwenden.",
        );
      }
      if (
        schluessel === "text" &&
        !(wert in SONDERWERTE) &&
        wert.length >= 16 &&
        siehtZufaelligAus(wert)
      ) {
        error(
          LISTE,
          `Bei „tippe“ steht ein Wert, der wie ein Schlüssel oder Passwort aussieht („${auszug(wert)}“).`,
          `Einen Sonderwert verwenden (${Object.keys(SONDERWERTE).join(", ")}) oder lesbaren Beispiel-Text.`,
        );
      }
    } else if (Array.isArray(wert)) {
      for (const teil of wert) besuche(teil, schluessel);
    } else if (wert && typeof wert === "object") {
      for (const [k, v] of Object.entries(wert)) besuche(v, k);
    }
  };
  besuche(raw, "");
}

function screenshotNames() {
  if (!existsSync(abs(LISTE))) {
    error(LISTE, "Die Liste der Screenshots fehlt.", 'Datei mit { "aufnahmen": [] } anlegen.');
    return new Set();
  }
  let raw;
  let text;
  try {
    text = readText(LISTE);
    raw = JSON.parse(text);
  } catch (e) {
    error(LISTE, `Die Datei ist kein gültiges JSON (${e.message}).`, "JSON-Fehler beheben.");
    return new Set();
  }
  if (!Array.isArray(raw.aufnahmen)) {
    error(LISTE, "Die Liste „aufnahmen“ fehlt.", 'Als { "aufnahmen": [ … ] } anlegen.');
    return new Set();
  }
  checkScreenshotList(raw, text);
  const names = new Set();
  for (const entry of raw.aufnahmen) {
    if (typeof entry?.name !== "string") continue;
    names.add(entry.name);
    const file = `${SCREENSHOTS}${entry.name}.png`;
    if (!fileExists(file)) {
      error(
        LISTE,
        `Zum Eintrag „${entry.name}“ fehlt die Datei ${file}.`,
        `Aufnehmen mit \`pnpm doku:screenshots ${entry.name}\` oder den Eintrag entfernen.`,
      );
    }
  }
  return names;
}

function templateHeadings() {
  if (!existsSync(abs(VORLAGE))) {
    error(VORLAGE, "Die Vorlage für Funktionsseiten fehlt.", "Vorlage wiederherstellen.");
    return [];
  }
  const headings = sections(readText(VORLAGE)).map((s) => s.titel);
  for (const needed of [ANLEITUNG, BILDER]) {
    if (!headings.includes(needed)) {
      error(VORLAGE, `In der Vorlage fehlt der Abschnitt „${needed}“.`, "Vorlage ergänzen.");
    }
  }
  return headings;
}

const isScreenshot = (rel) => rel.startsWith(SCREENSHOTS);

/** a) und b): Abschnitte einer Funktionsseite. */
function checkFunctionPage(file, required) {
  checkSections(file, required, VORLAGE);
  const found = sections(readText(file));
  const guide = found.find((s) => s.titel === ANLEITUNG);
  if (guide && !/^\s{0,3}\d+[.)]\s+\S/m.test(guide.text)) {
    error(
      file,
      `Im Abschnitt „${ANLEITUNG}“ fehlt die Schritt-für-Schritt-Anleitung.`,
      "Die Schritte als nummerierte Liste schreiben (1. … 2. … 3. …).",
    );
  }
  const pictures = found.find((s) => s.titel === BILDER);
  if (!pictures) return;
  const shots = references(pictures.text)
    .images.map((img) => resolveTarget(file, img))
    .filter((rel) => rel && isScreenshot(rel));
  if (shots.length > 0) return;
  const paragraphs = pictures.text
    .split(/\n\s*\n/)
    .map((p) => p.trim().replace(/^>\s*/, ""))
    .filter(Boolean);
  if (paragraphs.some((p) => OHNE_OBERFLAECHE.test(p))) return;
  if (paragraphs.some((p) => FOLGT_MIT_OBERFLAECHE.test(p))) {
    transitional.push(file);
    return;
  }
  error(
    file,
    `Im Abschnitt „${BILDER}“ steht weder ein Screenshot noch ein Vermerk.`,
    `Screenshot aus ${SCREENSHOTS} einbinden (Eintrag in ${LISTE}, \`pnpm doku:screenshots\`) ` +
      "oder einen Absatz mit „Ohne Oberfläche.“ bzw. „Folgt mit der Oberfläche.“ beginnen.",
  );
}

/** Pflicht-Abschnitte einer Vorlage (Überschriften zweiter Ebene). */
function headingsOf(rel, what) {
  if (!existsSync(abs(rel))) {
    error(rel, `Die ${what} fehlt.`, "Vorlage wiederherstellen.");
    return null;
  }
  return sections(readText(rel)).map((s) => s.titel);
}

/** Pflicht-Abschnitte einer Seite in der Reihenfolge der Vorlage. */
function checkSections(file, required, vorlage) {
  const text = readText(file);
  const titles = sections(text).map((s) => s.titel);
  if (!/^#\s+\S/m.test(stripCode(text))) {
    error(file, "Die Überschrift (# Name) fehlt.", `Wie in ${vorlage} anlegen.`);
  }
  for (const title of required.filter((t) => !titles.includes(t))) {
    error(
      file,
      `Der Pflicht-Abschnitt „## ${title}“ fehlt.`,
      `Abschnitt ergänzen; Reihenfolge wie in ${vorlage}: ${required.join(" · ")}.`,
    );
  }
  const order = titles.filter((t) => required.includes(t));
  const expected = required.filter((t) => titles.includes(t));
  if (order.join("\n") !== expected.join("\n")) {
    error(
      file,
      `Die Pflicht-Abschnitte stehen in der falschen Reihenfolge (${order.join(" · ")}).`,
      `Umstellen auf: ${expected.join(" · ")}.`,
    );
  }
}

/** h): Zu jeder Funktionsseite die Entwickler-Seite mit den Pflicht-Abschnitten. */
function checkDeveloperPages(functionPages) {
  if (functionPages.length === 0) return;
  const required = headingsOf(ENTWICKLER_VORLAGE, "Vorlage für Entwickler-Seiten");
  if (!required) return;
  for (const page of functionPages) {
    const name = path.posix.basename(page).replace(/^funktion-/, "");
    const dev = `${ENTWICKLER}${name}`;
    if (!fileExists(dev)) {
      error(
        page,
        `Die Entwickler-Seite ${dev} fehlt.`,
        `${ENTWICKLER_VORLAGE} nach ${dev} kopieren und jede Aussage am Code belegen.`,
      );
      continue;
    }
    checkSections(dev, required, ENTWICKLER_VORLAGE);
  }
}

/** i): Verweise auf Dateien im Repo in den Entwickler-Seiten. */
function checkRepoPaths(file) {
  for (const { code, zeile } of codeSpans(readText(file))) {
    const match = REPO_PFAD.exec(code);
    if (!match) continue;
    const [, rel, name] = match;
    const ziel = rel.replace(/\/$/, "");
    if (!fileExists(ziel)) {
      error(
        file,
        `Zeile ${zeile}: Die Datei \`${rel}\` gibt es im Repo nicht.`,
        "Pfad relativ zum Projektstamm schreiben und prüfen, ob die Datei noch so heißt.",
      );
      continue;
    }
    const istOrdner = statSync(abs(ziel)).isDirectory();
    if (rel.endsWith("/") !== istOrdner) {
      error(
        file,
        `Zeile ${zeile}: \`${rel}\` ist ${istOrdner ? "ein Ordner" : "eine Datei"}.`,
        istOrdner ? "Ordner mit „/“ am Ende schreiben." : "Datei ohne „/“ am Ende schreiben.",
      );
      continue;
    }
    if (
      name &&
      !new RegExp(`(?<![\\w$])${name.replace(/\$/g, "\\$")}(?![\\w$])`).test(readText(ziel))
    ) {
      error(
        file,
        `Zeile ${zeile}: „${name}“ kommt in ${ziel} nicht vor.`,
        "Namen der Funktion, Tabelle oder Konstante prüfen oder den Verweis anpassen.",
      );
    }
  }
}

/** c) und e): Bilder und Links einer Seite. */
function checkReferences(file, names) {
  const { images, links } = references(readText(file));
  for (const image of images) {
    if (isExternal(image)) continue;
    const rel = resolveTarget(file, image);
    if (!rel) continue;
    if (!fileExists(rel)) {
      error(
        file,
        `Das Bild „${image}“ gibt es nicht (${rel}).`,
        "Pfad korrigieren oder das Bild mit `pnpm doku:screenshots` aufnehmen.",
      );
      continue;
    }
    if (isScreenshot(rel)) {
      const name = path.posix.basename(rel).replace(/\.png$/i, "");
      if (!rel.toLowerCase().endsWith(".png") || !names.has(name)) {
        error(
          file,
          `Der Screenshot ${rel} hat keinen Eintrag in ${LISTE}, ist also nicht per Skript aufgenommen.`,
          `Eintrag „${name}“ in ${LISTE} anlegen und mit \`pnpm doku:screenshots ${name}\` neu aufnehmen.`,
        );
      }
    } else if (!(rel.startsWith(GRAFIKEN) && path.posix.dirname(rel) === "docs/assets")) {
      error(
        file,
        `Das Bild ${rel} liegt nicht unter ${SCREENSHOTS}.`,
        `Screenshots per Skript nach ${SCREENSHOTS} aufnehmen; Grafiken gehören direkt nach ${GRAFIKEN}.`,
      );
    }
  }
  for (const link of links) {
    const rel = resolveTarget(file, link);
    if (rel && !fileExists(rel)) {
      error(file, `Der Link „${link}“ zeigt auf nichts (${rel}).`, "Link-Ziel korrigieren.");
    }
  }
}

/** d): Jede Seite docs/*.md ist in docs/README.md verlinkt. */
function checkIndex(files) {
  if (!existsSync(abs(INHALT))) {
    error(INHALT, "Das Inhaltsverzeichnis der Doku fehlt.", "docs/README.md anlegen.");
    return;
  }
  const linked = new Set(
    references(readText(INHALT))
      .links.map((link) => resolveTarget(INHALT, link))
      .filter(Boolean),
  );
  const missing = files.filter((f) => /^docs\/[^/]+\.md$/.test(f) && f !== INHALT);
  for (const file of missing.filter((f) => !linked.has(f))) {
    warn(
      file,
      `Die Seite ist nicht in ${INHALT} verlinkt.`,
      `In der Tabelle „Inhalt“ von ${INHALT} eintragen.`,
    );
  }
}

/**
 * Darf ein HTML-Fund auf dieser Seite übergangen werden? Nur in den beiden Vorlagen, die ihre
 * Platzhalter in spitzen Klammern tragen, und nur solange die Seite nicht in den Index kommt.
 */
export function htmlAusnahme(file, imIndex) {
  return (file === VORLAGE || file === ENTWICKLER_VORLAGE) && !imIndex;
}

const AUSWEG_VERSTECKT = {
  unsichtbar: "Das Zeichen löschen (auch Bidi- und Steuerzeichen sind nicht erlaubt).",
  html: "Das HTML oder den Kommentar entfernen oder in Backticks setzen; die Seite nutzt nur Markdown, damit nichts Unsichtbares im Text steht. Was gesagt werden soll, gehört als sichtbarer Text in die Seite.",
  definition:
    "Die Definition löschen und den Link ausschreiben: [Text](Adresse). Eine Link-Definition zeigt auf der Seite nichts an.",
  referenz: "Den Verweis ausschreiben: [Text](Adresse) bzw. ![Alt](Bild).",
  fussnote: "Die Fußnote löschen; der Text gehört in den Satz oder in einen eigenen Absatz.",
  "zaun-zusatz":
    "Hinter der Sprache des Codeblocks nichts schreiben (```bash); der Zusatz erscheint auf der Seite nirgends.",
  "zaun-sprache":
    "Eine Sprache aus der Liste ERLAUBTE_SPRACHEN in scripts/doku-index/markdown.mjs nehmen oder keine angeben.",
  mermaid:
    "Kommentare (%%) und Texte für Screenreader (accTitle, accDescr) aus dem Diagramm nehmen; sie fehlen in der gezeichneten Fassung.",
  zeichenreferenz:
    "Das Zeichen selbst schreiben statt der Zeichenreferenz (&#x41; oder &amp;); in Backticks ist die Schreibweise erlaubt.",
  unbekannt:
    "Die Stelle in einfaches Markdown (Text, Liste, Tabelle, Code, Link, Bild) umschreiben.",
};

/** j) Verborgenes: rohes HTML und Kommentare, Definitionen, Zeichenreferenzen, unsichtbare Zeichen. */
function checkVersteckt(file, funde) {
  const ausnahme = htmlAusnahme(file, inDenIndex(file));
  for (const fund of funde) {
    if (fund.art === "html" && ausnahme) continue;
    error(file, `Zeile ${fund.zeile}: ${fund.meldung}.`, AUSWEG_VERSTECKT[fund.art]);
  }
}

/** j2) Überschriften (und ihre Pfade und Anker) ohne Zeichen, die der Index-Bau ablehnt. */
function checkUeberschriften(file, abschnitte) {
  for (const teil of abschnitte) {
    for (const feld of [teil.anker, teil.titel, ...teil.pfad]) {
      const code = findeUnerlaubtImTitel(feld);
      if (code !== null) {
        error(
          file,
          `Die Überschrift „${teil.titel}“ (oder ihr Pfad) enthält das Zeichen ${code}, das in Titeln nicht erlaubt ist.`,
          "Das Zeichen aus der Überschrift löschen.",
        );
        break;
      }
    }
  }
}

/** k) Jede Seite steht in genau einer der beiden Listen. */
function checkUmfang(file) {
  const drin = inDenIndex(file);
  const draussen = nichtInDenIndex(file);
  if (!drin && !draussen) {
    error(
      file,
      `Die Seite ${file} steht in keiner Liste.`,
      "Die Seite in scripts/doku-umfang.mjs eintragen: IN_DEN_INDEX (Anwender-Doku) oder NICHT_IN_DEN_INDEX (mit Grund).",
    );
  } else if (drin && draussen) {
    error(
      file,
      `Die Seite ${file} steht in beiden Listen.`,
      "In scripts/doku-umfang.mjs aus einer der beiden Listen nehmen.",
    );
  }
}

/** l) Typische Formen eingeschleuster Anweisungen in Seiten, die in den Index kommen. */
function checkEinschleusung(file, text) {
  for (const fund of findeEinschleusung(text)) {
    error(
      file,
      `Zeile ${fund.zeile}: Eine Wendung, wie sie eingeschleuste Anweisungen haben (${fund.form}).`,
      "Den Satz umformulieren; so etwas wird in dieser Doku nie wörtlich zitiert, sondern beschrieben.",
    );
  }
}

/**
 * Prüft die Doku im Ordner `wurzel`. Gibt Fehler, Warnungen (je { file, problem, fix }), die Seiten
 * mit Übergangs-Vermerk und die Zahl der geprüften Seiten zurück; schreibt nichts aus.
 */
export function pruefeDoku({ wurzel = PROJEKT, streng = false } = {}) {
  root = path.resolve(wurzel);
  strict = streng;
  errors = [];
  warnings = [];
  transitional = [];
  const docs = docFiles();
  const names = screenshotNames();
  const required = templateHeadings();
  const functionPages = docs.filter((f) => /^docs\/funktion-[^/]+\.md$/.test(f));
  for (const file of functionPages) checkFunctionPage(file, required);
  const scanned = [
    ...docs.filter((f) => f !== VORLAGE && f !== ENTWICKLER_VORLAGE),
    ...(existsSync(abs("README.md")) ? ["README.md"] : []),
  ];
  for (const file of scanned) checkReferences(file, names);
  for (const file of scanned) meldeGeheimnisse(file, readText(file));
  for (const file of docs) {
    const text = readText(file);
    const seite = leseSeite(text);
    checkVersteckt(file, seite.funde);
    checkUmfang(file);
    if (inDenIndex(file)) {
      checkEinschleusung(file, text);
      checkUeberschriften(file, seite.abschnitte);
    }
  }
  checkIndex(docs);
  checkDeveloperPages(functionPages);
  for (const file of docs.filter((f) => f.startsWith(ENTWICKLER) && f !== ENTWICKLER_VORLAGE)) {
    checkRepoPaths(file);
  }

  if (transitional.length > 0) {
    const list = strict ? errors : warnings;
    for (const file of transitional) {
      report(
        list,
        file,
        `Statt Screenshots steht der Übergangs-Vermerk „Folgt mit der Oberfläche“.`,
        `Sobald die Oberfläche da ist: Eintrag in ${LISTE}, \`pnpm doku:screenshots\`, Bild einbinden.`,
      );
    }
  }
  return {
    fehler: errors,
    warnungen: warnings,
    uebergang: transitional,
    funktionsseiten: functionPages.length,
    entwicklerseiten: docs.filter((f) => f.startsWith(ENTWICKLER) && f !== ENTWICKLER_VORLAGE)
      .length,
    seiten: scanned.length,
  };
}

function print(label, list, out) {
  for (const { file, problem, fix } of list) {
    out(`${label} ${file}: ${problem}`);
    out(`        Ausweg: ${fix}`);
  }
}
function usage(message) {
  console.error(message);
  console.error("Aufruf: node scripts/doku-check.mjs [--streng] [--wurzel <ordner>]");
  process.exit(2);
}

function main(args) {
  let wurzel = PROJEKT;
  let streng = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--streng") streng = true;
    else if (args[i] === "--wurzel") {
      if (!args[i + 1]) usage("Nach --wurzel fehlt der Ordner.");
      wurzel = args[i + 1];
      i += 1;
    } else usage(`Unbekannte Angabe: ${args[i]}`);
  }
  const ergebnis = pruefeDoku({ wurzel, streng });
  const { fehler, warnungen, uebergang, funktionsseiten, entwicklerseiten, seiten } = ergebnis;
  print("WARNUNG", warnungen, console.warn);
  print("FEHLER ", fehler, console.error);
  console.log(
    `Doku-Check: ${funktionsseiten} Funktionsseiten, ${entwicklerseiten} Entwickler-Seiten, ` +
      `${seiten} Seiten auf Bilder und Links geprüft.`,
  );
  console.log(
    `Übergangs-Vermerk „Folgt mit der Oberfläche“: ${uebergang.length} Seite(n)` +
      (uebergang.length > 0 ? ` (${uebergang.join(", ")})` : "") +
      ".",
  );
  if (fehler.length > 0) {
    console.error(
      `Doku-Check fehlgeschlagen: ${fehler.length} Fehler, ${warnungen.length} Warnungen.`,
    );
    process.exit(1);
  }
  console.log(
    `Doku-Check bestanden: 0 Fehler, ${warnungen.length} Warnungen` +
      (streng ? " (streng)." : ". Mit --streng zählen Warnungen als Fehler."),
  );
}

// Nur als Befehl ausführen, nicht beim Importieren (z. B. in Tests).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
