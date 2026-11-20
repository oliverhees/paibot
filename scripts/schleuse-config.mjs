/**
 * PaiBot – erzeugt die Konfiguration der Datenschleuse (Weiterleitung und Sprachmodell).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

// Erzeugt die zwei Dateien, die die Datenschleuse im Compose-Profil `schleuse` liest:
//
//   config.yaml      Weiterleitung an den Modell-Anbieter, Maskierung, Zugangsschlüssel
//   nlp-config.yml   Sprachmodell der Erkennung (Namen, Orte, Organisationen)
//
//   pnpm schleuse:config                              schreibt nach deploy/schleuse/
//   pnpm schleuse:config --env-datei deploy/.env      liest die Werte zusätzlich aus der Datei
//   pnpm schleuse:config --ausgabe <ordner>           schreibt in einen anderen Ordner
//   pnpm schleuse:config --zeigen                     gibt beide Dateien nur aus (nichts schreiben)
//   pnpm schleuse:config --pruefen                    Exit-Code 1, wenn die Dateien nicht aktuell sind
//
// Werte (Umgebung vor Datei, wie bei Docker Compose):
//   SCHLEUSE_ANBIETER         <schlüssel>=<basis-url>, mehrere mit Komma getrennt
//                             Standard: eurouter=https://api.eurouter.ai/v1
//   SCHLEUSE_SCHLUESSEL_WEG   umgebung (Standard): Die Datenschleuse liest den Schlüssel des
//                             Anbieters aus SCHLEUSE_ANBIETER_SCHLUESSEL (nur ein Anbieter).
//                             anfrage: PaiBot schickt den Schlüssel mit jeder Anfrage mit; die
//                             Datenschleuse speichert keinen.
//   SCHLEUSE_SPRACHMODELL     de_core_news_md (Standard) oder de_core_news_lg
//   SCHLEUSE_QI_STUFE         utility, balanced (Standard) oder paranoid
//   SCHLEUSE_ERLAUBE_HTTP     1 erlaubt http-Adressen (nur für Tests mit dem Test-Anbieter)
//
// Die Dateien enthalten nie ein Geheimnis: Schlüssel stehen dort nur als Verweis auf eine
// Umgebungsvariable (`os.environ/…`). Gleiche Werte ergeben byte-gleiche Dateien.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJEKT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STANDARD_AUSGABE = path.join(PROJEKT, "deploy", "schleuse");

export const STANDARD_ANBIETER = "eurouter=https://api.eurouter.ai/v1";
export const SPRACHMODELLE = ["de_core_news_md", "de_core_news_lg"];
export const QI_STUFEN = ["utility", "balanced", "paranoid"];
export const SCHLUESSEL_WEGE = ["umgebung", "anfrage"];

/** Umgebungsvariablen im Container der Datenschleuse, auf die die Konfiguration verweist. */
export const UMGEBUNG_IM_DIENST = {
  zugang: "DATENSCHLEUSE_MASTER_KEY",
  anbieterSchluessel: "SCHLEUSE_ANBIETER_SCHLUESSEL",
};

const ANBIETER_SCHLUESSEL_MUSTER = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const DIENST_NAMEN = new Set([
  "postgres",
  "web",
  "worker",
  "datenschleuse",
  "schleuse-analyzer",
  "localhost",
]);
const METADATEN_HOSTS = new Set([
  "169.254.169.254",
  "metadata.google.internal",
  "metadata",
  "fd00:ec2::254",
]);

export class SchleuseKonfigFehler extends Error {
  constructor(message) {
    super(message);
    this.name = "SchleuseKonfigFehler";
  }
}

/**
 * Liest eine `.env`-Datei: `NAME=wert` je Zeile, `#` leitet einen Kommentar ein, Werte dürfen in
 * einfachen oder doppelten Anführungszeichen stehen. Wird nie ausgegeben.
 */
