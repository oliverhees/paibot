/**
 * PaiBot – Tests für Fehlercodes, Fehlerklasse und Antwort-Hülle der API.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { apiError, apiErrorFrom, apiOk, apiResponse, errorBody, okBody } from "./api";
import {
  CODE_PATTERN,
  ERROR_CODES,
  ERROR_STATUS,
  FIELD_CODES,
  fieldErrorsFromZod,
  invalidInput,
  PaiBotError,
} from "./errors";

describe("Fehlercodes", () => {
  it("haben die vorgegebene Schreibweise und Liste", () => {
    for (const code of [...ERROR_CODES, ...FIELD_CODES]) expect(code).toMatch(CODE_PATTERN);
    expect(ERROR_CODES).toHaveLength(23);
    expect(ERROR_STATUS.schluessel_passt_nicht).toBe(502);
    expect(ERROR_STATUS.antwort_zu_gross).toBe(502);
    expect(ERROR_STATUS.zu_viele_versuche).toBe(429);
    expect(ERROR_STATUS.schleuse_blockiert).toBe(502);
    expect(ERROR_STATUS.nicht_angemeldet).toBe(401);
    expect(ERROR_STATUS.unterbrochen).toBe(500);
  });
});

describe("Antwort-Hülle", () => {
  it("Erfolg hat genau ok und daten in dieser Reihenfolge", () => {
    const body = okBody({ id: 1 });
    expect(JSON.stringify(body)).toBe('{"ok":true,"daten":{"id":1}}');
    expect(apiOk(z.object({ id: z.number() })).parse(body)).toEqual(body);
  });

  it("Fehler nutzt Standardtext und lässt fehlende Felder weg", () => {
    const body = errorBody("nicht_gefunden");
    expect(JSON.stringify(body)).toBe(
      '{"ok":false,"fehler":{"code":"nicht_gefunden","text":"Das gibt es nicht (mehr)."}}',
    );
    expect(apiError.parse(body)).toEqual(body);
    expect(Object.keys(errorBody("kein_modell").fehler)).toEqual(["code", "text", "ausweg"]);
    expect("felder" in errorBody("eingabe_ungueltig", { felder: [] }).fehler).toBe(false);
  });

  it("lehnt null, fremde Codes und zusätzliche Felder ab", () => {
    expect(apiError.safeParse({ ok: false, fehler: { code: "kaputt", text: "x" } }).success).toBe(
      false,
    );
    expect(
      apiError.safeParse({ ok: false, fehler: { code: "intern", text: "x", ausweg: null } })
        .success,
    ).toBe(false);
    expect(apiOk(z.string()).safeParse({ ok: true, daten: "x", mehr: 1 }).success).toBe(false);
  });

  it("apiResponse unterscheidet Erfolg und Fehler", () => {
    const schema = apiResponse(z.string());
    expect(schema.parse(okBody("x"))).toEqual({ ok: true, daten: "x" });
    expect(schema.parse(errorBody("intern")).ok).toBe(false);
  });
});

describe("apiErrorFrom", () => {
  it("übernimmt Code, Status, Felder und Retry-After", () => {
    const result = apiErrorFrom(
      new PaiBotError("zu_viele_versuche", { retryAfterSeconds: 12.2, ausweg: "Später." }),
    );
    expect(result.status).toBe(429);
    expect(result.headers).toEqual({ "Retry-After": "13" });
    expect(result.body.fehler).toEqual({
      code: "zu_viele_versuche",
      text: "Zu viele Versuche.",
      ausweg: "Später.",
    });
  });

  it("macht aus unbekannten Fehlern intern, ohne Details zu verraten", () => {
    const result = apiErrorFrom(new Error("geheimer Stacktrace"));
    expect(result.status).toBe(500);
    expect(result.body.fehler.code).toBe("intern");
    expect(JSON.stringify(result.body)).not.toContain("geheim");
  });
});

describe("Feld-Fehler aus Zod", () => {
  it("ordnet typische Fehler kurzen Codes zu", () => {
    const schema = z.object({
      name: z.string().min(2).max(3),
      alter: z.number().int().min(0).max(5),
      mail: z.string().regex(/^x$/),
      liste: z.array(z.string()).min(1),
      pflicht: z.string(),
    });
    const short = schema.safeParse({ name: "a", alter: -1, mail: "y", liste: [] });
    expect(short.success).toBe(false);
    if (short.success) return;
    expect(fieldErrorsFromZod(short.error)).toEqual([
      { feld: "name", code: "zu_kurz" },
      { feld: "alter", code: "zu_klein" },
      { feld: "mail", code: "format" },
      { feld: "liste", code: "zu_kurz" },
      { feld: "pflicht", code: "fehlt" },
    ]);
    const long = schema.safeParse({ name: "abcd", alter: 9, mail: "x", liste: ["a"], pflicht: 1 });
    if (long.success) throw new Error("unerwartet gültig");
    const longInput = { name: "abcd", alter: 9, mail: "x", liste: ["a"], pflicht: 1 };
    expect(fieldErrorsFromZod(long.error, longInput)).toEqual([
      { feld: "name", code: "zu_lang" },
      { feld: "alter", code: "zu_gross" },
      { feld: "pflicht", code: "ungueltig" },
    ]);
    expect(fieldErrorsFromZod(short.error, { name: "a" })[4]).toEqual({
      feld: "pflicht",
      code: "fehlt",
    });
    const error = invalidInput(long.error, longInput);
    expect(error.code).toBe("eingabe_ungueltig");
    expect(error.status).toBe(400);
    expect(apiErrorFrom(error).body.fehler.felder).toHaveLength(3);
  });
});
