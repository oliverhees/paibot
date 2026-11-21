/**
 * PaiBot – echte Abhängigkeiten des Workers: Datenbank, Warteschlange, Tor mit Beleg-Schreiber,
 * Motor, Datenschleuse und Lauf-Steuerung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  createAiSdkMotor,
  executeRun,
  failStaleRuns,
  RUN_TUNING,
  type RunDeps,
  readSchleuseStatus,
} from "@paibot/agents";
import { createSigningKeyHolder, decryptSecret, deriveKey, loadMasterSecret } from "@paibot/crypto";
import { createDb, type Database, repo } from "@paibot/db";
import { checkAppRole, checkMigrationState, pingDatabase } from "@paibot/db/migrate";
import { createGate, ruleSnapshot } from "@paibot/gate";
import { createQueue } from "@paibot/jobs";
import { schleuseFromEnv } from "@paibot/llm";
import { createReceiptWriter } from "@paibot/receipts";
import { secretAad, signingKeySecretBinding } from "@paibot/shared/bindung";
import { PaiBotError } from "@paibot/shared/fehler";
import type { KeyId } from "@paibot/shared/ids";
import { realSchleuseCheck } from "./schleuse-meldung";
import type { DatabaseHandle, RunDepsSource, WorkerDeps } from "./worker";

type Env = Readonly<Record<string, string | undefined>>;

/** Öffnet die Verbindung des Workers. */
export function openDatabase(url: string): DatabaseHandle {
  const { db, sql } = createDb(url);
  return {
    db,
    migrationState: (folder) => checkMigrationState(sql, folder),
    roleCheck: () => checkAppRole(sql),
    probe: async () => {
      await sql`select 1`;
    },
    close: () => sql.end({ timeout: 5 }),
  };
}

/**
 * Baut die Abhängigkeiten eines Laufs. Der Signaturschlüssel der Belege wird vor jedem Lauf neu
 * geladen (`createSigningKeyHolder`: entschlüsselt mit der Bindung an Kennung und öffentlichen
 * Teil, privater Teil gegen den öffentlichen geprüft) und nur im Speicher gehalten; der
 * Beleg-Schreiber fragt ihn mit `current()` ab, nie unter seiner Sperre aus der Datenbank.
 * Vor der Einrichtung gibt es keinen Schlüssel; ein Beleg scheitert dann mit `einrichtung_offen`.
 */
export function buildRunDeps(db: Database, env: Env): RunDepsSource {
  const master = loadMasterSecret(env);
  const keysKey = deriveKey(master, "keys-v1");
  const clock = { now: () => new Date() };
  const holder = createSigningKeyHolder<KeyId>(async () => {
    const key = await repo.installationKeys.getActive(db);
    if (key === undefined) throw new PaiBotError("einrichtung_offen");
    return {
      keyId: key.id,
      publicKey: key.publicKey,
      privateKey: decryptSecret(key.privateKeyEnc, keysKey, {
        aad: secretAad(signingKeySecretBinding(key.id, key.publicKey)),
      }),
    };
  });

  const receipts = createReceiptWriter(db, {
    current: async () => {
      if (!holder.loaded) throw new PaiBotError("einrichtung_offen");
      return holder.current();
    },
  });
  const gate = createGate({
    rules: {
      load: async () => {
        const snapshot = await repo.rules.loadSnapshot(db);
        return ruleSnapshot(snapshot.rules, snapshot.stand);
      },
    },
    receipts,
    clock,
  });
  const schleuse = schleuseFromEnv(env);
  const base: RunDeps = {
    db,
    gate,
    motor: createAiSdkMotor({ idleTimeoutMs: RUN_TUNING.idleTimeoutMs }),
    clock,
    keys: { secrets: deriveKey(master, "secrets-v1"), context: deriveKey(master, "context-v1") },
    ...(schleuse === undefined ? {} : { schleuse }),
    schleuseStatus: () => readSchleuseStatus(schleuse),
    receipts,
  };

  return {
    base,
    async prepare() {
      try {
        await holder.load();
      } catch (error) {
        if (!(error instanceof PaiBotError && error.code === "einrichtung_offen")) throw error;
        holder.discard();
      }
      return base;
    },
  };
}

/** Die Abhängigkeiten für den Betrieb. */
export function realWorkerDeps(): Omit<WorkerDeps, "log"> {
  return {
    pingDatabase: (url) => pingDatabase(url, 3),
    openDatabase,
    createQueue: (url) => createQueue(url),
    executeRun,
    failStaleRuns,
    buildRunDeps,
    schleuse: realSchleuseCheck(),
  };
}
