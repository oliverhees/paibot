/**
 * PaiBot – Tests des Laders für Team-Vorlagen: liest den Ordner aus dem Image, prüft jede Datei,
 * lehnt Ungültiges und Kennungen mit Pfad-Anteilen ab und braucht kein Netz.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ladeVorlage,
  ladeVorlagen,
  TEAM_VORLAGEN_ORDNER,
  TeamVorlagenFehler,
  VORLAGE_KENNUNG_MUSTER,
  VORLAGEN_MAX,
  vorlagenOrdner,
} from "./vorlagen";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const QUELLE = readFileSync(path.join(HIER, "vorlagen.ts"), "utf8");
const ECHTER_ORDNER = path.resolve(HIER, "../../../../../..", "vorlagen/teams");

function neuerOrdner(): string {
  return mkdtempSync(path.join(tmpdir(), "paibot-team-vorlagen-"));
}

/** Legt einen Ordner mit einer Kopie der echten Vorlage unter neuem Namen an. */
function ordnerMitKopie(kennung: string): string {
  const ordner = neuerOrdner();
  writeFileSync(
    path.join(ordner, `${kennung}.json`),
    readFileSync(path.join(ECHTER_ORDNER, "content-team.json"), "utf8"),
  );
  return ordner;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Ordner der Vorlagen", () => {
  it("nimmt PAIBOT_TEAM_VORLAGEN, wenn sie gesetzt ist", () => {
    expect(vorlagenOrdner({ PAIBOT_TEAM_VORLAGEN: "/app/vorlagen/teams" }, "/stamm")).toBe(
      "/app/vorlagen/teams",
    );
  });

  it("nimmt sonst den festen Ort unter dem Projektstamm", () => {
    expect(vorlagenOrdner({}, "/stamm")).toBe(path.join("/stamm", TEAM_VORLAGEN_ORDNER));
    expect(vorlagenOrdner({ PAIBOT_TEAM_VORLAGEN: "" }, "/stamm")).toBe(
      path.join("/stamm", TEAM_VORLAGEN_ORDNER),
    );
  });

  it("findet den Ordner ohne Umgebungsvariable vom Arbeitsordner aufwärts", async () => {
    vi.stubEnv("PAIBOT_TEAM_VORLAGEN", "");
    vi.spyOn(process, "cwd").mockReturnValue(HIER);
    const liste = await ladeVorlagen();
    expect(liste.map((v) => v.kennung)).toContain("content-team");
  });
});

describe("Vorlagen laden", () => {
  it("liefert die Vorlage „Content-Team“ mit Titel, Entwurf und Abdruck", async () => {
    const liste = await ladeVorlagen({ ordner: ECHTER_ORDNER });
    const vorlage = liste.find((v) => v.kennung === "content-team");
    expect(vorlage).toBeDefined();
    if (vorlage === undefined) return;
    expect(vorlage.titel).toBe("Content-Team");
    expect(vorlage.entwurf.team.name).toBe("Content");
    expect(vorlage.entwurf.bots).toHaveLength(4);
    expect(vorlage.abdruck).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(vorlage.hinweise).toEqual([]);
  });

  it("nennt als Herkunft die Kennung mit der Fassung aus dem Abdruck", async () => {
    const [vorlage] = await ladeVorlagen({ ordner: ECHTER_ORDNER });
    if (vorlage === undefined) throw new Error("keine Vorlage");
    expect(vorlage.quelle).toBe(`${vorlage.kennung}@${vorlage.abdruck.slice(7, 19)}`);
    expect(vorlage.quelle).toMatch(/^[a-z0-9-]+@[0-9a-f]{12}$/);
  });

  it("gibt bei gleichem Inhalt denselben Abdruck und dieselbe Herkunft", async () => {
    const [a] = await ladeVorlagen({ ordner: ECHTER_ORDNER });
    const [b] = await ladeVorlagen({ ordner: ECHTER_ORDNER });
    expect(a?.abdruck).toBe(b?.abdruck);
    expect(a?.quelle).toBe(b?.quelle);
  });

  it("sortiert die Vorlagen alphabetisch nach Kennung", async () => {
    const ordner = ordnerMitKopie("zebra-team");
    writeFileSync(
      path.join(ordner, "alpha-team.json"),
      readFileSync(path.join(ECHTER_ORDNER, "content-team.json"), "utf8"),
    );
    const liste = await ladeVorlagen({ ordner });
    expect(liste.map((v) => v.kennung)).toEqual(["alpha-team", "zebra-team"]);
  });

  it("übergeht Dateien, die nicht auf .json enden", async () => {
    const ordner = ordnerMitKopie("content-team");
    writeFileSync(path.join(ordner, "LIESMICH.md"), "kein Entwurf");
    const liste = await ladeVorlagen({ ordner });
    expect(liste.map((v) => v.kennung)).toEqual(["content-team"]);
  });

  it("ordnet die Modelle zu, wenn eine Liste da ist", async () => {
    const liste = await ladeVorlagen({
      ordner: ECHTER_ORDNER,
      modelle: [{ slug: "pai", eingeschaltet: true }],
    });
    expect(liste[0]?.hinweise).toEqual([]);
  });

  it("liefert eine einzelne Vorlage über ihre Kennung", async () => {
    const vorlage = await ladeVorlage("content-team", { ordner: ECHTER_ORDNER });
    expect(vorlage?.titel).toBe("Content-Team");
  });

  it("liefert nichts zu einer Kennung, die es nicht gibt", async () => {
    expect(await ladeVorlage("gibt-es-nicht", { ordner: ECHTER_ORDNER })).toBeUndefined();
  });
});

