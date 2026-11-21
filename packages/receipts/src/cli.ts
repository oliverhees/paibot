/**
 * PaiBot – Befehl `belege:pruefen`: prüft einen Beleg-Export ohne Datenbank.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  type ChainAnchor,
  type ChainProblem,
  encodeAnchor,
  parseAnchor,
} from "@paibot/shared/belege";
import { t } from "@paibot/shared/texte";
import { ExportFormatError, parseJsonl } from "./jsonl";
import { type ChainReport, type CheckResult, createAnchor, verifyChain } from "./verify";

/**
 * Exit-Codes des Befehls:
 * - 0: Kette vertrauenswürdig (bzw. Anker ausgegeben).
 * - 1: Kette ungültig (mit Stelle oder Problem).
 * - 2: Aufruf, Datei oder Anker fehlerhaft.
 * - 3: Kette in sich gültig, aber die Vertrauenskette ist gebrochen (Schlüsselwechsel ohne
 *   Beglaubigung).
 */
/** Text zu einem Problem der Kette (jedes Problem hat einen Text-Schlüssel). */
function problemText(problem: ChainProblem): string {
  return t(`belege.problem.${problem}`);
}

export const CLI_EXIT = { gueltig: 0, ungueltig: 1, fehler: 2, vertrauenGebrochen: 3 } as const;

const USAGE_FORMS = [
  "pnpm belege:pruefen <datei.jsonl> --anker <anker|pb-anker.json>",
  "pnpm belege:pruefen anker <datei.jsonl>",
] as const;

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

function usage(io: CliIo): number {
  io.err(t("belege.befehl.aufruf"));
  for (const form of USAGE_FORMS) io.err(`       ${form}`);
  return CLI_EXIT.fehler;
}

interface Arguments {
  command: "pruefen" | "anker";
  path: string;
  anchor?: string;
}

function parseArguments(argv: readonly string[]): Arguments | undefined {
  const args = argv.filter((arg) => arg !== "--");
  let command: Arguments["command"] = "pruefen";
  if (args[0] === "anker" || args[0] === "pruefen") {
    command = args[0];
    args.shift();
  }
  let anchor: string | undefined;
  const rest: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? "";
    if (arg === "--anker") {
      const value = args[index + 1];
      if (value === undefined || anchor !== undefined) return undefined;
      anchor = value;
      index++;
    } else if (arg.startsWith("--anker=")) {
      if (anchor !== undefined) return undefined;
      anchor = arg.slice("--anker=".length);
    } else {
      rest.push(arg);
    }
  }
  const path = rest[0];
  if (rest.length !== 1 || path === undefined || path === "" || path.startsWith("-")) {
    return undefined;
  }
  if (command === "anker" && anchor !== undefined) return undefined;
  return { command, path, ...(anchor === undefined ? {} : { anchor }) };
}

/** Anker als Text (beginnt mit `{`) oder aus einer Datei. */
async function readAnchor(value: string, io: CliIo): Promise<ChainAnchor | undefined> {
  let text = value;
  if (!value.trim().startsWith("{")) {
    try {
      text = await io.readFile(value);
    } catch {
      io.err(t("belege.befehl.datei", { datei: value }));
      return undefined;
    }
  }
  try {
    return parseAnchor(text);
  } catch {
    io.err(t("belege.anker.ungueltig"));
    return undefined;
  }
}

/**
 * Befehl `belege:pruefen`, ohne Datenbank:
 *
 * - `pnpm belege:pruefen <datei.jsonl> [--anker <anker|pb-anker.json>]`: liest den Export
 *   (`parseJsonl`), prüft die Kette mit den Schlüsseln aus der Kette (`verifyChain`; die Schlüssel
 *   der Kopfzeile nur zum Vergleich) und, wenn angegeben, gegen den aufbewahrten Anker. Ausgabe auf
 *   Deutsch: Ergebnis, Urteil, Probleme, Hinweis ohne Anker.
 * - `pnpm belege:pruefen anker <datei.jsonl>`: prüft die Kette und gibt danach ihren Anker als eine
 *   Zeile aus (zum Aufbewahren, z. B. als `pb-anker.json`).
 *
 * Rückgabe ist der Exit-Code (`CLI_EXIT`).
 */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const args = parseArguments(argv);
  if (args === undefined) return usage(io);

  let text: string;
  try {
    text = await io.readFile(args.path);
  } catch {
    io.err(t("belege.befehl.datei", { datei: args.path }));
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

  let anchor: ChainAnchor | undefined;
  if (args.anchor !== undefined) {
    anchor = await readAnchor(args.anchor, io);
    if (anchor === undefined) return CLI_EXIT.fehler;
  }

  const report = await verifyChain(parsed.entries, {
    publicKeys: parsed.header.publicKeys,
    ...(anchor === undefined ? {} : { anchor }),
  });
  const exit = printReport(report, io);
  if (args.command === "anker") {
    const start = parsed.entries[0];
    const head = parsed.entries.at(-1);
    if (exit !== CLI_EXIT.gueltig || start === undefined || head === undefined) {
      return exit === CLI_EXIT.gueltig ? CLI_EXIT.ungueltig : exit;
    }
    io.out(encodeAnchor(createAnchor(start, head)));
  }
  return exit;
}

function printReport(report: ChainReport, io: CliIo): number {
  const { verdict } = report;
  const failure = report.firstFailure;
  const ergebnis =
    failure === undefined ? t("pruefung.gueltig") : t("pruefung.ungueltig", { seq: failure.seq });
  io.out(t("belege.befehl.kette", { ergebnis, anzahl: report.checked }));
  if (failure === undefined && report.head !== undefined) {
    io.out(t("belege.befehl.kopf", report.head));
  }
  for (const check of failure?.checks ?? []) {
    const line = describe(check);
    if (line !== undefined) io.out(`  ${line}`);
  }
  io.out(t(`belege.urteil.${verdict.level}`));
  for (const finding of verdict.findings) {
    const where = finding.seq === undefined ? "" : ` (${finding.seq})`;
    io.out(`  ✗ ${problemText(finding.problem)}${where}`);
  }
  if (verdict.anchor === "fehlt") io.out(t("belege.anker.ohne"));

  if (verdict.level === "vertrauenswuerdig") return CLI_EXIT.gueltig;
  if (verdict.level === "vertrauen_gebrochen") return CLI_EXIT.vertrauenGebrochen;
  return CLI_EXIT.ungueltig;
}
