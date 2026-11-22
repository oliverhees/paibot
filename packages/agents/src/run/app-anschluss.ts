/**
 * PaiBot – Anschluss an Apps (MCP): was der Lauf von draußen braucht
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

/**
 * Die Steuerung eines Laufs kennt die MCP-Bibliothek nicht. Sie bekommt diesen Anschluss mit
 * eigenen Typen; im Betrieb setzt ihn der Worker mit `@paibot/mcp` um (Hülle, Token, Zeit- und
 * Größengrenzen), im Test eine Attrappe. Der Anschluss kennt weder Datenbank noch Tor: Welche
 * Werkzeuge angeboten werden und ob ein Aufruf gelten darf, entscheidet die Steuerung mit der
 * Datenbank und das Tor.
 */

import type { AppId } from "@paibot/shared/ids";

/** Eine App, wie der Anschluss sie braucht (der Token bleibt im Anschluss). */
export interface AppInfo {
  readonly id: AppId;
  /** Kurzname für die Namen der Werkzeuge (`<kurzname>__<name>`). */
  readonly kurzname: string;
  /** Adresse des MCP-Endpunkts. */
  readonly url: string;
}

/** Ein Werkzeug aus der frisch abgerufenen Liste einer App, schon bereinigt. */
export interface AppListeEintrag {
  /** Name beim Server; geht nie an das Modell. */
  readonly originalName: string;
  /** Abdruck der Rohform in voller Länge (`sha256:…`). */
  readonly abdruck: string;
  /** Bereinigte Beschreibung (die auch an das Modell geht). */
  readonly beschreibung: string;
  /** Gekürztes Schema für das Modell; `null`, wenn das Werkzeug nicht prüfbar ist. */
  readonly schemaFuerModell: Record<string, unknown> | null;
  readonly bestaetigbar: boolean;
  readonly hinweisNurLesen: boolean | null;
  readonly hinweisZerstoerend: boolean | null;
}

/** Ausgang eines Aufrufs an eine App; der Text ist bereinigt und gekürzt, bei Fehlern ein fester Satz. */
export interface AppAufrufErgebnis {
  readonly status: "ok" | "fehler";
  readonly text: string;
  readonly gekuerzt: boolean;
  readonly fehlercode: string | null;
}

/** Die Verbindung eines Laufs zu den Apps; sie hält die Liste, die beim Lauf-Start abgerufen wurde. */
export interface AppLauf {
  /**
   * Ruft die Liste einer App ab (nur ihr Origin geht hinaus). Wirft, wenn das nicht gelingt; die
   * Steuerung bietet dann nichts von dieser App an.
   */
  holeListe(input: {
    readonly app: AppInfo;
    /** Zuordnung Original-Name → Modell-Name aus der Datenbank (nie fehlend). */
    readonly bekannteNamen: ReadonlyMap<string, string>;
    /** Modell-Namen anderer Apps der Installation. */
    readonly bereitsVergeben: ReadonlySet<string>;
    readonly signal: AbortSignal;
  }): Promise<readonly AppListeEintrag[]>;
  /** Prüft die Argumente eines Aufrufs gegen das Prüf-Schema des Werkzeugs aus der Liste dieses Laufs. */
  pruefeArgumente(appId: AppId, originalName: string, argumente: unknown): boolean;
  /** Ruft ein Werkzeug aus der Liste dieses Laufs auf. Wirft nie; Fehler kommen als `status: "fehler"`. */
  rufeAuf(input: {
    readonly app: AppInfo;
    readonly originalName: string;
    readonly argumente: unknown;
    readonly signal: AbortSignal;
  }): Promise<AppAufrufErgebnis>;
}

/** Meldung über ein Werkzeug, das nicht angeboten wird, obwohl der Besitzer es kennt. */
export interface AusgeschlossenMeldung {
  readonly appId: AppId;
  /** Bereinigte Kennung (höchstens 128 Zeichen); nie Text des Servers im Rohzustand. */
  readonly kennung: string;
  /** Fester Grund; nie Text des Servers. */
  readonly grund: string;
}

export interface AppAnschluss {
  /** Eine neue Verbindung für einen Lauf. */
  neuerLauf(): AppLauf;
  /**
   * Wird aufgerufen, wenn ein Werkzeug beim Aufbau des Registers ausgeschlossen wurde. Kennung
   * und Grund gehen nie an das Modell.
   */
  meldeAusgeschlossen(meldung: AusgeschlossenMeldung): void;
}
