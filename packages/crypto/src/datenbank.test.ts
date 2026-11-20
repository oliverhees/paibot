/**
 * PaiBot – Test: Die Formate des Krypto-Pakets erfüllen die Prüfungen der Datenbank.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import { createTestDb, type TestDb } from "@paibot/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  decryptSecret,
  deriveKey,
  ENCRYPTED_SECRET_PATTERN,
  encryptSecret,
  fingerprint,
  generateSigningKey,
  loadMasterSecret,
  sign,
  verify,
} from "./index";

const PROVIDER_ID = `anb_0${"0".repeat(25)}`;
const KEY_ID = `sch_0${"0".repeat(25)}`;

// Zusatzdaten wie sie `secretAad` aus `@paibot/shared` baut.
const providerAad = (id: string) =>
  ["pb-geheimnis/v2", "providers", id, "api_key", "https://beispiel.invalid"].join("\n");
const keyAad = (id: string, publicKey: string) =>
  ["pb-geheimnis/v2", "installation_keys", id, "private_key", publicKey].join("\n");

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.client.close();
});

describe("Formate und Datenbank", () => {
  const master = loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") });

  it("api_key_enc nimmt einen verschlüsselten Anbieter-Schlüssel an und gibt ihn zurück", async () => {
    const secretsKey = deriveKey(master, "secrets-v1");
    const stored = encryptSecret("sk-test-beispiel", secretsKey, { aad: providerAad(PROVIDER_ID) });
    expect(stored.startsWith("v2:")).toBe(true);
    await ctx.client.query(
      "insert into providers (id, kind, name, base_url, api_key_enc, region) values ($1, 'openai_compatible', 'Test', 'https://beispiel.invalid/v1', $2, 'eu')",
      [PROVIDER_ID, stored],
    );
    const { rows } = await ctx.client.query<{ api_key_enc: string }>(
      "select api_key_enc from providers where id = $1",
      [PROVIDER_ID],
    );
    expect(
      decryptSecret(rows[0]?.api_key_enc ?? "", secretsKey, { aad: providerAad(PROVIDER_ID) }),
    ).toBe("sk-test-beispiel");
  });

  it("api_key_enc weist Klartext ab", async () => {
    await expect(
      ctx.client.query(
        "insert into providers (id, kind, name, base_url, api_key_enc, region) values ($1, 'openai_compatible', 'Test 2', 'https://zwei.invalid/v1', 'sk-klartext', 'eu')",
        [`anb_0${"0".repeat(24)}1`],
      ),
    ).rejects.toMatchObject({ constraint: "providers_api_key_format" });
  });

  it("installation_keys nimmt Schlüsselpaar, Kennung und verschlüsselten privaten Teil an", async () => {
    const pair = generateSigningKey();
    const keysKey = deriveKey(master, "keys-v1");
    const stored = encryptSecret(pair.privateKey, keysKey, { aad: keyAad(KEY_ID, pair.publicKey) });
    await ctx.client.query(
      "insert into installation_keys (id, purpose, public_key, private_key_enc, fingerprint) values ($1, 'receipts', $2, $3, $4)",
      [KEY_ID, pair.publicKey, stored, fingerprint(pair.publicKey)],
    );
    const { rows } = await ctx.client.query<{ public_key: string; private_key_enc: string }>(
      "select public_key, private_key_enc from installation_keys where id = $1",
      [KEY_ID],
    );
    const restored = decryptSecret(rows[0]?.private_key_enc ?? "", keysKey, {
      aad: keyAad(KEY_ID, rows[0]?.public_key ?? ""),
    });
    const signature = sign(restored, new TextEncoder().encode("Beleg"));
    expect(verify(rows[0]?.public_key ?? "", new TextEncoder().encode("Beleg"), signature)).toBe(
      true,
    );
  });

  it("jedes Format, das dieses Paket schreibt, erfüllt die CHECK-Bedingung der Datenbank", async () => {
    const secretsKey = deriveKey(master, "secrets-v1");
    const samples = ["k", "sk-test", "x".repeat(300), "äöü 🙂"].flatMap((plain, i) => [
      encryptSecret(plain, secretsKey, { aad: providerAad(`anb_${i}`) }),
      encryptSecret(plain, secretsKey), // Altbestand v1
    ]);
    for (const [i, value] of samples.entries()) {
      expect(value).toMatch(ENCRYPTED_SECRET_PATTERN);
      await ctx.client.query(
        "insert into providers (id, kind, name, base_url, api_key_enc, region) values ($1, 'openai_compatible', $2, $4, $3, 'eu')",
        [
          `anb_1${String(i).padStart(25, "0")}`,
          `Format ${i}`,
          value,
          `https://format${i}.invalid/v1`,
        ],
      );
    }
    // Ein verändertes Präfix lehnt die Datenbank ab.
    const id = `anb_0${"0".repeat(24)}3`;
    const v2 = encryptSecret("sk-test", secretsKey, { aad: providerAad(id) });
    await ctx.client.query(
      "insert into providers (id, kind, name, base_url, api_key_enc, region) values ($1, 'openai_compatible', 'Test 3', 'https://drei.invalid/v1', $2, 'eu')",
      [id, v2],
    );
    await expect(
      ctx.client.query("update providers set api_key_enc = $1 where id = $2", [
        v2.replace(/^v2/, "v3"),
        id,
      ]),
    ).rejects.toMatchObject({ constraint: "providers_api_key_format" });
  });

  it("viele zufällige Schlüssel erfüllen die Prüfung für öffentliche Schlüssel (Endzeichen)", async () => {
    for (let i = 0; i < 40; i++) {
      const { publicKey } = generateSigningKey();
      const { rows } = await ctx.client.query<{ ok: boolean }>(
        "select $1 ~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' as ok",
        [publicKey],
      );
      expect(rows[0]?.ok).toBe(true);
    }
  });
});
