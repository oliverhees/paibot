/**
 * PaiBot – Gespräch im Faden: Beiträge wie im Chat, Zulieferungen, erkannte Zeilen, Gruppen, Grenzen-Karte.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import bubble from "../chat/ChatBubble.module.css";
import { BelegZeichen } from "./BelegZeichen";
import { AvatarStapel, BotAvatar } from "./BotAvatar";
import { zuschlagMoeglich } from "./funktionen";
import styles from "./Gespraech.module.css";
import { DirekteBitteMarke, FremdMarke } from "./Marken";
import { Sym } from "./symbole";
import { reinerText, sauberName } from "./text";
import type { Beitrag, FadenBot, GespraechsEintrag, GrenzenKarteDaten, Gruppe } from "./typen";
import { ErkannteZeilen } from "./Zeilen";
import { ZulieferKarte } from "./Zulieferung";

type Bots = Readonly<Record<string, FadenBot>>;

/** Text eines Beitrags: reiner Text; `@Name` wird nur farbig hervorgehoben, es löst nichts aus. */
function BeitragsText({ text }: { text: string }) {
  const teile = reinerText(text).split(/(@[\p{L}\p{N}_-]{1,40})/u);
  return (
    <p className={styles.text}>
      {teile.map((teil, i) =>
        i % 2 === 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: feste Zerlegung eines Textes
          <span key={i} className={styles.erw}>
            {teil}
          </span>
        ) : (
          teil
        ),
      )}
    </p>
  );
}

export interface GespraechsBeitragProps {
  beitrag: Beitrag;
  bots: Bots;
}

/** Ein normaler Chat-Beitrag: deine Blase rechts, die eines Bots links mit Avatar, Name und Rolle. */
export function GespraechsBeitrag({ beitrag: b, bots }: GespraechsBeitragProps) {
  if (b.von === "du") {
    const leitung = b.route ? bots[b.route] : undefined;
    return (
      <div className={bubble.du} data-baustein="beitrag" data-von="du">
        <div className={bubble.blase}>{reinerText(b.text)}</div>
        <span className={styles.zeit}>{b.zeit}</span>
        {leitung && (
          <span className={styles.route}>
            <span aria-hidden="true">
              <BotAvatar
                farbe={leitung.farbe}
                {...(leitung.form ? { form: leitung.form } : {})}
                groesse={16}
                still
              />
            </span>
            {t("faden.beitrag.route", { name: sauberName(leitung.name) })}
          </span>
        )}
      </div>
    );
  }
  const bot = bots[b.von];
  const name = sauberName(bot?.name);
  const zustand = b.fragt ? "wartet" : (bot?.zustand ?? "ruhig");
  return (
    <div className={bubble.bot} data-baustein="beitrag" data-von={b.von} data-zustand="fertig">
      <div className={bubble.avatar}>
        {bot && (
          <BotAvatar
            farbe={bot.farbe}
            {...(bot.form ? { form: bot.form } : {})}
            zustand={zustand}
            groesse={30}
            titel={t("faden.beitrag.avatar", {
              name,
              zustand: b.fragt ? t("faden.beitrag.fragt") : reinerText(bot.stand, 40),
            })}
          />
        )}
      </div>
      <div className={bubble.spalte}>
        <div className={styles.wer}>
          <strong>{name}</strong>
          {bot && <span className={styles.rolle}>{reinerText(bot.rolle, 40)}</span>}
          <span className={styles.zeit}>{b.zeit}</span>
          {b.direkteBitte && <DirekteBitteMarke />}
          {b.untrusted && <FremdMarke />}
          {(b.direkteBitte ?? b.beleg) && (
            <BelegZeichen info={(b.direkteBitte ?? b.beleg) as NonNullable<Beitrag["beleg"]>} />
          )}
        </div>
        <div className={`${bubble.blase} ${bubble.blaseBot}`}>
          <BeitragsText text={b.text} />
          {b.streamt && <span className={bubble.marke} aria-hidden="true" />}
          {b.zulieferungen?.map((z) => (
            <ZulieferKarte key={z.id} zulieferung={z} bots={bots} />
          ))}
          {b.abnahme && (
            <div
              className={styles.abnahme}
              data-baustein="abnahme"
              data-fertig={b.abnahme.fertig ? "true" : "false"}
            >
              <Sym name="schild" groesse={15} />
              <b>{t("faden.abnahme.titel")}</b>
              <span>{reinerText(b.abnahme.text, 120)}</span>
              {b.abnahme.fertig && (
                <span className={styles.stempel} data-baustein="stempel">
                  <Sym name="haken" groesse={12} />
                  {t("faden.abnahme.stempel")}
                </span>
              )}
            </div>
          )}
          {b.zeilen && b.zeilen.length > 0 && <ErkannteZeilen zeilen={b.zeilen} />}
        </div>
      </div>
    </div>
  );
}

export interface GespraechsGruppeProps {
  gruppe: Gruppe;
  bots: Bots;
  children?: ReactNode;
  /** Gruppe ist anfangs offen. */
  offen?: boolean;
}

