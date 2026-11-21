/**
 * PaiBot – Tests: Besitzer, Sitzungen und Rate-Limit.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createHash } from "node:crypto";
import { newId, type OwnerId, SESSION } from "@paibot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../client";
import { owner as ownerTabelle } from "../schema";
import { createTestDb } from "../testing";

import { geraete, owner, rateLimit, sessions } from "./index";
import { mitCode } from "./testhilfe";

const TAG = 24 * 60 * 60 * 1000;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const T0 = new Date("2026-11-20T10:00:00.000Z");
const nach = (basis: Date, ms: number) => new Date(basis.getTime() + ms);

describe("owner", () => {
  let db: Database;
  beforeEach(async () => {
    db = (await createTestDb()).db;
  });

  it("legt höchstens einen Besitzer an", async () => {
    expect(await owner.get(db)).toBeUndefined();
    const erster = await owner.create(db, { passwordHash: "hash-1" });
    expect(await owner.get(db)).toEqual(erster);
    await expect(owner.create(db, { passwordHash: "hash-2" })).rejects.toEqual(
      mitCode("einrichtung_fertig"),
    );
  });

  it("ändert das Passwort und merkt sich den Zeitpunkt", async () => {
    const o = await owner.create(db, { passwordHash: "alt" });
    const neu = await owner.updatePassword(db, o.id, "neu", T0);
    expect(neu).toMatchObject({ passwordHash: "neu", passwordChangedAt: T0.toISOString() });
    expect(await owner.updatePassword(db, newId("owner"), "x")).toBeUndefined();
  });
});

describe("sessions", () => {
  let db: Database;
  let ownerId: OwnerId;
  beforeEach(async () => {
    db = (await createTestDb()).db;
    ownerId = (await owner.create(db, { passwordHash: "h" })).id;
  });

  const anlegen = (token: string, now = T0, userAgent?: string) =>
    sessions.create(db, {
      tokenHash: hash(token),
      ownerId,
      authLevel: "password",
      method: "password",
      now,
      ...(userAgent === undefined ? {} : { userAgent }),
    });

  it("legt an und findet per Token-Hash", async () => {
    const s = await anlegen("a");
    expect(s).toMatchObject({
      id: hash("a"),
      ownerId,
      current: true,
      createdAt: T0.toISOString(),
      expiresAt: nach(T0, SESSION.slidingDays * TAG).toISOString(),
    });
    expect(s).not.toHaveProperty("userAgent");
    expect(await sessions.findByTokenHash(db, hash("a"), { now: T0 })).toEqual(s);
    expect(await sessions.findByTokenHash(db, hash("unbekannt"), { now: T0 })).toBeUndefined();
    expect(await sessions.findByTokenHash(db, "kein-hash")).toBeUndefined();
  });

  it("kürzt den User-Agent auf 200 Zeichen und weist ein falsches Hash-Format ab", async () => {
    const s = await anlegen("b", T0, "x".repeat(500));
    expect(s.userAgent).toHaveLength(200);
    await expect(
      sessions.create(db, {
        tokenHash: "zu-kurz",
        ownerId,
        authLevel: "password",
        method: "password",
      }),
    ).rejects.toEqual(mitCode("eingabe_ungueltig"));
  });

  it("eine abgelaufene Sitzung wird nicht gefunden und nicht verlängert", async () => {
    await anlegen("c");
    const spaeter = nach(T0, SESSION.slidingDays * TAG + 1);
    expect(await sessions.findByTokenHash(db, hash("c"), { now: spaeter })).toBeUndefined();
    expect(await sessions.extend(db, hash("c"), { now: spaeter })).toBeUndefined();
    expect(await sessions.list(db, ownerId, { now: spaeter })).toEqual([]);
  });

  it("verlängert gleitend, aber nie über die längste Dauer hinaus", async () => {
    await anlegen("d");
    const tag20 = nach(T0, 20 * TAG);
    const a = await sessions.extend(db, hash("d"), { now: tag20 });
    expect(a?.expiresAt).toBe(nach(tag20, SESSION.slidingDays * TAG).toISOString());
    expect(a?.lastSeenAt).toBe(tag20.toISOString());

    // Immer wieder verlängern bis kurz vor Tag 90.
    let jetzt = tag20;
    for (let i = 0; i < 3; i++) {
      jetzt = nach(jetzt, 20 * TAG);
      await sessions.extend(db, hash("d"), { now: jetzt });
    }
    const spaet = await sessions.findByTokenHash(db, hash("d"), { now: jetzt });
    expect(spaet?.expiresAt).toBe(nach(T0, SESSION.maxDays * TAG).toISOString());

    // Nach 90 Tagen ist Schluss, auch wenn die Sitzung ständig benutzt wurde.
    const nachMax = nach(T0, SESSION.maxDays * TAG + 1);
    expect(await sessions.findByTokenHash(db, hash("d"), { now: nachMax })).toBeUndefined();
  });

  it("beendet eine Sitzung", async () => {
    await anlegen("e");
    expect(await sessions.end(db, hash("e"))).toBe(true);
    expect(await sessions.end(db, hash("e"))).toBe(false);
    expect(await sessions.findByTokenHash(db, hash("e"), { now: T0 })).toBeUndefined();
  });

  it("beendet alle bis auf die aktuelle", async () => {
    await anlegen("1");
    await anlegen("2");
    await anlegen("3");
    expect(await sessions.endAllExcept(db, ownerId, hash("2"))).toBe(2);
    const rest = await sessions.list(db, ownerId, { currentTokenHash: hash("2"), now: T0 });
    expect(rest.map((s) => [s.id, s.current])).toEqual([[hash("2"), true]]);
    expect(await sessions.endAll(db, ownerId)).toBe(1);
  });

  it("löscht abgelaufene Sitzungen und lässt gültige stehen", async () => {
    await anlegen("alt", T0);
    await anlegen("neu", nach(T0, 25 * TAG));
    const jetzt = nach(T0, SESSION.slidingDays * TAG + 1);
    expect(await sessions.deleteExpired(db, { now: jetzt })).toBe(1);
    expect(await sessions.findByTokenHash(db, hash("neu"), { now: jetzt })).toBeDefined();
    expect(await sessions.deleteExpired(db, { now: jetzt })).toBe(0);
  });

  it("Sitzungen verschwinden mit dem Besitzer", async () => {
    await anlegen("f");
    await db.delete(ownerTabelle);
    expect(await sessions.findByTokenHash(db, hash("f"), { now: T0 })).toBeUndefined();
  });
});

describe("rateLimit", () => {
  let db: Database;
  beforeEach(async () => {
    db = (await createTestDb()).db;
  });
  const eingabe = { key: "anmelden:ip:203.0.113.7", max: 3, windowSeconds: 60, now: T0 };

  it("zählt im Fenster und weist über dem Maximum ab", async () => {
    const ergebnisse = [];
    for (let i = 0; i < 5; i++) ergebnisse.push(await rateLimit.hit(db, eingabe));
    expect(ergebnisse.map((r) => [r.count, r.allowed, r.remaining])).toEqual([
      [1, true, 2],
      [2, true, 1],
      [3, true, 0],
      [4, false, 0],
      [5, false, 0],
    ]);
    expect(ergebnisse[0]?.retryAfterSeconds).toBe(60);
  });

  it("zählt bei parallelen Aufrufen nichts doppelt und nichts verloren", async () => {
    const parallel = await Promise.all(
      Array.from({ length: 25 }, () => rateLimit.hit(db, { ...eingabe, max: 100 })),
    );
    expect(parallel.map((r) => r.count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 1),
    );
    expect((await rateLimit.peek(db, { ...eingabe, max: 100 })).count).toBe(25);
  });

  it("ein neues Zeitfenster beginnt bei null", async () => {
    await rateLimit.hit(db, eingabe);
    await rateLimit.hit(db, eingabe);
    const spaeter = await rateLimit.hit(db, { ...eingabe, now: nach(T0, 61_000) });
    expect(spaeter.count).toBe(1);
    expect(spaeter.allowed).toBe(true);
  });

  it("Schlüssel zählen getrennt; Rest des Fensters wird als Wartezeit genannt", async () => {
    await rateLimit.hit(db, eingabe);
    const andere = await rateLimit.hit(db, { ...eingabe, key: "anmelden:gesamt" });
    expect(andere.count).toBe(1);
    const mitten = await rateLimit.hit(db, { ...eingabe, now: nach(T0, 45_000) });
    expect(mitten.retryAfterSeconds).toBe(15);
  });

  it("reset und deleteOlderThan räumen auf", async () => {
    await rateLimit.hit(db, eingabe);
    await rateLimit.reset(db, eingabe.key);
    expect((await rateLimit.peek(db, eingabe)).count).toBe(0);
    await rateLimit.hit(db, eingabe);
    expect(await rateLimit.deleteOlderThan(db, nach(T0, 3600_000))).toBe(1);
  });

  it("gleitendes Fenster: das vorige Fenster zählt anteilig mit", async () => {
    const gl = { ...eingabe, sliding: true };
    // 3 Versuche am Ende des ersten Fensters (T0 + 50 s).
    for (let i = 0; i < 3; i++) await rateLimit.hit(db, { ...gl, now: nach(T0, 50_000) });
    // 15 s ins nächste Fenster: vom vorigen zählen noch 45/60 → 3 × 0,75 + 1 = 3,25 > 3.
    const frueh = await rateLimit.hit(db, { ...gl, now: nach(T0, 75_000) });
    expect(frueh.allowed).toBe(false);
    expect(frueh.count).toBe(4);
    // Bis 3 × Anteil + 1 ≤ 3, also Anteil ≤ 2/3: noch 5 s.
    expect(frueh.retryAfterSeconds).toBe(5);
    // Ohne gleitendes Fenster wäre derselbe Versuch erlaubt.
    const fest = await rateLimit.hit(db, {
      ...eingabe,
      key: "anmelden:ip:x",
      now: nach(T0, 75_000),
    });
    expect(fest.allowed).toBe(true);
    // 50 s ins nächste Fenster: 3 × 10/60 + 2 = 2,5 ≤ 3.
    const spaet = await rateLimit.hit(db, { ...gl, now: nach(T0, 110_000) });
    expect(spaet.allowed).toBe(true);
    // Zwei Fenster später zählt nichts mehr mit.
    const leer = await rateLimit.hit(db, { ...gl, now: nach(T0, 185_000) });
    expect(leer.count).toBe(1);
  });

  it("gleitendes Fenster über dem Maximum: Wartezeit reicht ins nächste Fenster", async () => {
    const gl = { ...eingabe, sliding: true };
    for (let i = 0; i < 6; i++) await rateLimit.hit(db, { ...gl, now: nach(T0, 30_000) });
    const r = await rateLimit.hit(db, { ...gl, now: nach(T0, 30_000) });
    // 30 s bis zum Ende, dann muss 7 × (1 − f) ≤ 3 sein: f ≥ 4/7 von 60 s ≈ 34,3 s.
    expect(r.retryAfterSeconds).toBe(65);
  });

  it("deleteOlderThan lässt Schlüssel mit ausgenommenem Präfix stehen", async () => {
    await rateLimit.hit(db, eingabe);
    await rateLimit.hit(db, { ...eingabe, key: "anmelden:tag:203.0.113.7", windowSeconds: 86_400 });
    expect(
      await rateLimit.deleteOlderThan(db, nach(T0, 3600_000), {
        exceptPrefixes: ["anmelden:tag:"],
      }),
    ).toBe(1);
    expect(await rateLimit.deleteOlderThan(db, nach(T0, 3 * TAG))).toBe(1);
  });

  it("ein Schlüssel im falschen Format ist eine ungültige Eingabe", async () => {
    await expect(rateLimit.hit(db, { ...eingabe, key: "FALSCH" })).rejects.toEqual(
      mitCode("eingabe_ungueltig"),
    );
  });
});

describe("geraete", () => {
  let db: Database;
  let id: OwnerId;
  beforeEach(async () => {
    db = (await createTestDb()).db;
    id = (await owner.create(db, { passwordHash: "h" })).id as OwnerId;
  });
  const ablauf = nach(T0, 90 * TAG);

  it("anlegen, finden (nur gültig), entfernen", async () => {
    await geraete.create(db, { idHash: hash("a"), ownerId: id, expiresAt: ablauf, now: T0 });
    expect((await geraete.find(db, hash("a"), { now: T0 }))?.ownerId).toBe(id);
    expect(await geraete.find(db, hash("a"), { now: nach(ablauf, 1) })).toBeUndefined();
    expect(await geraete.find(db, "kein-hash", { now: T0 })).toBeUndefined();
    expect(await geraete.remove(db, hash("a"))).toBe(true);
    expect(await geraete.find(db, hash("a"), { now: T0 })).toBeUndefined();
  });

  it("höchstens MAX_GERAETE je Besitzer, das neue bleibt; removeAll entfernt alle", async () => {
    for (let i = 0; i < geraete.MAX_GERAETE + 3; i++) {
      await geraete.create(db, { idHash: hash(`g${i}`), ownerId: id, expiresAt: ablauf, now: T0 });
    }
    const letztes = hash(`g${geraete.MAX_GERAETE + 2}`);
    expect(await geraete.find(db, letztes, { now: T0 })).toBeDefined();
    expect(await geraete.removeAll(db, id)).toBe(geraete.MAX_GERAETE);
  });

  it("weist eine ID im falschen Format ab", async () => {
    await expect(
      geraete.create(db, { idHash: "x", ownerId: id, expiresAt: ablauf, now: T0 }),
    ).rejects.toEqual(mitCode("eingabe_ungueltig"));
  });
});
