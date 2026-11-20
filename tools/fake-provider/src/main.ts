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

const provider = createFakeProvider();
const { baseUrl } = await provider.start({
  host: "0.0.0.0",
  port: Number(process.env[FAKE_PROVIDER_PORT_ENV] ?? 0),
});
process.stdout.write(`Test-Anbieter bereit: ${baseUrl}\n`);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void provider.stop().then(() => process.exit(0));
  });
}
