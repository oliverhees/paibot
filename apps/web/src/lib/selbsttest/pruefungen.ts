/**
 * PaiBot – Prüfungen des Selbsttests als reine Funktionen: Jede bekommt nur, was sie braucht, und
 * liefert Ergebnis (in Ordnung, Hinweis, Fehler), Satz und Ausweg. Kein Ergebnis nennt Adressen,
 * Namen von Rollen oder Geheimnisse. Läuft auf dem Server und im Browser (ohne Zod).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";

export type PruefErgebnis = "ok" | "hinweis" | "fehler";

/** Kennungen der Prüfungen in der Reihenfolge der Seite. */
export const PRUEF_IDS = [
  "adresse",
  "proxy",
  "verbindung",
  "kopfzeilen",
  "rolle",
  "schalter",
  "migrationen",
  "worker",
  "schleuse",
  "einrichtung",
  "notaus",
  "zugang",
  "version",
] as const;
export type PruefId = (typeof PRUEF_IDS)[number];

/** Prüfungen, die nur der Browser sehen kann (seine Verbindung, ankommende Kopfzeilen). */
export const BROWSER_PRUEFUNGEN = ["verbindung", "kopfzeilen"] as const satisfies PruefId[];

export interface Pruefung {
  id: PruefId;
  ergebnis: PruefErgebnis;
  titel: string;
  text: string;
  ausweg?: string;
}

function pruefung(id: PruefId, ergebnis: PruefErgebnis, text: string, ausweg?: string): Pruefung {
  return {
    id,
    ergebnis,
    titel: t(`selbsttest.${id}.titel` as "selbsttest.adresse.titel"),
    text,
    ...(ausweg === undefined ? {} : { ausweg }),
  };
}

function unbekannt(id: PruefId): Pruefung {
  return pruefung(id, "hinweis", t("selbsttest.unbekannt"), t("selbsttest.unbekannt.ausweg"));
}

/**
 * `APP_URL` (nur ihr Origin, wird nicht weitergegeben) gegen den Host der Anfrage: fehlt → Fehler,
 * anderer Host → Fehler, `http://` → Hinweis, sonst in Ordnung.
 */
export function pruefeAdresse(eingabe: {
  appOrigin: string | undefined;
  host: string | null;
}): Pruefung {
  const { appOrigin, host } = eingabe;
  if (appOrigin === undefined) {
    return pruefung(
      "adresse",
      "fehler",
      t("selbsttest.adresse.fehlt"),
      t("selbsttest.adresse.fehlt.ausweg"),
    );
  }
  let erwartet: string;
  try {
    erwartet = new URL(appOrigin).host;
  } catch {
    return pruefung(
      "adresse",
      "fehler",
      t("selbsttest.adresse.fehlt"),
      t("selbsttest.adresse.fehlt.ausweg"),
    );
  }
  if (host !== null && host.trim().toLowerCase() !== erwartet) {
    return pruefung(
      "adresse",
      "fehler",
      t("selbsttest.adresse.anders"),
      t("selbsttest.adresse.anders.ausweg"),
    );
  }
  if (!appOrigin.startsWith("https://")) {
    return pruefung(
      "adresse",
      "hinweis",
      t("selbsttest.adresse.http"),
      t("selbsttest.adresse.http.ausweg"),
    );
  }
  return pruefung("adresse", "ok", t("selbsttest.adresse.ok"));
}

/**
 * `TRUST_PROXY` gegen die beobachtete Anfrage: Kam eine weitergereichte Adresse
 * (`X-Forwarded-For`) an? Beides passend → in Ordnung, sonst Hinweis mit Ausweg.
 */
export function pruefeProxy(eingabe: { vertraut: boolean; weitergereicht: boolean }): Pruefung {
  if (eingabe.vertraut && eingabe.weitergereicht) {
    return pruefung("proxy", "ok", t("selbsttest.proxy.ok_mit"));
  }
  if (!eingabe.vertraut && !eingabe.weitergereicht) {
    return pruefung("proxy", "ok", t("selbsttest.proxy.ok_ohne"));
  }
  if (eingabe.vertraut) {
    return pruefung(
      "proxy",
      "hinweis",
      t("selbsttest.proxy.ohne_adresse"),
      t("selbsttest.proxy.ohne_adresse.ausweg"),
    );
  }
  return pruefung(
    "proxy",
    "hinweis",
    t("selbsttest.proxy.nicht_vertraut"),
    t("selbsttest.proxy.nicht_vertraut.ausweg"),
  );
}