/**
 * Eingeklappte Gruppe aufeinanderfolgender Bot-Beiträge. Die Ergebnis-Zeile ist eine
 * übergebene Eigenschaft: Dieser Baustein erzeugt keinen Text. Die Ergänzung der Leitung steht
 * getrennt und als Bot-Text gekennzeichnet.
 */
export function GespraechsGruppe({
  gruppe: g,
  bots,
  children,
  offen: anfang = false,
}: GespraechsGruppeProps) {
  const [offen, setOffen] = useState(anfang);
  const id = useId();
  const autoren = g.autoren.flatMap((a) => (bots[a] ? [{ ...(bots[a] as FadenBot) }] : []));
  return (
    <div className={styles.gruppe} data-baustein="gruppe" data-offen={offen ? "true" : "false"}>
      <button
        type="button"
        className={styles.gruppeKopf}
        aria-expanded={offen}
        aria-controls={id}
        onClick={() => setOffen(!offen)}
      >
        <Sym name="rechts" groesse={14} />
        <AvatarStapel
          bots={autoren.map((b) => ({
            id: b.id,
            farbe: b.farbe,
            ...(b.form ? { form: b.form } : {}),
          }))}
          groesse={20}
          ueberlappung={5}
        />
        <span className={styles.gruppeText}>
          {g.titel && (
            <>
              <b>{reinerText(g.titel, 80)}</b> ·{" "}
            </>
          )}
          {!g.titel && reinerText(g.kopf, 200)}
          {g.titel && reinerText(g.kopf, 200)}
          {g.ergebnis !== "" && (
            <span className={styles.ergebnisZeile}>
              <em>{t("faden.gruppe.ergebnis")}</em> {reinerText(g.ergebnis, 400)}
              {g.belastet && (
                <>
                  {" "}
                  <FremdMarke />
                </>
              )}
            </span>
          )}
        </span>
        {g.abgenommen && (
          <span className={styles.abgenommen}>
            <Sym name="haken" groesse={13} />
            {t("faden.gruppe.abgenommen")}
          </span>
        )}
        <Sym name={offen ? "oben" : "unten"} groesse={15} />
      </button>
      {g.zusatz && (
        <div className={styles.zusatz} data-baustein="zusatz">
          {t("faden.gruppe.zusatz", { name: sauberName(g.zusatz.von) })}
          <p>{reinerText(g.zusatz.text, 400)}</p>
        </div>
      )}
      <div id={id} className={styles.inhalt} hidden={!offen}>
        {offen && children}
      </div>
    </div>
  );
}

export interface GrenzenKarteProps {
  daten: GrenzenKarteDaten;
  bot?: FadenBot | undefined;
  /** „+10.000 Token für diesen Auftrag“: nur hier gibt es diesen Knopf; der Server prüft und belegt. */
  onZuschlag?: () => void;
  /** Eine der anderen Möglichkeiten. */
  onWahl?: (id: string) => void;
}

/**
 * Die Karte „Grenze erreicht“: freundlich, mit klaren Wahlmöglichkeiten. Den Knopf für mehr Token
 * gibt es nur hier und nie aus Bot-Text; er gilt nur für diesen Auftrag, das Tagesbudget bleibt.
 */
