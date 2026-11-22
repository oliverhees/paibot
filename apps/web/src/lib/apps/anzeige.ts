/**
 * PaiBot – Was die Routen über Apps und ihre Werkzeuge zurückgeben: nie ein Token, nie ein
 * Text vom Server außer der bereinigten Form, die auch ans Modell geht. Je Werkzeug steht der
 * vollständige Modell-Text da (Name, Beschreibung und alle Texte des gekürzten Schemas), genau wie
 * er in der Datenbank liegt und später ans Modell geht; der Besitzer bestätigt, was er sieht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { repo } from "@paibot/db";

type App = repo.apps.App;
type AppTool = repo.apps.AppTool;

/** Eine App, wie die Oberfläche sie sieht: ohne Token, nur, ob einer hinterlegt ist. */
export function appAnsicht(app: App) {
  return {
    id: app.id,
    kurzname: app.shortName,
    name: app.name,
    adresse: app.url,
    anmeldung: app.authKind,
    tokenGesetzt: app.tokenSet,
    zustand: app.state,
    verbindungsNummer: app.connectionNo,
    verbundenAm: app.createdAt.toISOString(),
    getrenntAm: app.disconnectedAt === null ? null : app.disconnectedAt.toISOString(),
  };
}

/**
 * Ein Werkzeug mit dem Text, der ans Modell geht: `modellText` ist genau die gespeicherte Form
 * (Name, Beschreibung, Schema), nicht die Rohform des Servers. Die Hinweise des Servers sind nur
 * Anzeige („laut App“); die Einstufung `klasse` kommt allein aus der Bestätigung des Besitzers.
 */
export function werkzeugAnsicht(tool: AppTool, frueher?: AppTool, vergleichUnvollstaendig = false) {
  return {
    id: tool.toolId,
    version: tool.version,
    stand: tool.status,
    klasse: tool.toolClass,
    abdruck: tool.toolDigest,
    modellText: {
      name: tool.modelName,
      beschreibung: tool.description,
      schema: tool.inputSchema,
    },
    hinweiseLautApp: { nurLesend: tool.hintReadOnly, destruktiv: tool.hintDestructive },
    ...(frueher === undefined ? {} : { frueher: fassungAnsicht(frueher) }),
    ...(vergleichUnvollstaendig ? { vergleichUnvollstaendig: true as const } : {}),
  };
}

/** Eine frühere Fassung zum Vergleichen: Abdruck, Klasse und der Text, der damals ans Modell ging. */
export function fassungAnsicht(tool: AppTool) {
  return {
    version: tool.version,
    klasse: tool.toolClass,
    abdruck: tool.toolDigest,
    modellText: { name: tool.modelName, beschreibung: tool.description, schema: tool.inputSchema },
    hinweiseLautApp: { nurLesend: tool.hintReadOnly, destruktiv: tool.hintDestructive },
  };
}
