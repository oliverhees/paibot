/**
 * PaiBot – Team-Vorlagen aus dem Image laden: liest den Ordner `vorlagen/teams`, prüft jede Datei
 * mit `pruefeEntwurfText` und liefert geprüfte Vorlagen mit Abdruck.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 *
 * Die Vorlagen liegen als Dateien im Image, nicht im Netz und nicht in der Datenbank: Dieses Modul
 * ruft nie `fetch` auf (Test „kein Netz nötig“ in `vorlagen.test.ts`). Der Ordner steht entweder in
 * `PAIBOT_TEAM_VORLAGEN` (das Image setzt sie, `apps/web/Dockerfile`) oder wird vom Arbeitsordner
 * aufwärts gesucht (Entwicklung und Tests).
 *
 * Eine ungültige Vorlage hält an: Sie ist ein Fehler im Image, keine Eingabe eines Menschen. So
 * fällt sie beim Bau und im Test auf und nicht erst dem Besitzer. Nur für den Server; das
 * Browser-Bündel sperrt das Modul (`apps/web/src/lib/routen-browser-buendel.test.ts`).
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Sha256Digest } from "@paibot/shared";
import {
  ENTWURF_GRENZEN,
  type EntwurfHinweis,
  type ModellEintrag,
  pruefeEntwurfText,
  type TeamEntwurf,
} from "./format";

/** Ort der Vorlagen ohne `PAIBOT_TEAM_VORLAGEN`, relativ zum Projektstamm. */
export const TEAM_VORLAGEN_ORDNER = path.join("vorlagen", "teams");

/** So viele Vorlagen liest der Lader höchstens; mehr deutet auf einen falschen Ordner hin. */
export const VORLAGEN_MAX = 50;

/**
 * Erlaubte Kennung einer Vorlage – zugleich der Dateiname ohne `.json`. Das Muster lässt weder
 * einen Punkt noch einen Schrägstrich zu: Eine Kennung aus einer Anfrage kann damit nie aus dem
 * Ordner herausführen.
 */
export const VORLAGE_KENNUNG_MUSTER = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** Fehler im Image: Ordner fehlt, Datei unlesbar oder Vorlage ungültig. Hält den Aufruf an. */
export class TeamVorlagenFehler extends Error {
  constructor(grund: string) {
    super(
      `Team-Vorlagen: ${grund}. Ordner „${TEAM_VORLAGEN_ORDNER}“ im Image prüfen bzw. PAIBOT_TEAM_VORLAGEN prüfen.`,
    );
    this.name = "TeamVorlagenFehler";
  }
}

/** Eine geprüfte Vorlage, wie die Oberfläche und die Routen sie bekommen. */
export interface TeamVorlage {
  /** Dateiname ohne `.json`, z. B. `content-team`. */
  readonly kennung: string;
  /**
   * Herkunft für den Entwurf und den Beleg: Kennung mit Fassung, z. B.
   * `content-team@3f0a1b2c4d5e`. Die Fassung sind die ersten zwölf Stellen des Abdrucks – die
   * Vorlagen tragen keine eigene Nummer, und so ändert sie sich mit jeder Änderung am Inhalt.
   */
  readonly quelle: string;
  readonly titel: string;
  readonly beschreibung?: string;
  readonly entwurf: TeamEntwurf;
  readonly abdruck: Sha256Digest;
  /** Hinweise der Prüfung, etwa zu einem Modell, das es hier nicht gibt. */
  readonly hinweise: readonly EntwurfHinweis[];
}

export interface LadeOptionen {
  /** Eigene Modelle; ohne Angabe bleiben die Modelle, wie sie in der Vorlage stehen. */
  readonly modelle?: readonly ModellEintrag[];
  /** Nur für Tests: Ordner, aus dem gelesen wird. Sonst Umgebung bzw. Suche ab dem Arbeitsordner. */
  readonly ordner?: string;
}

/**
 * Der Ordner, aus dem gelesen wird: `PAIBOT_TEAM_VORLAGEN`, sonst `TEAM_VORLAGEN_ORDNER` unter
 * `projektstamm`.
 */
export function vorlagenOrdner(
  env: Readonly<Record<string, string | undefined>>,
  projektstamm: string,
): string {
  const gesetzt = env.PAIBOT_TEAM_VORLAGEN;
  return gesetzt !== undefined && gesetzt !== ""
    ? gesetzt
    : path.join(projektstamm, TEAM_VORLAGEN_ORDNER);
}

/**
 * Sucht vom Arbeitsordner aufwärts den Projektstamm: den ersten Ordner, der `vorlagen/teams`
 * enthält. Für Entwicklung und Tests, wo der Arbeitsordner `apps/web`, der Projektstamm oder ein
 * Paket sein kann. Im Image setzt das Dockerfile `PAIBOT_TEAM_VORLAGEN`, dann läuft diese Suche
 * nicht.
 */
