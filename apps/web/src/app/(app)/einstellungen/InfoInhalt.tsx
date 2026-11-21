/**
 * PaiBot – Inhalt der Info-Seite. Alle Links sind normale Links in einem neuen Tab; die Seite lädt
 * nichts von fremden Servern.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import { Footer, Icon, Logo, NurLesbar, Wortmarke } from "@paibot/ui";
import type { ReactNode } from "react";
import { ENTERPRISE_MAIL, INFO_LINKS, NEUER_TAB } from "../../../lib/einstellungen/info";
import { AbmeldenKnopf } from "./AbmeldenKnopf";
import styles from "./einstellungen.module.css";

function Extern({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} {...NEUER_TAB}>
      {children}
      <Icon name="extern" groesse={13} />
      <NurLesbar> {t("info.neuer_tab")}</NurLesbar>
    </a>
  );
}

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className={styles.textLink} {...NEUER_TAB}>
      {children}
      <NurLesbar> {t("info.neuer_tab")}</NurLesbar>
    </a>
  );
}

export interface InfoInhaltProps {
  /** Stand der Installation, z. B. `0.3.0+20261205.3f9c2ab`. */
  stand: string;
  installation?: string;
}

export function InfoInhalt({ stand, installation }: InfoInhaltProps) {
  return (
    <>
      <div className={styles.marke}>
        <Logo groesse={44} />
        <Wortmarke groesse={28} />
      </div>

      <div className={styles.kachel}>
        <dl className={styles.infoZeilen}>
          <dt>{t("info.version")}</dt>
          <dd className={styles.mono}>{stand}</dd>
          {installation && (
            <>
              <dt>{t("info.installation")}</dt>
              <dd className={styles.mono}>{installation}</dd>
            </>
          )}
          <dt>{t("info.lizenz")}</dt>
          <dd>{t("info.lizenz.name")}</dd>
          <dt>{t("info.entwickelt")}</dt>
          <dd>
            <TextLink href={INFO_LINKS.hrCodelabs}>{t("footer.link")}</TextLink>
          </dd>
          <dt>{t("info.team")}</dt>
          <dd>
            {t("info.enterprise")} {t("info.team.anfrage")}{" "}
            <span className={styles.mono}>{ENTERPRISE_MAIL}</span>
          </dd>
        </dl>
      </div>

      <section className={styles.abschnitt} aria-labelledby="info-lizenz">
        <div className={styles.abschnittKopf}>
          <h2 id="info-lizenz">{t("info.lizenz")}</h2>
        </div>
        <p className={styles.absatz}>{t("info.lizenz.text")}</p>
        <p className={styles.absatz}>{t("info.lizenz.person")}</p>
        <p className={styles.absatz}>{t("info.lizenz.team")}</p>
        <p className={styles.absatz}>
          <TextLink href={INFO_LINKS.lizenz}>{t("info.lizenz.link")}</TextLink>
        </p>
      </section>

      <section className={styles.abschnitt} aria-labelledby="info-links">
        <div className={styles.abschnittKopf}>
          <h2 id="info-links">{t("info.links")}</h2>
        </div>
        <ul className={styles.links}>
          <li>
            <Extern href={INFO_LINKS.paibot}>paibot.de</Extern>
          </li>
          <li>
            <Extern href={INFO_LINKS.doku}>{t("info.doku")}</Extern>
          </li>
          <li>
            <Extern href={INFO_LINKS.quellcode}>{t("info.link.quellcode")}</Extern>
          </li>
          <li>
            <Extern href={INFO_LINKS.hrCodelabs}>hr-codelabs.de</Extern>
          </li>
        </ul>
      </section>

      <section className={styles.abschnitt} aria-labelledby="info-hilfe">
        <div className={styles.abschnittKopf}>
          <h2 id="info-hilfe">{t("info.hilfe")}</h2>
        </div>
        <p className={styles.absatz}>{t("info.hilfe.text")}</p>
        <ul className={styles.links}>
          <li>
            <Extern href={INFO_LINKS.doku}>{t("info.doku")}</Extern>
          </li>
          <li>
            <Extern href={INFO_LINKS.community}>{t("info.link.community")}</Extern>
          </li>
        </ul>
      </section>

      <section className={styles.abschnitt} aria-labelledby="info-sicherheit">
        <div className={styles.abschnittKopf}>
          <h2 id="info-sicherheit">{t("info.sicherheit")}</h2>
        </div>
        <p className={styles.absatz}>{t("info.sicherheit.text")}</p>
        <p className={styles.absatz}>
          <TextLink href={INFO_LINKS.sicherheit}>{t("info.sicherheit.link")}</TextLink>
        </p>
      </section>

      <section className={styles.abschnitt} aria-labelledby="info-bestandteile">
        <div className={styles.abschnittKopf}>
          <h2 id="info-bestandteile">{t("info.bestandteile")}</h2>
        </div>
        <p className={styles.absatz}>{t("info.bestandteile.text")}</p>
        <p className={styles.absatz}>{t("info.bestandteile.schriften")}</p>
        <p className={styles.absatz}>
          <TextLink href={INFO_LINKS.bestandteile}>{t("info.bestandteile.link")}</TextLink>
        </p>
      </section>

      <div className={styles.knoepfe}>
        <AbmeldenKnopf />
      </div>
      <Footer className={styles.leise} />
    </>
  );
}
