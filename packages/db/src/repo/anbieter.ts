/**
 * PaiBot – Zugriff auf Anbieter. Schlüssel liegen nur als bereits verschlüsselter Text vor; verschlüsselt wird hier nicht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  newId,
  PaiBotError,
  type Provider,
  type ProviderId,
  type ProviderKind,
  type ProviderTemplateKey,
  type Region,
} from "@paibot/shared";
import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { providers } from "../schema";
import { toProvider } from "./abbildung";
import { feldFehler, SQLSTATE, standardFehler, uebersetzen } from "./fehler";

export interface ProviderCreate {
  id?: ProviderId;
  kind?: ProviderKind;
  /** Vorlage; ohne Angabe `eigener`. */
  templateKey?: ProviderTemplateKey;
  name: string;
  baseUrl: string;
  /**
   * Bereits verschlüsselter Schlüssel: `v2:iv:tag:ct`, gebunden an ID und Host der Basis-URL
   * (`providerSecretBinding`); `v1` nur noch aus alten Daten.
   */
  apiKeyEnc?: string;
  region: Region;
  country?: string;
  enabled?: boolean;
}

/** `apiKeyEnc` und `country`: `null` entfernt den Wert. */
export interface ProviderPatch {
  templateKey?: ProviderTemplateKey;
  name?: string;
  baseUrl?: string;
  apiKeyEnc?: string | null;
  region?: Region;
  country?: string | null;
  enabled?: boolean;
}

function fehler(f: Parameters<typeof standardFehler>[0]) {
  if (f.code === SQLSTATE.eindeutig) return feldFehler("baseUrl");
  return standardFehler(f);
}

export async function create(db: Database, input: ProviderCreate): Promise<Provider> {
  const [row] = await uebersetzen(
    () =>
      db
        .insert(providers)
        .values({
          id: input.id ?? newId("provider"),
          kind: input.kind ?? "openai_compatible",
          templateKey: input.templateKey ?? "eigener",
          name: input.name,
          baseUrl: input.baseUrl,
          apiKeyEnc: input.apiKeyEnc ?? null,
          region: input.region,
          country: input.country ?? null,
          enabled: input.enabled ?? true,
        })
        .returning(),
    fehler,
  );
  if (row === undefined) throw new PaiBotError("intern");
  return toProvider(row);
}

export async function get(db: Database, id: ProviderId): Promise<Provider | undefined> {
  const [row] = await db.select().from(providers).where(eq(providers.id, id));
  return row === undefined ? undefined : toProvider(row);
}

/** Der Anbieter samt verschlüsseltem Schlüssel, für die Anbieter-Schicht. */
export async function getWithKey(
  db: Database,
  id: ProviderId,
): Promise<{ provider: Provider; apiKeyEnc?: string } | undefined> {
  const [row] = await db.select().from(providers).where(eq(providers.id, id));
  if (row === undefined) return undefined;
  return {
    provider: toProvider(row),
    ...(row.apiKeyEnc === null ? {} : { apiKeyEnc: row.apiKeyEnc }),
  };
}

export async function list(db: Database): Promise<Provider[]> {
  const rows = await db
    .select()
    .from(providers)
    .orderBy(asc(providers.createdAt), asc(providers.id));
  return rows.map(toProvider);
}

/** Ändert einen Anbieter. `undefined`, wenn es ihn nicht gibt. */
export async function update(
  db: Database,
  id: ProviderId,
  patch: ProviderPatch,
): Promise<Provider | undefined> {
  const [row] = await uebersetzen(
    () =>
      db
        .update(providers)
        .set({ ...patch, updatedAt: sql`pg_catalog.now()` })
        .where(eq(providers.id, id))
        .returning(),
    fehler,
  );
  return row === undefined ? undefined : toProvider(row);
}

/** Hält das Ergebnis des letzten Verbindungstests fest. */
export async function setCheckResult(
  db: Database,
  id: ProviderId,
  result: { ok: boolean; at?: Date },
): Promise<Provider | undefined> {
  const [row] = await db
    .update(providers)
    .set({
      lastCheckOk: result.ok,
      lastCheckedAt: result.at ?? new Date(),
      updatedAt: sql`pg_catalog.now()`,
    })
    .where(eq(providers.id, id))
    .returning();
  return row === undefined ? undefined : toProvider(row);
}

/** Löscht den Anbieter samt seinen Modellen. `true`, wenn es ihn gab. */
export async function remove(db: Database, id: ProviderId): Promise<boolean> {
  const geloescht = await db
    .delete(providers)
    .where(eq(providers.id, id))
    .returning({ id: providers.id });
  return geloescht.length > 0;
}
