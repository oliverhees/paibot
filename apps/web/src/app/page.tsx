/**
 * PaiBot – Startseite mit Logo und Datenbank-Status.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

import { type DbState, databaseState } from "../lib/health";

export const dynamic = "force-dynamic";

const DB_TEXT: Record<DbState, string> = {
  ok: "Datenbank: ok",
  down: "Datenbank: nicht erreichbar",
  not_configured: "Datenbank: nicht eingerichtet",
};

function Logo() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" role="img" aria-label="PaiBot">
      <path
        d="M4 21A17 17 0 0 1 21 4H32.5Q36 4 36 7.5V19A17 17 0 0 1 19 36H7.5Q4 36 4 32.5Z"
        fill="var(--accent)"
      />
      <circle cx="15.5" cy="18" r="2.2" fill="var(--on-accent)" />
      <circle cx="25" cy="18" r="2.2" fill="var(--on-accent)" />
      <path
        d="M15 24.5q5.2 4 10.4 0"
        fill="none"
        stroke="var(--on-accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default async function HomePage() {
  const db = await databaseState();
  return (
    <main className="start">
      <div className="marke">
        <Logo />
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
    </main>
  );
}