/** Namen, unter denen ein Browser den eigenen Rechner erreicht. */
function istEigenerRechner(host: string): boolean {
  const ohnePort = host.startsWith("[")
    ? host.slice(1, host.indexOf("]"))
    : host.replace(/:\d+$/, "");
  const name = ohnePort.toLowerCase();
  return (
    name === "localhost" || name.endsWith(".localhost") || name === "::1" || /^127\./.test(name)
  );
}

/** Verbindung des Browsers: https → in Ordnung; http zum eigenen Rechner → Hinweis; sonst Fehler. */
export function pruefeVerbindung(eingabe: { protokoll: string; host: string }): Pruefung {
  if (eingabe.protokoll === "https:") {
    return pruefung("verbindung", "ok", t("selbsttest.verbindung.ok"));
  }
  return pruefung(
    "verbindung",
    istEigenerRechner(eingabe.host) ? "hinweis" : "fehler",
    istEigenerRechner(eingabe.host)
      ? t("selbsttest.verbindung.lokal")
      : t("selbsttest.verbindung.offen"),
    t("selbsttest.verbindung.ausweg"),
  );
}

/** Schutz-Kopfzeilen, die jede Antwort von PaiBot trägt (ohne HSTS). */
export const PFLICHT_KOPFZEILEN = [
  "content-security-policy",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
] as const;

/**
 * Kopfzeilen, wie sie beim Browser ankommen. Fehlt eine Pflicht-Kopfzeile → Fehler (Name in der
 * Liste); über https ohne HSTS → Hinweis; über http zählt HSTS nicht.
 */
export function pruefeKopfzeilen(eingabe: {
  https: boolean;
  kopf: (name: string) => string | null;
}): Pruefung {
  const fehlen = PFLICHT_KOPFZEILEN.filter((name) => !eingabe.kopf(name));
  if (fehlen.length > 0) {
    return pruefung(
      "kopfzeilen",
      "fehler",
      t("selbsttest.kopfzeilen.fehlen", { liste: fehlen.join(", ") }),
      t("selbsttest.kopfzeilen.fehlen.ausweg"),
    );
  }
  if (!eingabe.https) return pruefung("kopfzeilen", "ok", t("selbsttest.kopfzeilen.ok_http"));
  const hsts = eingabe.kopf("strict-transport-security") ?? "";
  if (!/max-age=\s*[1-9]/i.test(hsts)) {
    return pruefung(
      "kopfzeilen",
      "hinweis",
      t("selbsttest.kopfzeilen.hsts"),
      t("selbsttest.kopfzeilen.hsts.ausweg"),
    );
  }
  return pruefung("kopfzeilen", "ok", t("selbsttest.kopfzeilen.ok"));
}

/** Rechte der Datenbank-Rolle der App; `gruende` als lesbare Sätze ohne Namen. */
export function pruefeRolle(
  rolle: { status: "eingeschraenkt" | "zu_viele_rechte"; gruende: readonly string[] } | undefined,
): Pruefung {
  if (rolle === undefined) return unbekannt("rolle");
  if (rolle.status === "eingeschraenkt") return pruefung("rolle", "ok", t("selbsttest.rolle.ok"));
  return pruefung(
    "rolle",
    "fehler",
    t("selbsttest.rolle.zu_viel", { gruende: rolle.gruende.join("; ") }),
    t("selbsttest.rolle.zu_viel.ausweg"),
  );
}

/** `PAIBOT_ALLOW_PRIVILEGED_DB`: aus → in Ordnung; an → Fehler bei zu vielen Rechten, sonst Hinweis. */
export function pruefeSchalter(eingabe: { an: boolean; zuVieleRechte: boolean }): Pruefung {
  if (!eingabe.an) return pruefung("schalter", "ok", t("selbsttest.schalter.ok"));
  return pruefung(
    "schalter",
    eingabe.zuVieleRechte ? "fehler" : "hinweis",
    t("selbsttest.schalter.an"),
    t("selbsttest.schalter.an.ausweg"),
  );
}

/** Stand der Migrationen gegenüber dieser Version. */
export function pruefeMigrationen(
  stand:
    | { status: "aktuell" | "veraltet" | "leer" | "neuer"; expected: number; applied: number }
    | undefined,
): Pruefung {
  if (stand === undefined) return unbekannt("migrationen");
  switch (stand.status) {
    case "aktuell":
      return pruefung("migrationen", "ok", t("selbsttest.migrationen.ok"));
    case "neuer":
      return pruefung(
        "migrationen",
        "hinweis",
        t("selbsttest.migrationen.neuer"),
        t("selbsttest.migrationen.neuer.ausweg"),
      );
    default:
      return pruefung(
        "migrationen",
        "fehler",
        t("selbsttest.migrationen.veraltet", {
          angewendet: stand.applied,
          erwartet: stand.expected,
        }),
        t("selbsttest.migrationen.veraltet.ausweg"),
      );
  }
}

