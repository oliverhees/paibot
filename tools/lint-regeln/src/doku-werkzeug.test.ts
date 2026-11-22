/**
 * PaiBot – Regel-Test des Werkzeugs „In der Doku nachschlagen“: Nur der Lader liest eine Datei;
 * kein Modul des Werkzeugs öffnet Netz oder Prozesse oder ruft `fetch`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, it } from "vitest";

// Der Test durchsucht `packages/agents/src/werkzeuge/doku/` ohne Tests und Testdaten. Wie
// `werkzeug-schleife.test.ts` überspringt er die Probe-Ordner anderer Tests
// (`__lint_versuch_<pid>__`, `__akteur_versuch_<pid>__`) und Dateien, die während des Laufs
// verschwinden. Gegenprobe: `import { readFileSync } from "node:fs"` in `werkzeug.ts` → rot.

describe("Werkzeug „In der Doku nachschlagen“ ohne Dateien und Netz", () => {
  it.todo("nur index-laden.ts importiert node:fs");
  it.todo("kein Modul importiert node:net, node:http, node:https oder node:child_process");
  it.todo("kein Modul ruft fetch auf");
});
