/**
 * PaiBot – Tests der Fußzeile.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { t } from "@paibot/shared/texte";
import { describe, expect, it } from "vitest";
import { footerTeile } from "./Footer";

describe("Fußzeile", () => {
  it("verlinkt genau „HR CodeLabs“", () => {
    const [vor, link, nach] = footerTeile(t("footer.text"), t("footer.link"));
    expect(vor).toBe("Powered by PaiBot · entwickelt von ");
    expect(link).toBe("HR CodeLabs");
    expect(nach).toBe("");
  });

  it("zeigt den Text ohne Link, wenn der Teil fehlt", () => {
    expect(footerTeile("Nur Text", "HR CodeLabs")).toEqual(["Nur Text", "", ""]);
  });
});
