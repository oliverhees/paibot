/**
 * PaiBot – Grenzen der MCP-Schicht: Zeit, Größe, Anzahl und Tiefe für alles, was von einem fremden
 * MCP-Server kommt oder dorthin geht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

/** Alle Grenzen der Schicht. Jede lässt sich je Verbindung enger oder weiter stellen. */
export interface McpGrenzen {
  /** Gesamtzeit für Verbinden und das Holen der ganzen Werkzeug-Liste (ms). */
  listeMs: number;
  /** Gesamtzeit für einen Werkzeug-Aufruf (ms). */
  aufrufMs: number;
  /** Zeit für das Schließen der Verbindung (ms), danach wird abgebrochen. */
  schliessenMs: number;
  /** Höchstzahl der Seiten beim Holen der Liste. */
  maxSeiten: number;
  /**
   * Höchstzahl der Anfragen, die eine Verbindung tatsächlich nach draußen schickt (Aufbau, alle
   * Seiten der Liste, Aufruf, Beenden). Der echte Bedarf liegt bei höchstens `maxSeiten` + 5.
   */
  maxAnfragen: number;
  /** Höchstzahl der Ereignisse in einer Antwort als Ereignis-Strom; darüber endet die Verbindung. */
  maxEreignisse: number;
  /** Höchstzahl der Werkzeuge je Server; weitere werden nicht übernommen. */
  maxWerkzeuge: number;
  /** Höchstzahl der Bytes einer Antwort des Servers (die Schicht begrenzt sie selbst, zusätzlich zur Hülle). */
  maxAntwortBytes: number;
  /** Höchstlänge der Argumente eines Aufrufs als JSON (Bytes). */
  maxArgumenteBytes: number;
  /** Höchstlänge des Eingabe-Schemas eines Werkzeugs als JSON (Bytes). */
  maxSchemaBytes: number;
  /** Höchste Verschachtelung im Eingabe-Schema (Wurzel = 1). */
  maxSchemaTiefe: number;
  /** Höchstlänge der bereinigten Beschreibung (Zeichen). */
  maxBeschreibungZeichen: number;
  /** Höchstlänge jedes Texts im gekürzten Schema (Zeichen). */
  maxFeldTextZeichen: number;
  /** Höchstzahl der Zeichen des Ergebnis-Texts, der ans Modell geht. */
  maxErgebnisZeichen: number;
  /** Höchstzahl der Knoten eines rohen Werkzeugs bzw. Ergebnisses, bevor etwas verarbeitet wird. */
  maxKnoten: number;
  /** Höchste Verschachtelung eines rohen Werkzeugs bzw. Ergebnisses. */
  maxRohTiefe: number;
}

/**
 * Standardwerte. Die Zeit- und Größenwerte folgen den Vorgaben der MCP-Anbindung; die Antwort-Größe
 * selbst begrenzt die Ausgangs-Hülle (`maxBodyBytes`, empfohlen `MCP_EMPFOHLENE_ANTWORT_BYTES`).
 */
export const STANDARD_GRENZEN: Readonly<McpGrenzen> = Object.freeze({
  listeMs: 10_000,
  aufrufMs: 30_000,
  schliessenMs: 3_000,
  maxSeiten: 10,
  maxAnfragen: 32,
  maxEreignisse: 2_000,
  maxWerkzeuge: 200,
  maxAntwortBytes: 2 * 1024 * 1024,
  maxArgumenteBytes: 8 * 1024,
  maxSchemaBytes: 16 * 1024,
  maxSchemaTiefe: 8,
  maxBeschreibungZeichen: 1_000,
  maxFeldTextZeichen: 300,
  maxErgebnisZeichen: 16_000,
  maxKnoten: 20_000,
  maxRohTiefe: 64,
});

/** Empfohlene Größe einer Antwort (Bytes) für die Ausgangs-Hülle (`maxBodyBytes`): 2 MB. */
export const MCP_EMPFOHLENE_ANTWORT_BYTES = STANDARD_GRENZEN.maxAntwortBytes;

/** Empfohlene Zeit ohne Datenfluss (ms) für die Ausgangs-Hülle (`idleTimeoutMs`). */
export const MCP_EMPFOHLENES_LEERLAUF_MS = 15_000;

/** Mischt eigene Werte über die Standardwerte; ungültige Werte (nicht positiv, nicht endlich) fallen weg. */
export function mitStandardGrenzen(eigene?: Partial<McpGrenzen>): McpGrenzen {
  const ergebnis: McpGrenzen = { ...STANDARD_GRENZEN };
  if (eigene === undefined) return ergebnis;
  for (const schluessel of Object.keys(STANDARD_GRENZEN) as (keyof McpGrenzen)[]) {
    const wert = eigene[schluessel];
    if (typeof wert === "number" && Number.isFinite(wert) && wert > 0) {
      ergebnis[schluessel] = Math.floor(wert);
    }
  }
  return ergebnis;
}
