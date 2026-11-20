/**
 * PaiBot – startet den Test-Anbieter als eigenen Prozess (z. B. im Compose-Testprofil).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createFakeProvider, FAKE_PROVIDER_PORT_ENV } from "./index";

// Umgebungsvariablen: FAKE_PROVIDER_PORT (Standard 0 = zufällig), FAKE_PROVIDER_HOST
// (Standard 127.0.0.1; im Image 0.0.0.0), FAKE_PROVIDER_API_KEY (optional, sonst ohne Anmeldung).
const apiKey = process.env.FAKE_PROVIDER_API_KEY;
const provider = createFakeProvider(apiKey ? { apiKey } : undefined);
const { baseUrl } = await provider.start({
  host: process.env.FAKE_PROVIDER_HOST ?? "127.0.0.1",
  port: Number(process.env[FAKE_PROVIDER_PORT_ENV] ?? 0),
});
process.stdout.write(`Test-Anbieter bereit: ${baseUrl}\n`);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void provider.stop().then(() => process.exit(0));
  });
}
