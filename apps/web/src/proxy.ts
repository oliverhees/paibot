/**
 * PaiBot – Proxy vor jeder Anfrage: Sicherheits-Kopfzeilen mit frischer Nonce, Stand der Software,
 * Weiterleitung zu Einrichtung bzw. Anmeldung und 401 für API-Routen ohne Sitzung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { errorBody } from "@paibot/shared/api";
import { STAND_HEADER } from "@paibot/shared/konstanten";
import { type NextRequest, NextResponse } from "next/server";
import { kopfzeilenMitNonce } from "./lib/kopfzeilen";
import { koerperGrenzeFuerPfad } from "./lib/routen";
import { stand } from "./lib/stand";
import { hostPasstNicht, istHttps } from "./lib/umgebung";
import { prozessDienste } from "./lib/zugang/dienste";
import { cookieLesen, neuerVorabWert, vorabCookie, vorabCookieName } from "./lib/zugang/sitzung";
import { brauchtZustand, entscheide, istDatei } from "./lib/zugang/weiterleitung";
import { zustandFuer } from "./lib/zugang/zustand";

function kopfzeilenSetzen(antwort: NextResponse, kopfzeilen: { key: string; value: string }[]) {
  for (const zeile of kopfzeilen) antwort.headers.set(zeile.key, zeile.value);
  antwort.headers.set(STAND_HEADER, stand());
  return antwort;
}

/** Angegebene Länge des Körpers über der Grenze (oder keine gültige Zahl)? */
export function laengeZuGross(laenge: string | null, grenze: number): boolean {
  if (laenge === null) return false;
  const text = laenge.trim();
  return !/^\d{1,15}$/.test(text) || Number(text) > grenze;
}

const HOST_GEMELDET = Symbol.for("paibot.web.host-gemeldet");

/**
 * Schreibt einmal je Prozess einen Hinweis ins Log, wenn eine Anfrage an einen anderen Host geht
 * als `APP_URL` nennt (dann scheitern Anmelden und Einrichtung). Der Host steht nur gekürzt und
 * ohne Sonderzeichen im Log.
 */
export function hostHinweis(
  host: string | null,
  origin: string | undefined,
  warnen: (zeile: string) => void,
): void {
  const halter = globalThis as { [HOST_GEMELDET]?: true };
  if (halter[HOST_GEMELDET] || !hostPasstNicht(host, origin)) return;
  halter[HOST_GEMELDET] = true;
  const sauber = (host ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9.:[\]-]/g, "")
    .slice(0, 100);
  warnen(
    `[paibot] Anfrage an ${sauber}, APP_URL ist aber ${origin}. Anmelden und Einrichtung klappen nur über die Adresse aus APP_URL; trage dort genau die Adresse ein, die im Browser steht.`,
  );
}

export async function proxy(request: NextRequest) {
  const entwicklung = process.env.NODE_ENV !== "production";
  // HSTS nur, wenn PaiBot über https läuft (`APP_URL`).
  const { nonce, kopfzeilen, csp } = kopfzeilenMitNonce(entwicklung, istHttps(process.env));
  const pfad = request.nextUrl.pathname;

  // Zu große Körper gleich hier abweisen, bevor irgendetwas sie liest (Grenze je Route).
  if (
    laengeZuGross(
      request.headers.get("content-length"),
      koerperGrenzeFuerPfad(pfad, request.method),
    )
  ) {
    const antwort = NextResponse.json(
      errorBody("eingabe_ungueltig", { felder: [{ feld: "eingabe", code: "zu_gross" }] }),
      { status: 413, headers: { "Cache-Control": "no-store", Connection: "close" } },
    );
    return kopfzeilenSetzen(antwort, kopfzeilen);
  }

  if (istDatei(pfad)) return kopfzeilenSetzen(NextResponse.next(), kopfzeilen);

  const dienste = prozessDienste();
  const rahmen = { appUrl: dienste.appOrigin() };
  if (!entwicklung && pfad !== "/api/health") {
    hostHinweis(request.headers.get("host"), rahmen.appUrl, (zeile) => console.warn(zeile));
  }
  const cookieKopf = request.headers.get("cookie");
  const vorabName = vorabCookieName(rahmen);
  const vorabVorhanden = cookieLesen(cookieKopf, vorabName) !== undefined;
  const zustand = brauchtZustand(pfad, request.method)
    ? await zustandFuer(cookieKopf, dienste)
    : { eingerichtet: undefined, angemeldet: false };
  const entscheidung = entscheide(pfad, request.method, zustand, vorabVorhanden);

  if (entscheidung.art === "nicht_angemeldet") {
    const antwort = NextResponse.json(errorBody("nicht_angemeldet"), {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
    return kopfzeilenSetzen(antwort, kopfzeilen);
  }
  if (entscheidung.art === "umleiten") {
    const ziel = new URL(entscheidung.ziel, request.nextUrl);
    return kopfzeilenSetzen(NextResponse.redirect(ziel, 307), kopfzeilen);
  }

  const anfrageKopf = new Headers(request.headers);
  anfrageKopf.set("x-nonce", nonce);
  anfrageKopf.set("Content-Security-Policy", csp);
  let vorabZeile: string | undefined;
  if (entscheidung.vorabCookie) {
    const wert = neuerVorabWert();
    vorabZeile = vorabCookie(rahmen, wert);
    // Die Seite soll das neue Vorab-Cookie schon in dieser Anfrage sehen (für ihr Prüfzeichen).
    anfrageKopf.set(
      "cookie",
      cookieKopf ? `${cookieKopf}; ${vorabName}=${wert}` : `${vorabName}=${wert}`,
    );
  }
  const antwort = NextResponse.next({ request: { headers: anfrageKopf } });
  if (vorabZeile !== undefined) antwort.headers.append("Set-Cookie", vorabZeile);
  return kopfzeilenSetzen(antwort, kopfzeilen);
}

export const config = {
  matcher: ["/:path*"],
};
