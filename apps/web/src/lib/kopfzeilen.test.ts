/**
 * PaiBot – Tests der Sicherheits-Kopfzeilen und der Client-Adresse.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import {
  clientAdresse,
  contentSecurityPolicy,
  kopfzeilenMitNonce,
  neueNonce,
  sicherheitsKopfzeilen,
  UNBEKANNTE_ADRESSE,
  vertrautProxy,
} from "./kopfzeilen";

const wert = (zeilen: { key: string; value: string }[], key: string) =>
  zeilen.find((z) => z.key === key)?.value;

const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";

describe("sicherheitsKopfzeilen (Betrieb, statische Fassung)", () => {
  const zeilen = sicherheitsKopfzeilen({ entwicklung: false });

  it("Content-Security-Policy mit genauem Wert", () => {
    expect(wert(zeilen, "Content-Security-Policy")).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self'",
        "style-src-attr 'unsafe-inline'",
        "img-src 'self'",
        "font-src 'self'",
        "connect-src 'self'",
        "media-src 'self'",
        "manifest-src 'self'",
        "frame-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join("; "),
    );
  });

  it("weitere Kopfzeilen mit genauem Wert", () => {
    expect(wert(zeilen, "X-Content-Type-Options")).toBe("nosniff");
    expect(wert(zeilen, "X-Frame-Options")).toBe("DENY");
    expect(wert(zeilen, "Referrer-Policy")).toBe("no-referrer");
    expect(wert(zeilen, "Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(wert(zeilen, "Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(wert(zeilen, "Strict-Transport-Security")).toBe("max-age=31536000");
    expect(wert(zeilen, "Permissions-Policy")).toBe(
      [
        "accelerometer=()",
        "autoplay=()",
        "browsing-topics=()",
        "camera=()",
        "display-capture=()",
        "geolocation=()",
        "gyroscope=()",
        "hid=()",
        "magnetometer=()",
        "microphone=()",
        "midi=()",
        "payment=()",
        "serial=()",
        "usb=()",
        "xr-spatial-tracking=()",
      ].join(", "),
    );
  });

  it("kein X-Powered-By, keine unsichere Auswertung, kein eval", () => {
    expect(wert(zeilen, "X-Powered-By")).toBeUndefined();
    const csp = wert(zeilen, "Content-Security-Policy") ?? "";
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/https?:|\*/);
  });
});

describe("sicherheitsKopfzeilen (Nonce-Fassung)", () => {
  it("Skripte nur mit Nonce, ohne unsafe-inline und ohne eval", () => {
    const csp = contentSecurityPolicy({ entwicklung: false, nonce: NONCE });
    expect(csp).toContain(`script-src 'self' 'nonce-${NONCE}' 'strict-dynamic';`);
    expect(csp).toContain(`style-src 'self' 'nonce-${NONCE}';`);
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(csp).not.toContain("unsafe-eval");
  });

  it("weist eine Nonce ab, die die Regel verändern könnte", () => {
    for (const schlecht of [
      "",
      "kurz",
      "abc'; script-src *; x='AAAAAAAAAAAAAAAAAAAA",
      "a b c d e f g h i j k l m n",
    ]) {
      expect(() => contentSecurityPolicy({ entwicklung: false, nonce: schlecht })).toThrow();
    }
  });

  it("neueNonce ist 128 Bit, Base64 und jedes Mal anders", () => {
    const a = neueNonce();
    const b = neueNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(a).not.toBe(b);
  });

  it("kopfzeilenMitNonce liefert dieselbe CSP in Kopfzeilen und Einzelwert", () => {
    const { nonce, kopfzeilen, csp } = kopfzeilenMitNonce(false);
    expect(csp).toBe(wert(kopfzeilen, "Content-Security-Policy"));
    expect(csp).toContain(`'nonce-${nonce}'`);
  });
});

describe("sicherheitsKopfzeilen (Entwicklung)", () => {
  const zeilen = sicherheitsKopfzeilen({ entwicklung: true });

  it("erlaubt Hot-Reload, aber lädt weiter nichts von außen", () => {
    const csp = wert(zeilen, "Content-Security-Policy") ?? "";
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toMatch(/https?:|\*/);
  });

  it("kein HSTS in der Entwicklung", () => {
    expect(wert(zeilen, "Strict-Transport-Security")).toBeUndefined();
  });
});

describe("TRUST_PROXY", () => {
  it("gilt nur bei genau 1", () => {
    expect(vertrautProxy("1")).toBe(true);
    for (const anders of [undefined, "", "0", "true", "yes", " 1", "11"]) {
      expect(vertrautProxy(anders)).toBe(false);
    }
  });
});

describe("clientAdresse", () => {
  it("ohne Vertrauen zählt nur die direkte Adresse, auch bei gefälschter Kopfzeile", () => {
    expect(
      clientAdresse({ weiterleitung: "6.6.6.6", vertrauteProxy: false, direkt: "10.0.0.5" }),
    ).toBe("10.0.0.5");
    expect(clientAdresse({ weiterleitung: "6.6.6.6", vertrauteProxy: false })).toBe(
      UNBEKANNTE_ADRESSE,
    );
  });

  it("mit Vertrauen zählt der rechte Eintrag, nie ein linker", () => {
    expect(
      clientAdresse({
        weiterleitung: "6.6.6.6, 1.1.1.1, 203.0.113.9",
        vertrauteProxy: true,
        direkt: "10.0.0.5",
      }),
    ).toBe("203.0.113.9");
    expect(clientAdresse({ weiterleitung: "203.0.113.9", vertrauteProxy: true })).toBe(
      "203.0.113.9",
    );
  });

  it("fällt auf die direkte Adresse zurück, wenn die Kopfzeile fehlt oder keine Adresse ist", () => {
    for (const weiterleitung of [
      null,
      undefined,
      "",
      "6.6.6.6, kein-ip",
      "999.1.1.1",
      "1.2.3",
      "<script>",
      ", ",
    ]) {
      expect(clientAdresse({ weiterleitung, vertrauteProxy: true, direkt: "10.0.0.5" })).toBe(
        "10.0.0.5",
      );
    }
  });

  it("versteht Ports, IPv6 und abgebildete IPv4-Adressen", () => {
    const rechts = (weiterleitung: string) =>
      clientAdresse({ weiterleitung, vertrauteProxy: true });
    expect(rechts("203.0.113.9:4711")).toBe("203.0.113.9");
    expect(rechts("[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(rechts("2001:DB8::1")).toBe("2001:db8::1");
    expect(rechts("::ffff:203.0.113.9")).toBe("203.0.113.9");
  });

  it("eine ungültige direkte Adresse wird nicht übernommen", () => {
    expect(clientAdresse({ weiterleitung: null, vertrauteProxy: false, direkt: "x y" })).toBe(
      UNBEKANNTE_ADRESSE,
    );
  });
});

describe("next.config.ts", () => {
  it("hängt die Kopfzeilen an jede Adresse und gibt keinen X-Powered-By aus", async () => {
    const regeln = (await nextConfig.headers?.()) ?? [];
    expect(regeln).toHaveLength(1);
    expect(regeln[0]?.source).toBe("/:path*");
    expect(regeln[0]?.headers).toEqual(
      sicherheitsKopfzeilen({ entwicklung: process.env.NODE_ENV !== "production" }),
    );
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
