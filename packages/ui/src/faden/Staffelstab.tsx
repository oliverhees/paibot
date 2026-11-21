/**
 * PaiBot – Staffelstab: wer führt, wer dran ist, wer als Nächstes kommt (nur Anzeige).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import { AvatarStapel, BotAvatar } from "./BotAvatar";
import { stapelRest } from "./funktionen";
import { DranMarke } from "./Marken";
import styles from "./Staffelstab.module.css";
import { reinerText, sauberName } from "./text";
import type { StabPlatz } from "./typen";

function Figur({ p, groesse }: { p: StabPlatz; groesse: number }) {
  if (p.id === "du" || !p.farbe) {
    return <span className={styles.ich}>{t("faden.stab.du")}</span>;
  }
  return (
    <span className={styles.figur}>
      <BotAvatar
        farbe={p.farbe}
        {...(p.form ? { form: p.form } : {})}
        zustand={p.zustand ?? "ruhig"}
        ohneEck
        groesse={groesse}
        still
      />
    </span>
  );
}

/** Die Bahn mit allen Plätzen. „dran“ und „führt“ kommen fertig von außen. */
export function StabBahn({ plaetze }: { plaetze: readonly StabPlatz[] }) {
  return (
    <ol className={styles.bahn} aria-label={t("faden.stab.region")}>
      {plaetze.map((p) => {
        const name = p.id === "du" ? t("faden.stab.du") : sauberName(p.name);
        return (
          <li key={p.id} className={styles.platz} data-dran={p.dran ? "true" : "false"}>
            {p.dran && (
              <span className={styles.pille}>
                <DranMarke />
              </span>
            )}
            <Figur p={p} groesse={30} />
            <span className={styles.name}>{name}</span>
            <span className={styles.wort} data-art={p.wortArt}>
              {reinerText(p.wort, 40)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Die verdichtete Fassung für große Fäden: führt · dran · als Nächstes · Stapel „+N“. */
export function StabVerdichtet({
  plaetze,
  weitere = [],
}: {
  plaetze: readonly StabPlatz[];
  weitere?: readonly StabPlatz[];
}) {
  const alle = [...plaetze, ...weitere].filter((p) => p.id !== "du");
  const fuehrt = alle.find((p) => p.fuehrt);
  const dran = alle.filter((p) => p.dran && !p.fuehrt);
  const naechste = alle.find((p) => p.naechste && !p.dran && !p.fuehrt);
  const benutzt = new Set([fuehrt?.id, naechste?.id, ...dran.map((p) => p.id)]);
  const uebrige = alle.filter((p) => !benutzt.has(p.id));
  const { sichtbar } = stapelRest(uebrige, 5);
  const bot = (p: StabPlatz) =>
    p.farbe ? (
      <BotAvatar
        farbe={p.farbe}
        {...(p.form ? { form: p.form } : {})}
        zustand={p.zustand ?? "ruhig"}
        ohneEck
        groesse={24}
        still
      />
    ) : null;
  return (
    // biome-ignore lint/a11y/useSemanticElements: benannte Gruppe von Bedienelementen, fieldset passt hier nicht
    <div className={styles.verdichtet} role="group" aria-label={t("faden.stab.region")}>
      {fuehrt && (
        <span className={styles.gruppe}>
          <span className={styles.beschriftung}>{t("faden.stab.fuehrt")}</span>
          {bot(fuehrt)}
          <b>{sauberName(fuehrt.name)}</b>
        </span>
      )}
      {dran.length > 0 && (
        <span className={styles.gruppe} data-dran="true">
          <span className={styles.beschriftung}>{t("faden.stab.dran")}</span>
          <span className={styles.avatarReihe}>
            {dran.map((p) => (
              <span key={p.id}>{bot(p)}</span>
            ))}
          </span>
          <b>{dran.map((p) => sauberName(p.name)).join(", ")}</b>
        </span>
      )}
      {naechste && (
        <span className={styles.gruppe}>
          <span className={styles.beschriftung}>{t("faden.stab.naechstes")}</span>
          {bot(naechste)}
          <b>{sauberName(naechste.name)}</b>
        </span>
      )}
      {sichtbar.length > 0 && (
        <span className={styles.gruppe}>
          <AvatarStapel
            bots={sichtbar.flatMap((p) =>
              p.farbe
                ? [
                    {
                      id: p.id,
                      farbe: p.farbe,
                      ...(p.form ? { form: p.form } : {}),
                      zustand: p.zustand ?? "ruhig",
                    },
                  ]
                : [],
            )}
            groesse={20}
            ueberlappung={5}
          />
          {uebrige.length > 0 && <span>+{uebrige.length}</span>}
        </span>
      )}
    </div>
  );
}
