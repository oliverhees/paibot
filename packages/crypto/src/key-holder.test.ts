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

  it("derselbe Schlüssel erneut geladen: das Fach bleibt, früher herausgegebene Objekte gelten weiter", async () => {
    const pair = generateSigningKey();
    // Der Lader liefert jedes Mal ein neues Objekt mit demselben Inhalt (wie aus der Datenbank).
    const holder = createSigningKeyHolder(async () => ({ keyId: KEY_ID, ...pair }));
    const first = await holder.load();
    const again = await holder.load();
    expect(again).toBe(first);
    expect(await holder.current()).toBe(first);
    const data = new TextEncoder().encode("Beleg");
    expect(verify(pair.publicKey, data, sign(first.privateKey, data))).toBe(true);
  });

  it("gleichzeitige Ladevorgänge mit demselben Schlüssel: alle Objekte bleiben gültig", async () => {
    const pair = generateSigningKey();
    const holder = createSigningKeyHolder(async () => ({ keyId: KEY_ID, ...pair }));
    const views = await Promise.all(Array.from({ length: 5 }, () => holder.load()));
    for (const view of views) expect(view.privateKey).toBe(pair.privateKey);
    expect(new Set(views).size).toBe(1);
  });

  it("gleichzeitige Ladevorgänge mit verschiedenen Schlüsseln: das zuletzt begonnene zählt", async () => {
    const older = generateSigningKey();
    const newer = generateSigningKey();
    const NEWER_ID = `sch_0${"9".repeat(25)}`;
    const pending: ((value: { keyId: string; publicKey: string; privateKey: string }) => void)[] =
      [];
    const holder = createSigningKeyHolder(
      () =>
        new Promise<{ keyId: string; publicKey: string; privateKey: string }>((resolve) => {
          pending.push(resolve);
        }),
    );
    const first = holder.load();
    const second = holder.load();
    // Das später begonnene Laden wird zuerst fertig, das ältere danach.
    pending[1]?.({ keyId: NEWER_ID, ...newer });
    const secondView = await second;
    pending[0]?.({ keyId: KEY_ID, ...older });
    const firstView = await first;
    expect(firstView).toBe(secondView);
    expect((await holder.current()).keyId).toBe(NEWER_ID);
    expect(secondView.privateKey).toBe(newer.privateKey);
    expect(inspect(holder, { showHidden: true, depth: 5 })).not.toContain(older.privateKey);
  });

  it("discard während eines Ladens: der Schlüssel kommt danach nicht zurück", async () => {
    const pair = generateSigningKey();
    let resolveLoad: (value: { keyId: string; publicKey: string; privateKey: string }) => void =
      () => undefined;
    const holder = createSigningKeyHolder(
      () =>
        new Promise<{ keyId: string; publicKey: string; privateKey: string }>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const loading = holder.load();
    holder.discard();
    resolveLoad({ keyId: KEY_ID, ...pair });
    await expect(loading).rejects.toSatisfy(
      (e: unknown) => reasonOf(e) === "schluessel_nicht_geladen",
    );
    expect(holder.loaded).toBe(false);
  });

  it("scheitert ein Laden, bleiben gehaltener Schlüssel und früher herausgegebene Objekte gültig, ohne Geheimnis im Fehler", async () => {
    const good = generateSigningKey();
    const other = generateSigningKey();
    let mode: "ok" | "falsch" | "wirft" = "ok";
    const holder = createSigningKeyHolder(async () => {
      if (mode === "wirft") throw new Error("Datenbank nicht erreichbar");
      if (mode === "falsch") {
        return { keyId: KEY_ID, publicKey: good.publicKey, privateKey: other.privateKey };
      }
      return { keyId: KEY_ID, ...good };
    });
    const view = await holder.load();
    mode = "falsch";
    const error = await holder.load().catch((e: unknown) => e);
    expect(reasonOf(error)).toBe("schluessel_nicht_geladen");
    const shown = [
      String(error),
      (error as Error).stack ?? "",
      JSON.stringify(error),
      inspect(error),
    ];
    for (const text of shown) {
      expect(text).not.toContain(other.privateKey);
      expect(text).not.toContain(good.privateKey);
    }
    mode = "wirft";
    await expect(holder.load()).rejects.toThrow("Datenbank nicht erreichbar");
    expect(view.privateKey).toBe(good.privateKey);
    expect(await holder.current()).toBe(view);
  });

  it("gleiche Kennung, anderer öffentlicher Teil: das Fach wird ersetzt, das alte Objekt wirft beim Signieren", async () => {
    const first = generateSigningKey();
    const second = generateSigningKey();
    let next = { keyId: KEY_ID, ...first };
    const holder = createSigningKeyHolder(async () => next);
    const old = await holder.load();
    next = { keyId: KEY_ID, ...second };
    const replaced = await holder.load();
    expect(replaced).not.toBe(old);
    expect(replaced.publicKey).toBe(second.publicKey);
    const data = new TextEncoder().encode("Beleg");
    expect(verify(second.publicKey, data, sign(replaced.privateKey, data))).toBe(true);
    expect(() => sign(old.privateKey, data)).toThrow();
  });
});
