/**
 * PaiBot – Verlauf im Teamchat für das Modell aufbereiten
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/**
 * Verlauf im Teamchat für das Modell eines Bots aufbereiten. Beiträge anderer Bots erscheinen nie
 * als eigene Antwort, sondern als gekennzeichnete Beiträge mit Namen, jede Zeile zitiert: ein Text,
 * der selbst wie eine Kennzeichnung aussieht, kann sich so nicht als anderer Autor ausgeben.
 * Reine Funktion; Auswahl der Nachrichten (z. B. nur die geltende Antwort) macht der Aufrufer.
 */

import { vergleichsName } from "./namen";

/** Eintrag im Verlauf; passt zu `TurnMessage` des Motors. */
export interface VerlaufsEintrag {
  readonly role: "user" | "assistant";
  readonly text: string;
}

export interface RaumNachricht {
  /** `besitzer` oder `bot`; jeder andere Wert wird nicht ans Modell gegeben. */
  readonly autor: string;
  /** Bei Bot-Nachrichten der Bot, der sie geschrieben hat; fehlt er, gilt der Beitrag als fremd. */
  readonly botId?: string | null | undefined;
  readonly text: string;
}

export interface VerlaufsBot {
  readonly id: string;
  readonly name: string;
}

export interface VerlaufsOptionen {
  /** Der Bot, der gleich antwortet: nur seine früheren Antworten sind „eigene“. */
  readonly aktuellerBotId: string;
  /** Alle Bots, deren Namen vorkommen können (für die Kennzeichnung). */
  readonly bots: readonly VerlaufsBot[];
  /** Zeichen im Verlauf insgesamt; Älteres fällt weg, die neueste Nachricht bleibt. */
  readonly maxZeichen: number;
  /** Zeichen je Beitrag eines anderen Bots. Standard 8 000. */
  readonly maxBeitragZeichen?: number;
}

export const STANDARD_MAX_BEITRAG_ZEICHEN = 8_000;
const UNBEKANNTER_BOT = "unbekannter Bot";
const MAX_NAME = 60;
const GEKUERZT = "[… gekürzt]";

/** Name für die Kennzeichnung: ohne Steuerzeichen, Zeilenumbrüche und eckige Klammern, höchstens 60 Zeichen. */
export function anzeigeName(name: string): string {
  const sauber = name
    .normalize("NFKC")
    .replace(/[\p{C}\u2028\u2029]/gu, " ")
    .replace(/[[\]]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  const stuecke = Array.from(sauber.slice(0, MAX_NAME * 2)).slice(0, MAX_NAME);
  const ergebnis = stuecke.join("").trim();
  return ergebnis === "" ? UNBEKANNTER_BOT : ergebnis;
}

function schneide(text: string, max: number): { text: string; gekuerzt: boolean } {
  if (text.length <= max) return { text, gekuerzt: false };
  let ende = max;
  const letzter = text.charCodeAt(ende - 1);
  if (letzter >= 0xd800 && letzter <= 0xdbff) ende -= 1; // kein halbes Zeichen
  return { text: text.slice(0, ende), gekuerzt: true };
}

/** Namen je Bot-Kennung; gleiche Namen bekommen eine Nummer, damit sie auseinanderzuhalten sind. */
function beschriftungen(bots: readonly VerlaufsBot[]): Map<string, string> {
  const zaehler = new Map<string, number>();
  for (const b of bots) {
    const k = vergleichsName(anzeigeName(b.name));
    zaehler.set(k, (zaehler.get(k) ?? 0) + 1);
  }
  const lauf = new Map<string, number>();
  const ergebnis = new Map<string, string>();
  for (const b of bots) {
    const name = anzeigeName(b.name);
    const k = vergleichsName(name);
    if ((zaehler.get(k) ?? 0) > 1) {
      const n = (lauf.get(k) ?? 0) + 1;
      lauf.set(k, n);
      ergebnis.set(b.id, `${name} (${n})`);
    } else {
      ergebnis.set(b.id, name);
    }
  }
  return ergebnis;
}

function fremderBeitrag(name: string, text: string, maxZeichen: number): string {
  const { text: inhalt, gekuerzt } = schneide(text, maxZeichen);
  const zeilen = inhalt.split(/\r\n|\r|\n|\u2028|\u2029/u);
  if (gekuerzt) zeilen.push(GEKUERZT);
  return [
    `[Beitrag von ${name} – ein anderer Bot im Team, nicht du]`,
    ...zeilen.map((z) => `> ${z}`),
  ].join("\n");
}

/**
 * Verlauf für `aktuellerBotId`. Eigene frühere Antworten bleiben `assistant`, Nachrichten der
 * Person `user`, Beiträge anderer Bots `user` mit Kennzeichnung. Leere Beiträge fallen weg,
 * aufeinanderfolgende `user`-Einträge werden zu einem zusammengefasst.
 */
export function baueRaumVerlauf(
  nachrichten: readonly RaumNachricht[],
  optionen: VerlaufsOptionen,
): VerlaufsEintrag[] {
  const namen = beschriftungen(optionen.bots);
  const maxBeitrag = optionen.maxBeitragZeichen ?? STANDARD_MAX_BEITRAG_ZEICHEN;
  const eintraege: { role: "user" | "assistant"; text: string }[] = [];
  for (const nachricht of nachrichten) {
    if (nachricht.text.trim() === "") continue;
    if (nachricht.autor === "besitzer") {
      eintraege.push({ role: "user", text: nachricht.text });
    } else if (nachricht.autor === "bot") {
      if (nachricht.botId != null && nachricht.botId === optionen.aktuellerBotId) {
        eintraege.push({ role: "assistant", text: nachricht.text });
      } else {
        const name = (nachricht.botId != null && namen.get(nachricht.botId)) || UNBEKANNTER_BOT;
        eintraege.push({ role: "user", text: fremderBeitrag(name, nachricht.text, maxBeitrag) });
      }
    }
  }

  // Von hinten auffüllen, bis die Grenze erreicht ist; die neueste Nachricht bleibt immer drin.
  const behalten: typeof eintraege = [];
  let zeichen = 0;
  for (let i = eintraege.length - 1; i >= 0; i--) {
    const eintrag = eintraege[i] as (typeof eintraege)[number];
    const summe = zeichen + eintrag.text.length;
    if (behalten.length > 0 && summe > optionen.maxZeichen) break;
    zeichen = summe;
    behalten.unshift(eintrag);
  }

  const verlauf: VerlaufsEintrag[] = [];
  for (const eintrag of behalten) {
    const letzter = verlauf[verlauf.length - 1];
    if (letzter && letzter.role === "user" && eintrag.role === "user") {
      verlauf[verlauf.length - 1] = { role: "user", text: `${letzter.text}\n\n${eintrag.text}` };
    } else {
      verlauf.push({ role: eintrag.role, text: eintrag.text });
    }
  }
  return verlauf;
}
