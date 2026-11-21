/**
 * PaiBot – Eingabe im Faden: Feld mit @-Auswahl der Bots, Leiste „Aufrufen“, Schalter der Datenschleuse.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import type { AvatarShape, BotColor } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { IconButton } from "../basis/IconButton";
import { eingabeAktion, sendbar } from "../chat/eingabe";
import { Switch } from "../felder/Switch";
import { BotAvatar } from "./BotAvatar";
import styles from "./Eingabe.module.css";
import {
  erwaehnungAmCursor,
  erwaehnungEinsetzen,
  filtereNamen,
  naechsteAuswahl,
} from "./erwaehnung";
import { Sym } from "./symbole";
import { reinerText, sauberName } from "./text";

export interface EingabeBot {
  id: string;
  name: string;
  aufgabe: string;
  farbe: BotColor;
  form?: AvatarShape;
  /** Angehalten: steht in der Auswahl, ist aber nicht wählbar. */
  pausiert?: boolean;
}

export interface EingabeSteuerung {
  fokus(): void;
}

export interface FadenEingabeProps {
  bots: readonly EingabeBot[];
  /** Name der Leitung für den Platzhalter („Ohne @ antwortet Mila und verteilt.“). */
  leitung: string;
  wert?: string;
  onWert?: (text: string) => void;
  onSenden: (text: string) => void;
  deaktiviert?: boolean;
  schleuseAn?: boolean;
  onSchleuse?: (an: boolean) => void;
  /** Zeile über dem Feld, z. B. die Leiste „Aufrufen“. */
  davor?: ReactNode;
  ref?: Ref<EingabeSteuerung>;
}

function optionKennung(id: string, i: number): string {
  return `${id}-opt-${i}`;
}

/** Zeile „Aufrufen:“ mit den Bots; ein Klick setzt „@Name “ ins Feld. */
export function AufrufLeiste({
  bots,
  beschriftung,
  onAufrufen,
  max = 6,
}: {
  bots: readonly EingabeBot[];
  beschriftung: string;
  onAufrufen: (bot: EingabeBot) => void;
  max?: number;
}) {
  const sichtbar = bots.slice(0, max);
  const rest = bots.length - sichtbar.length;
  return (
    <ul className={styles.aufruf} aria-label={t("faden.eingabe.leiste")}>
      <li>{beschriftung}</li>
      {sichtbar.map((b) => (
        <li key={b.id}>
          <button
            type="button"
            className={styles.aufrufKnopf}
            disabled={b.pausiert}
            onClick={() => onAufrufen(b)}
          >
            <span aria-hidden="true">
              <BotAvatar farbe={b.farbe} {...(b.form ? { form: b.form } : {})} groesse={20} still />
            </span>
            {sauberName(b.name)}
          </button>
        </li>
      ))}
      {rest > 0 && (
        <li>
          <span className={styles.weitere}>{t("faden.eingabe.weitere", { anzahl: rest })}</span>
        </li>
      )}
    </ul>
  );
}

/**
 * Eingabe: Tippt man „@“ am Wortanfang, öffnet sich die Liste der Bots. Pfeil rauf und runter
 * wählen, Enter oder Tab setzt „@Name “ ein, Escape schließt. Ist die Liste zu, sendet Enter und
 * Umschalt+Enter macht eine neue Zeile. Die Auswahl ist reine Oberfläche: Wer wirklich antwortet,
 * entscheiden die Regeln des Servers.
 */
