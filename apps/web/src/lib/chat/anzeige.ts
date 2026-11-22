/**
 * PaiBot – kleine Regeln der Chat-Oberfläche ohne Zustand: Titel aus der ersten Nachricht,
 * Zeiten, Kennung eines Belegs, Weg der Anfrage, passende Seite zu einem Fehlercode, Fehler der
 * Datenschleuse, Länge.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ErrorCode } from "@paibot/shared/fehler";
import type { Route } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";

/** Längster Titel, der aus der ersten Nachricht entsteht. */
export const TITEL_ZEICHEN = 60;

/**
 * Titel einer neuen Unterhaltung aus ihrer ersten Nachricht: erste nicht leere Zeile, Leerraum
 * zusammengefasst, höchstens `TITEL_ZEICHEN` Zeichen, an einer Wortgrenze gekürzt mit „…“.
 * Ohne verwertbaren Text: „Neue Unterhaltung“.
 */
export function titelAusNachricht(text: string, max = TITEL_ZEICHEN): string {
  const zeile =
    text
      .split(/\r?\n/)
      .map((z) => z.replace(/\s+/g, " ").trim())
      .find((z) => z !== "") ?? "";
  if (zeile === "") return t("chat.titel.neu");
  const zeichen = Array.from(zeile);
  if (zeichen.length <= max) return zeile;
  const kurz = zeichen.slice(0, max - 1).join("");
  const grenze = kurz.lastIndexOf(" ");
  const schnitt = grenze >= max / 2 ? kurz.slice(0, grenze) : kurz;
  return `${schnitt.replace(/[\s,.;:!?–-]+$/u, "")}…`;
}

/** Uhrzeit „14:32“ in der Zeitzone der Einstellungen. */
export function uhrzeit(iso: string, zeitzone: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zeitzone,
  }).format(new Date(iso));
}

/** Datum in der Zeitzone als `JJJJ-MM-TT` (zum Vergleichen von Tagen). */
export function tagSchluessel(iso: string | Date, zeitzone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: zeitzone,
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

/** Trenner über den Nachrichten eines Tages: „Heute“, „Gestern“ oder das Datum. */
export function tagText(iso: string, zeitzone: string, jetzt: Date): string {
  const tag = tagSchluessel(iso, zeitzone);
  if (tag === tagSchluessel(jetzt, zeitzone)) return t("chat.tag.heute");
  const gestern = new Date(jetzt.getTime() - 24 * 60 * 60 * 1000);
  if (tag === tagSchluessel(gestern, zeitzone)) return t("chat.tag.gestern");
  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: zeitzone,
  }).format(new Date(iso));
}

/** Der Tag vor `tag` (`JJJJ-MM-TT`), mit Kalenderrechnung statt „minus 24 Stunden“. */
function tagDavor(tag: string): string {
  const [j, m, d] = tag.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(j, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * Kurze Zeitangabe für „Zuletzt“: „heute“, „gestern“, sonst „16.11.“ (im selben Jahr) oder
 * „16.11.2025“. Tage zählen in der Zeitzone der Einstellungen. Ungültige Zeit: `undefined`.
 */
export function kurzTagText(iso: string, zeitzone: string, jetzt: Date): string | undefined {
  const zeit = new Date(iso);
  if (Number.isNaN(zeit.getTime())) return undefined;
  const tag = tagSchluessel(zeit, zeitzone);
  const heute = tagSchluessel(jetzt, zeitzone);
  if (tag === heute) return t("startbereich.zeit.heute");
  if (tag === tagDavor(heute)) return t("startbereich.zeit.gestern");
  const gleichesJahr = tag.slice(0, 4) === heute.slice(0, 4);
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    ...(gleichesJahr ? {} : { year: "numeric" }),
    timeZone: zeitzone,
  }).format(zeit);
}

/** Datum und Uhrzeit „21.11.2026 · 14:32:08“ für die Belege. */
export function zeitpunkt(iso: string, zeitzone: string): string {
  const d = new Date(iso);
  const datum = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: zeitzone,
  }).format(d);
  const zeit = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: zeitzone,
  }).format(d);
  return `${datum} · ${zeit}`;
}

/** Kurze Kennung eines Belegs aus seiner Nummer in der Kette, z. B. „B-0142“. */
export function belegKennung(seq: number): string {
  return `B-${String(seq).padStart(4, "0")}`;
}

/** Adresse der Seite eines Belegs. */
export function belegAdresse(id: string): string {
  return `/belege/${encodeURIComponent(id)}`;
}

/** Weg der Anfrage für die Zeile unter der Antwort. */
export function wegAngabe(route: Route): {
  modus: "direkt" | "schleuse";
  text: string;
  kurz: string;
} {
  if (route === "schleuse") {
    return {
      modus: "schleuse",
      text: t("schleuse.hinweis.schleuse"),
      kurz: t("chat.weg.kurz.schleuse"),
    };
  }
  return {
    modus: "direkt",
    // Nur der Weg; wer geantwortet hat und woher, steht im Teil „Modell“ der Zeile.
    text: t("schleuse.hinweis.direkt_neutral"),
    kurz: t("chat.weg.kurz.direkt"),
  };
}

