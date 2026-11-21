/**
 * PaiBot – Test, dass `pnpm schleuse:config` eine gültige, geheimnisfreie Konfiguration erzeugt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = path.join(ROOT, "scripts", "schleuse-config.mjs");

interface Ergebnis {
  dateien: Record<"config.yaml" | "nlp-config.yml", string>;
  werte: { anbieter: string[]; weg: string; sprachmodell: string; qiStufe: string };
}
const modul = (await import(pathToFileURL(SCRIPT).href)) as {
  erzeugeSchleuseKonfig: (env: Record<string, string | undefined>) => Ergebnis;
  leseEnvText: (text: string) => Record<string, string>;
  SchleuseKonfigFehler: new (message: string) => Error;
};
const { erzeugeSchleuseKonfig, leseEnvText, SchleuseKonfigFehler } = modul;

const ordner: string[] = [];
afterEach(() => {
  for (const dir of ordner.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function tempOrdner(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "paibot-schleuse-config-"));
  ordner.push(dir);
  return dir;
}

/** Ruft den Befehl wirklich auf, mit einer Umgebung nur aus `env` (plus PATH). */
function befehl(args: string[], env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", ...env },
  });
  return { code: result.status, ausgabe: `${result.stdout}${result.stderr}` };
}

function fehlerVon(env: Record<string, string>): string {
  try {
    erzeugeSchleuseKonfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(SchleuseKonfigFehler);
    return (error as Error).message;
  }
  throw new Error("kein Fehler");
}

