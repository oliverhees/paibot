/**
 * PaiBot – feste Listen: welche Doku-Seiten in den Index im Image kommen und welche nicht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Diese Datei benutzen `pnpm doku:index` (baut den Index) und `pnpm doku:check` (prüft, dass jede
// Seite unter docs/ in genau einer der beiden Listen steht). Eine neue Seite gehört in eine der
// beiden Listen; die Anwender-Doku kommt in den Index, Entwickler-, Vertrags- und Lizenztexte nicht.

/** Seiten, die in den Index kommen (Anwender-Doku). Einzige Wildcard: docs/funktion-*.md. */
export const IN_DEN_INDEX = [
  "docs/README.md",
  "docs/funktion-*.md",
  "docs/installation.md",
  "docs/aktualisieren.md",
  "docs/sicherung.md",
  "docs/sicherheit.md",
  "docs/deploy-coolify.md",
  "docs/architektur.md",
];

/** Seiten unter docs/, die bewusst NICHT in den Index kommen, mit Grund. */
export const NICHT_IN_DEN_INDEX = [
  ["docs/entwickler/**", "Entwickler-Doku"],
  ["docs/entwickeln.md", "Entwickler-Doku"],
  ["docs/VORLAGE-funktion.md", "Vorlage"],
  ["docs/BEITRAGSVEREINBARUNG.md", "Vertragstext"],
  ["docs/LIZENZPOLITIK.md", "Lizenztext"],
];

// docs/assets/** und docs/screenshots.json sind keine Doku-Seiten und zählen nicht.

/** Ein Muster mit `*` (innerhalb eines Namens) und `**` (über Ordner) als regulärer Ausdruck. */
function alsAusdruck(muster) {
  let text = "";
  for (let i = 0; i < muster.length; i += 1) {
    const c = muster[i];
    if (c === "*" && muster[i + 1] === "*") {
      i += 1;
      text += ".*";
    } else if (c === "*") text += "[^/]*";
    else text += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${text}$`);
}

/** Passt der Pfad (mit „/“, relativ zum Projektstamm) auf das Muster? */
export function passtAuf(muster, pfad) {
  return alsAusdruck(muster).test(pfad);
}

/** Steht die Seite in der Liste „in den Index“? */
export function inDenIndex(pfad, liste = IN_DEN_INDEX) {
  return liste.some((muster) => passtAuf(muster, pfad));
}

/** Steht die Seite in der Liste „nicht in den Index“? */
export function nichtInDenIndex(pfad, liste = NICHT_IN_DEN_INDEX) {
  return liste.some(([muster]) => passtAuf(muster, pfad));
}