describe("Gegenproben: der Lader hält an, statt Falsches durchzulassen", () => {
  it("lehnt eine Kennung mit Pfad-Anteilen ab, ohne zu lesen", async () => {
    for (const kennung of [
      "../content-team",
      "../../etc/passwd",
      "/etc/passwd",
      "content-team.json",
      "Content-Team",
      "content team",
      "",
    ]) {
      expect(VORLAGE_KENNUNG_MUSTER.test(kennung), kennung).toBe(false);
      expect(await ladeVorlage(kennung, { ordner: ECHTER_ORDNER }), kennung).toBeUndefined();
    }
  });

  it("hält bei einer Vorlage an, die kein JSON ist", async () => {
    const ordner = neuerOrdner();
    writeFileSync(path.join(ordner, "kaputt.json"), "{ kein json");
    await expect(ladeVorlagen({ ordner })).rejects.toThrow(TeamVorlagenFehler);
  });

  it("hält bei einer Vorlage an, die gegen das Format verstößt, und nennt die Stelle", async () => {
    const ordner = neuerOrdner();
    const roh = JSON.parse(readFileSync(path.join(ECHTER_ORDNER, "content-team.json"), "utf8"));
    roh.bots[1].name = "Team Ideen";
    writeFileSync(path.join(ordner, "content-team.json"), JSON.stringify(roh));
    await expect(ladeVorlagen({ ordner })).rejects.toThrow(/bots\[1\]\.name/);
  });

  it("hält bei einem Dateinamen an, der keine Kennung ist", async () => {
    const ordner = ordnerMitKopie("Gross_Falsch");
    await expect(ladeVorlagen({ ordner })).rejects.toThrow(/keine Kennung/);
  });

  it("hält bei einem Ordner an, den es nicht gibt", async () => {
    await expect(
      ladeVorlagen({ ordner: path.join(tmpdir(), "paibot-gibt-es-nicht") }),
    ).rejects.toThrow(/nicht lesbar/);
  });

  it("hält an, wenn mehr als die Höchstzahl an Vorlagen im Ordner liegt", async () => {
    const ordner = neuerOrdner();
    const text = readFileSync(path.join(ECHTER_ORDNER, "content-team.json"), "utf8");
    for (let i = 0; i <= VORLAGEN_MAX; i += 1) {
      writeFileSync(path.join(ordner, `team-${i}.json`), text);
    }
    await expect(ladeVorlagen({ ordner })).rejects.toThrow(new RegExp(`mehr als ${VORLAGEN_MAX}`));
  });
});

describe("Die Vorlagen kommen aus dem Image, nicht aus dem Netz", () => {
  it("beim Laden des Moduls und beim Lesen aller Vorlagen geschieht kein Netzaufruf", async () => {
    const abruf = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("kein Netz"));
    vi.resetModules();
    const modul = await import("./vorlagen");
    const liste = await modul.ladeVorlagen({ ordner: ECHTER_ORDNER });
    expect(liste.length).toBeGreaterThan(0);
    await modul.ladeVorlage("content-team", { ordner: ECHTER_ORDNER });
    expect(abruf).not.toHaveBeenCalled();
  });

  it("der Quelltext ruft nichts Netzartiges auf und liest keine Datenbank", () => {
    expect(QUELLE).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|basisFetch|egress/);
    expect(QUELLE).not.toMatch(/@paibot\/db|node:https?|node:net/);
  });

  it("liest nur aus dem Dateisystem und nur diese Importe", () => {
    const importe = [...QUELLE.matchAll(/^import\s[^;]*?from\s+"([^"]+)";/gms)].map((m) => m[1]);
    expect(importe.sort()).toEqual(
      ["./format", "@paibot/shared", "node:fs/promises", "node:path"].sort(),
    );
    expect(QUELLE.match(/^import\s/gm)).toHaveLength(importe.length);
  });

  it("ist als Server-Code im Browser-Bündel gesperrt", () => {
    const buendelTest = readFileSync(
      path.join(HIER, "../../routen-browser-buendel.test.ts"),
      "utf8",
    );
    expect(buendelTest).toMatch(/team\\\/entwurf\\\/vorlagen\\\.ts\$/);
  });
});
