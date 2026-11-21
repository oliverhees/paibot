/**
 * PaiBot – Tests der Brücke Transaktion → Warteschlange: Literale, Platzhalter, Ergebnis-Formen
 * und Einreihen in der Transaktion des Aufrufers (PGlite mit pg-boss).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { PGlite } from "@electric-sql/pglite";
import { newId } from "@paibot/shared/ids";
import { fromPglite, PgBoss } from "pg-boss";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildQueue } from "./pgboss-queue";
import { inlineSqlParameters, sqlLiteral, textSqlExecutor } from "./sql-text";
import { QUEUE_SCHEMA, RUN_QUEUE } from "./vertrag";

describe("sqlLiteral", () => {
  it("setzt einfache Werte als Literal", () => {
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(undefined)).toBe("NULL");
    expect(sqlLiteral(true)).toBe("TRUE");
    expect(sqlLiteral(false)).toBe("FALSE");
    expect(sqlLiteral(42)).toBe("42");
    expect(sqlLiteral(-1.5)).toBe("(-1.5)");
    expect(sqlLiteral(7n)).toBe("7");
    expect(sqlLiteral("abc")).toMatch(/^\$pb_[0-9a-f]{12}\$abc\$pb_[0-9a-f]{12}\$$/);
  });

  it("lehnt ab, was es nicht sicher darstellen kann", () => {
    expect(() => sqlLiteral(Number.NaN)).toThrow(TypeError);
    expect(() => sqlLiteral(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => sqlLiteral("a\u0000b")).toThrow(TypeError);
    expect(() => sqlLiteral({ a: 1 })).toThrow(TypeError);
    expect(() => sqlLiteral(["a"])).toThrow(TypeError);
    expect(() => sqlLiteral(new Date(Number.NaN))).toThrow(TypeError);
  });

  it("wählt ein Tag, das im Text nicht vorkommt", () => {
    const wert = "x $pb_000000000000$ y";
    const literal = sqlLiteral(wert);
    const tag = literal.slice(0, literal.indexOf("$", 1) + 1);
    expect(wert.includes(tag)).toBe(false);
  });
});

describe("inlineSqlParameters", () => {
  it("ersetzt Platzhalter, auch mehrfach und mit Umwandlung", () => {
    const text = inlineSqlParameters("select $1::int + $2, $1", [1, 2]);
    expect(text).toBe("select 1::int + 2, 1");
  });

  it("lässt Texte, Namen, Dollar-Texte und Kommentare unberührt", () => {
    const quelle =
      "select '$1', E'\\'$1', \"$1\", $$ $1 $$, $t$ $1 $t$ -- $1\n, /* $1 /* $1 */ */ $1";
    expect(inlineSqlParameters(quelle, [5])).toBe(
      "select '$1', E'\\'$1', \"$1\", $$ $1 $$, $t$ $1 $t$ -- $1\n, /* $1 /* $1 */ */ 5",
    );
  });

  it("wirft bei einem Platzhalter ohne Wert", () => {
    expect(() => inlineSqlParameters("select $2", ["a"])).toThrow(RangeError);
    expect(() => inlineSqlParameters("select $0", ["a"])).toThrow(RangeError);
  });
});

describe("textSqlExecutor gegen Postgres (PGlite)", () => {
  const offen: PGlite[] = [];
  afterEach(async () => {
    for (const pg of offen.splice(0)) await pg.close();
  });

  function neu(): PGlite {
    const pg = new PGlite();
    offen.push(pg);
    return pg;
  }

  it("Texte kommen Byte für Byte an, auch mit Anführungszeichen und Einschleus-Versuchen", async () => {
    const pg = neu();
    const executor = textSqlExecutor((text) => pg.query(text));
    const werte = [
      "O'Reilly",
      "'); drop table x; --",
      "$$ und $pb_abc$",
      "Rückstrich \\ und \\' Ende",
      '{"json":[1,"zwei"]}',
    ];
    for (const wert of werte) {
      const { rows } = await executor.executeSql("select $1::text as v", [wert]);
      expect(rows).toEqual([{ v: wert }]);
    }
    const { rows } = await executor.executeSql("select $1::text::json->'a' as v", ['{"a":3}']);
    expect(rows).toEqual([{ v: 3 }]);
  });

  it("nimmt Ergebnisse als Liste und als Objekt mit Zeilen an", async () => {
    const liste = textSqlExecutor(async () => [{ a: 1 }]);
    expect((await liste.executeSql("select 1")).rows).toEqual([{ a: 1 }]);
    const kaputt = textSqlExecutor(async () => 5);
    await expect(kaputt.executeSql("select 1")).rejects.toThrow(TypeError);
  });

  it("reiht in der Transaktion ein: Rückgängig nimmt den Auftrag mit zurück", async () => {
    const pg = neu();
    const boss = new PgBoss({ db: fromPglite(pg), backend: "pglite", schema: QUEUE_SCHEMA });
    const fehler = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const queue = buildQueue(boss, { releaseIntervalMs: 200 });
    try {
      await queue.start();
      const conversationId = newId("conversation");
      await expect(
        pg.transaction(async (tx) => {
          await queue.enqueueRun(
            { runId: newId("run"), conversationId },
            { executor: textSqlExecutor((text) => tx.query(text)) },
          );
          throw new Error("abbrechen");
        }),
      ).rejects.toThrow("abbrechen");
      const zaehlen = async () =>
        (
          await pg.query<{ n: number }>(
            `select count(*)::int as n from ${QUEUE_SCHEMA}.job where name = $1`,
            [RUN_QUEUE.name],
          )
        ).rows[0]?.n;
      expect(await zaehlen()).toBe(0);

      const runId = newId("run");
      await pg.transaction(async (tx) => {
        await queue.enqueueRun(
          { runId, conversationId },
          { executor: textSqlExecutor((text) => tx.query(text)) },
        );
      });
      expect(await zaehlen()).toBe(1);
      const { rows } = await pg.query<{ data: unknown; singleton_key: string }>(
        `select data, singleton_key from ${QUEUE_SCHEMA}.job where name = $1`,
        [RUN_QUEUE.name],
      );
      expect(rows).toEqual([{ data: { runId, conversationId }, singleton_key: conversationId }]);
    } finally {
      await queue.stop({ timeoutMs: 1000 });
      fehler.mockRestore();
    }
  });
});
