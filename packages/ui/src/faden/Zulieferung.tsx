/**
 * PaiBot – Zulieferung als Kärtchen: was ein Bot einem anderen geliefert hat.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import { BelegZeichen } from "./BelegZeichen";
import { BotAvatar } from "./BotAvatar";
import { FremdMarke } from "./Marken";
import { Sym } from "./symbole";
import { reinerText, sauberName } from "./text";
import type { FadenBot, Zulieferung } from "./typen";
import styles from "./Zulieferung.module.css";

export interface ZulieferKarteProps {
  zulieferung: Zulieferung;
  /** Der liefernde Bot, für den Avatar (nur in der Liste der Leiste). */
  bot?: FadenBot | undefined;
  /** Mit Absender-Avatar und „von → an“ unter dem Titel (Leiste). */
  mitAbsender?: boolean;
}

/** Eine Zulieferung. Titel und Angaben sind Text eines Bots: nur Text, bereinigt und begrenzt. */
export function ZulieferKarte({ zulieferung: z, bot, mitAbsender = false }: ZulieferKarteProps) {
  const titel = reinerText(z.titel, 80);
  const von = sauberName(z.von);
  const an = sauberName(z.an);
  return (
    // biome-ignore lint/a11y/useSemanticElements: benannte Gruppe von Bedienelementen, fieldset passt hier nicht
    <div
      className={styles.karte}
      data-baustein="zulieferung"
      data-breit={mitAbsender ? "true" : undefined}
      role="group"
      aria-label={t("faden.lieferung.label", { titel, von, an })}
    >
      {mitAbsender && bot ? (
        <span className={styles.avatar}>
          <BotAvatar
            farbe={bot.farbe}
            {...(bot.form ? { form: bot.form } : {})}
            groesse={28}
            still
          />
        </span>
      ) : (
        <span className={styles.kachel} aria-hidden="true">
          <Sym name={z.symbol === "auge" ? "auge" : "doku"} groesse={18} />
        </span>
      )}
      <span className={styles.text}>
        <b>{titel}</b>
        <small>
          {mitAbsender ? t("faden.lieferung.von_an", { von, an }) : reinerText(z.meta, 120)}
        </small>
        {z.untrusted && (
          <>
            {" "}
            <FremdMarke />
          </>
        )}
      </span>
      {!mitAbsender && (
        <span className={styles.an}>
          <Sym name="rechts" groesse={13} />
          {t("faden.lieferung.an", { name: an })}
        </span>
      )}
      {z.beleg && <BelegZeichen info={z.beleg} />}
    </div>
  );
}
