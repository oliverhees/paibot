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
import { sicherheitsKopfzeilen } from "./src/lib/kopfzeilen";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@paibot/shared", "@paibot/db"],
  serverExternalPackages: ["postgres"],
  poweredByHeader: false,
  // Der Entwicklungs-Server soll weder eine Anzeige einblenden noch Dateien im Projekt anlegen.
  devIndicators: false,
  agentRules: false,
  headers: async () => [
    {
      source: "/:path*",
      headers: sicherheitsKopfzeilen({ entwicklung: process.env.NODE_ENV !== "production" }),
    },
  ],
};

export default nextConfig;
