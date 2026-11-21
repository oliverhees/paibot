/**
 * PaiBot – Tests der Prüfungen des Selbsttests: jede Prüfung mit gutem und schlechtem Fall, jedes
 * Ergebnis außer „in Ordnung“ mit Ausweg.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import {
  geordnet,
  PRUEF_IDS,
  type Pruefung,
  proxyErkennbar,
  pruefeAdresse,
  pruefeEinrichtung,
  pruefeKopfzeilen,
  pruefeMigrationen,
  pruefeNotAus,
  pruefeProxy,
  pruefeRolle,
  pruefeSchalter,
  pruefeSchleuse,
  pruefeVerbindung,
  pruefeVersion,
  pruefeWorker,
  pruefeZugang,
  zusammenfassung,
} from "./pruefungen";

function mitAusweg(p: Pruefung) {
  expect(p.titel.length).toBeGreaterThan(0);
  expect(p.text.length).toBeGreaterThan(0);
  if (p.ergebnis !== "ok") expect(p.ausweg, `${p.id}: Ausweg`).toBeTruthy();
  return p;
}

const KOPF = {
  "content-security-policy": "default-src 'self'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=()",
  "strict-transport-security": "max-age=31536000",
} as Record<string, string>;

function kopf(ohne: string[] = []) {
  return (name: string) => (ohne.includes(name) ? null : (KOPF[name] ?? null));
}

const WORKER = { zustand: "bereit", veraltet: false, zeit: "21.11.2026, 14:31" } as const;

describe("Prüfungen des Selbsttests", () => {
  it("Adresse: https und passender Host gut; fehlt, anderer Host, http schlecht", () => {
    const appOrigin = "https://paibot.example.de";
    expect(mitAusweg(pruefeAdresse({ appOrigin, host: "paibot.example.de" })).ergebnis).toBe("ok");
    expect(mitAusweg(pruefeAdresse({ appOrigin: undefined, host: "x" })).ergebnis).toBe("fehler");
    const anders = mitAusweg(pruefeAdresse({ appOrigin, host: "10.0.0.5:3000" }));
    expect(anders.ergebnis).toBe("fehler");
    expect(
      mitAusweg(pruefeAdresse({ appOrigin: "http://paibot.lan", host: "paibot.lan" })).ergebnis,
    ).toBe("hinweis");
    // Kein Ergebnis nennt die Adressen selbst.
    expect(JSON.stringify(anders)).not.toMatch(/paibot\.example\.de|10\.0\.0\.5/);
  });

  it("Proxy: „in Ordnung“ nur mit erkennbarem Proxy; ohne Zeichen bei TRUST_PROXY=1 nicht feststellbar", () => {
    expect(pruefeProxy({ vertraut: true, erkennbar: true }).ergebnis).toBe("ok");
    expect(pruefeProxy({ vertraut: false, erkennbar: false }).ergebnis).toBe("ok");
    const ohne = mitAusweg(pruefeProxy({ vertraut: true, erkennbar: false }));
    expect(ohne.ergebnis).toBe("hinweis");
    expect(ohne.text).toContain("nicht feststellen");
    expect(ohne.ausweg).toContain("TRUST_PROXY=0");
    const nicht = mitAusweg(pruefeProxy({ vertraut: false, erkennbar: true }));
    expect(nicht.ergebnis).toBe("hinweis");
    expect(nicht.ausweg).toContain("TRUST_PROXY=1");
  });

  it("Proxy erkennbar: nicht an der Adress-Kopfzeile allein, die die App selbst setzt", () => {
    const kopf = (werte: Record<string, string>) => (name: string) => werte[name] ?? null;
    expect(proxyErkennbar(kopf({}))).toBe(false);
    expect(proxyErkennbar(kopf({ "x-forwarded-for": "203.0.113.7" }))).toBe(false);
    expect(proxyErkennbar(kopf({ "x-forwarded-for": "203.0.113.7, 10.0.0.2" }))).toBe(true);
    expect(proxyErkennbar(kopf({ "x-real-ip": "203.0.113.7" }))).toBe(true);
    expect(proxyErkennbar(kopf({ forwarded: "for=203.0.113.7" }))).toBe(true);
    expect(proxyErkennbar(kopf({ via: "1.1 caddy" }))).toBe(true);
    expect(proxyErkennbar(kopf({ "x-forwarded-server": "traefik" }))).toBe(true);
    expect(proxyErkennbar(kopf({ via: "  " }))).toBe(false);
  });

  it("Verbindung: https gut, http lokal Hinweis, http über Netz Fehler", () => {
    expect(pruefeVerbindung({ protokoll: "https:", host: "paibot.example.de" }).ergebnis).toBe(
      "ok",
    );
    expect(
      mitAusweg(pruefeVerbindung({ protokoll: "http:", host: "localhost:3000" })).ergebnis,
    ).toBe("hinweis");
    expect(
      mitAusweg(pruefeVerbindung({ protokoll: "http:", host: "127.0.0.1:3000" })).ergebnis,
    ).toBe("hinweis");
    expect(mitAusweg(pruefeVerbindung({ protokoll: "http:", host: "192.168.1.20" })).ergebnis).toBe(
      "fehler",
    );
  });

  it("Kopfzeilen: alle da gut; eine fehlt Fehler mit Namen; HSTS fehlt über https Hinweis", () => {
    expect(pruefeKopfzeilen({ https: true, kopf: kopf() }).ergebnis).toBe("ok");
    expect(
      pruefeKopfzeilen({ https: false, kopf: kopf(["strict-transport-security"]) }).ergebnis,
    ).toBe("ok");
    const fehlt = mitAusweg(pruefeKopfzeilen({ https: true, kopf: kopf(["x-frame-options"]) }));
    expect(fehlt.ergebnis).toBe("fehler");
    expect(fehlt.text).toContain("x-frame-options");
    const hsts = mitAusweg(
      pruefeKopfzeilen({ https: true, kopf: kopf(["strict-transport-security"]) }),
    );
    expect(hsts.ergebnis).toBe("hinweis");
    const null_ = pruefeKopfzeilen({
      https: true,
      kopf: (n) => (n === "strict-transport-security" ? "max-age=0" : kopf()(n)),
    });
    expect(null_.ergebnis).toBe("hinweis");
  });

  it("Rolle: eingeschränkt gut, zu viele Rechte Fehler mit Gründen, unbekannt Hinweis", () => {
    expect(pruefeRolle({ status: "eingeschraenkt", gruende: [] }).ergebnis).toBe("ok");
    const zuViel = mitAusweg(
      pruefeRolle({ status: "zu_viele_rechte", gruende: ["ist Superuser"] }),
    );
    expect(zuViel.ergebnis).toBe("fehler");
    expect(zuViel.text).toContain("ist Superuser");
    expect(mitAusweg(pruefeRolle(undefined)).ergebnis).toBe("hinweis");
  });

  it("Schalter PAIBOT_ALLOW_PRIVILEGED_DB: aus gut, an Hinweis bzw. Fehler", () => {
    expect(pruefeSchalter({ an: false, zuVieleRechte: true }).ergebnis).toBe("ok");
    expect(mitAusweg(pruefeSchalter({ an: true, zuVieleRechte: false })).ergebnis).toBe("hinweis");
    expect(mitAusweg(pruefeSchalter({ an: true, zuVieleRechte: true })).ergebnis).toBe("fehler");
  });

  it("Migrationen: aktuell gut, veraltet/leer Fehler, neuer und unbekannt Hinweis", () => {
    expect(pruefeMigrationen({ status: "aktuell", expected: 11, applied: 11 }).ergebnis).toBe("ok");
    const alt = mitAusweg(pruefeMigrationen({ status: "veraltet", expected: 11, applied: 9 }));
    expect(alt.ergebnis).toBe("fehler");
    expect(alt.text).toContain("9 von 11");
    expect(
      mitAusweg(pruefeMigrationen({ status: "leer", expected: 11, applied: 0 })).ergebnis,
    ).toBe("fehler");
    expect(
      mitAusweg(pruefeMigrationen({ status: "neuer", expected: 11, applied: 12 })).ergebnis,
    ).toBe("hinweis");
    expect(mitAusweg(pruefeMigrationen(undefined)).ergebnis).toBe("hinweis");
  });

  it("Worker: frische Meldung gut, nie oder veraltet Fehler", () => {
    const ok = pruefeWorker(WORKER);
    expect(ok.ergebnis).toBe("ok");
    expect(ok.text).toContain(WORKER.zeit);
    expect(mitAusweg(pruefeWorker(undefined)).ergebnis).toBe("fehler");
    expect(mitAusweg(pruefeWorker({ ...WORKER, veraltet: true })).ergebnis).toBe("fehler");
  });

  it("Datenschleuse: aus oder bereit gut, Fehlerzustände Fehler, ohne Worker Hinweis", () => {
    expect(pruefeSchleuse(WORKER).ergebnis).toBe("ok");
    expect(pruefeSchleuse({ ...WORKER, zustand: "aus" }).ergebnis).toBe("ok");
    for (const zustand of ["nicht_erreichbar", "schluessel_falsch"] as const) {
      expect(mitAusweg(pruefeSchleuse({ ...WORKER, zustand })).ergebnis).toBe("fehler");
    }
    expect(mitAusweg(pruefeSchleuse({ ...WORKER, veraltet: true })).ergebnis).toBe("hinweis");
    expect(mitAusweg(pruefeSchleuse(undefined)).ergebnis).toBe("hinweis");
  });

  it("Einrichtung, Not-Aus, Zugang und Version", () => {
    expect(pruefeEinrichtung(true).ergebnis).toBe("ok");
    expect(mitAusweg(pruefeEinrichtung(false)).ergebnis).toBe("fehler");
    expect(pruefeNotAus(false).ergebnis).toBe("ok");
    expect(mitAusweg(pruefeNotAus(true)).ergebnis).toBe("hinweis");
    const zugang = pruefeZugang({ geraete: 2, sitzungen: 3 });
    expect(zugang.text).toBe("Bekannte Geräte: 2. Offene Sitzungen: 3.");
    expect(zugang.ausweg).toBeTruthy();
    expect(pruefeVersion("1.2.3 (abc1234)").text).toContain("1.2.3 (abc1234)");
  });

  it("Zusammenfassung zählt je Ergebnis, Reihenfolge folgt der festen Liste", () => {
    const liste = [pruefeVersion("x"), pruefeNotAus(true), pruefeEinrichtung(false)];
    expect(zusammenfassung(liste)).toEqual({ ok: 1, hinweis: 1, fehler: 1 });
    expect(geordnet(liste).map((p) => p.id)).toEqual(["einrichtung", "notaus", "version"]);
    expect(new Set(PRUEF_IDS).size).toBe(PRUEF_IDS.length);
  });
});
