/**
 * PaiBot – Test, dass `pnpm compose:vergleich` Unterschiede zwischen den Compose-Dateien meldet.
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
function vergleich(texte?: { bau: string; image: string }) {
  const args: string[] = [];
  if (texte) {
    const dir = mkdtempSync(path.join(tmpdir(), "paibot-compose-vergleich-"));
    ordner.push(dir);
    const bau = path.join(dir, "bau.yml");
    const image = path.join(dir, "image.yml");
    writeFileSync(bau, texte.bau);
    writeFileSync(image, texte.image);
    args.push(bau, image);
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
    "    mem_limit: 512m",
    "    pids_limit: 256",
    ...(name === "web" ? ["    environment:", `      TRUST_PROXY: ${"$"}{TRUST_PROXY:-1}`] : []),
    ...(extra[name] ?? []),
  ];
  return [
    "# Kommentar zählt nicht",
    "services:",
    "  postgres:",
    "    image: postgres:18",
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

describe("compose:vergleich", () => {
  it("die echten Compose-Dateien sind gleich aufgestellt (Exit 0)", () => {
    const r = vergleich();
    expect(r.ausgabe).toContain("Compose-Vergleich ok");
    expect(r.code).toBe(0);
  });

  it("gleiche Aufstellung bis auf image/build: Exit 0", () => {
    const r = vergleich({ bau: aufstellung("bau"), image: aufstellung("image") });
    expect(r.ausgabe).toContain("Compose-Vergleich ok");
    expect(r.code).toBe(0);
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
