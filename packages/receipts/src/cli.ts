/**
 * PaiBot – Befehl `belege:pruefen`: prüft einen Beleg-Export ohne Datenbank.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { t } from "@paibot/shared/texte";
import { ExportFormatError, parseJsonl } from "./jsonl";
import { type CheckResult, verifyChain } from "./verify";

/** Exit-Codes des Befehls. */
const CLI_EXIT = { gueltig: 0, ungueltig: 1, fehler: 2 } as const;

function describe(check: CheckResult): string | undefined {
  if (check.status === "entfaellt") return undefined;
  const ok = check.status === "ok";
  const mark = ok ? "✓" : "✗";
  switch (check.check) {
    case "inhalt":
      return `${mark} ${t(ok ? "pruefung.inhalt.ok" : "pruefung.inhalt.fehler")}`;
    case "signatur":
      return ok
        ? `${mark} ${t("pruefung.signatur.ok", { kurzform: check.fingerprint ?? "?" })}`
        : `${mark} ${t("pruefung.signatur.fehler")}`;
    case "kette":
      return `${mark} ${t(ok ? "pruefung.kette.ok" : "pruefung.kette.fehler")}`;
    case "entscheidung":
      return ok
        ? `${mark} ${t("pruefung.entscheidung.ok", { regel: check.rule?.id ?? "?" })}`
        : `${mark} ${t("pruefung.entscheidung.fehler")}`;
    case "kontext":
      return `${mark} ${t(ok ? "pruefung.kontext.ok" : "pruefung.kontext.fehler")}`;
  }
}

/** Ein- und Ausgabe des Befehls, für Tests austauschbar. */
export interface CliIo {
  readFile(path: string): Promise<string>;
  out(line: string): void;
  err(line: string): void;
}

/**
 * `pnpm belege:pruefen <datei.jsonl>`: liest den Export (`parseJsonl`), prüft die Kette mit den
 * öffentlichen Schlüsseln aus der ersten Zeile (`verifyChain`) und gibt das Ergebnis auf Deutsch aus.
 *
 * Rückgabe ist der Exit-Code: 0 = Kette gültig, 1 = Kette ungültig (mit Stelle), 2 = Aufruf oder
 * Datei fehlerhaft.
 */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const args = argv.filter((arg) => arg !== "--");
  const path = args[0];
  if (args.length !== 1 || path === undefined || path.startsWith("-")) {
    io.err(t("belege.befehl.aufruf"));
    return CLI_EXIT.fehler;
  }

  let text: string;
  try {
    text = await io.readFile(path);
  } catch {
    io.err(t("belege.befehl.datei", { datei: path }));
    return CLI_EXIT.fehler;
  }

  let parsed: ReturnType<typeof parseJsonl>;
  try {
    parsed = parseJsonl(text);
  } catch (error) {
    if (!(error instanceof ExportFormatError)) throw error;
    io.err(t("belege.befehl.format", { grund: error.message }));
    return CLI_EXIT.fehler;
  }

  const report = await verifyChain(parsed.entries, parsed.header.publicKeys);
  if (report.ok) {
    io.out(t("belege.befehl.kette", { ergebnis: t("pruefung.gueltig"), anzahl: report.checked }));
    if (report.head !== undefined) io.out(t("belege.befehl.kopf", report.head));
    return CLI_EXIT.gueltig;
  }

  const failure = report.firstFailure;
  const seq = failure?.seq ?? 0;
  io.out(
    t("belege.befehl.kette", {
      ergebnis: t("pruefung.ungueltig", { seq }),
      anzahl: report.checked,
    }),
  );
  for (const check of failure?.checks ?? []) {
    const line = describe(check);
    if (line !== undefined) io.out(`  ${line}`);
  }
  return CLI_EXIT.ungueltig;
}
