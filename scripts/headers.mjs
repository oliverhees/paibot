/**
 * PaiBot – prüft und ergänzt den Urheber-Kopf in den Dateien des Projekts.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-18
 */

// Prüft und ergänzt den Urheber-Kopf in den Dateien des Projekts.
//
//   node scripts/headers.mjs --check   listet Dateien ohne Kopf oder mit veralteter Lizenz-Angabe
//                                      (Exit-Code 1)
//   node scripts/headers.mjs --write   fügt fehlende Köpfe mit Platzhalter-Beschreibung ein und
//                                      setzt die Lizenz-Angabe vorhandener Köpfe auf die aktuelle
//
// Das Datum im Kopf ("Seit") ist das Datum des ersten Commits der Datei, bei neuen Dateien
// das heutige Datum. Mit PAIBOT_HEADER_DATE=JJJJ-MM-TT lässt sich das heutige Datum festlegen.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const PLACEHOLDER = "Beschreibung folgt";

// Ausnahmen: hier bekommt keine Datei einen Kopf.
const EXCLUDED_FILES = new Set([
  "LICENSE", // Lizenztext, darf nicht verändert werden
  "THIRD_PARTY_NOTICES.md", // wird mit `pnpm licenses:notices` erzeugt
  "pnpm-lock.yaml", // wird von pnpm erzeugt
  "next-env.d.ts", // wird von Next.js erzeugt
  ".nvmrc", // enthält nur die Node-Version
  ".github/pull_request_template.md", // der Text landet sonst in jeder Pull-Request-Beschreibung
]);
const EXCLUDED_PREFIXES = [
  "packages/db/drizzle/", // erzeugte Migrationen, dürfen sich nicht ändern
];
const EXCLUDED_SEGMENTS = new Set(["node_modules", ".next", "dist", ".turbo", "coverage"]);
const EXCLUDED_EXTENSIONS = new Set([
  ".json", // kein Kommentar möglich
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".pdf",
]);

const BLOCK_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".css"]);
const HASH_EXTENSIONS = new Set([".yml", ".yaml", ".sh", ".py"]);
const HASH_NAMES = new Set([
  "Dockerfile",
  ".dockerignore",
  ".gitignore",
  ".editorconfig",
  ".env.example",
]);
const MARKDOWN_EXTENSIONS = new Set([".md"]);

const FIELDS = {
  author: "Oliver Hees",
  link: "https://paibot.de",
  copyright: "2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.",
  license: "PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm",
};

/** Lizenz-Angabe im Kopf, gleich welcher Fassung. */
const LICENSE_PATTERN = /PaiBot Fair-Code-Lizenz \d+(\.\d+)* – siehe Datei LICENSE im Projektstamm/;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function todayDate() {
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: nur für dieses Skript, kein Turborepo-Task
  return process.env.PAIBOT_HEADER_DATE ?? new Date().toISOString().slice(0, 10);
}

/** Alle Dateien im Projekt (versioniert oder neu, aber nicht ignoriert). */
function projectFiles() {
  return git(["ls-files", "--cached", "--others", "--exclude-standard"])
    .split("\n")
    .filter(Boolean)
    .filter((file) => existsOnDisk(file));
}

function existsOnDisk(file) {
  try {
    readFileSync(file);
    return true;
  } catch {
    return false;
  }
}

function isExcluded(file) {
  if (EXCLUDED_FILES.has(file) || EXCLUDED_FILES.has(path.basename(file))) return true;
  if (EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix))) return true;
  if (file.split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment))) return true;
  return EXCLUDED_EXTENSIONS.has(path.extname(file).toLowerCase());
}

/** Art des Kommentars für die Datei oder null, wenn der Typ nicht unterstützt wird. */
function styleOf(file) {
  const base = path.basename(file);
  const ext = path.extname(file).toLowerCase();
  if (HASH_NAMES.has(base)) return "hash";
  if (BLOCK_EXTENSIONS.has(ext)) return "block";
  if (HASH_EXTENSIONS.has(ext)) return "hash";
  if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown";
  return null;
}

function sinceDate(file) {
  const out = git(["log", "--diff-filter=A", "--follow", "--format=%as", "--", file])
    .trim()
    .split("\n")
    .filter(Boolean);
  return out.length > 0 ? out[out.length - 1] : todayDate();
}

