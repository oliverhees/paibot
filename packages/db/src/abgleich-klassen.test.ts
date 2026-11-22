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
import { APPEND_ONLY_TABLES, QUEUE_SCHEMA_NAME } from "./rollen";
import * as schema from "./schema";
import {
  ABGLEICH_GEHEIM_WERTE,
  ABGLEICH_KLASSEN,
  ABGLEICH_KLASSEN_FREMDE_SCHEMAS,
  ABGLEICH_KLASSEN_WERTE,
  type AbgleichEintrag,
  abgleichGeheimFehler,
  abgleichKlassenFehler,
  GEHEIMNIS_SPALTE,
} from "./schema/abgleich-klassen";

const KONFIGURATIONEN = (Object.values(schema) as unknown[])
  .filter((wert): wert is PgTable => is(wert, PgTable))
  .map((tabelle) => getTableConfig(tabelle));
const TABELLEN = KONFIGURATIONEN.map((konfiguration) => konfiguration.name);
const SPALTEN_JE_TABELLE = Object.fromEntries(
  KONFIGURATIONEN.map((konfiguration) => [
    konfiguration.name,
    konfiguration.columns.map((spalte) => spalte.name),
  ]),
);

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

  it("Tabellen, auf denen die App weder ändern noch löschen darf (`APPEND_ONLY_TABLES`), sind Klasse A; nur ein Geheimnis, das den Ort nie verlässt, macht sie zu C", () => {
    expect(APPEND_ONLY_TABLES.length).toBeGreaterThan(0);
    for (const name of APPEND_ONLY_TABLES) {
      const eintrag = ABGLEICH_KLASSEN[name];
      expect(eintrag, name).toBeDefined();
      expect(eintrag?.klasse, name).toBe(eintrag?.geheim === "nie" ? "C" : "A");
    }
  });

  it("die Klasse jeder Tabelle ist festgenagelt (eine Änderung braucht eine bewusste Entscheidung)", () => {
    const erwartet: Record<string, "A" | "B" | "C"> = {
      belege: "A",
      rules: "A",
      app_tools: "A",
      bot_app_grants: "A",
      conversation_events: "A",
      messages: "B",
      runs: "B",
      tool_calls: "B",
      bots: "B",
      conversations: "B",
      models: "B",
      settings: "B",
      apps: "B",
      providers: "B",
      owner: "B",
      installation_keys: "C",
      sessions: "C",
      geraete: "C",
      rate_limits: "C",
      schleuse_zustand: "C",
    };
    expect(Object.keys(erwartet).sort()).toEqual([...TABELLEN].sort());
    for (const [name, klasse] of Object.entries(erwartet)) {
      expect(ABGLEICH_KLASSEN[name]?.klasse, name).toBe(klasse);
    }
  });

  it("Sitzungen, Geräte, Versuchszähler und der Zustand der Schleuse bleiben am Ort", () => {
    for (const name of ["sessions", "geraete", "rate_limits", "schleuse_zustand"]) {
      expect(ABGLEICH_KLASSEN[name]?.klasse, name).toBe("C");
    }
  });
});

