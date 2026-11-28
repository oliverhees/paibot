/**
 * PaiBot – Anfragen, die nur nacheinander laufen dürfen, in diesem Prozess in eine Reihe stellen.
 * Beim Anlegen eines Bots zählt der Server vor der Entscheidung, wie viele Bots es gibt; liefen
 * zwei Anfragen gleichzeitig, läse die zweite denselben Stand und das Tor bekäme eine falsche
 * Zahl. In der Reihe wartet die zweite, bis die erste fertig ist, und das Tor entscheidet mit der
 * richtigen Zahl. Über Prozesse hinweg hält zusätzlich die Sperre der Datenbank
 * (`repo.bots.anlegenUnterGrenze`).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

/** Die Reihe hängt an `globalThis`, damit sie ein Neuladen des Moduls übersteht. */
const REIHE = Symbol.for("paibot.web.bots-anlegen-reihe");

function halter(): { letzte: Promise<void> } {
  const g = globalThis as { [REIHE]?: { letzte: Promise<void> } };
  g[REIHE] ??= { letzte: Promise.resolve() };
  return g[REIHE];
}

/**
 * Führt `arbeit` aus, sobald jede frühere Arbeit dieser Reihe fertig ist – ob sie gelang oder
 * scheiterte. Gibt zurück, was `arbeit` zurückgibt, und wirft, was sie wirft.
 */
export function nacheinander<T>(arbeit: () => Promise<T>): Promise<T> {
  const h = halter();
  const dran = h.letzte.then(arbeit, arbeit);
  h.letzte = dran.then(
    () => undefined,
    () => undefined,
  );
  return dran;
}
