/**
 * PaiBot – Hilfen für die Tests der Apps-Datenbank: Entscheidungen des Besitzers im
 * Beleg-Protokoll, Apps, Werkzeuge und Abdrücke mit Beispiel-Werten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { createHash } from "node:crypto";
import {
  type ActionId,
  type AppId,
  type AppToolId,
  appTargetDigestInput,
  type KeyId,
  newId,
  type ReceiptBody,
  type Sha256Digest,
  ZERO_PREV,
} from "@paibot/shared";
import type { Database } from "./client";
import { belege, installationKeys } from "./schema";
import { belegRow, keyRow, sha256Digest } from "./testdaten";

/** Abdruck des Ziels einer App, wie das Tor ihn rechnet. */
export function zielAbdruck(appId: AppId, url: string): Sha256Digest {
  return `sha256:${createHash("sha256").update(appTargetDigestInput(appId, url)).digest("hex")}` as Sha256Digest;
}

/** Eine Kette von Belegen, in die Entscheidungen des Besitzers mit eigenen Fakten kommen. */
export class BelegKette {
  private keyId: KeyId | undefined;
  private seq = 0;
  private prevHash: string = ZERO_PREV;

  constructor(private readonly db: Database) {}

  private async weiter(): Promise<{ keyId: KeyId; seq: number; prevHash: string }> {
    if (this.keyId === undefined) {
      const key = keyRow();
      await this.db.insert(installationKeys).values(key);
      this.keyId = key.id;
      this.seq = 1;
      const start = belegRow(key.id, { seq: 1, prevHash: ZERO_PREV, type: "start" });
      await this.db.insert(belege).values(start);
      this.prevHash = start.hash;
    }
    this.seq += 1;
    return { keyId: this.keyId, seq: this.seq, prevHash: this.prevHash };
  }

  /** Hängt eine Entscheidung an und gibt die Kennung der Aktion zurück. */
  async entscheidung(input: {
    type: string;
    target: Record<string, unknown>;
    facts: Record<string, unknown>;
    outcome?: "allow" | "deny" | "ask";
    actor?: string;
  }): Promise<ActionId> {
    const { keyId, seq, prevHash } = await this.weiter();
    const actionId = newId("action");
    const actor = input.actor ?? "besitzer";
    const row = belegRow(keyId, {
      seq,
      prevHash,
      type: "decision",
      actionId,
      actor,
      ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
    });
    const body = row.body as unknown as Record<string, unknown>;
    const neuerKoerper = {
      ...body,
      action: { actionId, type: input.type, actor, target: input.target },
      facts: input.facts,
    } as unknown as ReceiptBody;
    await this.db.insert(belege).values({
      ...row,
      action: input.type,
      conversationId: null,
      body: neuerKoerper,
    } as typeof belege.$inferInsert);
    this.prevHash = row.hash;
    return actionId;
  }

  /** Entscheidung `app.werkzeuge_bestaetigen` mit den Fakten des Tors. */
  werkzeugBestaetigen(input: {
    appId: AppId;
    toolId: AppToolId;
    toolClass: "lesen" | "schreiben" | "gesperrt";
    toolDigest: Sha256Digest;
    seenToolDigest?: Sha256Digest;
    targetDigest: Sha256Digest;
    toolStatus: "neu" | "bestaetigt" | "geaendert" | "gesperrt";
    toolVersion: number;
    outcome?: "allow" | "deny";
    actor?: string;
  }): Promise<ActionId> {
    return this.entscheidung({
      type: "app.werkzeuge_bestaetigen",
      target: { appId: input.appId, toolId: input.toolId },
      facts: {
        credential: "sitzung",
        toolClass: input.toolClass,
        toolVersion: input.toolVersion,
        toolDigest: input.toolDigest,
        seenToolDigest: input.seenToolDigest ?? input.toolDigest,
        toolStatus: input.toolStatus,
        targetDigest: input.targetDigest,
      },
      ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
      ...(input.actor === undefined ? {} : { actor: input.actor }),
    });
  }

  /** Entscheidung `app.zugriff_setzen`. */
  zugriffSetzen(input: {
    appId: AppId;
    botId: string;
    access: "keiner" | "lesen";
    outcome?: "allow" | "deny";
  }): Promise<ActionId> {
    return this.entscheidung({
      type: "app.zugriff_setzen",
      target: { appId: input.appId, botId: input.botId },
      facts: { credential: "sitzung", access: input.access, previousAccess: "keiner" },
      ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
    });
  }
}

/** Ein verschlüsselter Token in der Form `v2` (nur die Form). */
export function tokenV2(): string {
  return `v2:${"a".repeat(16)}:${"b".repeat(22)}:${"c".repeat(40)}`;
}

/** Ein Abdruck mit festem Muster, damit Tests lesbar bleiben. */
export function abdruck(zeichen: string): Sha256Digest {
  return `sha256:${zeichen.repeat(64).slice(0, 64)}` as Sha256Digest;
}

export { sha256Digest };
