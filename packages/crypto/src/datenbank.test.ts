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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// Die Test-Datenbank liegt im Paket `db`; ein Verweis über den Pfad hält `crypto` frei von Abhängigkeiten.
import { createTestDb, type TestDb } from "../../db/src/testing";
import {
  decryptSecret,
  deriveKey,
  encryptSecret,
  fingerprint,
  generateSigningKey,
  loadMasterSecret,
  sign,
  verify,
} from "./index";

const PROVIDER_ID = `anb_0${"0".repeat(25)}`;
const KEY_ID = `sch_0${"0".repeat(25)}`;

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
    const stored = encryptSecret("sk-test-beispiel", secretsKey);
    await ctx.client.query(
      "insert into providers (id, kind, name, base_url, api_key_enc, region) values ($1, 'openai_compatible', 'Test', 'https://beispiel.invalid/v1', $2, 'eu')",
      [PROVIDER_ID, stored],
    );
    const { rows } = await ctx.client.query<{ api_key_enc: string }>(
      "select api_key_enc from providers where id = $1",
      [PROVIDER_ID],
    );
    expect(decryptSecret(rows[0]?.api_key_enc ?? "", secretsKey)).toBe("sk-test-beispiel");
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
    const stored = encryptSecret(pair.privateKey, keysKey);
    await ctx.client.query(
      "insert into installation_keys (id, purpose, public_key, private_key_enc, fingerprint) values ($1, 'receipts', $2, $3, $4)",
      [KEY_ID, pair.publicKey, stored, fingerprint(pair.publicKey)],
    );
    const { rows } = await ctx.client.query<{ public_key: string; private_key_enc: string }>(
      "select public_key, private_key_enc from installation_keys where id = $1",
      [KEY_ID],
    );
    const restored = decryptSecret(rows[0]?.private_key_enc ?? "", keysKey);
    const signature = sign(restored, new TextEncoder().encode("Beleg"));
    expect(verify(rows[0]?.public_key ?? "", new TextEncoder().encode("Beleg"), signature)).toBe(
      true,
    );
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