describe("Kennzeichnung der Geheimnisse", () => {
  it("jede Spalte mit `_enc`, `_hash` oder `token` am Ende ist gekennzeichnet, jede genannte Spalte gibt es", () => {
    expect(abgleichGeheimFehler(SPALTEN_JE_TABELLE, ABGLEICH_KLASSEN)).toEqual([]);
  });

  it("der Test sieht Spalten dieser Art im echten Schema", () => {
    const gefunden = Object.entries(SPALTEN_JE_TABELLE).flatMap(([tabelle, spalten]) =>
      spalten
        .filter((spalte) => GEHEIMNIS_SPALTE.test(spalte))
        .map((spalte) => `${tabelle}.${spalte}`),
    );
    expect(gefunden).toEqual(
      expect.arrayContaining([
        "installation_keys.private_key_enc",
        "geraete.token_hash",
        "owner.password_hash",
        "providers.api_key_enc",
        "providers.management_key_enc",
        "apps.token_enc",
        "settings.setup_code_hash",
        "belege.prev_hash",
      ]),
    );
  });

  it("Signaturschlüssel, Sitzungen und Geräte verlassen den Ort nie (Klasse C, Kennzeichnung nie)", () => {
    for (const name of ["installation_keys", "sessions", "geraete"]) {
      expect(ABGLEICH_KLASSEN[name]?.klasse, name).toBe("C");
      expect(ABGLEICH_KLASSEN[name]?.geheim, name).toBe("nie");
    }
    expect(ABGLEICH_KLASSEN.installation_keys?.spalten).toEqual(["private_key_enc"]);
    expect(ABGLEICH_KLASSEN.sessions?.spalten).toEqual(["id"]);
    expect(ABGLEICH_KLASSEN.geraete?.spalten).toEqual(["token_hash"]);
  });

  it("Besitzer, Anbieter, Apps und Einstellungen sind gekennzeichnet", () => {
    expect(ABGLEICH_KLASSEN.owner).toMatchObject({
      geheim: "nur-gekoppelt-verschluesselt",
      spalten: ["password_hash"],
    });
    expect(ABGLEICH_KLASSEN.settings).toMatchObject({
      geheim: "nie",
      spalten: ["setup_code_hash"],
    });
    expect(ABGLEICH_KLASSEN.providers).toMatchObject({
      geheim: "je-ort-neu-verschluesselt",
      spalten: ["api_key_enc", "management_key_enc"],
    });
    expect(ABGLEICH_KLASSEN.apps).toMatchObject({
      geheim: "je-ort-neu-verschluesselt",
      spalten: ["token_enc"],
    });
  });

  it("jeder Eintrag hat eine bekannte Kennzeichnung", () => {
    for (const [name, eintrag] of Object.entries(ABGLEICH_KLASSEN)) {
      expect(ABGLEICH_GEHEIM_WERTE as readonly string[], name).toContain(eintrag.geheim);
    }
  });
});

