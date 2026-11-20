/**
 * PaiBot – Fußzeile „Powered by PaiBot · entwickelt von HR CodeLabs“.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { t } from "@paibot/shared/texte";
import styles from "./Footer.module.css";

/** Aufteilen des Fußzeilen-Texts um den verlinkten Teil. */
export function footerTeile(text: string, link: string): [string, string, string] {
  const stelle = text.lastIndexOf(link);
  if (stelle < 0) return [text, "", ""];
  return [text.slice(0, stelle), link, text.slice(stelle + link.length)];
}

export const HR_CODELABS_URL = "https://hr-codelabs.de";

/** „Powered by PaiBot · entwickelt von HR CodeLabs“ mit Link. */
export function Footer({ className }: { className?: string }) {
  const [vor, link, nach] = footerTeile(t("footer.text"), t("footer.link"));
  return (
    <p className={className ? `${styles.fuss} ${className}` : styles.fuss}>
      {vor}
      {link && (
        <a href={HR_CODELABS_URL} target="_blank" rel="noopener noreferrer">
          {link}
        </a>
      )}
      {nach}
    </p>
  );
}
