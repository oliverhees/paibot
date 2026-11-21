/**
 * PaiBot – Pfade der Beleg-Routen für den Browser, ohne den Routen-Vertrag zu laden (der zieht Zod
 * nach sich). Ein Test vergleicht sie mit `lib/routen.ts`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/** Grundpfade, genau wie im Routen-Vertrag. */
export const BELEG_PFADE = {
  belege: "/api/belege",
  beleg: "/api/belege/:id",
  belegPruefung: "/api/belege/:id/pruefung",
  belegeKette: "/api/belege/kette",
  belegeSchluessel: "/api/belege/schluessel",
  belegeExport: "/api/belege/export",
  regeln: "/api/regeln",
} as const;

/** Inhaltstyp der Export-Datei (eine JSON-Zeile je Eintrag). */
export const EXPORT_TYP = "application/x-ndjson";

/**
 * Kopfzeilen der Export-Antwort: Anzahl der Einträge in der Datei und die Belege des Exports
 * (Kennung und Nummer, durch ein Leerzeichen getrennt).
 */
export const EXPORT_KOPF = {
  eintraege: "X-Pb-Eintraege",
  entscheidung: "X-Pb-Beleg-Entscheidung",
  ergebnis: "X-Pb-Beleg-Ergebnis",
} as const;

/** Liest „Kennung Nummer“ aus einer Kopfzeile des Exports. */
export function belegAusKopf(wert: string | null): { id: string; seq: number } | undefined {
  const treffer = /^(blg_[0-9a-z]+) ([1-9][0-9]*)$/.exec(wert ?? "");
  if (treffer === null) return undefined;
  return { id: treffer[1] as string, seq: Number(treffer[2]) };
}

function mitAbfrage(pfad: string, abfrage: Record<string, string | number | undefined>): string {
  const teile = Object.entries(abfrage).filter(
    (e): e is [string, string | number] => e[1] !== undefined,
  );
  if (teile.length === 0) return pfad;
  return `${pfad}?${new URLSearchParams(teile.map(([k, v]) => [k, String(v)])).toString()}`;
}

/** `/api/belege?before=…&limit=…` */
export function belegeListePfad(abfrage: { before?: number; limit?: number } = {}): string {
  return mitAbfrage(BELEG_PFADE.belege, abfrage);
}

/** `/api/belege/<id>` bzw. `/api/belege/<id>/pruefung` */
export function belegPfad(id: string, pruefung = false): string {
  const pfad = (pruefung ? BELEG_PFADE.belegPruefung : BELEG_PFADE.beleg).replace(
    ":id",
    encodeURIComponent(id),
  );
  return pfad;
}

/** `/api/belege/kette?ab=…&anzahl=…` bzw. mit `pruefung=server` */
export function kettePfad(abfrage: { ab?: number; anzahl?: number; pruefung?: "server" }): string {
  return mitAbfrage(BELEG_PFADE.belegeKette, abfrage);
}
