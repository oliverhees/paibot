/**
 * PaiBot – Entscheidung des Proxys je Anfrage: durchlassen, umleiten oder (bei API-Routen ohne
 * Sitzung) mit 401 antworten. Reine Funktion, damit sie sich vollständig testen lässt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { API_ROUTEN, type RoutenDefinition } from "../routen";

export const SEITE_EINRICHTUNG = "/einrichtung";
export const SEITE_ANMELDEN = "/anmelden";
export const SEITE_APP = "/";

/** Zustand der Installation und der Anfrage, wie ihn der Proxy ermittelt. */
export interface ZugangsZustand {
  /** `undefined`: Datenbank nicht eingestellt oder nicht erreichbar. */
  eingerichtet: boolean | undefined;
  angemeldet: boolean;
}

export type ProxyEntscheidung =
  | { art: "weiter"; vorabCookie: boolean }
  | { art: "umleiten"; ziel: string }
  | { art: "nicht_angemeldet" };

/** Dateien und Framework-Pfade: nur Kopfzeilen, keine Prüfung. */
export function istDatei(pfad: string): boolean {
  return (
    pfad.startsWith("/_next/") ||
    pfad.startsWith("/fonts/") ||
    pfad.startsWith("/icons/") ||
    pfad === "/manifest.webmanifest" ||
    pfad === "/favicon.ico" ||
    pfad === "/robots.txt"
  );
}

/** Entwicklungs-Beispielseiten (in Produktion 404) bleiben ohne Anmeldung erreichbar. */
function istEntwicklungsSeite(pfad: string): boolean {
  return pfad === "/_komponenten" || pfad.startsWith("/_komponenten/");
}

function passt(muster: string, pfad: string): boolean {
  const a = muster.split("/");
  const b = pfad.replace(/\/+$/, "").split("/");
  if (a.length !== b.length) return false;
  return a.every((teil, i) => teil.startsWith(":") || teil === b[i]);
}

/** Die Route des Vertrags zu Pfad und Methode, falls es eine gibt. */
export function routeZu(pfad: string, methode: string): RoutenDefinition | undefined {
  const m = methode.toUpperCase() === "HEAD" ? "GET" : methode.toUpperCase();
  return Object.values(API_ROUTEN).find(
    (route: RoutenDefinition) => route.methode === m && passt(route.pfad, pfad),
  );
}

/** Braucht die Entscheidung den Zustand (Datenbank)? Nicht bei Dateien und offenen API-Routen. */
export function brauchtZustand(pfad: string, methode: string): boolean {
  if (istDatei(pfad)) return false;
  if (pfad === "/api" || pfad.startsWith("/api/")) {
    const route = routeZu(pfad, methode);
    return route === undefined || route.zugang === "besitzer";
  }
  return !istEntwicklungsSeite(pfad);
}

/**
 * Entscheidet für eine Anfrage:
 * - Dateien: durchlassen.
 * - API: `/api/health` und Routen mit Zugang `oeffentlich`/`vorab` durchlassen; alles andere ohne
 *   Sitzung mit 401 beantworten (die Routen prüfen die Sitzung selbst noch einmal).
 * - Seiten: ohne Einrichtung nach `/einrichtung`, nach der Einrichtung `/einrichtung` nach
 *   `/anmelden`, ohne Anmeldung nach `/anmelden`, angemeldet von `/anmelden` in die App.
 *   `/einrichtung` und `/anmelden` bekommen ein Vorab-Cookie, falls es fehlt.
 * - Ist der Zustand der Datenbank unbekannt, wird bei Seiten nicht umgeleitet (die Seite zeigt den
 *   Fehler), API-Routen ohne Sitzung bekommen trotzdem 401.
 */
export function entscheide(
  pfad: string,
  methode: string,
  zustand: ZugangsZustand,
  vorabVorhanden: boolean,
): ProxyEntscheidung {
  if (istDatei(pfad)) return { art: "weiter", vorabCookie: false };

  if (pfad === "/api" || pfad.startsWith("/api/")) {
    const route = routeZu(pfad, methode);
    if (route !== undefined && route.zugang !== "besitzer") {
      return { art: "weiter", vorabCookie: false };
    }
    return zustand.angemeldet ? { art: "weiter", vorabCookie: false } : { art: "nicht_angemeldet" };
  }

  if (istEntwicklungsSeite(pfad)) return { art: "weiter", vorabCookie: false };

  const vorabSeite = pfad === SEITE_EINRICHTUNG || pfad === SEITE_ANMELDEN;
  const vorab = vorabSeite && !vorabVorhanden;
  if (zustand.eingerichtet === undefined) return { art: "weiter", vorabCookie: vorab };

  if (!zustand.eingerichtet) {
    return pfad === SEITE_EINRICHTUNG
      ? { art: "weiter", vorabCookie: vorab }
      : { art: "umleiten", ziel: SEITE_EINRICHTUNG };
  }
  if (pfad === SEITE_EINRICHTUNG) {
    return { art: "umleiten", ziel: zustand.angemeldet ? SEITE_APP : SEITE_ANMELDEN };
  }
  if (pfad === SEITE_ANMELDEN) {
    return zustand.angemeldet
      ? { art: "umleiten", ziel: SEITE_APP }
      : { art: "weiter", vorabCookie: vorab };
  }
  return zustand.angemeldet
    ? { art: "weiter", vorabCookie: false }
    : { art: "umleiten", ziel: SEITE_ANMELDEN };
}
