/**
 * PaiBot – Verteiler: eine gemeinsame LISTEN-Verbindung pro Prozess, Meldungen gehen im Speicher an
 * alle offenen Ströme der betroffenen Unterhaltung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { isId } from "@paibot/shared/ids";
import { EVENT_NOTIFY_CHANNEL } from "@paibot/shared/konstanten";

/** Ein aktives `LISTEN` auf einem Kanal. */
export interface MeldungsAbo {
  unlisten(): Promise<void>;
}

/**
 * Quelle für Meldungen (`LISTEN`). `beiBereit` wird gerufen, sobald `LISTEN` aktiv ist, und erneut
 * nach jedem Wiederaufbau der Verbindung; dann können Meldungen verloren gegangen sein.
 */
export interface MeldungsQuelle {
  listen(
    kanal: string,
    beiMeldung: (nutzlast: string) => void,
    beiBereit: () => void,
  ): Promise<MeldungsAbo>;
}

/** Was postgres.js für `sql.listen` anbietet (Ausschnitt). */
export interface PostgresListen {
  listen(
    kanal: string,
    beiMeldung: (nutzlast: string) => void,
    beiBereit?: () => void,
  ): Promise<MeldungsAbo>;
}

/**
 * Meldungs-Quelle über postgres.js. postgres.js hält für `listen` eine eigene Verbindung, baut sie
 * nach einem Abbruch selbst wieder auf und ruft danach `beiBereit` erneut.
 */
export function ausPostgres(sql: PostgresListen): MeldungsQuelle {
  return {
    listen: (kanal, beiMeldung, beiBereit) => sql.listen(kanal, beiMeldung, beiBereit),
  };
}

/** Meldet einem Strom: „Es gibt (vielleicht) Neues, lies aus der Datenbank nach.“ */
export type Wecker = () => void;

export interface Verteiler {
  /**
   * Meldet einen Strom für eine Unterhaltung an. Das Versprechen erfüllt sich erst, wenn `LISTEN`
   * aktiv ist; ab dann geht keine Meldung mehr verloren. Gibt die Abmeldung zurück (mehrfach
   * aufrufbar). Schlägt `LISTEN` fehl, wird der Fehler weitergegeben und nichts bleibt angemeldet.
   */
  abonnieren(conversationId: string, wecken: Wecker): Promise<() => Promise<void>>;
  /** Anzahl angemeldeter Ströme. */
  readonly anzahl: number;
  /** Ob gerade ein `LISTEN` besteht. */
  readonly hoertZu: boolean;
}

/**
 * Baut den Verteiler. Das erste Abo startet `LISTEN`, das letzte Abmelden beendet es (`UNLISTEN`).
 * Die Nutzlast einer Meldung ist nur die ID der Unterhaltung; alles andere wird ignoriert. Inhalte
 * liest jeder Strom selbst aus der Datenbank.
 */
export function createVerteiler(
  quelle: MeldungsQuelle,
  kanal: string = EVENT_NOTIFY_CHANNEL,
): Verteiler {
  const abos = new Map<string, Set<Wecker>>();
  let anzahl = 0;
  let verbindung: MeldungsAbo | undefined;
  let kette: Promise<unknown> = Promise.resolve();

  function nacheinander<T>(schritt: () => Promise<T>): Promise<T> {
    const ergebnis = kette.then(schritt);
    kette = ergebnis.catch(() => undefined);
    return ergebnis;
  }

  function weckeAlle(wecker: Iterable<Wecker>): void {
    for (const wecken of [...wecker]) {
      try {
        wecken();
      } catch {
        // Ein fehlerhafter Strom darf die anderen nicht aufhalten.
      }
    }
  }

  function beiMeldung(nutzlast: string): void {
    if (!isId("conversation", nutzlast)) return;
    const wecker = abos.get(nutzlast);
    if (wecker) weckeAlle(wecker);
  }

  function beiBereit(): void {
    for (const wecker of abos.values()) weckeAlle(wecker);
  }

  function entfernen(conversationId: string, wecken: Wecker): boolean {
    const wecker = abos.get(conversationId);
    if (!wecker?.delete(wecken)) return false;
    if (wecker.size === 0) abos.delete(conversationId);
    anzahl -= 1;
    return true;
  }

  async function stoppenWennLeer(): Promise<void> {
    await nacheinander(async () => {
      if (anzahl > 0 || verbindung === undefined) return;
      const alt = verbindung;
      verbindung = undefined;
      try {
        await alt.unlisten();
      } catch {
        // Verbindung schon weg: nichts mehr abzumelden.
      }
    });
  }

  return {
    async abonnieren(conversationId, wecken) {
      // Zuerst eintragen, damit eine Meldung direkt nach dem Start des LISTEN schon ankommt.
      const eigener: Wecker = () => wecken();
      let wecker = abos.get(conversationId);
      if (!wecker) {
        wecker = new Set();
        abos.set(conversationId, wecker);
      }
      wecker.add(eigener);
      anzahl += 1;

      try {
        await nacheinander(async () => {
          if (verbindung === undefined)
            verbindung = await quelle.listen(kanal, beiMeldung, beiBereit);
        });
      } catch (fehler) {
        entfernen(conversationId, eigener);
        throw fehler;
      }

      let abgemeldet = false;
      return async () => {
        if (abgemeldet) return;
        abgemeldet = true;
        if (entfernen(conversationId, eigener)) await stoppenWennLeer();
      };
    },
    get anzahl() {
      return anzahl;
    },
    get hoertZu() {
      return verbindung !== undefined;
    },
  };
}
