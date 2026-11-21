/**
 * PaiBot – Fragen an dich: gesammelt im Kopf und in der Leiste, mit Antwort-Vorschlägen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import { BotAvatar } from "./BotAvatar";
import styles from "./Fragen.module.css";
import { vorschlagLabel, vorschlagText } from "./funktionen";
import { FremdMarke } from "./Marken";
import { Sym } from "./symbole";
import { reinerText, sauberName } from "./text";
import type { FadenBot, Frage, Vorschlag, VorschlagWahl } from "./typen";

export interface FragenProps {
  fragen: readonly Frage[];
  bots: Readonly<Record<string, FadenBot>>;
  /**
   * Ein Vorschlag wurde angetippt. Der Aufrufer setzt `wahl.text` ins Eingabefeld und sendet nichts;
   * abschicken tust du selbst.
   */
  onVorschlag?: (wahl: VorschlagWahl) => void;
  /** „Selbst antworten“: Fokus ins Eingabefeld. */
  onSelbst?: () => void;
}

function Wahl({
  frage,
  onVorschlag,
  onSelbst,
}: {
  frage: Frage;
  onVorschlag: FragenProps["onVorschlag"];
  onSelbst: FragenProps["onSelbst"];
}) {
  const klick = (v: Vorschlag) =>
    onVorschlag?.({ frageId: frage.id, vorschlag: v, text: vorschlagText(v) });
  return (
    // biome-ignore lint/a11y/useSemanticElements: benannte Gruppe von Bedienelementen, fieldset passt hier nicht
    <div className={styles.wahl} role="group" aria-label={t("faden.fragen.vorschlaege")}>
      {frage.vorschlaege.map((v, i) => {
        const label = reinerText(vorschlagLabel(v), 120);
        return (
          <button
            key={`${v.art}-${v.art === "moeglichkeit" ? v.nummer : v.text}`}
            type="button"
            className={styles.chip}
            data-erste={i === 0 ? "true" : undefined}
            aria-label={t("faden.fragen.vorschlag_label", { text: label })}
            onClick={() => klick(v)}
          >
            <span className={styles.chipText}>{label}</span>
          </button>
        );
      })}
      <button type="button" className={styles.chip} onClick={() => onSelbst?.()}>
        <Sym name="stift" groesse={13} />
        {t("faden.fragen.selbst")}
      </button>
    </div>
  );
}

function FrageText({ frage, bot }: { frage: Frage; bot: FadenBot | undefined }) {
  return (
    <>
      <b>{sauberName(bot?.name)}:</b> {reinerText(frage.text, 400)}
      {frage.untrusted && (
        <>
          {" "}
          <FremdMarke />
        </>
      )}
    </>
  );
}

/** Das Fragen-Band im Kopf: alle offenen Fragen des Fadens untereinander. */
export function FragenBand({ fragen, bots, onVorschlag, onSelbst }: FragenProps) {
  if (fragen.length === 0) return null;
  const titel =
    fragen.length === 1
      ? t("faden.fragen.titel_eine")
      : t("faden.fragen.titel", { anzahl: fragen.length });
  return (
    <section className={styles.band} aria-label={titel} data-baustein="fragen-band">
      <p className={styles.kopf}>
        <Sym name="post" groesse={15} />
        {titel}
      </p>
      {fragen.map((f) => {
        const bot = bots[f.botId];
        return (
          <div key={f.id} className={styles.frage} data-frage={f.id}>
            {bot && (
              <BotAvatar
                farbe={bot.farbe}
                {...(bot.form ? { form: bot.form } : {})}
                zustand="wartet"
                groesse={22}
                still
              />
            )}
            <p className={styles.text} style={{ margin: 0 }}>
              <FrageText frage={f} bot={bot} />
            </p>
            <Wahl frage={f} onVorschlag={onVorschlag} onSelbst={onSelbst} />
          </div>
        );
      })}
      <p className={styles.hinweis}>{t("faden.fragen.hinweis")}</p>
    </section>
  );
}

/** Die Fragen im Reiter „Fragen“ der Leiste: je Frage eine Karte. */
export function FragenKarten({ fragen, bots, onVorschlag, onSelbst }: FragenProps) {
  if (fragen.length === 0) return <p className={styles.leer}>{t("faden.fragen.leer")}</p>;
  return (
    <>
      {fragen.map((f) => {
        const bot = bots[f.botId];
        return (
          <div key={f.id} className={styles.karte} data-frage={f.id}>
            <div className={styles.oben}>
              {bot && (
                <BotAvatar
                  farbe={bot.farbe}
                  {...(bot.form ? { form: bot.form } : {})}
                  zustand="wartet"
                  groesse={22}
                  still
                />
              )}
              <span style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
                <FrageText frage={f} bot={bot} />
              </span>
            </div>
            <Wahl frage={f} onVorschlag={onVorschlag} onSelbst={onSelbst} />
          </div>
        );
      })}
      <p className={styles.hinweis}>{t("faden.fragen.hinweis")}</p>
    </>
  );
}