async function projektstammSuchen(start: string): Promise<string> {
  let ordner = path.resolve(start);
  for (;;) {
    try {
      await readdir(path.join(ordner, TEAM_VORLAGEN_ORDNER));
      return ordner;
    } catch {
      const eltern = path.dirname(ordner);
      if (eltern === ordner) {
        throw new TeamVorlagenFehler(`kein Ordner „${TEAM_VORLAGEN_ORDNER}“ über „${start}“`);
      }
      ordner = eltern;
    }
  }
}

async function ordnerBestimmen(optionen: LadeOptionen): Promise<string> {
  if (optionen.ordner !== undefined) return optionen.ordner;
  const gesetzt = process.env.PAIBOT_TEAM_VORLAGEN;
  if (gesetzt !== undefined && gesetzt !== "") return gesetzt;
  return vorlagenOrdner(process.env, await projektstammSuchen(process.cwd()));
}

/** Die Kennungen im Ordner, alphabetisch. Lehnt einen Dateinamen ab, der keine Kennung ist. */
async function kennungen(ordner: string): Promise<string[]> {
  let namen: string[];
  try {
    namen = await readdir(ordner);
  } catch {
    throw new TeamVorlagenFehler(`Ordner „${ordner}“ nicht lesbar`);
  }
  const gefunden = namen
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort((a, b) => a.localeCompare(b, "de"));
  for (const kennung of gefunden) {
    if (!VORLAGE_KENNUNG_MUSTER.test(kennung)) {
      throw new TeamVorlagenFehler(`Dateiname ist keine Kennung: „${kennung}.json“`);
    }
  }
  if (gefunden.length > VORLAGEN_MAX) {
    throw new TeamVorlagenFehler(`mehr als ${VORLAGEN_MAX} Vorlagen in „${ordner}“`);
  }
  return gefunden;
}

/**
 * Liest eine Vorlage, prüft sie und bildet ihren Abdruck. Die Kennung muss dem Muster entsprechen;
 * ein Pfad führt damit nie aus dem Ordner heraus.
 */
async function lade(ordner: string, kennung: string, optionen: LadeOptionen): Promise<TeamVorlage> {
  if (!VORLAGE_KENNUNG_MUSTER.test(kennung)) {
    throw new TeamVorlagenFehler(`keine Kennung: „${kennung}“`);
  }
  let text: string;
  try {
    text = await readFile(path.join(ordner, `${kennung}.json`), "utf8");
  } catch {
    throw new TeamVorlagenFehler(`Datei „${kennung}.json“ nicht lesbar`);
  }
  if (Buffer.byteLength(text, "utf8") > ENTWURF_GRENZEN.textBytesMax) {
    throw new TeamVorlagenFehler(`Vorlage „${kennung}“ ist zu groß`);
  }
  const geprueft = await pruefeEntwurfText(
    text,
    optionen.modelle === undefined ? {} : { modelle: optionen.modelle },
  );
  if (!geprueft.ok) {
    const stellen = geprueft.fehler.map((f) => `${f.pfad === "" ? "(ganz)" : f.pfad}: ${f.code}`);
    throw new TeamVorlagenFehler(`Vorlage „${kennung}“ ist ungültig – ${stellen.join(", ")}`);
  }
  return {
    kennung,
    quelle: `${kennung}@${geprueft.abdruck.slice("sha256:".length, "sha256:".length + 12)}`,
    titel: geprueft.entwurf.titel,
    ...(geprueft.entwurf.beschreibung === undefined
      ? {}
      : { beschreibung: geprueft.entwurf.beschreibung }),
    entwurf: geprueft.entwurf,
    abdruck: geprueft.abdruck,
    hinweise: geprueft.hinweise,
  };
}

/** Alle Vorlagen des Ordners, alphabetisch nach Kennung. */
export async function ladeVorlagen(optionen: LadeOptionen = {}): Promise<TeamVorlage[]> {
  const ordner = await ordnerBestimmen(optionen);
  const liste = await kennungen(ordner);
  return Promise.all(liste.map((kennung) => lade(ordner, kennung, optionen)));
}

/** Eine Vorlage über ihre Kennung; `undefined`, wenn es sie nicht gibt. */
export async function ladeVorlage(
  kennung: string,
  optionen: LadeOptionen = {},
): Promise<TeamVorlage | undefined> {
  if (!VORLAGE_KENNUNG_MUSTER.test(kennung)) return undefined;
  const ordner = await ordnerBestimmen(optionen);
  if (!(await kennungen(ordner)).includes(kennung)) return undefined;
  return lade(ordner, kennung, optionen);
}
