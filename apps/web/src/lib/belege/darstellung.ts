/**
 * PaiBot – Belege in Nutzer-Sprache: Kennung, Art, was, wer, Ergebnis, Zeit. Läuft auch im Browser
 * (nur Typen und Texte, kein Zod) und verträgt beschädigte Daten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ReceiptEntry } from "@paibot/shared/belege";
import { isTextKey, t } from "@paibot/shared/texte";

/** Art eines Belegs. `unbekannt` nur bei beschädigten Daten. */
export type BelegArt = "start" | "decision" | "result" | "key_change" | "unbekannt";

/** Ergebnis in Worten und als Status-Art für die Marke. */
export interface BelegErgebnis {
  text: string;
  art: "ok" | "warn" | "fehler" | "neutral";
}

/** Eine Zeile der Liste, fertig zum Anzeigen. */
export interface BelegZeile {
  id: string;
  seq: number;
  kennung: string;
  zeit: string;
  art: BelegArt;
  artText: string;
  was: string;
  wer: string;
  /** `besitzer`, `bot` oder `paibot` (Start, Schlüsselwechsel). */
  von: "besitzer" | "bot" | "paibot";
  ergebnis: BelegErgebnis;
  /** Angewandte Regel bei Entscheidungen, z. B. `R-001`. */
  regel?: string;
}

type Roh = Record<string, unknown>;

function objekt(wert: unknown): Roh | undefined {
  return typeof wert === "object" && wert !== null && !Array.isArray(wert)
    ? (wert as Roh)
    : undefined;
}

function text(wert: unknown): string | undefined {
  return typeof wert === "string" ? wert : undefined;
}

/** Lesbare Kennung aus der laufenden Nummer, z. B. `B-0142`. */
export function kennung(seq: number): string {
  return Number.isSafeInteger(seq) && seq > 0 ? `B-${String(seq).padStart(4, "0")}` : "B-?";
}

export function belegArt(entry: ReceiptEntry): BelegArt {
  const typ = objekt(entry.body)?.type;
  return typ === "start" || typ === "decision" || typ === "result" || typ === "key_change"
    ? typ
    : "unbekannt";
}

export function artText(art: BelegArt): string {
  return t(`belege.art.${art}`);
}

/** Aktion in Nutzer-Sprache aus dem Text-Katalog. */
export function wasText(entry: ReceiptEntry): string {
  const art = belegArt(entry);
  if (art === "start") return t("belege.was.start");
  if (art === "key_change") return t("belege.was.schluesselwechsel");
  const typ = text(objekt(objekt(entry.body)?.action)?.type);
  if (typ === undefined) return t("belege.was.unbekannt");
  const schluessel = `aktion.${typ}`;
  return isTextKey(schluessel) ? t(schluessel as "aktion.lauf.abbrechen") : typ;
}

/** Wer die Aktion ausgelöst hat. `botNamen`: Kennung des Bots → Name. */
export function wer(
  entry: ReceiptEntry,
  botNamen: Readonly<Record<string, string>> = {},
): { von: BelegZeile["von"]; text: string } {
  const actor = text(objekt(objekt(entry.body)?.action)?.actor);
  if (actor === undefined) return { von: "paibot", text: t("belege.wer.paibot") };
  if (actor === "besitzer") return { von: "besitzer", text: t("belege.wer.du") };
  const name = botNamen[actor.replace(/^bot:/, "")];
  return {
    von: "bot",
    text: name === undefined ? t("belege.wer.bot") : t("belege.wer.bot_name", { name }),
  };
}

