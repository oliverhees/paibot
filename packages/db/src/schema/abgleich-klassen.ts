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

/**
 * Ob eine Tabelle Geheimnisse enthält und was ein Abgleich damit tun darf:
 *
 * - `nein`: kein Geheimnis in der Tabelle.
 * - `nie`: Die genannten Spalten verlassen den Ort nie (auch nicht verschlüsselt).
 * - `je-ort-neu-verschluesselt`: Die genannten Spalten sind Geheimtext. Sie gehen nie als
 *   Geheimtext zu einem anderen Ort, sondern nur auf ausdrückliche Wahl am Zielort, der sie mit
 *   seinem eigenen Schlüssel neu verschlüsselt.
 */
export const ABGLEICH_GEHEIM_WERTE = ["nein", "nie", "je-ort-neu-verschluesselt"] as const;
export type AbgleichGeheim = (typeof ABGLEICH_GEHEIM_WERTE)[number];

/** Klasse einer Tabelle, der Grund, warum sie so eingeordnet ist, und die Kennzeichnung der Geheimnisse. */
export interface AbgleichEintrag {
  readonly klasse: AbgleichKlasse;
  readonly grund: string;
  readonly geheim: AbgleichGeheim;
  /** Spalten mit Geheimnis; bei `geheim: "nein"` leer, sonst mindestens eine. */
  readonly spalten?: readonly string[];
  /** Spalten, die nach einem Geheimnis aussehen (`…_enc`, `…_hash`, `…token`), aber keines sind. */
  readonly oeffentlich?: readonly string[];
}

