/**
 * PaiBot – liest eine Doku-Seite mit einem Markdown-Parser: findet Verborgenes und schneidet Abschnitte.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

// Gemeinsam benutzt von scripts/doku-index.mjs (Index bauen) und scripts/doku-check.mjs (Doku
// prüfen). Beide lesen jede Seite genau einmal mit `mdast-util-from-markdown` (CommonMark, auf
// `micromark` gebaut) und GFM (Tabellen, Durchgestrichenes, Adress-Verweise im Fließtext). Was
// Code, Link, Bild oder HTML ist, sagt allein der Parser; es gibt keine eigenen Muster dafür.
// Das Programm ist die Fassung der Pakete, die in der Wurzel-`package.json` fest eingetragen ist.
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { ankerVon, findeUnsichtbares, normalisiere } from "./hilfen.mjs";

/**
 * Rohe HTML-Tags, die im Fließtext der Doku stehen dürfen (kleingeschrieben). Die Seiten unter
 * `docs/` benutzen heute keine; die Liste ist deshalb leer. Auch ein erlaubtes Tag darf kein
 * Attribut `hidden`, `style` oder `aria-hidden` tragen und muss allein einen Knoten bilden.
 */
export const ERLAUBTE_TAGS = [];

/**
 * Sprachen, die ein Zaun nach den drei Zeichen nennen darf. Ein Zaun ohne Sprache ist erlaubt;
 * ein Zusatztext hinter der Sprache nicht, weil er auf der Seite nirgends erscheint.
 */
export const ERLAUBTE_SPRACHEN = [
  "bash",
  "sh",
  "text",
  "ts",
  "js",
  "json",
  "yaml",
  "diff",
  "mermaid",
];

/** Knotenarten, die eine Seite haben darf. Alles andere ist ein Fund (Art „unbekannt“). */
const BEKANNTE_KNOTEN = new Set([
  "root",
  "paragraph",
  "heading",
  "text",
  "emphasis",
  "strong",
  "delete",
  "inlineCode",
  "code",
  "link",
  "image",
  "blockquote",
  "list",
  "listItem",
  "table",
  "tableRow",
  "tableCell",
  "thematicBreak",
  "break",
  "html",
]);

/**
 * Größte Seite in Bytes (UTF-8). Die größte Seite unter `docs/` hat heute rund 68 000 Bytes; die
 * Grenze liegt gut beim Fünffachen darüber. Eine größere Seite wird gemeldet, bevor der Parser
 * sie liest, weil er bei sehr großen, tief verschachtelten Seiten sehr langsam wird.
 */
export const GRENZE_SEITE_BYTES = 350 * 1024;

/**
 * Größte Tiefe des Baums (Wurzel = Ebene 0). Die echten Seiten reichen heute nur wenige Ebenen
 * tief; wer mehr verschachtelt (Zitate, Listen), hat die Seite falsch gebaut.
 */
export const GRENZE_TIEFE = 50;