/** Ergebnis: erlaubt, abgelehnt, fragt, bereitet vor, fertig, fehlgeschlagen, abgebrochen … */
export function ergebnis(entry: ReceiptEntry): BelegErgebnis {
  const body = objekt(entry.body);
  switch (belegArt(entry)) {
    case "decision": {
      const outcome = text(objekt(body?.decision)?.outcome);
      if (outcome === "allow") return { text: t("belege.ergebnis.allow"), art: "ok" };
      if (outcome === "deny") return { text: t("belege.ergebnis.deny"), art: "fehler" };
      if (outcome === "ask") return { text: t("belege.ergebnis.ask"), art: "warn" };
      if (outcome === "prepare") return { text: t("belege.ergebnis.prepare"), art: "warn" };
      break;
    }
    case "result": {
      const status = text(objekt(body?.result)?.status);
      if (status === "ok") return { text: t("belege.ergebnis.ok"), art: "ok" };
      if (status === "error") return { text: t("belege.ergebnis.error"), art: "fehler" };
      if (status === "cancelled") return { text: t("belege.ergebnis.cancelled"), art: "neutral" };
      if (status === "denied") return { text: t("belege.ergebnis.denied"), art: "fehler" };
      break;
    }
    case "start":
      return { text: t("belege.ergebnis.start"), art: "neutral" };
    case "key_change":
      return objekt(body?.facts)?.signedBy === "new"
        ? { text: t("belege.ergebnis.wechsel_nicht_beglaubigt"), art: "warn" }
        : { text: t("belege.ergebnis.wechsel"), art: "neutral" };
    default:
      break;
  }
  return { text: t("belege.ergebnis.unbekannt"), art: "neutral" };
}

/** Erste angewandte Regel einer Entscheidung. */
export function ersteRegel(entry: ReceiptEntry): string | undefined {
  const regeln = objekt(objekt(entry.body)?.decision)?.rules;
  if (!Array.isArray(regeln)) return undefined;
  return text(objekt(regeln[0])?.id);
}

/** Zeit eines Belegs in der Zeitzone der Einstellungen (`mitDatum`: Datum davor). */
export function zeitText(entry: ReceiptEntry, zeitzone: string, mitDatum = false): string {
  const roh = text(objekt(entry.body)?.time);
  const datum = roh === undefined ? undefined : new Date(roh);
  if (datum === undefined || Number.isNaN(datum.getTime())) return "–";
  const format = (optionen: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat("de-DE", { ...optionen, timeZone: zeitzone }).format(datum);
    } catch {
      return new Intl.DateTimeFormat("de-DE", { ...optionen, timeZone: "UTC" }).format(datum);
    }
  };
  const uhr = format(
    mitDatum
      ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
      : { hour: "2-digit", minute: "2-digit" },
  );
  if (!mitDatum) return uhr;
  return `${format({ day: "2-digit", month: "2-digit", year: "numeric" })} · ${uhr}`;
}

/** Datum für die Liste: heute nur die Uhrzeit, sonst Tag und Monat davor. */
export function listenZeit(entry: ReceiptEntry, zeitzone: string, jetzt: Date): string {
  const roh = text(objekt(entry.body)?.time);
  const datum = roh === undefined ? undefined : new Date(roh);
  if (datum === undefined || Number.isNaN(datum.getTime())) return "–";
  const tag = (d: Date) => {
    try {
      return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeZone: zeitzone }).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  };
  const uhr = zeitText(entry, zeitzone);
  if (tag(datum) === tag(jetzt)) return uhr;
  try {
    const kurz = new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      timeZone: zeitzone,
    }).format(datum);
    return `${kurz} ${uhr}`;
  } catch {
    return uhr;
  }
}

/** Alles für eine Zeile der Liste. */
export function belegZeile(
  entry: ReceiptEntry,
  optionen: { zeitzone: string; jetzt: Date; botNamen?: Readonly<Record<string, string>> },
): BelegZeile {
  const art = belegArt(entry);
  const von = wer(entry, optionen.botNamen);
  const regel = art === "decision" ? ersteRegel(entry) : undefined;
  return {
    id: String(entry.id),
    seq: entry.seq,
    kennung: kennung(entry.seq),
    zeit: listenZeit(entry, optionen.zeitzone, optionen.jetzt),
    art,
    artText: artText(art),
    was: wasText(entry),
    wer: von.text,
    von: von.von,
    ergebnis: ergebnis(entry),
    ...(regel === undefined ? {} : { regel }),
  };
}
