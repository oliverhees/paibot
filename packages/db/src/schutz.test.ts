/**
 * PaiBot – Test: Schlüssel der Installation sind nur anzuhängen, Anbieter tragen ihre Vorlage,
 * verschlüsselte Werte dürfen im Format v1 oder v2 vorliegen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { beforeEach, describe, expect, it } from "vitest";
import { providers as anbieter, installationKeys as keys } from "./repo";
import { installationKeys, providers } from "./schema";
import { encrypted, encryptedV2, keyRow, providerRow, publicKey } from "./testdaten";
import { createTestDb, type TestDb } from "./testing";

const RESTRICT = "23001";
const CHECK = "23514";

async function fehler(
  statement: PromiseLike<unknown>,
): Promise<{ code?: string; constraint?: string }> {
  try {
    await statement;
  } catch (error) {
    return ((error as { cause?: unknown }).cause ?? error) as {
      code?: string;
      constraint?: string;
    };
  }
  throw new Error("Die Anweisung hätte scheitern müssen.");
}

let ctx: TestDb;
beforeEach(async () => {
  ctx = await createTestDb();
});

describe("installation_keys nur anhängen", () => {
  it("Ausmustern geht genau einmal, alles andere wird abgewiesen", async () => {
    const key = keyRow();
    await ctx.db.insert(installationKeys).values(key);
    const update = (set: string) =>
      fehler(ctx.client.query(`update installation_keys set ${set} where id = $1`, [key.id]));

    expect((await update(`public_key = '${publicKey()}'`)).code).toBe(RESTRICT);
    expect((await update(`private_key_enc = '${encrypted()}'`)).code).toBe(RESTRICT);
    expect((await update("fingerprint = '0000-0000-0000-0000'")).code).toBe(RESTRICT);
    expect((await update(`public_key = '${publicKey()}', retired_at = now()`)).code).toBe(RESTRICT);

    await ctx.client.query("update installation_keys set retired_at = now() where id = $1", [
      key.id,
    ]);
    expect((await update("retired_at = null")).code).toBe(RESTRICT);
    expect((await update("retired_at = now() + interval '1 day'")).code).toBe(RESTRICT);
  });

  it("weist DELETE und TRUNCATE ab", async () => {
    const key = keyRow();
    await ctx.db.insert(installationKeys).values(key);
    expect((await fehler(ctx.client.query("delete from installation_keys"))).code).toBe(RESTRICT);
    expect((await fehler(ctx.client.query("truncate installation_keys cascade"))).code).toBe(
      RESTRICT,
    );
  });

  it("der Schlüsselwechsel über den Datenzugriff funktioniert weiter", async () => {
    const erster = await keys.create(ctx.db, {
      publicKey: publicKey(),
      privateKeyEnc: encryptedV2(),
      fingerprint: "1111-2222-3333-4444",
    });
    const zweiter = await keys.rotate(ctx.db, {
      publicKey: publicKey(),
      privateKeyEnc: encryptedV2(),
      fingerprint: "5555-6666-7777-8888",
    });
    expect((await keys.getActive(ctx.db))?.id).toBe(zweiter.id);
    expect((await keys.get(ctx.db, erster.id))?.retiredAt).toBeDefined();
  });
});

describe("providers", () => {
  it("speichert die Vorlage, Standard ist ein eigener Anbieter", async () => {
    const eigen = await anbieter.create(ctx.db, {
      name: "Lokal",
      baseUrl: "http://127.0.0.1:1234/v1",
      region: "local",
    });
    expect(eigen.templateKey).toBe("eigener");
    const eu = await anbieter.create(ctx.db, {
      templateKey: "eurouter",
      name: "EUrouter",
      baseUrl: "https://api.eurouter.ai/v1",
      region: "eu",
      apiKeyEnc: encryptedV2(),
    });
    expect(eu).toMatchObject({ templateKey: "eurouter", keySet: true });
    expect(
      (await anbieter.update(ctx.db, eigen.id, { templateKey: "eurouter" }))?.templateKey,
    ).toBe("eurouter");
  });

  it.each([
    ["unbekannte Vorlage", { templateKey: "openai" }, "providers_template_key_werte"],
    ["Schlüssel im Klartext", { apiKeyEnc: "sk-geheim" }, "providers_api_key_format"],
    [
      "unbekanntes Format v3",
      { apiKeyEnc: encryptedV2().replace("v2:", "v3:") },
      "providers_api_key_format",
    ],
    [
      "v2 mit zu kurzem IV",
      { apiKeyEnc: `v2:AAAA:${"B".repeat(22)}:CCCC` },
      "providers_api_key_format",
    ],
  ])("weist ab: %s", async (_name, abweichung, constraint) => {
    const f = await fehler(ctx.db.insert(providers).values(providerRow(abweichung as never)));
    expect({ code: f.code, constraint: f.constraint }).toEqual({ code: CHECK, constraint });
  });

  it("nimmt v1 und v2 an", async () => {
    await ctx.db.insert(providers).values(providerRow({ apiKeyEnc: encrypted() }));
    await ctx.db.insert(providers).values(providerRow({ apiKeyEnc: encryptedV2() }));
    await ctx.db.insert(installationKeys).values(keyRow({ privateKeyEnc: encryptedV2() }));
  });
});
