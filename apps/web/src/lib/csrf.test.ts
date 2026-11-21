/**
 * PaiBot – Tests der Prüfung gegen untergeschobene Anfragen: Herkunft und Prüfzeichen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { deriveKey, loadMasterSecret } from "@paibot/crypto";
import { describe, expect, it } from "vitest";
import {
  istVeraendernd,
  pruefeHerkunft,
  pruefePruefzeichen,
  pruefzeichenSitzung,
  pruefzeichenVorab,
  pruefzeichenZuCookie,
} from "./csrf";
import { testGeheimnis } from "./zugang/testing";

const schluessel = deriveKey(loadMasterSecret({ PAIBOT_SECRET: testGeheimnis() }), "session-v1");
const ORIGIN = "https://paibot.example.de";

describe("Herkunft", () => {
  it("nur genau der Origin von APP_URL", () => {
    expect(pruefeHerkunft(new Headers({ origin: ORIGIN }), ORIGIN)).toBe("ok");
    for (const o of ["http://paibot.example.de", `${ORIGIN}:444`, "https://evil.de", "null"]) {
      expect(pruefeHerkunft(new Headers({ origin: o }), ORIGIN)).toBe("herkunft_falsch");
    }
  });
  it("fehlender Kopf oder fehlende APP_URL: abgelehnt", () => {
    expect(pruefeHerkunft(new Headers(), ORIGIN)).toBe("herkunft_falsch");
    expect(pruefeHerkunft(new Headers({ origin: ORIGIN }), undefined)).toBe("herkunft_falsch");
  });
  it("Sec-Fetch-Site muss same-origin sein, wenn vorhanden", () => {
    const kopf = (s: string) => new Headers({ origin: ORIGIN, "sec-fetch-site": s });
    expect(pruefeHerkunft(kopf("same-origin"), ORIGIN)).toBe("ok");
    expect(pruefeHerkunft(kopf("same-site"), ORIGIN)).toBe("herkunft_falsch");
    expect(pruefeHerkunft(kopf("cross-site"), ORIGIN)).toBe("herkunft_falsch");
  });
});

describe("Prüfzeichen", () => {
  it("abgeleitet aus Sitzung bzw. Vorab-Cookie; beide verschieden und base64url", () => {
    const s = pruefzeichenSitzung(schluessel, "a".repeat(64));
    const v = pruefzeichenVorab(schluessel, "a".repeat(64));
    expect(s).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(s).not.toBe(v);
    expect(pruefzeichenZuCookie(schluessel, "token")).not.toBe(
      pruefzeichenZuCookie(schluessel, "token2"),
    );
  });
  it("Vergleich: fehlend, leer oder falsch → pruefzeichen_fehlt", () => {
    const richtig = pruefzeichenVorab(schluessel, "wert");
    const kopf = (w?: string) => new Headers(w === undefined ? {} : { "X-Pb-Pruefzeichen": w });
    expect(pruefePruefzeichen(kopf(richtig), [richtig])).toBe("ok");
    expect(pruefePruefzeichen(kopf(), [richtig])).toBe("pruefzeichen_fehlt");
    expect(pruefePruefzeichen(kopf(""), [richtig])).toBe("pruefzeichen_fehlt");
    expect(pruefePruefzeichen(kopf(`${richtig}x`), [richtig])).toBe("pruefzeichen_fehlt");
    expect(pruefePruefzeichen(kopf(richtig), [undefined])).toBe("pruefzeichen_fehlt");
  });
  it("verändernd sind alle Methoden außer GET, HEAD, OPTIONS", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) expect(istVeraendernd(m)).toBe(true);
    for (const m of ["GET", "HEAD", "OPTIONS"]) expect(istVeraendernd(m)).toBe(false);
  });
});