const ZEICHENREFERENZ = /&(?:#[0-9]+|#[xX][0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]*);/g;
const MERMAID_VERBOTEN = /%%|\baccTitle\b|\baccDescr\b/;
const WORT = /[\p{L}\p{N}]{3,}/gu;

/** Liest den Text mit dem Parser; `text` muss schon normalisiert sein. */
function parse(text) {
  return fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
}

/**
 * Alle Knoten unter `knoten` (einschließlich seiner selbst), in Dokument-Reihenfolge. Ohne
 * Rekursion, damit auch ein sehr tiefer Baum den Aufrufstapel nicht sprengt.
 */
function* alle(knoten) {
  const stapel = [knoten];
  while (stapel.length > 0) {
    const aktuell = stapel.pop();
    yield aktuell;
    const kinder = aktuell.children ?? [];
    for (let i = kinder.length - 1; i >= 0; i -= 1) stapel.push(kinder[i]);
  }
}

/**
 * Die Tiefe des Baums (Wurzel = 0), ohne Rekursion. Hört auf, sobald `grenze` überschritten ist,
 * und gibt dann einen Knoten dieser Tiefe mit zurück: { tiefe, knoten }.
 */
function messeTiefe(wurzel, grenze) {
  const stapel = [[wurzel, 0]];
  let tiefste = { tiefe: 0, knoten: wurzel };
  while (stapel.length > 0) {
    const [knoten, tiefe] = stapel.pop();
    if (tiefe > tiefste.tiefe) tiefste = { tiefe, knoten };
    if (tiefe > grenze) return tiefste;
    for (const kind of knoten.children ?? []) stapel.push([kind, tiefe + 1]);
  }
  return tiefste;
}

/**
 * Ist dieser HTML-Knoten der Urheber-Kopf? Der erste Knoten der Seite, beginnt bei Offset 0, ist
 * ein einziger Kommentar, und `-->` kommt genau einmal vor, ganz am Ende.
 */
function istKopf(knoten, wurzel) {
  return (
    knoten === wurzel.children[0] &&
    knoten.position.start.offset === 0 &&
    /^<!--[\s\S]*-->$/.test(knoten.value) &&
    knoten.value.split("-->").length === 2
  );
}

/** Ein erlaubtes Tag allein: ein öffnendes oder schließendes Tag aus `ERLAUBTE_TAGS`, harmlos. */
function istErlaubtesTag(wert) {
  const treffer = /^<\/?([A-Za-z][A-Za-z0-9-]*)((?:\s[^<>]*)?)\/?>$/.exec(wert);
  if (!treffer) return false;
  if (!ERLAUBTE_TAGS.includes(treffer[1].toLowerCase())) return false;
  return !/(?:^|[\s"'])(?:hidden|style|aria-hidden)(?=[\s=/>]|$)/i.test(treffer[2]);
}

/** Zeilennummer (ab 1) eines Offsets im normalisierten Text. */
function zeileVon(text, offset) {
  let zeile = 1;
  for (let i = text.indexOf("\n"); i !== -1 && i < offset; i = text.indexOf("\n", i + 1))
    zeile += 1;
  return zeile;
}

/**
 * Findet alles, was auf der dargestellten Seite nichts anzeigt oder was der Parser anders deutet,
 * als es aussieht. Gibt [{ zeile, art, meldung }] zurück, nach Zeile sortiert. `art` ist ein fester
 * Schlüssel: `unsichtbar`, `html`, `definition`, `fussnote`, `referenz`, `zaun-zusatz`,
 * `zaun-sprache`, `mermaid`, `zeichenreferenz`, `tabelle`, `unbekannt`. Die Größe und die Tiefe
 * prüft `leseSeite` vor bzw. nach dem Parsen (Arten `groesse` und `tiefe`).
 */
export function findeVerborgenes(wurzel, text) {
  const funde = [];
  const melde = (zeile, art, meldung) => funde.push({ zeile, art, meldung });
  for (const fund of findeUnsichtbares(text)) {
    melde(fund.zeile, "unsichtbar", `Ein unsichtbares Zeichen (${fund.code})`);
  }
  const spaltenVon = new Map();
  for (const knoten of alle(wurzel)) {
    if (knoten.type === "table") {
      for (const zeile of knoten.children) spaltenVon.set(zeile, knoten.align.length);
    }
  }
  const ohneReferenz = [];
  for (const knoten of alle(wurzel)) {
    if (knoten.type === "tableRow" && knoten.children.length > spaltenVon.get(knoten)) {
      melde(
        knoten.position?.start.line ?? 1,
        "tabelle",
        `Tabellenzeile mit mehr Zellen als Spalten (${knoten.children.length} statt ${spaltenVon.get(knoten)}); die überzähligen Zellen zeigt die Seite nicht an`,
      );
    }
    const zeile = knoten.position?.start.line ?? 1;
    const bereich = knoten.position
      ? [knoten.position.start.offset, knoten.position.end.offset]
      : null;
    if (!BEKANNTE_KNOTEN.has(knoten.type)) {
      if (
        [
          "definition",
          "footnoteDefinition",
          "footnoteReference",
          "imageReference",
          "linkReference",
        ].includes(knoten.type)
      ) {
        const art =
          knoten.type === "definition"
            ? "definition"
            : knoten.type.startsWith("footnote")
              ? "fussnote"
              : "referenz";
        const wie = {
          definition: "Link-Definition (unsichtbar auf der Seite)",
          fussnote: "Fußnote",
          referenz: "Verweis über eine Definition (Bild oder Link)",
        }[art];
        melde(zeile, art, wie);
      } else {
        melde(zeile, "unbekannt", `Nicht erlaubte Markdown-Form (${knoten.type})`);
      }
      continue;
    }
    if (knoten.type === "html") {
      ohneReferenz.push(bereich);
      if (!istKopf(knoten, wurzel) && !istErlaubtesTag(knoten.value)) {
        melde(
          zeile,
          "html",
          `Rohes HTML im Fließtext (${knoten.value.replace(/\s+/g, " ").slice(0, 24)})`,
        );
      }
    } else if (knoten.type === "code" || knoten.type === "inlineCode") {
      ohneReferenz.push(bereich);
    }
    if (knoten.type === "code") {
      if (knoten.meta) {
        melde(zeile, "zaun-zusatz", "Ein Zusatz hinter der Sprache eines Codeblocks");
      }
      if (knoten.lang && !ERLAUBTE_SPRACHEN.includes(knoten.lang)) {
        melde(zeile, "zaun-sprache", `Sprache „${knoten.lang}“ des Codeblocks ist nicht erlaubt`);
      }
      if (knoten.lang === "mermaid") {
        knoten.value.split("\n").forEach((z, i) => {
          if (MERMAID_VERBOTEN.test(z)) {
            melde(zeile + 1 + i, "mermaid", "Kommentar oder Screenreader-Text im Diagramm");
          }
        });
      }
    }
  }
  for (const treffer of text.matchAll(ZEICHENREFERENZ)) {
    const dabei = ohneReferenz.some(([von, bis]) => treffer.index >= von && treffer.index < bis);
    if (!dabei) {
      melde(zeileVon(text, treffer.index), "zeichenreferenz", `Zeichenreferenz ${treffer[0]}`);
    }
  }
  return funde.sort((a, b) => a.zeile - b.zeile);
}

/**
 * Der Quelltext eines Knotens, wie er in den Index kommt: Bild leer, Link als der Quelltext seiner
 * Kinder (ein Adress-Verweis also als Adresse), Diagramm-Block (`mermaid`) und Urheber-Kopf leer.
 * Alles andere bleibt Zeichen für Zeichen, auch Code.
 */
function rendere(knoten, text, wurzel) {
  if (knoten.type === "image") return "";
  if (knoten.type === "code" && knoten.lang === "mermaid") return "";
  if (knoten.type === "html" && istKopf(knoten, wurzel)) return "";
  const kinder = knoten.children ?? [];
  if (knoten.type === "link") {
    return kinder.length === 0 ? "" : rendereKinder(kinder, text, wurzel);
  }
  if (kinder.length === 0)
    return text.slice(knoten.position.start.offset, knoten.position.end.offset);
  return (
    text.slice(knoten.position.start.offset, kinder[0].position.start.offset) +
    rendereKinder(kinder, text, wurzel) +
    text.slice(kinder[kinder.length - 1].position.end.offset, knoten.position.end.offset)
  );
}

/** Die Kinder nacheinander; was zwischen ihnen steht, bleibt wie es ist. */
function rendereKinder(kinder, text, wurzel) {
  let aus = "";
  let ende = kinder[0].position.start.offset;
  for (const kind of kinder) {
    aus += text.slice(ende, kind.position.start.offset) + rendere(kind, text, wurzel);
    ende = kind.position.end.offset;
  }
  return aus;
}

/**
 * Zerlegt eine Seite in Abschnitte: Eine Überschrift der Ebene 1 bis 3 direkt unter der Wurzel
 * schneidet die Seite (auch Setext-Überschriften, auch ATX mit bis zu drei Leerzeichen Einzug);
 * eine Überschrift in einer Liste oder einem Zitat schneidet nicht. Rückgabe wie bei `leseSeite`.
 */
function zerlege(wurzel, text) {
  const abschnitte = [];
  const offen = [];
  const kinder = wurzel.children;
  const schnitte = kinder
    .map((k, i) => ({ k, i }))
    .filter(({ k }) => k.type === "heading" && k.depth <= 3);
  schnitte.forEach(({ k, i }, nr) => {
    const titel = k.children.length === 0 ? "" : rendereKinder(k.children, text, wurzel).trim();
    while (offen.length > 0 && offen[offen.length - 1].ebene >= k.depth) offen.pop();
    if (titel !== "") offen.push({ ebene: k.depth, titel });
    const bis = schnitte[nr + 1]?.i ?? kinder.length;
    let roh = "";
    let ende = k.position.end.offset;
    for (const kind of kinder.slice(i + 1, bis)) {
      roh += text.slice(ende, kind.position.start.offset) + rendere(kind, text, wurzel);
      ende = kind.position.end.offset;
    }
    const naechster = kinder[bis]?.position.start.offset ?? text.length;
    roh += text.slice(ende, naechster);
    abschnitte.push({
      titel,
      pfad: offen.map((o) => o.titel),
      anker: ankerVon(titel),
      text: roh.replace(/\n{3,}/g, "\n\n").trim(),
    });
  });
  return abschnitte.filter((a) => a.titel !== "" && a.anker !== "" && a.text !== "");
}

/**
 * Der Text, den ein Leser der dargestellten Seite sieht: Werte von Text, Code in Backticks und
 * Codeblöcken (außer Diagrammen) sowie die Nummern geordneter Listen. Nicht dazu gehören HTML,
 * Alt-Texte, Titel, Link-Ziele und Definitionen. Die Adresse eines Adress-Verweises steht als
 * Text-Knoten darin.
 */
function sichtbarerText(wurzel) {
  const teile = [];
  for (const knoten of alle(wurzel)) {
    if (knoten.type === "text" || knoten.type === "inlineCode") teile.push(knoten.value);
    else if (knoten.type === "code" && knoten.lang !== "mermaid") teile.push(knoten.value);
    else if (knoten.type === "list" && knoten.ordered) {
      knoten.children.forEach((_, i) => {
        teile.push(String((knoten.start ?? 1) + i));
      });
    }
  }
  return teile.join("\n");
}

/**
 * Liest eine Seite einmal und gibt zurück:
 * - `funde`: Verborgenes (siehe `findeVerborgenes`),
 * - `abschnitte`: [{ titel, pfad, anker, text }] ohne Abschnitte ohne Titel, Anker oder Text,
 * - `sichtbar`: der sichtbare Text der Seite (für `pruefeWorte`).
 * Es wird nichts still entfernt; der Text geht unverändert (nur mit vereinheitlichten
 * Zeilenenden) an den Parser.
 */
export function leseSeite(roh) {
  const bytes = Buffer.byteLength(roh, "utf8");
  if (bytes > GRENZE_SEITE_BYTES) {
    return {
      funde: [
        {
          zeile: 1,
          art: "groesse",
          meldung: `Die Seite ist mit ${bytes} Bytes größer als erlaubt (${GRENZE_SEITE_BYTES} Bytes)`,
        },
      ],
      abschnitte: [],
      sichtbar: "",
    };
  }
  const text = normalisiere(roh);
  const wurzel = parse(text);
  const tiefste = messeTiefe(wurzel, GRENZE_TIEFE);
  if (tiefste.tiefe > GRENZE_TIEFE) {
    return {
      funde: [
        {
          zeile: tiefste.knoten.position?.start.line ?? 1,
          art: "tiefe",
          meldung: `Der Baum der Seite ist tiefer als ${GRENZE_TIEFE} Ebenen (zu viele verschachtelte Zitate oder Listen)`,
        },
      ],
      abschnitte: [],
      sichtbar: "",
    };
  }
  return {
    funde: findeVerborgenes(wurzel, text),
    abschnitte: zerlege(wurzel, text),
    sichtbar: sichtbarerText(wurzel),
  };
}

/**
 * Gegenprobe für das Schneiden: Jedes Wort (drei oder mehr Buchstaben oder Ziffern) im Text der
 * Abschnitte muss im sichtbaren Text der Seite oder in `ERLAUBTE_SPRACHEN` vorkommen. Gibt das
 * erste Wort zurück, das fehlt, sonst `null`. Verglichen wird mit dem sichtbaren Text aus demselben
 * Baum der ganzen Seite: Das fängt Wörter, die beim Schneiden aus Teilen hineinkommen, die der
 * Baum nicht als Text führt (Bild-Alt-Text, Link-Ziele, HTML). Es fängt nicht, wenn der Baum selbst
 * etwas Unsichtbares als Text führt; dafür sind `findeVerborgenes` und der Parser da.
 */
export function pruefeWorte(abschnitte, sichtbar) {
  const erlaubt = new Set([...(sichtbar.match(WORT) ?? []), ...ERLAUBTE_SPRACHEN]);
  for (const abschnitt of abschnitte) {
    for (const wort of abschnitt.text.match(WORT) ?? []) {
      if (!erlaubt.has(wort)) return { wort, titel: abschnitt.titel };
    }
  }
  return null;
}