/** Tabellen im Schema `public`, nach Namen in der Datenbank. */
export const ABGLEICH_KLASSEN: Readonly<Record<string, AbgleichEintrag>> = {
  // A: nur anhängen
  belege: {
    klasse: "A",
    geheim: "nein",
    oeffentlich: ["prev_hash"],
    grund: "Beleg-Protokoll, verkettet und nur anhängen; ein Trigger weist Ändern und Löschen ab.",
  },
  rules: {
    klasse: "A",
    geheim: "nein",
    grund:
      "Regeln des Tors, nur anhängen; jede Änderung ist eine neue Zeile mit höherer Fassung (Trigger).",
  },
  app_tools: {
    klasse: "A",
    geheim: "nein",
    grund: "Fassungen der Werkzeuge einer App, nur anhängen (Trigger); gültig ist die neueste.",
  },
  bot_app_grants: {
    klasse: "A",
    geheim: "nein",
    grund:
      "Zugriff eines Bots auf eine App, nur anhängen (Trigger); gültig ist die neueste Zeile je Bot und App.",
  },
  conversation_events: {
    klasse: "A",
    geheim: "nein",
    grund:
      "Ereignis-Strom je Unterhaltung mit fester Nummer je Ereignis; gelöscht werden nur Zwischenstücke der Antwort (`text.delta`, `draft.delta`) und alles mit der Unterhaltung.",
  },

  // B: letzter Stand
  settings: {
    klasse: "B",
    geheim: "nie",
    spalten: ["setup_code_hash"],
    grund:
      "Einstellungen der Installation, eine Zeile, wird überschrieben. Der Abdruck des Einrichtungs-Codes (`setup_code_hash`) bleibt am Ort.",
  },
  providers: {
    klasse: "B",
    geheim: "je-ort-neu-verschluesselt",
    spalten: ["api_key_enc", "management_key_enc"],
    grund:
      "Anbieter mit verschlüsselten Schlüsseln (`api_key_enc`, `management_key_enc`); wird geändert, es zählt der neueste Stand. Die Schlüssel gehen nie als Geheimtext zu einem anderen Ort, nur auf ausdrückliche Wahl am Zielort neu verschlüsselt.",
  },
  models: {
    klasse: "B",
    geheim: "nein",
    grund: "Modelle eines Anbieters; werden geändert, es zählt der neueste Stand.",
  },
  bots: {
    klasse: "B",
    geheim: "nein",
    grund: "Bots mit Name, Anweisung und Modell; werden geändert.",
  },
  conversations: {
    klasse: "B",
    geheim: "nein",
    grund: "Unterhaltungen mit Titel und Schleusen-Einstellung; werden geändert und gelöscht.",
  },
  messages: {
    klasse: "B",
    geheim: "nein",
    grund:
      "Nachrichten; eine Antwort wird beim Schreiben fortgeschrieben (Status, Inhalt, Zähler), es zählt der Endstand.",
  },
  runs: {
    klasse: "B",
    geheim: "nein",
    grund:
      "Läufe eines Bots; der Zustand wird fortgeschrieben, es zählt der Endstand. Laufende Läufe gehören dem Ort, an dem sie laufen.",
  },
  tool_calls: {
    klasse: "B",
    geheim: "nein",
    grund: "Werkzeug-Aufrufe eines Laufs; der Zustand wird fortgeschrieben, es zählt der Endstand.",
  },
  apps: {
    klasse: "B",
    geheim: "je-ort-neu-verschluesselt",
    spalten: ["token_enc"],
    grund:
      "Verbundene Apps mit verschlüsseltem Token (`token_enc`); werden geändert und getrennt, nie gelöscht. Der Token geht nie als Geheimtext zu einem anderen Ort, nur auf ausdrückliche Wahl am Zielort neu verschlüsselt.",
  },
  owner: {
    klasse: "B",
    geheim: "nie",
    spalten: ["password_hash"],
    grund:
      "Der Besitzer mit Passwort-Abdruck, höchstens eine Zeile; wird geändert. Der Passwort-Abdruck ist ein Geheimnis und geht nie offen oder als Geheimtext zu einem anderen Ort; Änderungen laufen nur über einen gekoppelten, verschlüsselten Kanal.",
  },

  // C: bleibt am Ort
  installation_keys: {
    klasse: "C",
    geheim: "nie",
    spalten: ["private_key_enc"],
    grund:
      "Signaturschlüssel der Installation; der private Teil verlässt den Ort nie. Der öffentliche Teil wird später über die Tabelle der Orte verteilt.",
  },
  sessions: {
    klasse: "C",
    geheim: "nie",
    spalten: ["id"],
    grund:
      "Angemeldete Sitzungen eines Ortes; gelten nur dort. Die Kennung ist der Abdruck des Sitzungs-Tokens und verlässt den Ort nie.",
  },
  geraete: {
    klasse: "C",
    geheim: "nie",
    spalten: ["token_hash"],
    grund: "Bekannte Geräte (Cookie-Abdrücke); gelten nur an dem Ort, der sie ausgestellt hat.",
  },
  rate_limits: {
    klasse: "C",
    geheim: "nein",
    grund: "Zähler der Versuchsgrenzen; Zeitfenster eines Ortes.",
  },
  schleuse_zustand: {
    klasse: "C",
    geheim: "nein",
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
    geheim: "nein",
    grund: "Warteschlange (pg-boss); laufende Läufe werden beim Wechsel beendet, nicht nachgeholt.",
  },
  drizzle: {
    klasse: "C",
    geheim: "nein",
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

/** Namen von Spalten, die nach einem Geheimnis aussehen: `…_enc`, `…_hash`, `token` oder `…_token`. */
export const GEHEIMNIS_SPALTE = /(?:_enc|_hash)$|(?:^|_)token$/;

/**
 * Prüft die Kennzeichnung der Geheimnisse. `spaltenJeTabelle` nennt je Tabelle ihre Spalten. Jede
 * Spalte, die nach einem Geheimnis aussieht (`GEHEIMNIS_SPALTE`), muss in `spalten` oder in
 * `oeffentlich` ihrer Tabelle stehen; genannte Spalten müssen es geben; `spalten` ist genau bei
 * `geheim` ungleich `nein` gefüllt. Gibt die Meldungen zurück (leer = in Ordnung).
 */
export function abgleichGeheimFehler(
  spaltenJeTabelle: Readonly<Record<string, readonly string[]>>,
  zuordnung: Readonly<Record<string, AbgleichEintrag>>,
): string[] {
  const fehler: string[] = [];
  for (const [tabelle, spalten] of Object.entries(spaltenJeTabelle)) {
    const eintrag = Object.hasOwn(zuordnung, tabelle) ? zuordnung[tabelle] : undefined;
    if (eintrag === undefined) continue; // fehlende Klasse meldet `abgleichKlassenFehler`
    const gekennzeichnet = new Set([...(eintrag.spalten ?? []), ...(eintrag.oeffentlich ?? [])]);
    for (const spalte of spalten) {
      if (GEHEIMNIS_SPALTE.test(spalte) && !gekennzeichnet.has(spalte)) {
        fehler.push(
          `Spalte ${tabelle}.${spalte} sieht nach einem Geheimnis aus und ist nicht gekennzeichnet.`,
        );
      }
    }
    for (const spalte of gekennzeichnet) {
      if (!spalten.includes(spalte)) fehler.push(`Spalte ${tabelle}.${spalte} gibt es nicht.`);
    }
  }
  for (const [tabelle, eintrag] of Object.entries(zuordnung)) {
    if (!(ABGLEICH_GEHEIM_WERTE as readonly string[]).includes(eintrag.geheim)) {
      fehler.push(`Tabelle ${tabelle}: unbekannte Kennzeichnung ${String(eintrag.geheim)}.`);
      continue;
    }
    const mitGeheimnis = (eintrag.spalten ?? []).length > 0;
    if (eintrag.geheim === "nein" && mitGeheimnis) {
      fehler.push(`Tabelle ${tabelle}: Spalten mit Geheimnis, aber geheim ist nein.`);
    }
    if (eintrag.geheim !== "nein" && !mitGeheimnis) {
      fehler.push(
        `Tabelle ${tabelle}: geheim ist ${eintrag.geheim}, aber es sind keine Spalten genannt.`,
      );
    }
  }
  return fehler;
}
