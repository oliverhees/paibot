/**
 * PaiBot – Unterhaltung als Datei sichern: lesbares Markdown mit Titel, Datum und je Nachricht
 * wer und wann; abgebrochene, fehlgeschlagene und ersetzte Antworten sind gekennzeichnet. Die
 * Datei enthält keine internen Kennungen und keine Schlüssel. HTML, Bilder und Steuerzeichen aus
 * den Nachrichten sind entschärft: als Text sichtbar, in einer Vorschau nie wirksam. Der Export
 * läuft durch das Tor.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { PaiBotError } from "@paibot/shared/fehler";
import { type ConversationId, isId } from "@paibot/shared/ids";
import type { Message, Run } from "@paibot/shared/objekte";
import { errorText, t } from "@paibot/shared/texte";
import type { RoutenAktion, RoutenErgebnis } from "../api/route";
import { fassungenVon } from "./fassungen";
import { ladeVerlauf } from "./laden";
import type { ModellInfo } from "./typen";

/** Inhaltstyp der Datei. */
export const EXPORT_TYP = "text/markdown";

/** Kopfzeilen der Antwort: Anzahl der Nachrichten und die Belege des Exports. */
export const UNTERHALTUNG_EXPORT_KOPF = {
  nachrichten: "X-Pb-Nachrichten",
  entscheidung: "X-Pb-Beleg-Entscheidung",
  ergebnis: "X-Pb-Beleg-Ergebnis",
} as const;

const UMLAUTE: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

/**
 * Sicherer Dateiname aus Titel und Datum, z. B. `paibot-gartenplan-fuer-maerz-2026-11-21.md`:
 * nur Kleinbuchstaben, Ziffern und Bindestriche, höchstens 40 Zeichen aus dem Titel.
 */
export function exportDateiname(titel: string, datum: string): string {
  const teil = titel
    .toLowerCase()
    .replace(/[äöüß]/g, (z) => UMLAUTE[z] ?? z)
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `paibot-${teil === "" ? "unterhaltung" : teil}-${datum}.md`;
}

function datumText(iso: string, zeitzone: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: zeitzone,
  }).format(new Date(iso));
}

function zeitText(iso: string, zeitzone: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zeitzone,
  }).format(new Date(iso));
}

/** Datum im Format `JJJJ-MM-TT` in der Zeitzone (für den Dateinamen). */
function isoDatum(datum: Date, zeitzone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: zeitzone,
  }).format(datum);
}

/**
 * Steuerzeichen der Schreibrichtung (U+200E, U+200F, U+202A–U+202E, U+2066–U+2069) und
 * unsichtbare Zeichen, mit denen sich ein Text anders anzeigen lässt, als er ist.
 */