/** Seite, die bei einem Fehlercode weiterhilft, mit Beschriftung des Links. */
export function zielZuCode(code: ErrorCode): { href: string; text: string } | undefined {
  switch (code) {
    case "kein_modell":
    case "schluessel_ungueltig":
      return { href: "/modelle", text: t("chat.ziel.modelle") };
    case "schleuse_blockiert":
    case "schleuse_nicht_installiert":
    case "schluessel_passt_nicht":
      return { href: "/datenschleuse", text: t("chat.ziel.datenschleuse") };
    case "limit_erreicht":
      return { href: "/einstellungen", text: t("chat.ziel.einstellungen") };
    default:
      return undefined;
  }
}

/**
 * Hat das Tor wegen des Tagesbudgets (Grenze G-04) abgelehnt? Der Code ist dann `abgelehnt`; die
 * Grenze steht in der Begründung des Tors („G-04 …“). Die Begründung kommt aus dem Ende des Laufs
 * oder, nach dem Neuladen, aus dem Beleg der Entscheidung. Dann gibt es einen Ausweg mit Link zu
 * den Grenzen; sonst nichts.
 */
export function tagesbudgetAusweg(
  e: { ergebnis: "abgebrochen" | "fehlgeschlagen" | "abgelehnt"; code: ErrorCode },
  gruende: readonly (string | undefined)[],
): { ausweg: string; ziel: { href: string; text: string } } | undefined {
  if (e.ergebnis !== "abgelehnt" || e.code !== "abgelehnt") return undefined;
  if (!gruende.some((g) => g !== undefined && /\bG-04\b/.test(g))) return undefined;
  return {
    ausweg: t("chat.ende.tagesbudget"),
    ziel: { href: "/einstellungen/grenzen", text: t("chat.ziel.grenzen") },
  };
}

/** Fehler, die an der Datenschleuse lagen und dort ihren eigenen Text mit Ausweg haben. */
export type SchleuseFehlerArt =
  | "blockiert"
  | "nicht_erreichbar"
  | "schluessel_passt_nicht"
  | "antwort_zu_gross";

/** Was über ein Ende bekannt ist, um zu erkennen, ob es an der Datenschleuse lag. */
export interface EndeHinweise {
  ergebnis: "abgebrochen" | "fehlgeschlagen" | "abgelehnt";
  code: ErrorCode;
  /** Ereignis `schleuse.blockiert` zu diesem Lauf (nur in der laufenden Ansicht bekannt). */
  schleuseGemeldet?: boolean;
  /** Die Anfrage ging über die Datenschleuse (Weg der Antwort). */
  ueberSchleuse?: boolean;
}

/**
 * Lag das Ende an der Datenschleuse, und woran genau? Ein abgelehnter Lauf mit dem Code
 * `schluessel_ungueltig` entsteht nur, wenn die Datenschleuse den Schlüssel von PaiBot abgelehnt hat
 * (der Schlüssel des Anbieters fällt erst während des Laufs auf, dann ist er „fehlgeschlagen“).
 * Hat die Datenschleuse einen abgelehnten Lauf gemeldet, ohne ihn selbst zu stoppen, war sie nicht
 * bereit. Andere Fehler bleiben beim allgemeinen Text.
 */
export function schleuseFehlerArt(e: EndeHinweise): SchleuseFehlerArt | undefined {
  if (e.ergebnis === "abgebrochen") return undefined;
  if (e.code === "schluessel_passt_nicht") return "schluessel_passt_nicht";
  if (e.ergebnis === "abgelehnt" && e.code === "schluessel_ungueltig") {
    return "schluessel_passt_nicht";
  }
  if (e.code === "schleuse_blockiert") return "blockiert";
  if (e.ergebnis === "abgelehnt" && e.schleuseGemeldet) return "nicht_erreichbar";
  if (e.code === "antwort_zu_gross" && e.ueberSchleuse) return "antwort_zu_gross";
  return undefined;
}

/** Satz und Ausweg zu einem Fehler der Datenschleuse. */
export function schleuseFehler(art: SchleuseFehlerArt): { text: string; ausweg: string } {
  return { text: t(`schleuse.fehler.${art}`), ausweg: t(`schleuse.fehler.${art}.ausweg`) };
}

/** Passende Seite zu einem Fehler der Datenschleuse (keine bei einer zu großen Antwort). */
export function zielZuSchleuseFehler(
  art: SchleuseFehlerArt,
): { href: string; text: string } | undefined {
  return art === "antwort_zu_gross"
    ? undefined
    : { href: "/datenschleuse", text: t("chat.ziel.datenschleuse") };
}

/** Ab diesem Anteil der Höchstlänge zeigt die Eingabe, wie viel noch geht. */
const LAENGE_WARNUNG = 0.9;

/**
 * Hinweis zur Länge der Eingabe: nichts, solange viel Platz ist; „Noch … Zeichen“ kurz vor der
 * Grenze; „… Zeichen zu viel“ darüber (dann wird nicht gesendet).
 */
export function laengenHinweis(
  text: string,
  max: number,
): { art: "ok" } | { art: "knapp"; text: string } | { art: "zu_lang"; text: string } {
  const laenge = text.length;
  if (laenge > max) {
    return { art: "zu_lang", text: t("chat.laenge.zu_lang", { anzahl: zahl(laenge - max) }) };
  }
  if (laenge >= max * LAENGE_WARNUNG) {
    return { art: "knapp", text: t("chat.laenge.noch", { anzahl: zahl(max - laenge) }) };
  }
  return { art: "ok" };
}

function zahl(n: number): string {
  return new Intl.NumberFormat("de-DE").format(n);
}
