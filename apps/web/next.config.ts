/**
 * PaiBot – Next.js-Einstellungen: Standalone-Ausgabe und eingebundene Pakete.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

import path from "node:path";
import type { NextConfig } from "next";
import { GROESSTER_KOERPER_BYTES } from "./src/lib/api/koerper";
import { sicherheitsKopfzeilen } from "./src/lib/kopfzeilen";

/** Sicherheits-Kopfzeilen ohne die beiden, die der Proxy je Anfrage setzt. */
export function statischeKopfzeilen(entwicklung: boolean) {
  return sicherheitsKopfzeilen({ entwicklung }).filter(
    (zeile) => zeile.key !== "Content-Security-Policy" && zeile.key !== "Strict-Transport-Security",
  );
}

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@paibot/shared", "@paibot/db"],
  serverExternalPackages: ["postgres"],
  poweredByHeader: false,
  // Der Entwicklungs-Server soll weder eine Anzeige einblenden noch Dateien im Projekt anlegen.
  devIndicators: false,
  agentRules: false,
  experimental: {
    // Vor dem Proxy hält Next höchstens so viel vom Körper einer Anfrage im Speicher (Standard wären
    // 10 MiB je Anfrage). Ein Byte über der größten Grenze einer Route, damit ein abgeschnittener
    // Körper im Rahmen als zu groß erkannt wird statt als vermeintlich vollständige Eingabe.
    proxyClientMaxBodySize: GROESSTER_KOERPER_BYTES + 1,
  },
  // PaiBot nutzt keine Bild-Optimierung; der Endpunkt /_next/image antwortet damit 404.
  images: { unoptimized: true },
  // Grundkopfzeilen für jede Antwort. Content-Security-Policy (mit Nonce je Anfrage) und HSTS (nur
  // bei https) setzt der Proxy (src/proxy.ts), damit keine zweite, lockerere Fassung mitgeht.
  headers: async () => [
    {
      source: "/:path*",
      headers: statischeKopfzeilen(process.env.NODE_ENV !== "production"),
    },
  ],
};

export default nextConfig;