describe("Gegenproben der Prüfung", () => {
  const ZUORDNUNG: Record<string, AbgleichEintrag> = {
    eins: { klasse: "A", geheim: "nein", grund: "Beispiel, nur anhängen." },
    zwei: { klasse: "B", geheim: "nein", grund: "Beispiel, letzter Stand." },
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
      eins: { klasse: "D", geheim: "nein", grund: "Beispiel." },
      zwei: { klasse: "B", geheim: "nein", grund: "  " },
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

  describe("Kennzeichnung der Geheimnisse", () => {
    const SPALTEN = {
      eins: ["id", "key_enc", "pw_hash", "token", "api_token", "max_output_tokens"],
    };

    it("Spalten, die nach einem Geheimnis aussehen, ohne Kennzeichnung: Meldung je Spalte", () => {
      expect(abgleichGeheimFehler(SPALTEN, ZUORDNUNG)).toEqual([
        "Spalte eins.key_enc sieht nach einem Geheimnis aus und ist nicht gekennzeichnet.",
        "Spalte eins.pw_hash sieht nach einem Geheimnis aus und ist nicht gekennzeichnet.",
        "Spalte eins.token sieht nach einem Geheimnis aus und ist nicht gekennzeichnet.",
        "Spalte eins.api_token sieht nach einem Geheimnis aus und ist nicht gekennzeichnet.",
      ]);
    });

    it("gekennzeichnete Spalten (Geheimnis oder öffentlich) sind in Ordnung; `max_output_tokens` ist kein Treffer", () => {
      const zuordnung = {
        ...ZUORDNUNG,
        eins: {
          klasse: "A",
          geheim: "nie",
          grund: "Beispiel.",
          spalten: ["key_enc", "token", "api_token"],
          oeffentlich: ["pw_hash"],
        },
      } as Record<string, AbgleichEintrag>;
      expect(abgleichGeheimFehler(SPALTEN, zuordnung)).toEqual([]);
    });

    it("genannte Spalte, die es nicht gibt: Meldung", () => {
      const zuordnung = {
        eins: { klasse: "A", geheim: "nie", grund: "Beispiel.", spalten: ["gibt_es_nicht_enc"] },
      } as Record<string, AbgleichEintrag>;
      expect(abgleichGeheimFehler({ eins: ["id"] }, zuordnung)).toEqual([
        "Spalte eins.gibt_es_nicht_enc gibt es nicht.",
      ]);
    });

    it("`nein` mit Spalten und Geheimnis ohne Spalten: Meldung", () => {
      const zuordnung = {
        eins: { klasse: "A", geheim: "nein", grund: "Beispiel.", spalten: ["id"] },
        zwei: { klasse: "B", geheim: "nie", grund: "Beispiel." },
      } as Record<string, AbgleichEintrag>;
      expect(abgleichGeheimFehler({ eins: ["id"], zwei: ["id"] }, zuordnung)).toEqual([
        "Tabelle eins: Spalten mit Geheimnis, aber geheim ist nein.",
        "Tabelle zwei: geheim ist nie, aber es sind keine Spalten genannt.",
      ]);
    });

    it("unbekannte Kennzeichnung: Meldung", () => {
      const zuordnung = {
        eins: { klasse: "A", geheim: "vielleicht", grund: "Beispiel." },
      } as unknown as Record<string, AbgleichEintrag>;
      expect(abgleichGeheimFehler({ eins: ["id"] }, zuordnung)).toEqual([
        "Tabelle eins: unbekannte Kennzeichnung vielleicht.",
      ]);
    });
  });

  it("dieselbe Spalte in spalten und in oeffentlich: Meldung", () => {
    const zuordnung = {
      eins: {
        klasse: "A",
        geheim: "nie",
        grund: "Beispiel.",
        spalten: ["pw_hash"],
        oeffentlich: ["pw_hash"],
      },
    } as Record<string, AbgleichEintrag>;
    expect(abgleichGeheimFehler({ eins: ["id", "pw_hash"] }, zuordnung)).toEqual([
      "Spalte eins.pw_hash steht in spalten und in oeffentlich.",
    ]);
  });

  it("der vierte Wert nur-gekoppelt-verschluesselt ist erlaubt und verlangt Spalten", () => {
    const gut = {
      eins: {
        klasse: "B",
        geheim: "nur-gekoppelt-verschluesselt",
        grund: "Beispiel.",
        spalten: ["pw_hash"],
      },
    } as Record<string, AbgleichEintrag>;
    expect(abgleichGeheimFehler({ eins: ["pw_hash"] }, gut)).toEqual([]);
    const ohne = {
      eins: { klasse: "B", geheim: "nur-gekoppelt-verschluesselt", grund: "Beispiel." },
    } as Record<string, AbgleichEintrag>;
    expect(abgleichGeheimFehler({ eins: ["pw_hash"] }, ohne)).toContain(
      "Tabelle eins: geheim ist nur-gekoppelt-verschluesselt, aber es sind keine Spalten genannt.",
    );
  });

  it("die vier Werte der Kennzeichnung", () => {
    expect([...ABGLEICH_GEHEIM_WERTE]).toEqual([
      "nein",
      "nie",
      "nur-gekoppelt-verschluesselt",
      "je-ort-neu-verschluesselt",
    ]);
  });

  describe("Namensmuster für Geheimnisse (GEHEIMNIS_SPALTE)", () => {
    it.each([
      "api_key",
      "apikey",
      "webhook_secret",
      "password",
      "passwd",
      "private_key",
      "refresh_tokens",
      "access_token",
      "access_token_cipher",
      "client_credentials",
      "token",
      "api_key_enc",
      "pw_hash",
      "signing_key",
      "Token",
    ])("%s sieht nach einem Geheimnis aus", (name) => {
      expect(GEHEIMNIS_SPALTE.test(name)).toBe(true);
    });

    it.each([
      "id",
      "key",
      "owner_id",
      "created_at",
      "tokens_in",
      "tokens_out",
      "max_output_tokens",
      "output_tokens",
      "max_tokens_per_run",
      "daily_token_budget",
      "history_token_limit",
      "hash",
      "signature",
      "fingerprint",
    ])("%s ist kein Treffer", (name) => {
      expect(GEHEIMNIS_SPALTE.test(name)).toBe(false);
    });

    it("eine Spalte mit Klartext-Geheimnis in einer Tabelle ohne Kennzeichnung wird gemeldet", () => {
      const spalten = {
        eins: [
          "id",
          "api_key",
          "webhook_secret",
          "password",
          "private_key",
          "refresh_tokens",
          "access_token_cipher",
        ],
      };
      const fehler = abgleichGeheimFehler(spalten, ZUORDNUNG);
      expect(fehler).toHaveLength(6);
      for (const name of spalten.eins.slice(1)) {
        expect(fehler).toContain(
          `Spalte eins.${name} sieht nach einem Geheimnis aus und ist nicht gekennzeichnet.`,
        );
      }
    });
  });
});
