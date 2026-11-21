/**
 * PaiBot – Seite „Bot“ im Browser: Name, Anweisung (mit Zähler und Beispielen), Aussehen aus den
 * festen Paaren von Form und Farbe, Modell und der Überblick „Was dein Bot darf“.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { LIMITS } from "@paibot/shared/konstanten";
import type { BotColor } from "@paibot/shared/objekte";
import { t, tList } from "@paibot/shared/texte";
import {
  Avatar,
  Button,
  FORM_ZU_FARBE,
  Icon,
  Karte,
  SeitenSpalte,
  StatusChip,
  TextArea,
  TextField,
} from "@paibot/ui";
import Link from "next/link";
import { useId, useState } from "react";
import { apiFetch } from "../../../lib/api/client";
import {
  anweisungAnhaengen,
  type BotEntwurf,
  botEntwurf,
  entwurfGeaendert,
} from "../../../lib/bot/ansicht";
import type { BotModell, BotRechte, BotSeitenDaten } from "../../../lib/bot/bot";
import styles from "./bot.module.css";

export interface BotAnsichtProps {
  daten: BotSeitenDaten;
  /** Nach dem Speichern, z. B. um die Navigation neu zu laden. */
  onGespeichert?: () => void;
}

const FARBEN = Object.keys(FORM_ZU_FARBE) as BotColor[];

