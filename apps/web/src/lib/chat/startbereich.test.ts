/**
 * PaiBot – Tests der Wahl der Fassung des Startbereichs: Standard, Prüfung, Cookie, Gleichlauf
 * mit den Fassungen der Bausteine.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { START_FASSUNGEN as BAUSTEIN_FASSUNGEN } from "@paibot/ui";
import { describe, expect, it } from "vitest";
import {
  FASSUNG_COOKIE,
  fassungAus,
  fassungAusCookies,
  fassungCookie,
  STANDARD_FASSUNG,
  START_FASSUNGEN,
} from "./startbereich";

describe("Fassung des Startbereichs", () => {
  it("ab Werk „Begrüßung“; unbekannte oder fehlende Werte ergeben den Standard", () => {
    expect(STANDARD_FASSUNG).toBe("begruessung");
    for (const wert of [undefined, null, "", "Stille", "x", 3, {}, "stille "]) {
      expect(fassungAus(wert)).toBe("begruessung");
    }
  });

  it("jede Fassung wird erkannt und hat ein Gegenstück im Baustein", () => {
    expect([...START_FASSUNGEN]).toEqual([...BAUSTEIN_FASSUNGEN]);
    for (const f of START_FASSUNGEN) expect(fassungAus(f)).toBe(f);
  });

  it("liest die Wahl aus einer Cookie-Zeile mit anderen Cookies davor und danach", () => {
    expect(fassungAusCookies(`a=1; ${FASSUNG_COOKIE}=stille; b=2`)).toBe("stille");
    expect(fassungAusCookies(`${FASSUNG_COOKIE}=startbrett`)).toBe("startbrett");
    expect(fassungAusCookies("a=1")).toBe("begruessung");
    expect(fassungAusCookies(undefined)).toBe("begruessung");
    expect(fassungAusCookies(`x${FASSUNG_COOKIE}=stille`)).toBe("begruessung");
  });

  it("schreibt das Cookie für diesen Browser: ein Jahr, nur Fassung, Secure nur bei https", () => {
    const zeile = fassungCookie("stille", false);
    expect(zeile).toBe(`${FASSUNG_COOKIE}=stille; Path=/; Max-Age=31536000; SameSite=Lax`);
    expect(fassungCookie("stille", true)).toMatch(/; Secure$/);
    // was geschrieben wird, liest sich wieder
    for (const f of START_FASSUNGEN) {
      expect(fassungAusCookies(fassungCookie(f, false).split(";")[0])).toBe(f);
    }
  });
});
