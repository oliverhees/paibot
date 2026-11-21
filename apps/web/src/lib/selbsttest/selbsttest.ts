/**
 * PaiBot – Selbsttest auf dem Server: sammelt, was die Web-App von innen sehen kann (Umgebung,
 * beobachtete Anfrage, Datenbank, Meldung des Workers), und gibt nur Ergebnisse und Sätze zurück,
 * nie Adressen, Namen von Rollen oder Geheimnisse. Liest nur.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import path from "node:path";
import { repo } from "@paibot/db";
import {
  ALLOW_PRIVILEGED_DB_ENV,
  checkAppRole,
  checkMigrationState,
  type MigrationState,
  ROLE_ISSUE_TEXT,
} from "@paibot/db/migrate";
import type { RoutenKontext } from "../api/route";
import { datenbankMitClient } from "../datenbank";
import { zeitText } from "../schleuse/ansicht";
import { workerMeldungAus } from "../schleuse/schleuse";
import { stand } from "../stand";
import {
  geordnet,
  type Pruefung,
  proxyErkennbar,
  pruefeAdresse,
  pruefeEinrichtung,
  pruefeMigrationen,
  pruefeNotAus,
  pruefeProxy,
  pruefeRolle,
  pruefeSchalter,
  pruefeSchleuse,
  pruefeVersion,
  pruefeWorker,
  pruefeZugang,
} from "./pruefungen";

/** Rechte der App-Rolle als Ergebnis und lesbare Gründe (ohne Namen von Rollen oder Tabellen). */
export interface RollenBefund {
  status: "eingeschraenkt" | "zu_viele_rechte";
  gruende: string[];
}

/** Woher der Selbsttest Rolle und Stand der Migrationen liest; in Tests ersetzbar. */
export interface SelbsttestQuellen {
  rolle(): Promise<RollenBefund | undefined>;
  migrationen(): Promise<MigrationState | undefined>;
  /** Umgebung des Prozesses (nur gelesen). */
  env(): Readonly<Record<string, string | undefined>>;
}

function migrationsOrdner(env: Readonly<Record<string, string | undefined>>): string {
  return env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "../../packages/db/drizzle");
}

/** Mit der Verbindung des Prozesses (App-Rolle); ohne `DATABASE_URL` oder bei Fehler unbekannt. */
const PROZESS_QUELLEN: SelbsttestQuellen = {
  async rolle() {
    if (!process.env.DATABASE_URL) return undefined;
    try {
      const pruefung = await checkAppRole(datenbankMitClient().sql);
      return {
        status: pruefung.status,
        gruende: pruefung.issues.map((issue) => ROLE_ISSUE_TEXT[issue]),
      };
    } catch {
      return undefined;
    }
  },
  async migrationen() {
    if (!process.env.DATABASE_URL) return undefined;
    try {
      return await checkMigrationState(datenbankMitClient().sql, migrationsOrdner(process.env));
    } catch {
      return undefined;
    }
  },
  env: () => process.env,
};

let ersatz: SelbsttestQuellen | undefined;

/** Nur für Tests: andere Quellen (oder `undefined` für die des Prozesses). */
export function _ersetzeSelbsttestQuellen(quellen: SelbsttestQuellen | undefined): void {
  ersatz = quellen;
}

/** Antwort von `GET /api/selbsttest`. Die Prüfungen des Browsers ergänzt die Seite selbst. */
export interface SelbsttestDaten {
  /** Wann geprüft wurde (ISO). */
  geprueft: string;
  pruefungen: Pruefung[];
}

/** `GET /api/selbsttest`: alle Prüfungen, die der Server kennt. */
export async function selbsttestLesen(
  kontext: RoutenKontext<"selbsttest">,
): Promise<SelbsttestDaten> {
  const quellen = ersatz ?? PROZESS_QUELLEN;
  const { db, dienste: d, sitzung, request } = kontext;
  const jetzt = d.uhr.now();
  const env = quellen.env();
  const [settings, rolle, migrationen, meldung, geraete, sitzungen] = await Promise.all([
    repo.settings.get(db),
    quellen.rolle(),
    quellen.migrationen(),
    repo.schleuse.get(db),
    repo.geraete.list(db, sitzung.ownerId, { now: jetzt }),
    repo.sessions.list(db, sitzung.ownerId, { now: jetzt }),
  ]);
  const zeitzone = settings?.timezone ?? "UTC";
  const worker = workerMeldungAus(meldung, jetzt);
  const befund =
    worker === undefined
      ? undefined
      : {
          zustand: worker.zustand,
          veraltet: worker.veraltet,
          zeit: zeitText(worker.geprueft, zeitzone),
        };
  const pruefungen = [
    pruefeAdresse({ appOrigin: d.appOrigin(), host: request.headers.get("host") }),
    pruefeProxy({
      vertraut: d.hinterProxy(),
      erkennbar: proxyErkennbar((name) => request.headers.get(name)),
    }),
    pruefeRolle(rolle),
    pruefeSchalter({
      an: env[ALLOW_PRIVILEGED_DB_ENV] === "1",
      zuVieleRechte: rolle?.status === "zu_viele_rechte",
    }),
    pruefeMigrationen(migrationen),
    pruefeWorker(befund),
    pruefeSchleuse(befund),
    pruefeEinrichtung(settings?.setupCompletedAt !== undefined),
    pruefeNotAus(settings?.killSwitch === true),
    pruefeZugang({ geraete: geraete.length, sitzungen: sitzungen.length }),
    pruefeVersion(stand()),
  ];
  return { geprueft: jetzt.toISOString(), pruefungen: geordnet(pruefungen) };
}
