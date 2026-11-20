/**
 * PaiBot – Startseite mit Logo und Datenbank-Status.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

import { Logo } from "@paibot/ui";
import { type DbState, databaseState } from "../lib/health";

export const dynamic = "force-dynamic";

const DB_TEXT: Record<DbState, string> = {
  ok: "Datenbank: ok",
  down: "Datenbank: nicht erreichbar",
  not_configured: "Datenbank: nicht eingerichtet",
};

export default async function HomePage() {
  const db = await databaseState();
  return (
    <main className="start">
      <div className="marke">
        <Logo titel="PaiBot" />
        <span>
          Pai<b>Bot</b>
        </span>
      </div>
      <h1>
        PaiBot <span>läuft.</span>
      </h1>
      <p>Dein persönliches KI-Team, auf deinem eigenen Server und mit eigener Datenbank.</p>
      <p>Das ist das Fundament. Als Nächstes kommt der erste Chat.</p>
      <div className="status" data-db={db}>
        <i />
        {DB_TEXT[db]}
      </div>
      <footer className="fuss">
        Powered by PaiBot · entwickelt von{" "}
        <a href="https://hr-codelabs.de" target="_blank" rel="noopener">
          HR CodeLabs
        </a>
      </footer>
    </main>
  );
}
