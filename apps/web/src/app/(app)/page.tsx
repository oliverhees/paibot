/**
 * PaiBot – Startseite der App nach der Anmeldung. Bis der Chat fertig ist, steht hier ein ehrlich
 * beschrifteter Platzhalter.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { repo } from "@paibot/db";
import { t } from "@paibot/shared/texte";
import { Avatar, EmptyState } from "@paibot/ui";
import type { Metadata } from "next";
import { datenbank } from "../../lib/datenbank";
import { besitzerSeite } from "../../lib/zugang/seite";
import styles from "./app.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${t("seite.chat")} · PaiBot` };

export default async function StartSeite() {
  await besitzerSeite();
  const bot = await repo.bots.getDefault(datenbank());
  const name = bot?.name ?? t("einrichtung.bot.vorschlag");
  return (
    <div className={styles.start}>
      <EmptyState
        bild={<Avatar farbe={bot?.color ?? "limette"} groesse={64} still />}
        titel={t("start.titel")}
        text={
          <>
            <span className={styles.absatz}>{t("start.text", { name })}</span>
            {bot?.modelId === undefined && (
              <span className={styles.absatz}>{t("start.ohne_modell", { name })}</span>
            )}
          </>
        }
      />
    </div>
  );
}