const UNSICHTBAR = /[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

/** Ohne Steuerzeichen (außer Zeilenumbruch und Tabulator) und ohne Zeichen der Schreibrichtung. */
function ohneSteuerzeichen(text: string): string {
  let aus = "";
  for (const z of text.replace(UNSICHTBAR, "")) {
    const code = z.codePointAt(0) ?? 0;
    const steuer = (code < 0x20 && z !== "\n" && z !== "\t") || (code >= 0x7f && code <= 0x9f);
    if (!steuer) aus += z;
  }
  return aus;
}

/**
 * Text außerhalb von Code als Markdown entschärft: `<` wird zu `\<` (HTML erscheint als Text),
 * `![` zu `!\[` (kein Bild wird aus dem Netz geladen), und Links auf `javascript:`, `data:` und
 * `vbscript:` verlieren ihr Schema. In einem Texteditor bleibt alles lesbar.
 */
function entschaerfeText(text: string): string {
  return text
    .replace(/</g, "\\<")
    .replace(/!\[/g, "!\\[")
    .replace(/\]\(\s*(javascript|data|vbscript):/gi, "](\\$1:");
}

/** Code-Spannen (gleich lange Folgen von Backticks) bleiben, wie sie sind; sie zeigen nie HTML. */
function entschaerfeZeile(zeileText: string): string {
  let aus = "";
  let rest = zeileText;
  for (;;) {
    const start = /`+/.exec(rest);
    if (start === null) return aus + entschaerfeText(rest);
    const zaun = start[0];
    const nach = rest.slice(start.index + zaun.length);
    const ende = new RegExp(`(?<!\`)${zaun}(?!\`)`).exec(nach);
    if (ende === null) return aus + entschaerfeText(rest);
    aus +=
      entschaerfeText(rest.slice(0, start.index)) + zaun + nach.slice(0, ende.index + zaun.length);
    rest = nach.slice(ende.index + zaun.length);
  }
}

/**
 * Inhalt einer Nachricht für die Datei: ohne Steuerzeichen, HTML und Bilder außerhalb von
 * Code-Blöcken entschärft (siehe `entschaerfeText`). Code-Blöcke (``` oder ~~~) bleiben wörtlich.
 */
export function sichererInhalt(text: string): string {
  const zeilen = ohneSteuerzeichen(text.replace(/\r\n?/g, "\n")).split("\n");
  let zaun: string | undefined;
  return zeilen
    .map((z) => {
      const treffer = /^ {0,3}(`{3,}|~{3,})/.exec(z);
      if (zaun !== undefined) {
        if (
          treffer?.[1] !== undefined &&
          treffer[1][0] === zaun[0] &&
          treffer[1].length >= zaun.length
        ) {
          zaun = undefined;
        }
        return z;
      }
      if (treffer?.[1] !== undefined) {
        zaun = treffer[1];
        return z;
      }
      return entschaerfeZeile(z);
    })
    .join("\n");
}

/** Eine Zeile Text ohne Steuerzeichen (für Überschriften und Kopf), HTML entschärft. */
function zeile(text: string): string {
  let aus = "";
  for (const z of text.replace(UNSICHTBAR, "")) {
    const code = z.codePointAt(0) ?? 0;
    aus += code < 0x20 || (code >= 0x7f && code <= 0x9f) ? " " : z;
  }
  return entschaerfeText(aus.replace(/ {2,}/g, " ").trim());
}

export interface ExportEingabe {
  titel: string;
  botName: string;
  angelegt: string;
  nachrichten: readonly Message[];
  /** Beendete Läufe (für Antworten, die nie entstanden sind). */
  laeufe: readonly Run[];
  modelle: Readonly<Record<string, ModellInfo>>;
  zeitzone: string;
  jetzt: Date;
}

/** Baut die Markdown-Datei. Rein, ohne Datenbank. */
export function unterhaltungAlsMarkdown(e: ExportEingabe): string {
  const z = e.zeitzone;
  const jetztIso = e.jetzt.toISOString();
  const sichtbar = e.nachrichten.filter((m) => m.role !== "system");
  const fassungen = fassungenVon(
    sichtbar.map((m) => ({ id: m.id, rolle: m.role === "user" ? "du" : "bot" })),
  );
  const mitAntwort = new Set(sichtbar.map((m) => m.runId).filter(Boolean));
  const ohneAntwort = e.laeufe.filter(
    (l) => !mitAntwort.has(l.id) && (l.status === "failed" || l.status === "denied"),
  );

  const teile: string[] = [
    `# ${zeile(e.titel)}`,
    "",
    `${t("export.kopf.unterhaltung", { name: zeile(e.botName) })}  `,
    `${t("export.kopf.angelegt", { datum: datumText(e.angelegt, z) })}  `,
    `${t("export.kopf.gesichert", { datum: datumText(jetztIso, z), zeit: zeitText(jetztIso, z), zone: z })}  `,
    t("export.kopf.anzahl", { anzahl: sichtbar.length }),
    "",
    `> ${t("export.kopf.hinweis")}`,
    "",
  ];
  if (sichtbar.length === 0) {
    teile.push("---", "", t("export.leer"), "");
  }
  for (const m of sichtbar) {
    const wer = m.role === "user" ? t("export.von.du") : zeile(e.botName);
    teile.push(
      "---",
      "",
      `## ${t("export.zeile", { wer, datum: datumText(m.createdAt, z), zeit: zeitText(m.createdAt, z) })}`,
      "",
    );
    const vermerke: string[] = [];
    if (m.role === "assistant") {
      const f = fassungen.get(m.id);
      if (f !== undefined && f.von > 1) {
        vermerke.push(
          f.nr < f.von
            ? t("export.status.ersetzt", { nr: f.nr, von: f.von })
            : t("export.status.fassung", { nr: f.nr, von: f.von }),
        );
      }
      if (m.status === "cancelled") vermerke.push(t("export.status.abgebrochen"));
      if (m.status === "failed") {
        vermerke.push(t("export.status.fehler", { grund: errorText(m.errorCode ?? "intern") }));
      }
      if (m.status === "streaming") vermerke.push(t("export.status.laeuft"));
      const modell = m.modelId === undefined ? undefined : e.modelle[m.modelId];
      if (modell !== undefined) {
        const weg = m.route === "schleuse" ? `, ${t("export.weg.schleuse")}` : "";
        vermerke.push(`${t("export.modell", { modell: zeile(modell.name) })}${weg}`);
      }
    }
    for (const v of vermerke) teile.push(`> ${v}`);
    if (vermerke.length > 0) teile.push("");
    if (m.content !== "") teile.push(sichererInhalt(m.content).trimEnd(), "");
    // Läufe zu dieser Nachricht, die ohne Antwort endeten.
    for (const l of ohneAntwort.filter((x) => x.triggerMessageId === m.id)) {
      teile.push(
        `> ${zeile(e.botName)}: ${t("export.status.fehler", { grund: errorText(l.errorCode ?? "intern") })}`,
        "",
      );
    }
  }
  return `${teile.join("\n").trimEnd()}\n`;
}

/**
 * `POST /api/unterhaltungen/:id/export`: liest die Unterhaltung in einem Lesestand, entscheidet
 * über `unterhaltung.exportieren` und liefert die Datei; die Belege nennen die Kopfzeilen. Die
 * Aktion ändert keine Daten, ihr einziges Ergebnis sind die Belege.
 */
export const unterhaltungExportieren: RoutenAktion<"unterhaltungExport"> = async (
  k,
): Promise<RoutenErgebnis> => {
  const id = k.params.id;
  if (!isId("conversation", id)) throw new PaiBotError("nicht_gefunden");
  const conversationId = id as ConversationId;
  const verlauf = await ladeVerlauf(k.db, conversationId);
  const u = verlauf === undefined ? undefined : await repo.conversations.get(k.db, conversationId);
  const settings = await repo.settings.get(k.db);
  const bot = u === undefined ? undefined : await repo.bots.get(k.db, u.botId);
  const nachrichten = verlauf?.nachrichten.filter((m) => m.role !== "system") ?? [];
  const jetzt = k.dienste.uhr.now();
  const zeitzone = settings?.timezone ?? "Europe/Berlin";
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "unterhaltung.exportieren", target: { conversationId } },
    { conversationExists: verlauf !== undefined && u !== undefined, messages: nachrichten.length },
    async () => {
      if (verlauf === undefined || u === undefined) throw new PaiBotError("nicht_gefunden");
      const inhalt = unterhaltungAlsMarkdown({
        titel: u.title,
        botName: bot?.name ?? t("einrichtung.bot.vorschlag"),
        angelegt: u.createdAt,
        nachrichten: verlauf.nachrichten,
        laeufe: verlauf.laeufe,
        modelle: verlauf.modelle,
        zeitzone,
        jetzt,
      });
      return { value: { inhalt, titel: u.title }, result: { status: "ok" } };
    },
  );
  const { decision, result } = ergebnis.receipts;
  return {
    datei: {
      name: exportDateiname(ergebnis.value.titel, isoDatum(jetzt, zeitzone)),
      typ: EXPORT_TYP,
      inhalt: ergebnis.value.inhalt,
      kopf: {
        [UNTERHALTUNG_EXPORT_KOPF.nachrichten]: String(nachrichten.length),
        [UNTERHALTUNG_EXPORT_KOPF.entscheidung]: `${decision.receiptId} ${decision.seq}`,
        [UNTERHALTUNG_EXPORT_KOPF.ergebnis]: `${result.receiptId} ${result.seq}`,
      },
    },
  };
};
