import { execSync } from "node:child_process";

/** Liest die Lizenzen aller Produktions-Abhängigkeiten über pnpm. */
export function readLicenses() {
  const raw = execSync("pnpm licenses list --json --prod", { encoding: "utf8" });
  const byLicense = JSON.parse(raw || "{}");
  const packages = [];
  for (const [license, entries] of Object.entries(byLicense)) {
    for (const entry of entries) {
      packages.push({ license, name: entry.name, versions: entry.versions ?? [] });
    }
  }
  return packages.sort((a, b) => a.name.localeCompare(b.name));
}
