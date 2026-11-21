/**
 * PaiBot – Test, dass `pnpm compose:vergleich` Unterschiede zwischen den Compose-Dateien meldet (auch Coolify).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = path.join(ROOT, "scripts", "compose-vergleich.mjs");

const ordner: string[] = [];
afterEach(() => {
  for (const dir of ordner.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Ruft den Befehl wirklich auf; mit zwei Texten vergleicht er diese statt der echten Dateien. */
function vergleich(texte?: { bau: string; image: string; coolify?: string }) {
  const args: string[] = [];
  if (texte) {
    const dir = mkdtempSync(path.join(tmpdir(), "paibot-compose-vergleich-"));
    ordner.push(dir);
    const bau = path.join(dir, "bau.yml");
    const image = path.join(dir, "image.yml");
    writeFileSync(bau, texte.bau);
    writeFileSync(image, texte.image);
    args.push(bau, image);
    if (texte.coolify !== undefined) {
      const coolify = path.join(dir, "coolify.yml");
      writeFileSync(coolify, texte.coolify);
      args.push(coolify);
    }
  }
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: "utf8" });
  return { code: result.status, ausgabe: `${result.stdout}${result.stderr}` };
}

const IMAGE = `    image: ghcr.io/oliverhees/paibot:${"$"}{PAIBOT_VERSION:?Version fehlt}`;

/** Kleine Aufstellung mit den drei PaiBot-Diensten und einer Datenbank. */
function aufstellung(art: "bau" | "image", extra: Partial<Record<string, string[]>> = {}): string {
  const dienst = (name: string) => [
    `  ${name}:`,
    ...(art === "bau"
      ? ["    image: paibot:lokal", "    build:", "      context: ..", "      target: app"]
      : [IMAGE]),
    "    read_only: true",
    "    logging: *logging",
    "    mem_limit: 512m",
    "    pids_limit: 256",
    ...(name === "web"
      ? [
          "    environment:",
          `      APP_URL: ${"$"}{APP_URL:?APP_URL fehlt}`,
          `      TRUST_PROXY: ${"$"}{TRUST_PROXY:-1}`,
        ]
      : []),
    ...(extra[name] ?? []),
  ];
  return [
    "# Kommentar zählt nicht",
    "x-logging: &logging",
    "  driver: json-file",
    "  options:",
    '    max-size: "10m"',
    '    max-file: "3"',
    "services:",
    "  postgres:",
    "    image: postgres:18",
    "    logging: *logging",
    ...(extra.postgres ?? []),
    "",
    ...dienst("migrate"),
    ...dienst("web"),
    ...dienst("worker"),
    "volumes:",
    "  daten:",
    "",
  ].join("\n");
}

const D = "$";
const GEHEIM_BAU = {
  postgres: [
    "    environment:",
    `      POSTGRES_PASSWORD: ${D}{POSTGRES_PASSWORD:?fehlt}`,
    "    cap_drop: [ALL]",
  ],
  migrate: [
    '    restart: "no"',
    "    environment:",
    `      DATABASE_URL: postgres://app:${D}{POSTGRES_APP_PASSWORD:?fehlt}@postgres:5432/db`,
    `      DATABASE_MIGRATION_URL: postgres://owner:${D}{POSTGRES_PASSWORD}@postgres:5432/db`,
  ],
  worker: ["    environment:", `      PAIBOT_SECRET: ${D}{PAIBOT_SECRET:?fehlt}`],
};

/** Coolify-Datei zur kleinen Aufstellung: web zuerst, Geheimnisse und Adresse aus Coolify. */
function coolify(ersetzen: (text: string) => string = (t) => t, webZuerst = true): string {
  const bau = aufstellung("bau", GEHEIM_BAU);
  const start = bau.indexOf("  postgres:");
  const web = bau.indexOf("  web:");
  const worker = bau.indexOf("  worker:");
  const umgestellt = `${bau.slice(0, start)}${bau.slice(web, worker)}${bau.slice(start, web)}${bau.slice(worker)}`;
  return ersetzen(
    (webZuerst ? umgestellt : bau)
      .replace(
        `      APP_URL: ${D}{APP_URL:?APP_URL fehlt}`,
        `      APP_URL: ${D}{SERVICE_URL_WEB}\n      SERVICE_URL_WEB_3000:`,
      )
      .replace(`${D}{POSTGRES_PASSWORD:?fehlt}`, `${D}{SERVICE_HEX_64_PGOWNER}`)
      .replace(`${D}{POSTGRES_PASSWORD}`, `${D}{SERVICE_HEX_64_PGOWNER}`)
      .replace(`${D}{POSTGRES_APP_PASSWORD:?fehlt}`, `${D}{SERVICE_HEX_64_PGAPP}`)
      .replace(`${D}{PAIBOT_SECRET:?fehlt}`, `${D}{SERVICE_REALBASE64_32_PAIBOT}`),
  );
}

