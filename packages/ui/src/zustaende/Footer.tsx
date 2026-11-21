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
export const PAIBOT_URL = "https://paibot.de";

function Verlinkt({ text, link, href }: { text: string; link: string; href: string }) {
  const [vor, teil, nach] = footerTeile(text, link);
  return (
    <>
      {vor}
      {teil && (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {teil}
          <span className={styles.nurLesbar}> {t("info.neuer_tab")}</span>
        </a>
      )}
      {nach}
    </>
  );
}

/**
 * „Powered by PaiBot · entwickelt von HR CodeLabs“: „PaiBot“ verlinkt paibot.de, „HR CodeLabs“
 * hr-codelabs.de (beide im neuen Tab). `zweizeilig` setzt jeden Teil in eine eigene Zeile.
 */
export function Footer({ className, zweizeilig }: { className?: string; zweizeilig?: boolean }) {
  const [erster = "", ...rest] = t("footer.text").split(" · ");
  const zweiter = rest.join(" · ");
  const klasse = [styles.fuss, zweizeilig && styles.zweizeilig, className]
    .filter(Boolean)
    .join(" ");
  return (
    <p className={klasse}>
      <span className={styles.teil}>
        <Verlinkt text={erster} link={t("footer.paibot")} href={PAIBOT_URL} />
      </span>
      {zweiter && (
        <>
          <span className={styles.trenner}> · </span>
          <span className={styles.teil}>
            <Verlinkt text={zweiter} link={t("footer.link")} href={HR_CODELABS_URL} />
          </span>
        </>
      )}
    </p>
  );
}