function RechteListe({
  titel,
  art,
  eintraege,
}: {
  titel: string;
  art: "ok" | "warn" | "fehler";
  eintraege: BotRechte["erlaubt"];
}) {
  if (eintraege.length === 0) return null;
  return (
    <div className={styles.rechte} data-art={art}>
      <span className={styles.rechteTitel}>
        <Icon name={art === "ok" ? "check" : art === "warn" ? "warnung" : "x"} />
        {titel}
      </span>
      <ul>
        {eintraege.map((e) => (
          <li key={e.id}>
            <span>{e.text}</span>
            <span className={styles.mono}>{e.id}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BotAnsicht({ daten, onGespeichert }: BotAnsichtProps) {
  const [gespeichert, setGespeichert] = useState<BotEntwurf>(botEntwurf(daten.bot));
  const [entwurf, setEntwurf] = useState<BotEntwurf>(botEntwurf(daten.bot));
  const [speichert, setSpeichert] = useState(false);
  const [meldung, setMeldung] = useState<{ art: "ok" | "fehler"; text: string; ausweg?: string }>();
  const [nameFehler, setNameFehler] = useState<string | undefined>();
  const modell: BotModell | undefined = daten.modell;
  const geaendert = entwurfGeaendert(gespeichert, entwurf);
  const aussehenId = useId();
  const zuLang = entwurf.instructions.length > LIMITS.botInstructionsChars;
  const anzeigeName = entwurf.name.trim() || gespeichert.name;

  function aendern(teil: Partial<BotEntwurf>) {
    setEntwurf((alt) => ({ ...alt, ...teil }));
    setMeldung(undefined);
  }

  async function speichern() {
    if (entwurf.name.trim() === "") {
      setNameFehler(t("bot.name.leer"));
      return;
    }
    if (zuLang) return;
    setNameFehler(undefined);
    setSpeichert(true);
    const antwort = await apiFetch<{ bot: BotEntwurf }>("PUT", "/api/bot", {
      ...entwurf,
      name: entwurf.name.trim(),
    });
    setSpeichert(false);
    if (!antwort.ok) {
      if (antwort.fehler.felder?.some((f) => f.feld === "name")) setNameFehler(antwort.fehler.text);
      setMeldung({
        art: "fehler",
        text: antwort.fehler.text,
        ...(antwort.fehler.ausweg ? { ausweg: antwort.fehler.ausweg } : {}),
      });
      return;
    }
    const neu = botEntwurf(antwort.daten.bot);
    setGespeichert(neu);
    setEntwurf(neu);
    setMeldung({ art: "ok", text: t("bot.gespeichert", { name: neu.name }) });
    onGespeichert?.();
  }

  return (
    <SeitenSpalte
      titel={t("seite.bot")}
      einleitung={t("bot.seite.text", { name: gespeichert.name })}
    >
      <form
        className={styles.formular}
        onSubmit={(e) => {
          e.preventDefault();
          void speichern();
        }}
      >
        <Karte
          titel={anzeigeName}
          rechts={
            geaendert ? (
              <StatusChip art="warn">{t("allgemein.ungespeichert")}</StatusChip>
            ) : undefined
          }
        >
          <div className={styles.kopf}>
            <div className={styles.vorschau}>
              <Avatar farbe={entwurf.color} groesse={72} titel={t("bot.vorschau")} />
            </div>
            <div className={styles.felder}>
              <TextField
                label={t("bot.name")}
                name="name"
                value={entwurf.name}
                maxLength={LIMITS.botNameChars}
                autoComplete="off"
                onChange={(e) => {
                  aendern({ name: e.target.value });
                  setNameFehler(undefined);
                }}
                fehler={nameFehler}
                hilfe={t("bot.name.hilfe")}
              />
            </div>
          </div>
        </Karte>

        <Karte titel={t("bot.anweisung")}>
          <TextArea
            label={t("bot.anweisung")}
            labelVersteckt
            name="instructions"
            rows={7}
            value={entwurf.instructions}
            placeholder={t("bot.anweisung.platzhalter")}
            onChange={(e) => aendern({ instructions: e.target.value })}
            fehler={
              zuLang ? t("bot.anweisung.zu_lang", { max: LIMITS.botInstructionsChars }) : undefined
            }
            hilfe={
              <>
                {t("bot.anweisung.hilfe", { name: anzeigeName })}{" "}
                <span className={styles.zaehler} data-voll={zuLang || undefined}>
                  {t("bot.anweisung.zaehler", {
                    anzahl: entwurf.instructions.length,
                    max: LIMITS.botInstructionsChars,
                  })}
                </span>
              </>
            }
          />
          <div className={styles.beispiele}>
            <span className={styles.etikett}>{t("bot.beispiele.titel")}</span>
            <div className={styles.chips}>
              {tList("bot.beispiele").map((satz) => (
                <button
                  key={satz}
                  type="button"
                  className={styles.chip}
                  onClick={() =>
                    aendern({ instructions: anweisungAnhaengen(entwurf.instructions, satz) })
                  }
                >
                  <Icon name="plus" />
                  {satz}
                </button>
              ))}
            </div>
            <p className={styles.leise}>{t("bot.beispiele.text")}</p>
          </div>
        </Karte>

        <Karte titel={t("bot.aussehen.titel")}>
          <fieldset className={styles.paare} aria-describedby={`${aussehenId}h`}>
            <legend className={styles.unsichtbar}>{t("bot.aussehen.titel")}</legend>
            {FARBEN.map((farbe) => {
              const form = FORM_ZU_FARBE[farbe];
              const text = t("bot.aussehen.paar", {
                form: t(`bot.form.${form}`),
                farbe: t(`bot.farbe.${farbe}`),
              });
              return (
                <label
                  key={farbe}
                  className={styles.paar}
                  data-gewaehlt={entwurf.color === farbe || undefined}
                  title={text}
                >
                  <input
                    type="radio"
                    name="aussehen"
                    value={farbe}
                    checked={entwurf.color === farbe}
                    onChange={() => aendern({ color: farbe, avatarShape: form })}
                    aria-label={text}
                  />
                  <Avatar farbe={farbe} groesse={30} still />
                </label>
              );
            })}
          </fieldset>
          <p id={`${aussehenId}h`} className={styles.leise}>
            {t("bot.aussehen.hilfe")}
          </p>
        </Karte>

        <Karte titel={t("bot.modell")}>
          <p className={styles.text}>
            {modell
              ? t("modelle.aktuell.text", { name: gespeichert.name, modell: modell.displayName })
              : t("modelle.aktuell.keins", { name: gespeichert.name })}{" "}
            {modell && <StatusChip art="neutral">{modell.herkunft}</StatusChip>}
          </p>
          <Link href="/modelle" prefetch={false} className={styles.link}>
            {t("bot.modell.aendern")}
          </Link>
        </Karte>

        <div className={styles.leiste}>
          <div role="status" aria-live="polite" className={styles.live}>
            {meldung && (
              <p className={styles.meldung} data-art={meldung.art}>
                {meldung.text}
                {meldung.ausweg && <span className={styles.leise}> {meldung.ausweg}</span>}
              </p>
            )}
          </div>
          <div className={styles.knoepfe}>
            <Button
              art="leise"
              disabled={!geaendert || speichert}
              onClick={() => {
                setEntwurf(gespeichert);
                setNameFehler(undefined);
                setMeldung(undefined);
              }}
            >
              {t("bot.verwerfen")}
            </Button>
            <Button art="primaer" type="submit" laedt={speichert} disabled={!geaendert || zuLang}>
              {speichert ? t("bot.speichert") : t("allgemein.speichern")}
            </Button>
          </div>
        </div>
      </form>

      <Karte titel={t("bot.darf.titel")}>
        <p className={styles.leise}>{t("bot.darf.text")}</p>
        <RechteListe titel={t("bot.darf.erlaubt")} art="ok" eintraege={daten.rechte.erlaubt} />
        <RechteListe titel={t("bot.darf.fragt")} art="warn" eintraege={daten.rechte.fragt} />
        <RechteListe titel={t("bot.darf.nie")} art="fehler" eintraege={daten.rechte.nie} />
        <p className={styles.text}>{t("bot.darf.werkzeuge", { name: gespeichert.name })}</p>
        <Link href="/belege" prefetch={false} className={styles.link}>
          {t("bot.darf.belege")}
        </Link>
      </Karte>
    </SeitenSpalte>
  );
}