export function GrenzenKarte({ daten, bot, onZuschlag, onWahl }: GrenzenKarteProps) {
  const moeglich = zuschlagMoeglich(daten.zuschlaege);
  const nummer = Math.min(daten.zuschlaege.benutzt + 1, daten.zuschlaege.max);
  return (
    <div className={bubble.bot} data-baustein="grenze" data-zustand="fertig">
      <div className={bubble.avatar}>
        {bot && (
          <BotAvatar
            farbe={bot.farbe}
            {...(bot.form ? { form: bot.form } : {})}
            zustand="wartet"
            groesse={30}
            titel={sauberName(bot.name)}
          />
        )}
      </div>
      <div className={bubble.spalte}>
        <div className={styles.wer}>
          <strong>{sauberName(bot?.name)}</strong>
          <span className={styles.rolle}>{t("faden.grenze.region")}</span>
          <span className={styles.zeit}>{daten.zeit}</span>
          {daten.beleg && <BelegZeichen info={daten.beleg} />}
        </div>
        <section className={styles.karte} aria-label={t("faden.grenze.region")}>
          <h3>{reinerText(daten.titel, 200)}</h3>
          <p>{reinerText(daten.text, 600)}</p>
          <div className={styles.wahlen}>
            {daten.wahl.map((w) => {
              if (w.art === "zuschlag") {
                return (
                  <button
                    key={w.id}
                    type="button"
                    className={styles.wahl}
                    data-empfohlen={w.empfohlen ? "true" : undefined}
                    data-wahl="zuschlag"
                    disabled={!moeglich}
                    onClick={() => onZuschlag?.()}
                  >
                    <span className={styles.wahlSymbol} aria-hidden="true">
                      <Sym name="plus" groesse={14} />
                    </span>
                    <span>
                      <b>
                        {t("faden.grenze.zuschlag")}
                        {w.empfohlen && (
                          <span className={styles.empfohlen}>{t("faden.grenze.empfohlen")}</span>
                        )}
                      </b>
                      <small>{reinerText(w.text, 200)}</small>
                      <small>
                        {t("faden.grenze.zuschlag_text")} ·{" "}
                        {t("faden.grenze.zaehler", { nummer, max: daten.zuschlaege.max })}
                      </small>
                    </span>
                    <Sym name="rechts" groesse={16} />
                  </button>
                );
              }
              return (
                <button
                  key={w.id}
                  type="button"
                  className={styles.wahl}
                  data-wahl={w.art}
                  onClick={() => onWahl?.(w.id)}
                >
                  <span className={styles.wahlSymbol} aria-hidden="true">
                    {w.art === "selbst" ? t("faden.stab.du") : <Sym name="pause" groesse={12} />}
                  </span>
                  <span>
                    <b>{reinerText(w.titel, 80)}</b>
                    <small>{reinerText(w.text, 200)}</small>
                  </span>
                  <Sym name="rechts" groesse={16} />
                </button>
              );
            })}
          </div>
          {!moeglich && (
            <p className={styles.verbraucht}>
              {t("faden.grenze.verbraucht", { max: daten.zuschlaege.max })}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

export interface FadenGespraechProps {
  eintraege: readonly GespraechsEintrag[];
  bots: Bots;
  onZuschlag?: () => void;
  onGrenzenWahl?: (id: string) => void;
}

function Eintrag({
  e,
  bots,
  onZuschlag,
  onGrenzenWahl,
}: { e: GespraechsEintrag } & Omit<FadenGespraechProps, "eintraege">) {
  switch (e.art) {
    case "beitrag":
      return <GespraechsBeitrag beitrag={e} bots={bots} />;
    case "trenner":
      return <div className={styles.trenner}>{reinerText(e.text, 120)}</div>;
    case "gruppe":
      return (
        <GespraechsGruppe gruppe={e} bots={bots}>
          {e.inhalt.map((i) => (
            <Eintrag
              key={i.id}
              e={i}
              bots={bots}
              {...(onZuschlag ? { onZuschlag } : {})}
              {...(onGrenzenWahl ? { onGrenzenWahl } : {})}
            />
          ))}
        </GespraechsGruppe>
      );
    case "grenze":
      return (
        <GrenzenKarte
          daten={e}
          bot={bots.pai}
          {...(onZuschlag ? { onZuschlag } : {})}
          {...(onGrenzenWahl ? { onWahl: onGrenzenWahl } : {})}
        />
      );
    case "band":
      return (
        <div className={styles.band} role="status" data-baustein="band">
          <Sym name="pause" groesse={20} />
          <div>
            <h3>{reinerText(e.titel, 120)}</h3>
            <p>{reinerText(e.text, 300)}</p>
          </div>
        </div>
      );
  }
}

/** Das Gespräch: die Einträge in der Reihenfolge, wie der Server sie liefert. */
export function FadenGespraech({
  eintraege,
  bots,
  onZuschlag,
  onGrenzenWahl,
}: FadenGespraechProps) {
  return (
    <div className={styles.spalte} data-baustein="gespraech">
      {eintraege.map((e) => (
        <Eintrag
          key={e.id}
          e={e}
          bots={bots}
          {...(onZuschlag ? { onZuschlag } : {})}
          {...(onGrenzenWahl ? { onGrenzenWahl } : {})}
        />
      ))}
    </div>
  );
}

export interface FadenFilterProps {
  wahl: "alles" | "ergebnisse" | "an_mich";
  onWahl: (w: "alles" | "ergebnisse" | "an_mich") => void;
  anMich: number;
  /** „40 Beiträge · 32 eingeklappt“ */
  zaehler?: { gesamt: number; eingeklappt: number };
}

/** Umschalter „Alles · Nur Ergebnisse · Nur an mich“. */
export function FadenFilter({ wahl, onWahl, anMich, zaehler }: FadenFilterProps) {
  const knopf = (id: FadenFilterProps["wahl"], text: string, zahl?: number) => (
    <button type="button" aria-pressed={wahl === id} onClick={() => onWahl(id)} data-filter={id}>
      {text}
      {zahl !== undefined && zahl > 0 && <span className={styles.zahl}>{zahl}</span>}
    </button>
  );
  return (
    // biome-ignore lint/a11y/useSemanticElements: benannte Gruppe von Bedienelementen, fieldset passt hier nicht
    <div className={styles.filter} role="group" aria-label={t("faden.filter.region")}>
      {knopf("alles", t("faden.filter.alles"))}
      {knopf("ergebnisse", t("faden.filter.ergebnisse"))}
      {knopf("an_mich", t("faden.filter.an_mich"), anMich)}
      {zaehler && zaehler.gesamt > 0 && (
        <span className={styles.rechts}>{t("faden.filter.zaehler", zaehler)}</span>
      )}
    </div>
  );
}

/** Hinweis, wenn der Filter „Nur an mich“ nichts zeigt. */
export function FilterLeer() {
  return <p className={styles.leer}>{t("faden.filter.an_mich_leer")}</p>;
}
