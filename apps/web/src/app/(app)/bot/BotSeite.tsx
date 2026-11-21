/**
 * PaiBot – Seite „Bot“ mit Router: lädt nach dem Speichern die Navigation neu (Name, Avatar).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { useRouter } from "next/navigation";
import type { BotSeitenDaten } from "../../../lib/bot/bot";
import { BotAnsicht } from "./BotAnsicht";

export function BotSeite({ daten }: { daten: BotSeitenDaten }) {
  const router = useRouter();
  return <BotAnsicht daten={daten} onGespeichert={() => router.refresh()} />;
}