function mitCoolify(coolifyText: string) {
  return vergleich({
    bau: aufstellung("bau", GEHEIM_BAU),
    image: aufstellung("image", GEHEIM_BAU),
    coolify: coolifyText,
  });
}

describe("compose:vergleich", () => {
  it("die echten Compose-Dateien sind gleich aufgestellt, auch die für Coolify (Exit 0)", () => {
    const r = vergleich();
    expect(r.ausgabe).toContain("Compose-Vergleich ok");
    expect(r.ausgabe).toContain("Compose-Vergleich Coolify ok");
    expect(r.ausgabe).toContain("Schreibweisen ok");
    expect(r.code).toBe(0);
  });

  it("Coolify-Datei: nur Herkunft der Geheimnisse und Reihenfolge anders → Exit 0", () => {
    const r = mitCoolify(coolify());
    expect(r.ausgabe).toContain("Compose-Vergleich Coolify ok");
    expect(r.code).toBe(0);
  });

  it("Coolify-Datei ohne Schutz (read_only, cap_drop, restart) → jeweils Exit 1", () => {
    for (const [weg, stelle] of [
      [
        "    read_only: true\n    logging: *logging\n    mem_limit: 512m\n    pids_limit: 256\n    environment:\n      PAIBOT_SECRET",
        "Dienst worker",
      ],
      ["    cap_drop: [ALL]\n", "Dienst postgres"],
      ['    restart: "no"\n', "Dienst migrate"],
    ] as const) {
      const text = coolify();
      const ohne = weg.startsWith("    read_only")
        ? text.replace(weg, weg.replace("    read_only: true\n", ""))
        : text.replace(weg, "");
      expect(ohne).not.toBe(text);
      const r = mitCoolify(ohne);
      expect(r.code).toBe(1);
      expect(r.ausgabe).toContain(`Erster Unterschied zur Coolify-Datei (${stelle})`);
    }
  });

  it("Coolify-Datei: Standardwert für ein Geheimnis oder eigene Variable → Exit 1", () => {
    const mitStandard = mitCoolify(
      coolify((t) =>
        t.replace(`${D}{SERVICE_REALBASE64_32_PAIBOT}`, `${D}{SERVICE_REALBASE64_32_PAIBOT:-AAAA}`),
      ),
    );
    expect(mitStandard.code).toBe(1);
    expect(mitStandard.ausgabe).toContain("ohne Standard");

    const vonHand = mitCoolify(
      coolify((t) => t.replace(`${D}{SERVICE_HEX_64_PGAPP}`, `${D}{POSTGRES_APP_PASSWORD:?fehlt}`)),
    );
    expect(vonHand.code).toBe(1);
    expect(vonHand.ausgabe).toContain("Diesen Wert erzeugt Coolify");

    const fremd = mitCoolify(
      coolify((t) => t.replace(`${D}{SERVICE_HEX_64_PGAPP}`, `${D}{SERVICE_PASSWORD_PGAPP}`)),
    );
    expect(fremd.code).toBe(1);
    expect(fremd.ausgabe).toContain("ist hier nicht vorgesehen");
  });

  it("Coolify-Datei: web nicht zuerst oder ohne SERVICE_URL_WEB_3000 → Exit 1", () => {
    const nichtZuerst = mitCoolify(coolify(undefined, false));
    expect(nichtZuerst.code).toBe(1);
    expect(nichtZuerst.ausgabe).toContain("Der erste Dienst muss web sein");

    const ohnePort = mitCoolify(coolify((t) => t.replace("\n      SERVICE_URL_WEB_3000:", "")));
    expect(ohnePort.code).toBe(1);
    expect(ohnePort.ausgabe).toContain("SERVICE_URL_WEB_3000");
  });

  it("Schreibweisen, die YAML 1.1 anders liest (oktal, yes/no/on/off, Basis 60) → Exit 1", () => {
    for (const [zeile, grund] of [
      ["    shm_size: 01777", "führender Null"],
      ["    restart: no", "yes/no/on/off"],
      ["    cap_add: [on]", "yes/no/on/off"],
      ["    stop_signal: 0o17", "0o/0x/0b"],
      ["    ports: [22:22]", "Basis 60"],
      ["      - 1:30", "Basis 60"],
    ] as const) {
      const extra = { postgres: [zeile] };
      const r = vergleich({ bau: aufstellung("bau", extra), image: aufstellung("image", extra) });
      expect(r.code, zeile).toBe(1);
      expect(r.ausgabe).toContain(grund);
      expect(r.ausgabe).toMatch(/bau\.yml:\d+:/);
    }
  });

  it("Gegenprobe Schreibweisen: quotiert, dezimal und in mehrzeiligem Text erlaubt → Exit 0", () => {
    const extra = {
      postgres: [
        '    restart: "no"',
        "    shm_size: 1023",
        '    ports: ["3000:3000"]',
        "    entrypoint: |",
        "      case x in no) ;; esac",
        "      mode: 01777",
        "    user: postgres # no",
      ],
    };
    const r = vergleich({ bau: aufstellung("bau", extra), image: aufstellung("image", extra) });
    expect(r.ausgabe).toContain("Schreibweisen ok: 2 Compose-Dateien");
    expect(r.code).toBe(0);
  });

  it("gleiche Aufstellung bis auf image/build: Exit 0", () => {
    const r = vergleich({ bau: aufstellung("bau"), image: aufstellung("image") });
    expect(r.ausgabe).toContain("Compose-Vergleich ok");
    expect(r.code).toBe(0);
  });

  it("Dienst ohne Log-Grenzen oder APP_URL mit Standard: jeweils Exit 1", () => {
    const ohneLog = aufstellung("bau").replace(
      "  postgres:\n    image: postgres:18\n    logging: *logging",
      "  postgres:\n    image: postgres:18",
    );
    const r1 = vergleich({
      bau: ohneLog,
      image: aufstellung("image").replace(
        "  postgres:\n    image: postgres:18\n    logging: *logging",
        "  postgres:\n    image: postgres:18",
      ),
    });
    expect(r1.code).toBe(1);
    expect(r1.ausgabe).toContain("Dienst postgres braucht „logging: *logging“");
    const mitStandard = (art: "bau" | "image") =>
      aufstellung(art).replace("APP_URL:?APP_URL fehlt", "APP_URL:-http://localhost:3000");
    const r2 = vergleich({ bau: mitStandard("bau"), image: mitStandard("image") });
    expect(r2.code).toBe(1);
    expect(r2.ausgabe).toContain("APP_URL");
  });

  it("andere Grenze in nur einer Datei: Exit 1 mit der Stelle", () => {
    const r = vergleich({
      bau: aufstellung("bau"),
      image: aufstellung("image", { worker: ["    pids_limit: 64"] }),
    });
    expect(r.code).toBe(1);
    expect(r.ausgabe).toContain("Erster Unterschied in der Aufstellung");
    expect(r.ausgabe).toContain("pids_limit: 64");
    expect(r.ausgabe).not.toContain("Compose-Vergleich ok");
  });

  it("„latest“, Bau-Eintrag im Image oder fehlendes build: jeweils Exit 1", () => {
    const latest = aufstellung("image", { postgres: ["    labels: [latest]"] });
    const r1 = vergleich({
      bau: aufstellung("bau", { postgres: ["    labels: [latest]"] }),
      image: latest,
    });
    expect(r1.code).toBe(1);
    expect(r1.ausgabe).toContain("„latest“ ist nicht erlaubt");

    const mitBau = aufstellung("image").replace(
      `${IMAGE}\n    read_only`,
      `${IMAGE}\n    build:\n    read_only`,
    );
    const r2 = vergleich({ bau: aufstellung("bau"), image: mitBau });
    expect(r2.code).toBe(1);
    expect(r2.ausgabe).toContain("darf keinen Bau-Eintrag haben");

    const ohneBau = aufstellung("bau").replace(
      "    build:\n      context: ..\n      target: app\n",
      "",
    );
    const r3 = vergleich({ bau: ohneBau, image: aufstellung("image") });
    expect(r3.code).toBe(1);
    expect(r3.ausgabe).toContain("nicht genau „image: paibot:lokal“ und „build:“");
  });

  it("Image ohne Pflicht-Version: Exit 1", () => {
    const r = vergleich({
      bau: aufstellung("bau"),
      image: aufstellung("image").replaceAll(IMAGE, "    image: ghcr.io/oliverhees/paibot:1.0.0"),
    });
    expect(r.code).toBe(1);
    expect(r.ausgabe).toContain("Pflichtwert, ohne Standard");
  });
});