export function FadenEingabe({
  bots,
  leitung,
  wert,
  onWert,
  onSenden,
  deaktiviert = false,
  schleuseAn = false,
  onSchleuse,
  davor,
  ref,
}: FadenEingabeProps) {
  const [eigen, setEigen] = useState("");
  const text = wert ?? eigen;
  const [cursor, setCursor] = useState(0);
  const [aktiv, setAktiv] = useState(-1);
  const [geschlossenBei, setGeschlossenBei] = useState<string | null>(null);
  const feld = useRef<HTMLTextAreaElement>(null);
  const nachCursor = useRef<number | null>(null);
  const id = useId();
  const listeId = `${id}-liste`;

  useImperativeHandle(ref, () => ({
    fokus() {
      const el = feld.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    },
  }));

  const setzen = (neu: string) => {
    if (wert === undefined) setEigen(neu);
    onWert?.(neu);
  };

  const offen = deaktiviert ? null : erwaehnungAmCursor(text, cursor);
  const schluessel = offen ? `${offen.start}:${offen.suche}` : null;
  const zeigen = offen !== null && schluessel !== geschlossenBei;
  const treffer = useMemo(() => (offen ? filtereNamen(bots, offen.suche) : []), [bots, offen]);
  const gesperrt = treffer.map((b) => Boolean(b.pausiert));
  const optionId = (i: number) => optionKennung(id, i);

  // biome-ignore lint/correctness/useExhaustiveDependencies: nur die Suche setzt die Auswahl zurück
  useEffect(() => {
    setAktiv(naechsteAuswahl(gesperrt, -1, 1));
  }, [schluessel, treffer.length]);

  useLayoutEffect(() => {
    const el = feld.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    if (nachCursor.current !== null) {
      el.setSelectionRange(nachCursor.current, nachCursor.current);
      nachCursor.current = null;
    }
  });

  useEffect(() => {
    if (aktiv < 0) return;
    document.getElementById(optionKennung(id, aktiv))?.scrollIntoView?.({ block: "nearest" });
  }, [aktiv, id]);

  const merkeCursor = () => setCursor(feld.current?.selectionStart ?? 0);

  const waehle = (i: number) => {
    const bot = treffer[i];
    if (!bot || bot.pausiert || !offen) return;
    const neu = erwaehnungEinsetzen(text, offen, cursor, bot.name);
    nachCursor.current = neu.cursor;
    setzen(neu.text);
    setCursor(neu.cursor);
    feld.current?.focus();
  };

  const senden = () => {
    if (deaktiviert || !sendbar(text)) return;
    onSenden(text.trim());
    setzen("");
    setCursor(0);
  };

  const at = () => {
    const el = feld.current;
    if (!el || deaktiviert) return;
    const vorne = text.slice(0, el.selectionStart ?? text.length);
    const hinten = text.slice(el.selectionEnd ?? text.length);
    const mitLeer = vorne === "" || /\s$/u.test(vorne) ? vorne : `${vorne} `;
    const neu = `${mitLeer}@${hinten}`;
    nachCursor.current = mitLeer.length + 1;
    setzen(neu);
    setCursor(mitLeer.length + 1);
    setGeschlossenBei(null);
    el.focus();
  };

  const hatListe = zeigen && treffer.length > 0;

  if (deaktiviert) {
    return (
      <div className={styles.bereich} data-baustein="eingabe" data-gesperrt="true">
        <div className={styles.gesperrt} role="status">
          <Sym name="pause" groesse={18} />
          {t("faden.eingabe.gesperrt")}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.bereich} data-baustein="eingabe">
      <div className={styles.innen}>
        {davor}
        {zeigen && (
          <div className={styles.popup}>
            {treffer.length > 0 ? (
              <div
                id={listeId}
                role="listbox"
                aria-label={t("faden.eingabe.auswahl")}
                className={styles.liste}
              >
                {treffer.map((bot, i) => (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: Tastatur läuft über das Feld (combobox)
                  <div
                    key={bot.id}
                    id={optionId(i)}
                    role="option"
                    tabIndex={-1}
                    aria-selected={i === aktiv}
                    aria-disabled={bot.pausiert || undefined}
                    aria-label={
                      bot.pausiert
                        ? t("faden.eingabe.option_pausiert", {
                            name: sauberName(bot.name),
                            aufgabe: reinerText(bot.aufgabe, 60),
                          })
                        : t("faden.eingabe.option", {
                            name: sauberName(bot.name),
                            aufgabe: reinerText(bot.aufgabe, 60),
                          })
                    }
                    className={styles.option}
                    data-aktiv={i === aktiv || undefined}
                    data-pausiert={bot.pausiert || undefined}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => waehle(i)}
                    onMouseMove={() => !bot.pausiert && setAktiv(i)}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <BotAvatar
                        farbe={bot.farbe}
                        {...(bot.form ? { form: bot.form } : {})}
                        groesse={26}
                        still
                      />
                      <b style={{ fontWeight: 600 }}>{sauberName(bot.name)}</b>
                    </span>
                    <span className={styles.aufgabe}>{reinerText(bot.aufgabe, 60)}</span>
                    {bot.pausiert && (
                      <span className={styles.pause}>{t("faden.eingabe.pausiert")}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.leer} role="status">
                {t("faden.eingabe.leer")}
              </p>
            )}
          </div>
        )}
        <span className={styles.versteckt} role="status" aria-live="polite">
          {zeigen
            ? treffer.length > 0
              ? t("faden.eingabe.treffer", { anzahl: treffer.length })
              : t("faden.eingabe.treffer_keine")
            : ""}
        </span>

        <form
          className={styles.feld}
          onSubmit={(e) => {
            e.preventDefault();
            senden();
          }}
        >
          <label htmlFor={`${id}-feld`} className={styles.versteckt}>
            {t("faden.eingabe.label")}
          </label>
          <textarea
            ref={feld}
            id={`${id}-feld`}
            className={styles.text}
            rows={1}
            value={text}
            placeholder={t("faden.eingabe.platzhalter", { name: sauberName(leitung) })}
            role="combobox"
            aria-expanded={hatListe}
            aria-controls={hatListe ? listeId : undefined}
            aria-activedescendant={hatListe && aktiv >= 0 ? optionId(aktiv) : undefined}
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-describedby={`${id}-hinweis`}
            onChange={(e) => {
              setzen(e.target.value);
              setCursor(e.target.selectionStart ?? e.target.value.length);
              setGeschlossenBei(null);
            }}
            onKeyUp={(e) => {
              if (e.key.startsWith("Arrow") && !hatListe) merkeCursor();
              if (e.key === "Home" || e.key === "End") merkeCursor();
            }}
            onClick={merkeCursor}
            onSelect={merkeCursor}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (hatListe) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setAktiv(naechsteAuswahl(gesperrt, aktiv, e.key === "ArrowDown" ? 1 : -1));
                  return;
                }
                if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
                  if (aktiv >= 0) {
                    e.preventDefault();
                    waehle(aktiv);
                    return;
                  }
                }
              }
              if (zeigen && e.key === "Escape") {
                e.preventDefault();
                setGeschlossenBei(schluessel);
                return;
              }
              if (eingabeAktion({ key: e.key, shiftKey: e.shiftKey }) === "senden") {
                e.preventDefault();
                senden();
              }
            }}
          />
          <div className={styles.werkzeuge}>
            <button
              type="button"
              className={styles.atKnopf}
              aria-label={t("faden.eingabe.erwaehnen")}
              title={t("faden.eingabe.erwaehnen")}
              onClick={at}
            >
              <Sym name="at" groesse={17} />
            </button>
            <Switch an={schleuseAn} onAendern={(an) => onSchleuse?.(an)}>
              {schleuseAn ? t("faden.eingabe.schleuse_an") : t("faden.eingabe.schleuse_aus")}
            </Switch>
            <span className={styles.senden}>
              <IconButton
                icon="hoch"
                art="rund-akzent"
                label={t("faden.eingabe.senden")}
                disabled={!sendbar(text)}
                type="submit"
              />
            </span>
          </div>
        </form>
        <p className={styles.hinweis} id={`${id}-hinweis`}>
          {t("faden.eingabe.hinweis")}
        </p>
      </div>
    </div>
  );
}
