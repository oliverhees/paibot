/**
 * PaiBot – Test: Jede Tabelle der Datenbank hat eine Abgleich-Klasse (A, B oder C), und keine
 * Klasse gehört zu einer Tabelle, die es nicht gibt. Die Tabellen kommen aus dem echten
 * Drizzle-Schema, nicht aus einer zweiten Liste. Wer eine Tabelle anlegt, trägt ihre Klasse in
 * `packages/db/src/schema/abgleich-klassen.ts` ein; sonst wird dieser Test rot.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-23
 */

import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { APP_TABLE_RIGHTS, QUEUE_SCHEMA_NAME } from "./rollen";
import * as schema from "./schema";
import {
  ABGLEICH_KLASSEN,
  ABGLEICH_KLASSEN_FREMDE_SCHEMAS,
  ABGLEICH_KLASSEN_WERTE,
  type AbgleichEintrag,
  abgleichKlassenFehler,
} from "./schema/abgleich-klassen";

const TABELLEN = (Object.values(schema) as unknown[])
  .filter((wert): wert is PgTable => is(wert, PgTable))
  .map((tabelle) => getTableConfig(tabelle).name);

describe("Abgleich-Klassen der Tabellen", () => {
  it("das Schema hat Tabellen (der Test sieht etwas)", () => {
    expect(TABELLEN.length).toBeGreaterThan(10);
    expect(TABELLEN).toContain("belege");
  });

  it("jede Tabelle des Schemas hat eine Klasse, und keine Klasse gehört zu einer fehlenden Tabelle", () => {
    expect(abgleichKlassenFehler(TABELLEN, ABGLEICH_KLASSEN)).toEqual([]);
  });

  it("jede Klasse ist A, B oder C und hat eine Begründung", () => {
    for (const [name, eintrag] of Object.entries(ABGLEICH_KLASSEN)) {
      expect(ABGLEICH_KLASSEN_WERTE as readonly string[], name).toContain(eintrag.klasse);
      expect(eintrag.grund.trim().length, name).toBeGreaterThan(10);
    }
  });

  it("die Tabellen der Warteschlange und des Migrations-Stands bleiben am Ort (Klasse C)", () => {
    expect(Object.keys(ABGLEICH_KLASSEN_FREMDE_SCHEMAS).sort()).toEqual(["drizzle", "pgboss"]);
    expect(ABGLEICH_KLASSEN_FREMDE_SCHEMAS[QUEUE_SCHEMA_NAME]?.klasse).toBe("C");
    expect(ABGLEICH_KLASSEN_FREMDE_SCHEMAS.drizzle?.klasse).toBe("C");
    // Kein Name aus den fremden Schemas ist zugleich eine Tabelle des Schemas.
    for (const name of Object.keys(ABGLEICH_KLASSEN_FREMDE_SCHEMAS)) {
      expect(TABELLEN).not.toContain(name);
    }
  });

  it("Tabellen, in denen die App nur lesen und anlegen darf, sind Klasse A", () => {
    const nurAnhaengen = Object.entries(APP_TABLE_RIGHTS)
      .filter(([, rechte]) => rechte === "select" || rechte === "select, insert")
      .map(([name]) => name);
    expect(nurAnhaengen.length).toBeGreaterThan(0);
    for (const name of nurAnhaengen) {
      expect(ABGLEICH_KLASSEN[name]?.klasse, name).toBe("A");
    }
  });

  it("Sitzungen, Geräte, Versuchszähler und der Zustand der Schleuse bleiben am Ort", () => {
    for (const name of ["sessions", "geraete", "rate_limits", "schleuse_zustand"]) {
      expect(ABGLEICH_KLASSEN[name]?.klasse, name).toBe("C");
    }
  });
});

describe("Gegenproben der Prüfung", () => {
  const ZUORDNUNG: Record<string, AbgleichEintrag> = {
    eins: { klasse: "A", grund: "Beispiel, nur anhängen." },
    zwei: { klasse: "B", grund: "Beispiel, letzter Stand." },
  };

  it("eine Zuordnung zu genau den Tabellen ist in Ordnung", () => {
    expect(abgleichKlassenFehler(["eins", "zwei"], ZUORDNUNG)).toEqual([]);
  });

  it("neue Tabelle ohne Klasse: Meldung", () => {
    expect(abgleichKlassenFehler(["eins", "zwei", "drei"], ZUORDNUNG)).toEqual([
      "Tabelle drei hat keine Abgleich-Klasse.",
    ]);
  });

  it("Klasse ohne Tabelle: Meldung", () => {
    expect(abgleichKlassenFehler(["eins"], ZUORDNUNG)).toEqual([
      "Klasse für zwei, aber es gibt die Tabelle nicht.",
    ]);
  });

  it("unbekannte Klasse und leere Begründung: Meldung", () => {
    const schlecht = {
      eins: { klasse: "D", grund: "Beispiel." },
      zwei: { klasse: "B", grund: "  " },
    } as unknown as Record<string, AbgleichEintrag>;
    expect(abgleichKlassenFehler(["eins", "zwei"], schlecht)).toEqual([
      "Tabelle eins: unbekannte Klasse D.",
      "Tabelle zwei: Begründung fehlt.",
    ]);
  });

  it("ein Name wie `toString` zählt nicht als Klasse (nur eigene Einträge)", () => {
    expect(abgleichKlassenFehler(["toString"], ZUORDNUNG)).toContain(
      "Tabelle toString hat keine Abgleich-Klasse.",
    );
  });
});
