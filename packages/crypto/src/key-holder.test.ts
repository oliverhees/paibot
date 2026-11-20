/**
 * PaiBot – Tests für den Signaturschlüssel im Speicher.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { createSigningKeyHolder, generateSigningKey, isCryptoError, sign, verify } from "./index";

function reasonOf(error: unknown): string | undefined {
  return isCryptoError(error) ? error.reason : undefined;
}

const KEY_ID = `sch_0${"7".repeat(25)}`;

describe("createSigningKeyHolder", () => {
  it("lädt einmal und ruft den Lader in current() nie", async () => {
    const pair = generateSigningKey();
    let calls = 0;
    const holder = createSigningKeyHolder(async () => {
      calls++;
      return { keyId: KEY_ID, ...pair };
    });
    expect(holder.loaded).toBe(false);
    await expect(holder.current()).rejects.toSatisfy(
      (e: unknown) => reasonOf(e) === "schluessel_nicht_geladen",
    );
    await holder.load();
    expect(holder.loaded).toBe(true);
    for (let i = 0; i < 5; i++) {
      const key = await holder.current();
      const data = new TextEncoder().encode(`Beleg ${i}`);
      expect(verify(pair.publicKey, data, sign(key.privateKey, data))).toBe(true);
    }
    expect(calls).toBe(1);
  });

  it("zeigt den privaten Teil nicht in JSON, Kopien, Schlüssel-Listen oder inspect", async () => {
    const pair = generateSigningKey();
    const holder = createSigningKeyHolder(async () => ({ keyId: KEY_ID, ...pair }));
    const key = await holder.load();
    const texts = [
      JSON.stringify(key),
      JSON.stringify({ ...key }),
      JSON.stringify(holder),
      Object.keys(key).join(","),
      inspect(key, { showHidden: true, depth: 5 }),
      inspect(holder, { showHidden: true, depth: 5 }),
      String(Object.entries(key)),
    ];
    for (const text of texts) expect(text).not.toContain(pair.privateKey);
    expect(key.privateKey).toBe(pair.privateKey);
    expect(key.keyId).toBe(KEY_ID);
  });

  it("lehnt einen privaten Teil ab, der nicht zum öffentlichen passt, und behält den alten", async () => {
    const good = generateSigningKey();
    const other = generateSigningKey();
    let next = { keyId: KEY_ID, ...good };
    const holder = createSigningKeyHolder(async () => next);
    await holder.load();
    next = { keyId: KEY_ID, publicKey: good.publicKey, privateKey: other.privateKey };
    await expect(holder.load()).rejects.toSatisfy(
      (e: unknown) => reasonOf(e) === "schluessel_nicht_geladen",
    );
    expect((await holder.current()).privateKey).toBe(good.privateKey);
    next = { keyId: KEY_ID, publicKey: good.publicKey, privateKey: "kein-schluessel" };
    await expect(holder.load()).rejects.toSatisfy(
      (e: unknown) => reasonOf(e) === "schluessel_nicht_geladen",
    );
  });

  it("discard verwirft den Schlüssel, auch für früher herausgegebene Objekte", async () => {
    const pair = generateSigningKey();
    const holder = createSigningKeyHolder(async () => ({ keyId: KEY_ID, ...pair }));
    const key = await holder.load();
    holder.discard();
    expect(holder.loaded).toBe(false);
    expect(() => key.privateKey).toThrow();
    await expect(holder.current()).rejects.toSatisfy(
      (e: unknown) => reasonOf(e) === "schluessel_nicht_geladen",
    );
  });

  it("ein neues load nach einem Schlüsselwechsel ersetzt den alten Schlüssel", async () => {
    const first = generateSigningKey();
    const second = generateSigningKey();
    let next = { keyId: KEY_ID, ...first };
    const holder = createSigningKeyHolder(async () => next);
    const old = await holder.load();
    next = { keyId: `sch_0${"8".repeat(25)}`, ...second };
    await holder.load();
    expect((await holder.current()).privateKey).toBe(second.privateKey);
    expect(() => old.privateKey).toThrow();
  });
});