export function leseEnvText(text) {
  const werte = {};
  for (const roh of text.split(/\r?\n/)) {
    const zeile = roh.trim();
    if (zeile === "" || zeile.startsWith("#")) continue;
    const treffer = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(zeile);
    if (!treffer) continue;
    let wert = treffer[2];
    if (/^".*"$/.test(wert) || /^'.*'$/.test(wert)) wert = wert.slice(1, -1);
    else wert = wert.replace(/\s+#.*$/, "").trim();
    werte[treffer[1]] = wert;
  }
  return werte;
}

function wert(env, name, standard) {
  const roh = env[name];
  if (roh === undefined) return standard;
  const getrimmt = String(roh).trim();
  return getrimmt === "" ? standard : getrimmt;
}

function istLinkLokal(host) {
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return /^fe[89ab][0-9a-f]:/i.test(host);
}

/** Prüft eine Basis-URL des Anbieters und gibt sie ohne abschließenden Schrägstrich zurück. */
export function pruefeAnbieterUrl(roh, { erlaubeHttp = false } = {}) {
  let url;
  try {
    url = new URL(roh);
  } catch {
    throw new SchleuseKonfigFehler(`Die Adresse „${roh}“ ist keine gültige URL.`);
  }
  if (url.protocol !== "https:" && !(erlaubeHttp && url.protocol === "http:")) {
    throw new SchleuseKonfigFehler(
      `Die Adresse ${url.origin} muss mit https beginnen (http nur mit SCHLEUSE_ERLAUBE_HTTP=1, für Tests).`,
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new SchleuseKonfigFehler(
      "Die Adresse des Anbieters darf keine Zugangsdaten enthalten. Den Schlüssel nie in die URL schreiben.",
    );
  }
  if (url.search !== "" || url.hash !== "") {
    throw new SchleuseKonfigFehler(
      "Die Adresse des Anbieters darf keinen Teil nach ? oder # haben.",
    );
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (METADATEN_HOSTS.has(host) || istLinkLokal(host)) {
    throw new SchleuseKonfigFehler(`Die Adresse ${url.origin} ist nicht erlaubt.`);
  }
  if (!erlaubeHttp && (DIENST_NAMEN.has(host) || !host.includes("."))) {
    throw new SchleuseKonfigFehler(
      `Die Adresse ${url.origin} zeigt auf einen Namen im eigenen Netz. Erlaubt sind nur Anbieter im Internet.`,
    );
  }
  return url.href.replace(/\/+$/, "");
}

/** Liest `SCHLEUSE_ANBIETER` (`<schlüssel>=<url>`, durch Komma getrennt). */
export function leseAnbieter(roh, optionen) {
  const liste = [];
  const gesehen = new Set();
  for (const teil of roh.split(",")) {
    const eintrag = teil.trim();
    if (eintrag === "") continue;
    const gleich = eintrag.indexOf("=");
    if (gleich <= 0) {
      throw new SchleuseKonfigFehler(
        `SCHLEUSE_ANBIETER: „${eintrag}“ hat nicht die Form <schlüssel>=<basis-url>.`,
      );
    }
    const schluessel = eintrag.slice(0, gleich).trim();
    const url = eintrag.slice(gleich + 1).trim();
    if (!ANBIETER_SCHLUESSEL_MUSTER.test(schluessel)) {
      throw new SchleuseKonfigFehler(
        `SCHLEUSE_ANBIETER: „${schluessel}“ ist kein gültiger Anbieter-Schlüssel (Kleinbuchstaben, Ziffern, - und _).`,
      );
    }
    if (gesehen.has(schluessel)) {
      throw new SchleuseKonfigFehler(`SCHLEUSE_ANBIETER: „${schluessel}“ steht doppelt.`);
    }
    gesehen.add(schluessel);
    liste.push({ schluessel, url: pruefeAnbieterUrl(url, optionen) });
  }
  if (liste.length === 0) throw new SchleuseKonfigFehler("SCHLEUSE_ANBIETER ist leer.");
  return liste;
}

function auswahl(env, name, erlaubt, standard, hinweis = "") {
  const gewaehlt = wert(env, name, standard);
  if (!erlaubt.includes(gewaehlt)) {
    throw new SchleuseKonfigFehler(
      `${name}: „${gewaehlt}“ ist nicht erlaubt. Möglich: ${erlaubt.join(", ")}.${hinweis}`,
    );
  }
  return gewaehlt;
}

/** YAML-Text in doppelten Anführungszeichen (JSON-Schreibweise ist gültiges YAML). */
function q(text) {
  return JSON.stringify(text);
}

const KOPF = [
  "# Konfiguration der Datenschleuse für PaiBot, erzeugt mit `pnpm schleuse:config`.",
  "# Nicht von Hand ändern, sondern neu erzeugen. Enthält keine Geheimnisse.",
];

/**
 * Baut beide Dateien aus den Werten der Umgebung. Rein und deterministisch.
 * Fehler: `SchleuseKonfigFehler` mit einer Meldung ohne geheime Werte.
 */
export function erzeugeSchleuseKonfig(env = {}) {
  const erlaubeHttp = wert(env, "SCHLEUSE_ERLAUBE_HTTP", "") === "1";
  const anbieter = leseAnbieter(wert(env, "SCHLEUSE_ANBIETER", STANDARD_ANBIETER), {
    erlaubeHttp,
  });
  const weg = auswahl(env, "SCHLEUSE_SCHLUESSEL_WEG", SCHLUESSEL_WEGE, "umgebung");
  const sprachmodell = auswahl(
    env,
    "SCHLEUSE_SPRACHMODELL",
    SPRACHMODELLE,
    "de_core_news_md",
    " Das kleine Modell (de_core_news_sm) übersieht zu viele Namen und wird nicht angeboten.",
  );
  const qiStufe = auswahl(env, "SCHLEUSE_QI_STUFE", QI_STUFEN, "balanced");
  if (weg === "umgebung" && anbieter.length > 1) {
    throw new SchleuseKonfigFehler(
      "Mit SCHLEUSE_SCHLUESSEL_WEG=umgebung ist nur ein Anbieter möglich (ein Schlüssel in SCHLEUSE_ANBIETER_SCHLUESSEL). Für mehrere Anbieter: SCHLEUSE_SCHLUESSEL_WEG=anfrage.",
    );
  }

  const zeilen = [...KOPF, "", "model_list:"];
  for (const { schluessel, url } of anbieter) {
    zeilen.push(
      `  - model_name: ${q(`${schluessel}/*`)}`,
      "    litellm_params:",
      `      model: ${q("openai/*")}`,
      `      api_base: ${q(url)}`,
    );
    if (weg === "umgebung") {
      zeilen.push(`      api_key: ${q(`os.environ/${UMGEBUNG_IM_DIENST.anbieterSchluessel}`)}`);
    }
  }
  zeilen.push(
    "",
    "guardrails:",
    `  - guardrail_name: ${q("datenschleuse-reid")}`,
    "    litellm_params:",
    `      guardrail: ${q("datenschleuse_guardrail.DatenschleuseGuardrail")}`,
    `      mode: [${q("pre_call")}, ${q("post_call")}]`,
    "      default_on: true",
    `      presidio_language: ${q("de")}`,
    "      presidio_score_threshold: 0.0",
    `      qi_risk_preset: ${q(qiStufe)}`,
    "",
    "litellm_settings:",
    "  set_verbose: false",
    "  turn_off_message_logging: true",
    "",
    "general_settings:",
    `  master_key: ${q(`os.environ/${UMGEBUNG_IM_DIENST.zugang}`)}`,
    "",
  );

  const nlp = [
    ...KOPF,
    "",
    "nlp_engine_name: spacy",
    "models:",
    "  - lang_code: de",
    `    model_name: ${sprachmodell}`,
    "",
  ];

  return {
    dateien: { "config.yaml": zeilen.join("\n"), "nlp-config.yml": nlp.join("\n") },
    werte: { anbieter: anbieter.map((a) => a.schluessel), weg, sprachmodell, qiStufe },
  };
}

function abbruch(meldung, code = 1) {
  console.error(meldung);
  process.exit(code);
}

function main(args) {
  let envDatei;
  let ausgabe = STANDARD_AUSGABE;
  let zeigen = false;
  let pruefen = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--zeigen") zeigen = true;
    else if (arg === "--pruefen") pruefen = true;
    else if (arg === "--env-datei" || arg === "--ausgabe") {
      const naechstes = args[i + 1];
      if (!naechstes) abbruch(`Nach ${arg} fehlt der Pfad.`, 2);
      if (arg === "--env-datei") envDatei = naechstes;
      else ausgabe = path.resolve(naechstes);
      i += 1;
    } else {
      abbruch(
        `Unbekannte Angabe: ${arg}\nAufruf: pnpm schleuse:config [--env-datei <datei>] [--ausgabe <ordner>] [--zeigen] [--pruefen]`,
        2,
      );
    }
  }

  let env = {};
  if (envDatei !== undefined) {
    if (!existsSync(envDatei)) abbruch(`Die Datei ${envDatei} gibt es nicht.`, 2);
    env = leseEnvText(readFileSync(envDatei, "utf8"));
  }
  for (const [name, inhalt] of Object.entries(process.env)) {
    if (name.startsWith("SCHLEUSE_") && inhalt !== undefined) env[name] = inhalt;
  }

  let ergebnis;
  try {
    ergebnis = erzeugeSchleuseKonfig(env);
  } catch (error) {
    if (error instanceof SchleuseKonfigFehler) abbruch(`Abbruch: ${error.message}`);
    throw error;
  }

  if (zeigen) {
    for (const [name, inhalt] of Object.entries(ergebnis.dateien)) {
      process.stdout.write(`### ${name}\n${inhalt}\n`);
    }
    return;
  }

  if (pruefen) {
    const veraltet = Object.entries(ergebnis.dateien)
      .filter(([name, inhalt]) => {
        const datei = path.join(ausgabe, name);
        return !existsSync(datei) || readFileSync(datei, "utf8") !== inhalt;
      })
      .map(([name]) => name);
    if (veraltet.length > 0) {
      abbruch(
        `Nicht aktuell: ${veraltet.join(", ")} in ${ausgabe}. Neu erzeugen mit: pnpm schleuse:config`,
      );
    }
    console.log(`Aktuell: ${Object.keys(ergebnis.dateien).join(", ")} in ${ausgabe}.`);
    return;
  }

  mkdirSync(ausgabe, { recursive: true });
  for (const [name, inhalt] of Object.entries(ergebnis.dateien)) {
    writeFileSync(path.join(ausgabe, name), inhalt);
  }
  const { anbieter, weg, sprachmodell, qiStufe } = ergebnis.werte;
  console.log(
    `Geschrieben: ${Object.keys(ergebnis.dateien).join(", ")} in ${ausgabe}\n` +
      `  Anbieter: ${anbieter.join(", ")} · Schlüssel des Anbieters: ${weg} · ` +
      `Sprachmodell: ${sprachmodell} · Quasi-Identifikatoren: ${qiStufe}`,
  );
}

// Nur als Befehl ausführen, nicht beim Importieren (z. B. in Tests).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
