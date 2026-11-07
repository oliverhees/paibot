// Erzeugt THIRD_PARTY_NOTICES.md aus den Produktions-Abhängigkeiten.
import { writeFileSync } from "node:fs";
import { readLicenses } from "./licenses.mjs";

const rows = readLicenses().map(
  (pkg) => `| ${pkg.name} | ${pkg.versions.join(", ")} | ${pkg.license} |`,
);
const content = [
  "# Third-Party Notices",
  "",
  "Paibot nutzt die folgenden Bestandteile Dritter. Für sie gelten ausschließlich ihre eigenen Lizenzen (siehe § 7 der Paibot Fair-Code-Lizenz).",
  "",
  "Diese Datei wird mit `pnpm licenses:notices` erzeugt.",
  "",
  "| Paket | Version | Lizenz |",
  "| --- | --- | --- |",
  ...rows,
  "",
  "Zusätzlich als separater Dienst eingebunden: Datenschleuse (https://github.com/oliverhees/datenschleuse), GNU AGPL v3.",
  "",
].join("\n");
writeFileSync("THIRD_PARTY_NOTICES.md", content);
console.log(`THIRD_PARTY_NOTICES.md geschrieben (${rows.length} Pakete).`);