/** Letzte Meldung des Workers (er meldet alle 30 Sekunden); `zeit` schon als Text. */
export interface WorkerBefund {
  zustand: "aus" | "nicht_erreichbar" | "schluessel_falsch" | "bereit";
  veraltet: boolean;
  zeit: string;
}

/** Worker: nie gemeldet oder veraltet → Fehler, sonst in Ordnung mit der Zeit. */
export function pruefeWorker(worker: WorkerBefund | undefined): Pruefung {
  if (worker === undefined) {
    return pruefung("worker", "fehler", t("selbsttest.worker.nie"), t("selbsttest.worker.ausweg"));
  }
  if (worker.veraltet) {
    return pruefung(
      "worker",
      "fehler",
      t("selbsttest.worker.veraltet", { zeit: worker.zeit }),
      t("selbsttest.worker.ausweg"),
    );
  }
  return pruefung("worker", "ok", t("selbsttest.worker.ok", { zeit: worker.zeit }));
}

/** Datenschleuse nach der Meldung des Workers; ohne frische Meldung unbekannt. */
export function pruefeSchleuse(worker: WorkerBefund | undefined): Pruefung {
  if (worker === undefined || worker.veraltet) {
    return pruefung(
      "schleuse",
      "hinweis",
      t("selbsttest.schleuse.unbekannt"),
      t("selbsttest.worker.ausweg"),
    );
  }
  switch (worker.zustand) {
    case "aus":
      return pruefung("schleuse", "ok", t("selbsttest.schleuse.aus"));
    case "bereit":
      return pruefung("schleuse", "ok", t("selbsttest.schleuse.bereit"));
    case "nicht_erreichbar":
      return pruefung(
        "schleuse",
        "fehler",
        t("datenschleuse.zustand.nicht_erreichbar"),
        t("datenschleuse.zustand.nicht_erreichbar.ausweg"),
      );
    case "schluessel_falsch":
      return pruefung(
        "schleuse",
        "fehler",
        t("datenschleuse.zustand.schluessel_falsch"),
        t("datenschleuse.zustand.schluessel_falsch.ausweg"),
      );
  }
}

export function pruefeEinrichtung(abgeschlossen: boolean): Pruefung {
  return abgeschlossen
    ? pruefung("einrichtung", "ok", t("selbsttest.einrichtung.ok"))
    : pruefung(
        "einrichtung",
        "fehler",
        t("selbsttest.einrichtung.offen"),
        t("selbsttest.einrichtung.offen.ausweg"),
      );
}

export function pruefeNotAus(an: boolean): Pruefung {
  return an
    ? pruefung("notaus", "hinweis", t("selbsttest.notaus.an"), t("selbsttest.notaus.an.ausweg"))
    : pruefung("notaus", "ok", t("selbsttest.notaus.aus"));
}

/** Zahl bekannter Geräte und offener Sitzungen; immer mit Ausweg, falls eins fremd ist. */
export function pruefeZugang(eingabe: { geraete: number; sitzungen: number }): Pruefung {
  return pruefung(
    "zugang",
    "ok",
    t("selbsttest.zugang.text", { geraete: eingabe.geraete, sitzungen: eingabe.sitzungen }),
    t("selbsttest.zugang.ausweg"),
  );
}

export function pruefeVersion(stand: string): Pruefung {
  return pruefung("version", "ok", t("selbsttest.version.text", { stand }));
}

/** Zahl der Ergebnisse je Art. */
export function zusammenfassung(pruefungen: readonly Pruefung[]): Record<PruefErgebnis, number> {
  const summe = { ok: 0, hinweis: 0, fehler: 0 };
  for (const p of pruefungen) summe[p.ergebnis] += 1;
  return summe;
}

/** Fügt Server- und Browser-Prüfungen in der Reihenfolge von `PRUEF_IDS` zusammen. */
export function geordnet(pruefungen: readonly Pruefung[]): Pruefung[] {
  return [...pruefungen].sort((a, b) => PRUEF_IDS.indexOf(a.id) - PRUEF_IDS.indexOf(b.id));
}
