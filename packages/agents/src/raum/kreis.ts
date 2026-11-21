/**
 * PaiBot – Kein Kreis im Auftragsbaum
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/**
 * Kein Kreis im Auftragsbaum: ein Bot darf Arbeit nie an sich selbst oder an einen Bot geben, der
 * im Baum über ihm steht. Reine Funktion über eine Liste von Knoten.
 */

export interface AuftragsKnoten {
  readonly id: string;
  /** `null` bei der Wurzel. */
  readonly elternId: string | null;
  readonly botId: string;
}

export type KreisErgebnis =
  | { readonly ok: true; readonly tiefe: number }
  | {
      readonly ok: false;
      readonly grund: "selbst" | "vorfahre" | "auftrag_unbekannt" | "baum_defekt";
    };

/** Ein Baum aus Millionen Knoten ist kein Baum mehr; die Suche nach oben bricht dort ab. */
const MAX_KETTE = 1_000;

/**
 * Darf der Bot `anBotId` eine Aufgabe vom Auftrag `vonAuftragId` übernehmen? Nein, wenn er der
 * Geber selbst oder einer seiner Vorfahren im Baum ist. Ein Baum mit Schleife, mit fehlendem
 * Elternknoten oder mit doppelten Knoten-Kennungen wird abgelehnt (`baum_defekt`).
 */
export function pruefeKeinKreis(
  knoten: readonly AuftragsKnoten[],
  vonAuftragId: string,
  anBotId: string,
): KreisErgebnis {
  const nachId = new Map<string, AuftragsKnoten>();
  for (const k of knoten) {
    if (nachId.has(k.id)) return { ok: false, grund: "baum_defekt" };
    nachId.set(k.id, k);
  }
  let aktuell = nachId.get(vonAuftragId);
  if (!aktuell) return { ok: false, grund: "auftrag_unbekannt" };
  if (aktuell.botId === anBotId) return { ok: false, grund: "selbst" };
  const besucht = new Set<string>([aktuell.id]);
  let abstand = 0;
  while (aktuell.elternId !== null) {
    const eltern = nachId.get(aktuell.elternId);
    if (!eltern || besucht.has(eltern.id) || abstand >= MAX_KETTE) {
      return { ok: false, grund: "baum_defekt" };
    }
    if (eltern.botId === anBotId) return { ok: false, grund: "vorfahre" };
    besucht.add(eltern.id);
    aktuell = eltern;
    abstand += 1;
  }
  // Tiefe des neuen Auftrags = Tiefe des Gebers + 1 (Wurzel = 0)
  return { ok: true, tiefe: abstand + 1 };
}