describe("schleuse:config", () => {
  it("Standard: EUrouter, Schlüssel je Anfrage, mittleres Sprachmodell", () => {
    const { dateien, werte } = erzeugeSchleuseKonfig({});
    expect(werte).toEqual({
      anbieter: ["eurouter"],
      weg: "anfrage",
      sprachmodell: "de_core_news_md",
      qiStufe: "balanced",
    });
    const config = dateien["config.yaml"];
    expect(config).toContain('- model_name: "eurouter/*"');
    expect(config).toContain('model: "openai/*"');
    expect(config).toContain('api_base: "https://api.eurouter.ai/v1"');
    expect(config).not.toContain("api_key");
    expect(config).toContain('master_key: "os.environ/DATENSCHLEUSE_MASTER_KEY"');
    expect(config).toContain("default_on: true");
    expect(config).toContain('mode: ["pre_call", "post_call"]');
    expect(config).toContain("turn_off_message_logging: true");
    expect(config).toContain("set_verbose: false");
    expect(dateien["nlp-config.yml"]).toMatch(/model_name: de_core_news_md\n$/);
  });

  it("Modellnamen folgen dem Muster <anbieter>/<modell>, das PaiBot schickt", () => {
    const { dateien } = erzeugeSchleuseKonfig({
      SCHLEUSE_ANBIETER: "eurouter=https://api.eurouter.ai/v1/, eigener=https://llm.example.org/v1",
      SCHLEUSE_SCHLUESSEL_WEG: "anfrage",
    });
    const config = dateien["config.yaml"];
    expect(config).toContain('- model_name: "eurouter/*"');
    expect(config).toContain('- model_name: "eigener/*"');
    expect(config).toContain('api_base: "https://api.eurouter.ai/v1"\n');
    expect(config.indexOf("eurouter/*")).toBeLessThan(config.indexOf("eigener/*"));
  });

  it("Weg „umgebung“ (Rückfall): Verweis auf SCHLEUSE_ANBIETER_SCHLUESSEL, nur ein Anbieter", () => {
    const { dateien, werte } = erzeugeSchleuseKonfig({ SCHLEUSE_SCHLUESSEL_WEG: "umgebung" });
    expect(werte.weg).toBe("umgebung");
    expect(dateien["config.yaml"]).toContain('api_key: "os.environ/SCHLEUSE_ANBIETER_SCHLUESSEL"');
    expect(
      fehlerVon({
        SCHLEUSE_SCHLUESSEL_WEG: "umgebung",
        SCHLEUSE_ANBIETER: "eurouter=https://api.eurouter.ai/v1,eigener=https://llm.example.org/v1",
      }),
    ).toContain("nur ein Anbieter");
  });

  it("Weg „anfrage“: kein Verweis auf einen Schlüssel des Anbieters in der Datei", () => {
    const { dateien } = erzeugeSchleuseKonfig({ SCHLEUSE_SCHLUESSEL_WEG: "anfrage" });
    expect(dateien["config.yaml"]).not.toContain("api_key");
    expect(dateien["config.yaml"]).toContain("master_key");
  });

  it("Sprachmodell und Stufe sind einstellbar, das kleine Modell nicht", () => {
    const { dateien } = erzeugeSchleuseKonfig({
      SCHLEUSE_SPRACHMODELL: "de_core_news_lg",
      SCHLEUSE_QI_STUFE: "paranoid",
    });
    expect(dateien["nlp-config.yml"]).toContain("model_name: de_core_news_lg");
    expect(dateien["config.yaml"]).toContain('qi_risk_preset: "paranoid"');
    expect(fehlerVon({ SCHLEUSE_SPRACHMODELL: "de_core_news_sm" })).toContain("nicht angeboten");
    expect(fehlerVon({ SCHLEUSE_QI_STUFE: "aus" })).toContain("SCHLEUSE_QI_STUFE");
    expect(fehlerVon({ SCHLEUSE_SCHLUESSEL_WEG: "datei" })).toContain("SCHLEUSE_SCHLUESSEL_WEG");
  });

  it("deterministisch: gleiche Werte, gleiche Bytes; Leerwerte zählen als Standard", () => {
    const a = erzeugeSchleuseKonfig({ SCHLEUSE_ANBIETER: " eurouter=https://api.eurouter.ai/v1 " });
    const b = erzeugeSchleuseKonfig({ SCHLEUSE_ANBIETER: "", SCHLEUSE_SPRACHMODELL: "  " });
    expect(a.dateien).toEqual(b.dateien);
    expect(JSON.stringify(a.dateien)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("Geheimnisse aus der Umgebung landen nie in den Dateien", () => {
    const geheim = `sk-${randomBytes(24).toString("hex")}`;
    const { dateien } = erzeugeSchleuseKonfig({
      SCHLEUSE_ANBIETER_SCHLUESSEL: geheim,
      SCHLEUSE_KEY: geheim,
      SCHLEUSE_STATE_KEY: geheim,
    });
    for (const inhalt of Object.values(dateien)) expect(inhalt).not.toContain(geheim);
  });

  it("Adressen: nur https ins Internet, keine Zugangsdaten, keine internen Ziele", () => {
    const faelle: Array<[string, string]> = [
      ["eurouter=http://api.eurouter.ai/v1", "https"],
      ["eurouter=https://nutzer:passwort@api.eurouter.ai/v1", "Zugangsdaten"],
      ["eurouter=https://api.eurouter.ai/v1?key=abc", "nach ? oder #"],
      ["eurouter=https://169.254.169.254/v1", "nicht erlaubt"],
      ["eurouter=https://[fe80::1]/v1", "nicht erlaubt"],
      ["eurouter=https://metadata.google.internal/v1", "nicht erlaubt"],
      ["eurouter=https://postgres/v1", "eigenen Netz"],
      ["eurouter=https://datenschleuse/v1", "eigenen Netz"],
      ["eurouter=kein-url", "keine gültige URL"],
      ["Eurouter=https://api.eurouter.ai/v1", "kein gültiger Anbieter-Schlüssel"],
      ["https://api.eurouter.ai/v1", "nicht die Form"],
      ["a=https://a.example.org/v1,a=https://b.example.org/v1", "doppelt"],
      [" , ", "leer"],
    ];
    for (const [anbieter, erwartet] of faelle) {
      expect(
        fehlerVon({ SCHLEUSE_ANBIETER: anbieter, SCHLEUSE_SCHLUESSEL_WEG: "anfrage" }),
      ).toContain(erwartet);
    }
    // Nur mit ausdrücklicher Erlaubnis (Tests mit dem Test-Anbieter): http und interne Namen.
    const test = erzeugeSchleuseKonfig({
      SCHLEUSE_ANBIETER: "test=http://fake-provider:8080/v1",
      SCHLEUSE_ERLAUBE_HTTP: "1",
    });
    expect(test.dateien["config.yaml"]).toContain('api_base: "http://fake-provider:8080/v1"');
    expect(
      fehlerVon({
        SCHLEUSE_ANBIETER: "test=http://169.254.169.254/v1",
        SCHLEUSE_ERLAUBE_HTTP: "1",
      }),
    ).toContain("nicht erlaubt");
  });

  it("mehrere Anbieter gehen im Standard (Schlüssel je Anfrage), mit umgebung nicht", () => {
    const zwei = "a=https://a.example.org/v1,b=https://b.example.org/v1";
    expect(erzeugeSchleuseKonfig({ SCHLEUSE_ANBIETER: zwei }).werte.anbieter).toEqual(["a", "b"]);
    expect(fehlerVon({ SCHLEUSE_ANBIETER: zwei, SCHLEUSE_SCHLUESSEL_WEG: "umgebung" })).toContain(
      "nur ein Anbieter",
    );
  });

  it("liest .env-Dateien wie Docker Compose (Kommentare, Anführungszeichen)", () => {
    expect(
      leseEnvText(
        [
          "# Kommentar",
          "SCHLEUSE_SPRACHMODELL=de_core_news_lg",
          'SCHLEUSE_QI_STUFE="utility"',
          "SCHLEUSE_ANBIETER='eurouter=https://api.eurouter.ai/v1'",
          "export SCHLEUSE_SCHLUESSEL_WEG=anfrage # dahinter",
          "kaputt",
          "",
        ].join("\n"),
      ),
    ).toEqual({
      SCHLEUSE_SPRACHMODELL: "de_core_news_lg",
      SCHLEUSE_QI_STUFE: "utility",
      SCHLEUSE_ANBIETER: "eurouter=https://api.eurouter.ai/v1",
      SCHLEUSE_SCHLUESSEL_WEG: "anfrage",
    });
  });

  it("Befehl: schreibt, prüft und gibt keine Werte aus der .env-Datei aus", () => {
    const dir = tempOrdner();
    const geheim = randomBytes(24).toString("hex");
    const envDatei = path.join(dir, ".env");
    writeFileSync(
      envDatei,
      `SCHLEUSE_KEY=sk-${geheim}\nSCHLEUSE_ANBIETER_SCHLUESSEL=${geheim}\nSCHLEUSE_SPRACHMODELL=de_core_news_lg\n`,
    );
    const ziel = path.join(dir, "schleuse");

    const geschrieben = befehl(["--env-datei", envDatei, "--ausgabe", ziel]);
    expect(geschrieben.code).toBe(0);
    expect(geschrieben.ausgabe).not.toContain(geheim);
    expect(readFileSync(path.join(ziel, "nlp-config.yml"), "utf8")).toContain("de_core_news_lg");
    expect(readFileSync(path.join(ziel, "config.yaml"), "utf8")).not.toContain(geheim);

    expect(befehl(["--env-datei", envDatei, "--ausgabe", ziel, "--pruefen"]).code).toBe(0);
    // Die Umgebung geht vor der Datei (wie bei Docker Compose): andere Werte → nicht aktuell.
    const veraltet = befehl(["--env-datei", envDatei, "--ausgabe", ziel, "--pruefen"], {
      SCHLEUSE_SPRACHMODELL: "de_core_news_md",
    });
    expect(veraltet.code).toBe(1);
    expect(veraltet.ausgabe).toContain("Nicht aktuell: nlp-config.yml");

    const gezeigt = befehl(["--env-datei", envDatei, "--zeigen"]);
    expect(gezeigt.code).toBe(0);
    expect(gezeigt.ausgabe).toContain("### config.yaml");
    expect(gezeigt.ausgabe).not.toContain(geheim);
  });

  it("Befehl: Fehler enden mit Exit-Code 1 bzw. 2 und einer Meldung", () => {
    const falsch = befehl(["--zeigen"], { SCHLEUSE_SPRACHMODELL: "de_core_news_sm" });
    expect(falsch.code).toBe(1);
    expect(falsch.ausgabe).toContain("Abbruch: SCHLEUSE_SPRACHMODELL");
    expect(befehl(["--unbekannt"]).code).toBe(2);
    expect(befehl(["--env-datei", path.join(tempOrdner(), "fehlt.env")]).code).toBe(2);
  });
});