function buildHeader(style, description, since) {
  const title = `PaiBot – ${description}`;
  if (style === "block") {
    return [
      "/**",
      ` * ${title}`,
      " *",
      ` * @author    ${FIELDS.author}`,
      ` * @link      ${FIELDS.link}`,
      ` * @copyright ${FIELDS.copyright}`,
      ` * @license   ${FIELDS.license}`,
      ` * @since     ${since}`,
      " */",
    ];
  }
  const lines = [
    title,
    "",
    `Autor:     ${FIELDS.author}`,
    `Website:   ${FIELDS.link}`,
    `Copyright: ${FIELDS.copyright}`,
    `Lizenz:    ${FIELDS.license}`,
    `Seit:      ${since}`,
  ];
  if (style === "hash") return lines.map((line) => (line === "" ? "#" : `# ${line}`));
  return ["<!--", ...lines, "-->"];
}

/** Hat die Datei oben einen Kopf? Prüft die ersten Zeilen auf Autor und Website. */
function headOf(text) {
  return text.split("\n").slice(0, 16).join("\n");
}

function hasHeader(text) {
  const head = headOf(text);
  return /(@author|Autor:)\s+Oliver Hees/.test(head) && head.includes(FIELDS.link);
}

function hasPlaceholder(text) {
  return headOf(text).includes(`PaiBot – ${PLACEHOLDER}`);
}

/** Nennt der Kopf eine andere als die aktuelle Fassung der Lizenz (oder gar keine)? */
function hasOutdatedLicense(text) {
  return !headOf(text).includes(FIELDS.license);
}

/** Ersetzt die Lizenz-Angabe im Kopf durch die aktuelle; der Rest der Datei bleibt unberührt. */
function withCurrentLicense(text) {
  const lines = text.split("\n");
  const head = lines.slice(0, 16).join("\n");
  const rest = lines.slice(16);
  return [head.replace(LICENSE_PATTERN, FIELDS.license), ...rest].join("\n");
}

/** Zeilen, die ganz oben stehen bleiben müssen (Shebang, Dockerfile-Syntax-Zeile). */
function keptFirstLines(lines) {
  const first = lines[0] ?? "";
  if (first.startsWith("#!") || /^#\s*syntax\s*=/.test(first)) return 1;
  return 0;
}

function withHeader(file, text) {
  const style = styleOf(file);
  const lines = text.split("\n");
  const keep = keptFirstLines(lines);
  const header = buildHeader(style, PLACEHOLDER, sinceDate(file));
  const rest = lines.slice(keep);
  return [...lines.slice(0, keep), ...header, "", ...rest].join("\n");
}

const mode = process.argv[2];
if (mode !== "--check" && mode !== "--write") {
  console.error("Aufruf: node scripts/headers.mjs --check | --write");
  process.exit(2);
}

const candidates = projectFiles().filter((file) => !isExcluded(file) && styleOf(file) !== null);
const missing = [];
const placeholders = [];
const outdated = [];
for (const file of candidates) {
  const text = readFileSync(file, "utf8");
  if (!hasHeader(text)) {
    missing.push(file);
    continue;
  }
  if (hasPlaceholder(text)) placeholders.push(file);
  if (hasOutdatedLicense(text)) outdated.push(file);
}

if (mode === "--check") {
  if (missing.length > 0) {
    console.error("Diese Dateien haben keinen Urheber-Kopf (Abhilfe: pnpm headers:write):");
    for (const file of missing) console.error(`  ${file}`);
  }
  if (placeholders.length > 0) {
    console.error(`Diese Dateien haben noch den Platzhalter „${PLACEHOLDER}“ im Kopf:`);
    for (const file of placeholders) console.error(`  ${file}`);
  }
  if (outdated.length > 0) {
    console.error(
      `Diese Dateien nennen im Kopf nicht „${FIELDS.license}“ (Abhilfe: pnpm headers:write):`,
    );
    for (const file of outdated) console.error(`  ${file}`);
  }
  if (missing.length + placeholders.length + outdated.length > 0) process.exit(1);
  console.log(`Urheber-Kopf ok (${candidates.length} Dateien geprüft).`);
} else {
  for (const file of missing) writeFileSync(file, withHeader(file, readFileSync(file, "utf8")));
  const unchanged = [];
  for (const file of outdated) {
    const text = readFileSync(file, "utf8");
    const updated = withCurrentLicense(text);
    if (updated === text) unchanged.push(file);
    else writeFileSync(file, updated);
  }
  console.log(
    `${missing.length} Köpfe eingefügt. Bitte die Beschreibung („${PLACEHOLDER}“) von Hand anpassen.`,
  );
  console.log(
    `${outdated.length - unchanged.length} Lizenz-Angaben auf die aktuelle Fassung gesetzt.`,
  );
  if (unchanged.length > 0) {
    console.error("In diesen Köpfen fehlt die Lizenz-Angabe, bitte von Hand ergänzen:");
    for (const file of unchanged) console.error(`  ${file}`);
    process.exitCode = 1;
  }
}
