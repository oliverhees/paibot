/**
 * PaiBot – Datenbankschema: Abgleich-Klasse je Tabelle (Vertrag).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-23
 */
/*
 * Jede Tabelle der Datenbank trägt eine Klasse dafür, wie sie zwischen zwei Orten einer
 * Installation abgeglichen würde. Heute gibt es keinen Abgleich; die Zuordnung hält fest, was für
 * jede Tabelle gelten soll, damit später nicht jede Tabelle nachträglich eingeordnet werden muss.
 * Ein Test (`packages/db/src/abgleich-klassen.test.ts`) liest die Tabellen aus dem Schema und
 * verlangt für jede eine Klasse; eine neue Tabelle ohne Klasse macht ihn rot.
 *
 * - **A: nur anhängen.** Zeilen kommen dazu und ändern sich nicht (oder nur auf festen, einseitigen
 *   Wegen). Der Abgleich überträgt neue Zeilen in ihrer Reihenfolge.
 * - **B: letzter Stand.** Zeilen werden geändert; es zählt der neueste Stand je Zeile.
 * - **C: bleibt am Ort.** Zeilen gelten nur an dem Ort, an dem sie entstanden sind; sie werden nicht
 *   abgeglichen.
 *
 * Wer eine Migration mit einer neuen Tabelle schreibt, trägt die Tabelle hier mit Klasse und einem
 * Satz Begründung ein, im selben Commit.
 *
 */

/** Die drei Klassen. */
export const ABGLEICH_KLASSEN_WERTE = ["A", "B", "C"] as const;
export type AbgleichKlasse = (typeof ABGLEICH_KLASSEN_WERTE)[number];

/** Klasse einer Tabelle und der Grund, warum sie so eingeordnet ist. */
export interface AbgleichEintrag {
  readonly klasse: AbgleichKlasse;
  readonly grund: string;
}

/** Tabellen im Schema `public`, nach Namen in der Datenbank. */
export const ABGLEICH_KLASSEN: Readonly<Record<string, AbgleichEintrag>> = {
  // A: nur anhängen
  belege: {
    klasse: "A",
    grund: "Beleg-Protokoll, verkettet und nur anhängen; ein Trigger weist Ändern und Löschen ab.",
  },
  rules: {
    klasse: "A",
    grund:
      "Regeln des Tors, nur anhängen; jede Änderung ist eine neue Zeile mit höherer Fassung (Trigger).",
  },
  app_tools: {
    klasse: "A",
    grund: "Fassungen der Werkzeuge einer App, nur anhängen (Trigger); gültig ist die neueste.",
  },
  bot_app_grants: {
    klasse: "A",
    grund:
      "Zugriff eines Bots auf eine App, nur anhängen (Trigger); gültig ist die neueste Zeile je Bot und App.",
  },
  conversation_events: {
    klasse: "A",
    grund:
      "Ereignis-Strom je Unterhaltung mit fester Nummer je Ereignis; gelöscht werden nur Zwischenstücke der Antwort (`text.delta`, `draft.delta`) und alles mit der Unterhaltung.",
  },

  // B: letzter Stand
  settings: {
    klasse: "B",
    grund: "Einstellungen der Installation, eine Zeile, wird überschrieben.",
  },
  providers: {
    klasse: "B",
    grund: "Anbieter mit verschlüsseltem Schlüssel; wird geändert, es zählt der neueste Stand.",
  },
  models: {
    klasse: "B",
    grund: "Modelle eines Anbieters; werden geändert, es zählt der neueste Stand.",
  },
  bots: { klasse: "B", grund: "Bots mit Name, Anweisung und Modell; werden geändert." },
  conversations: {
    klasse: "B",
    grund: "Unterhaltungen mit Titel und Schleusen-Einstellung; werden geändert und gelöscht.",
  },
  messages: {
    klasse: "B",
    grund:
      "Nachrichten; eine Antwort wird beim Schreiben fortgeschrieben (Status, Inhalt, Zähler), es zählt der Endstand.",
  },
  runs: {
    klasse: "B",
    grund:
      "Läufe eines Bots; der Zustand wird fortgeschrieben, es zählt der Endstand. Laufende Läufe gehören dem Ort, an dem sie laufen.",
  },
  tool_calls: {
    klasse: "B",
    grund: "Werkzeug-Aufrufe eines Laufs; der Zustand wird fortgeschrieben, es zählt der Endstand.",
  },
  apps: {
    klasse: "B",
    grund: "Verbundene Apps mit verschlüsseltem Token; werden geändert und getrennt, nie gelöscht.",
  },
  owner: {
    klasse: "B",
    grund: "Der Besitzer mit Passwort-Abdruck, höchstens eine Zeile; wird geändert.",
  },

  // C: bleibt am Ort
  installation_keys: {
    klasse: "C",
    grund:
      "Signaturschlüssel der Installation; der private Teil verlässt den Ort nie. Der öffentliche Teil wird später über die Tabelle der Orte verteilt.",
  },
  sessions: { klasse: "C", grund: "Angemeldete Sitzungen eines Ortes; gelten nur dort." },
  geraete: {
    klasse: "C",
    grund: "Bekannte Geräte (Cookie-Abdrücke); gelten nur an dem Ort, der sie ausgestellt hat.",
  },
  rate_limits: { klasse: "C", grund: "Zähler der Versuchsgrenzen; Zeitfenster eines Ortes." },
  schleuse_zustand: {
    klasse: "C",
    grund: "Zustand der Datenschleuse aus Sicht des Workers an diesem Ort; Zwischenstand.",
  },
};

/**
 * Schemas, deren Tabellen nicht aus dem Drizzle-Schema stammen, nach dem Namen des Schemas in der
 * Datenbank. Sie bleiben am Ort.
 */
export const ABGLEICH_KLASSEN_FREMDE_SCHEMAS: Readonly<Record<string, AbgleichEintrag>> = {
  pgboss: {
    klasse: "C",
    grund: "Warteschlange (pg-boss); laufende Läufe werden beim Wechsel beendet, nicht nachgeholt.",
  },
  drizzle: {
    klasse: "C",
    grund: "Stand der Migrationen dieses Ortes; Abgleich nur zwischen Orten mit gleichem Stand.",
  },
};

/**
 * Prüft eine Zuordnung gegen die Tabellen: Jede Tabelle hat eine Klasse, und keine Klasse gehört
 * zu einer Tabelle, die es nicht gibt. Gibt die Meldungen zurück (leer = in Ordnung).
 */
export function abgleichKlassenFehler(
  tabellen: readonly string[],
  zuordnung: Readonly<Record<string, AbgleichEintrag>>,
): string[] {
  const fehler: string[] = [];
  for (const name of [...tabellen].sort()) {
    if (!Object.hasOwn(zuordnung, name)) {
      fehler.push(`Tabelle ${name} hat keine Abgleich-Klasse.`);
    }
  }
  for (const name of Object.keys(zuordnung).sort()) {
    if (!tabellen.includes(name))
      fehler.push(`Klasse für ${name}, aber es gibt die Tabelle nicht.`);
    const eintrag = zuordnung[name] as AbgleichEintrag;
    if (!(ABGLEICH_KLASSEN_WERTE as readonly string[]).includes(eintrag.klasse)) {
      fehler.push(`Tabelle ${name}: unbekannte Klasse ${String(eintrag.klasse)}.`);
    }
    if (eintrag.grund.trim() === "") fehler.push(`Tabelle ${name}: Begründung fehlt.`);
  }
  return fehler;
}
