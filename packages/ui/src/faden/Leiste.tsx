/**
 * PaiBot – rechte Faden-Leiste: Reiter Ziele, Team, Lieferungen, Fragen, Belege; am Handy ein Blatt von unten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { useId, useRef, useState } from "react";
import { BelegZeichen } from "./BelegZeichen";
import { BotAvatar } from "./BotAvatar";
import { FragenKarten } from "./Fragen";
import {
  alleZiele,
  laufendeEtappe,
  naechsterReiter,
  stapelRest,
  teamGruppen,
  zielStand,
} from "./funktionen";
import { BudgetZeile } from "./Kopf";
import styles from "./Leiste.module.css";
import { Sym } from "./symbole";
import { reinerText, sauberName } from "./text";
import type {
  BudgetAnzeige,
  Etappe,
  FadenBot,
  FadenStand,
  LeistenDaten,
  TiefeAnzeige,
  VorschlagWahl,
  Ziel,
} from "./typen";
import { ZulieferKarte } from "./Zulieferung";

export type ReiterId = "ziele" | "team" | "lieferungen" | "fragen" | "belege";
const REITER: readonly ReiterId[] = ["ziele", "team", "lieferungen", "fragen", "belege"];

export interface FadenLeisteProps {
  daten: LeistenDaten;
  bots: Readonly<Record<string, FadenBot>>;
  stand: FadenStand;
  budget: BudgetAnzeige;
  tiefe: TiefeAnzeige;
  /** Offen oder zu. Zu: am Desktop weg, am Handy nur die Griffzeile. */
  offen: boolean;
  onOffen: (offen: boolean) => void;
  /** Gewählter Reiter; ohne Angabe verwaltet die Leiste ihn selbst. */
  reiter?: ReiterId;
  onReiter?: (reiter: ReiterId) => void;
  onStabNehmen?: () => void;
  onAnhalten?: () => void;
  onFortsetzen?: () => void;
  onVorschlag?: (wahl: VorschlagWahl) => void;
  onSelbst?: () => void;
  /** Ein Ziel antippen: zur Stelle im Chat springen. */
  onZiel?: (zielId: string) => void;
  /** Kennung für `aria-controls` des Knopfes, der die Leiste öffnet. */
  id?: string;
}

function ZielZeile({
  ziel,
  bots,
  onZiel,
}: {
  ziel: Ziel;
  bots: Readonly<Record<string, FadenBot>>;
  onZiel: FadenLeisteProps["onZiel"];
}) {
  const bot = ziel.botId ? bots[ziel.botId] : undefined;
  const inhalt = (
    <>
      <span className={styles.ck} aria-hidden="true">
        {ziel.stand === "erledigt" && <Sym name="haken" groesse={9} />}
      </span>
      {bot && (
        <BotAvatar farbe={bot.farbe} {...(bot.form ? { form: bot.form } : {})} groesse={20} still />
      )}
      <span className={styles.zielText}>
        {reinerText(ziel.text, 120)}
        {ziel.hinweis && (
          <small
            data-art={
              ziel.stand === "laeuft" ? "aktiv" : ziel.stand === "wartet" ? "warn" : undefined
            }
          >
            {reinerText(ziel.hinweis, 120)}
          </small>
        )}
      </span>
    </>
  );
  if (onZiel) {
    return (
      <button
        type="button"
        className={styles.ziel}
        data-stand={ziel.stand}
        title={t("faden.leiste.zur_stelle")}
        onClick={() => onZiel(ziel.id)}
      >
        {inhalt}
        <span className={styles.sprung}>
          <Sym name="rechts" groesse={14} />
        </span>
      </button>
    );
  }
  return (
    <div className={styles.ziel} data-stand={ziel.stand}>
      {inhalt}
    </div>
  );
}

function EtappeBlock({
  etappe,
  nr,
  anfangOffen,
  bots,
  onZiel,
}: {
  etappe: Etappe;
  nr: number;
  anfangOffen: boolean;
  bots: Readonly<Record<string, FadenBot>>;
  onZiel: FadenLeisteProps["onZiel"];
}) {
  const [offen, setOffen] = useState(anfangOffen);
  const s = zielStand(etappe.ziele);
  const fertig = s.gesamt > 0 && s.erledigt === s.gesamt;
  const id = useId();
  return (
    <div className={styles.etappe} data-offen={offen}>
      <button
        type="button"
        className={styles.etappeKopf}
        aria-expanded={offen}
        aria-controls={id}
        onClick={() => setOffen(!offen)}
      >
        {fertig ? (
          <Sym name="haken" groesse={15} />
        ) : (
          <Sym name={offen ? "unten" : "rechts"} groesse={15} />
        )}
        <b>{t("faden.leiste.etappe", { nr, name: reinerText(etappe.name, 60) })}</b>
        <span className={styles.stand}>{t("faden.leiste.etappe_stand", s)}</span>
      </button>
      <div id={id} className={styles.ziele} hidden={!offen}>
        {offen &&
          etappe.ziele.map((z) => <ZielZeile key={z.id} ziel={z} bots={bots} onZiel={onZiel} />)}
      </div>
    </div>
  );
}

function Mitglied({ bot, gross }: { bot: FadenBot; gross?: boolean }) {
  return (
    <div className={styles.mitglied} data-gross={gross ? "true" : undefined}>
      <BotAvatar
        farbe={bot.farbe}
        {...(bot.form ? { form: bot.form } : {})}
        zustand={bot.zustand}
        groesse={gross ? 30 : 22}
        still
      />
      <span className={styles.text}>
        <b style={{ fontWeight: 600 }}>{sauberName(bot.name)}</b>{" "}
        <span className={styles.rolle}>{reinerText(bot.rolle, 40)}</span>
        {gross && <small>{reinerText(bot.stand, 60)}</small>}
      </span>
      {!gross && (
        <span className={styles.wort} data-art={bot.standArt}>
          {reinerText(bot.stand, 40)}
        </span>
      )}
    </div>
  );
}

/**
 * Die Faden-Leiste. Am Desktop eine Spalte rechts, die man ein- und ausklappt; am Handy ein Blatt
 * von unten mit einer Griffzeile. Alle Texte von Bots stehen als reiner Text. „Stab nehmen“ und
 * „Faden anhalten“ sind Knöpfe mit Rückruf; die Leiste entscheidet nichts selbst.
 */
export function FadenLeiste({
  daten,
  bots,
  stand,
  budget,
  tiefe,
  offen,
  onOffen,
  reiter,
  onReiter,
  onStabNehmen,
  onAnhalten,
  onFortsetzen,
  onVorschlag,
  onSelbst,
  onZiel,
  id,
}: FadenLeisteProps) {
  const [eigen, setEigen] = useState<ReiterId>("ziele");
  const aktiv = reiter ?? eigen;
  const waehle = (r: ReiterId) => {
    if (reiter === undefined) setEigen(r);
    onReiter?.(r);
  };
  const basis = useId();
  const knoepfe = useRef<Record<string, HTMLButtonElement | null>>({});

  const ziele = alleZiele(daten.etappen);
  const zs = zielStand(ziele);
  const laufend = laufendeEtappe(daten.etappen);
  const mitEtappen = daten.etappen.some((e) => e.name);
  const teamBots = daten.beteiligte.flatMap((b) => (bots[b] ? [bots[b]] : []));
  const gruppen = teamGruppen(teamBots, {
    fuehrt: daten.fuehrt,
    dran: daten.dran,
    naechste: daten.naechste,
    fragen: daten.fragen,
  });
  const ruhigStapel = stapelRest(gruppen.ruhig, 3);
  const dranNamen = daten.dran.map((d) => sauberName(bots[d]?.name)).join(", ");

  const taste = (e: React.KeyboardEvent, i: number) => {
    const neu = naechsterReiter(REITER.length, i, e.key);
    if (neu === null) return;
    e.preventDefault();
    const r = REITER[neu];
    if (r) {
      waehle(r);
      knoepfe.current[r]?.focus();
    }
  };

  const zahl = (r: ReiterId): { n: number; warn?: boolean } | null => {
    if (r === "lieferungen" && daten.lieferungen.length > 0) return { n: daten.lieferungen.length };
    if (r === "fragen" && daten.fragen.length > 0) return { n: daten.fragen.length, warn: true };
    return null;
  };
  const text: Record<ReiterId, string> = {
    ziele: t("faden.leiste.reiter_ziele"),
    team: t("faden.leiste.reiter_team"),
    lieferungen: t("faden.leiste.reiter_lieferungen"),
    fragen: t("faden.leiste.reiter_fragen"),
    belege: t("faden.leiste.reiter_belege"),
  };

  return (
    <aside
      id={id}
      className={styles.leiste}
      data-baustein="leiste"
      data-offen={offen ? "true" : "false"}
      aria-label={t("faden.leiste.region")}
    >
      <button
        type="button"
        className={styles.griff}
        aria-expanded={offen}
        aria-label={t("faden.leiste.griff")}
        onClick={() => onOffen(!offen)}
      >
        <span className={styles.strich} aria-hidden="true" />
        <b>{t("faden.leiste.griff_ziele", zs)}</b>
        {daten.fragen.length > 0 && (
          <span className={styles.griffWarn}>
            {t("faden.leiste.griff_fragen", { anzahl: daten.fragen.length })}
          </span>
        )}
        {dranNamen && (
          <span style={{ color: "var(--ink-soft)" }}>
            {t("faden.leiste.griff_dran", { name: dranNamen })}
          </span>
        )}
        <Sym name={offen ? "unten" : "oben"} groesse={16} />
      </button>

      <div className={styles.innen} {...(offen ? {} : { inert: true })}>
        <div className={styles.reiter} role="tablist" aria-label={t("faden.leiste.reiter")}>
          {REITER.map((r, i) => {
            const z = zahl(r);
            return (
              <button
                key={r}
                ref={(el) => {
                  knoepfe.current[r] = el;
                }}
                type="button"
                role="tab"
                id={`${basis}-tab-${r}`}
                aria-selected={aktiv === r}
                aria-controls={`${basis}-panel-${r}`}
                tabIndex={aktiv === r ? 0 : -1}
                onClick={() => waehle(r)}
                onKeyDown={(e) => taste(e, i)}
              >
                {text[r]}
                {z && (
                  <span className={styles.zahl} data-art={z.warn ? "warn" : undefined}>
                    {z.n}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className={styles.inhalt}>
          {REITER.map((r) => (
            <div
              key={r}
              role="tabpanel"
              id={`${basis}-panel-${r}`}
              aria-labelledby={`${basis}-tab-${r}`}
              className={styles.panel}
              hidden={aktiv !== r}
              data-panel={r}
            >
              {aktiv === r && r === "ziele" && (
                <>
                  {daten.naechstOffen && (
                    <div className={styles.naechst}>
                      <span className={styles.beschriftung}>{t("faden.leiste.naechst")}</span>
                      <b>{reinerText(daten.naechstOffen.titel, 80)}</b>
                      <p>{reinerText(daten.naechstOffen.text, 160)}</p>
                    </div>
                  )}
                  {mitEtappen ? (
                    daten.etappen.map((e, i) => (
                      <EtappeBlock
                        key={e.id}
                        etappe={e}
                        nr={i + 1}
                        anfangOffen={e.id === laufend?.id}
                        bots={bots}
                        onZiel={onZiel}
                      />
                    ))
                  ) : (
                    <div className={styles.zielListe}>
                      {ziele.map((z) => (
                        <ZielZeile key={z.id} ziel={z} bots={bots} onZiel={onZiel} />
                      ))}
                    </div>
                  )}
                </>
              )}

              {aktiv === r && r === "team" && (
                <div className={styles.team}>
                  {gruppen.fuehrt.length > 0 && (
                    <span className={styles.gruppe}>{t("faden.leiste.team_fuehrt")}</span>
                  )}
                  {gruppen.fuehrt.map((b) => (
                    <Mitglied key={b.id} bot={b} gross />
                  ))}
                  {gruppen.dran.length > 0 && (
                    <span className={styles.gruppe}>{t("faden.leiste.team_dran")}</span>
                  )}
                  {gruppen.dran.map((b) => (
                    <Mitglied key={b.id} bot={b} gross />
                  ))}
                  {gruppen.wartetAufDich.length > 0 && (
                    <span className={styles.gruppe}>{t("faden.leiste.team_wartet")}</span>
                  )}
                  {gruppen.wartetAufDich.map((b) => (
                    <Mitglied key={b.id} bot={b} />
                  ))}
                  {gruppen.naechste.length > 0 && (
                    <span className={styles.gruppe}>{t("faden.leiste.team_naechste")}</span>
                  )}
                  {gruppen.naechste.map((b) => (
                    <Mitglied key={b.id} bot={b} />
                  ))}
                  {gruppen.ruhig.length > 0 && (
                    <div className={styles.rest}>
                      <span style={{ display: "inline-flex" }} aria-hidden="true">
                        {ruhigStapel.sichtbar.map((b, i) => (
                          <span key={b.id} style={i === 0 ? undefined : { marginLeft: -6 }}>
                            <BotAvatar
                              farbe={b.farbe}
                              {...(b.form ? { form: b.form } : {})}
                              groesse={20}
                              still
                            />
                          </span>
                        ))}
                      </span>
                      <span>
                        {t("faden.leiste.team_ruhig_text", { anzahl: gruppen.ruhig.length })}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {aktiv === r &&
                r === "lieferungen" &&
                (daten.lieferungen.length === 0 ? (
                  <p className={styles.leer}>{t("faden.leiste.lieferungen_leer")}</p>
                ) : (
                  daten.lieferungen.map((z) => (
                    <ZulieferKarte key={z.id} zulieferung={z} bot={bots[z.von]} mitAbsender />
                  ))
                ))}

              {aktiv === r && r === "fragen" && (
                <FragenKarten
                  fragen={daten.fragen}
                  bots={bots}
                  {...(onVorschlag ? { onVorschlag } : {})}
                  {...(onSelbst ? { onSelbst } : {})}
                />
              )}

              {aktiv === r && r === "belege" && (
                <>
                  <div className={styles.belege}>
                    {daten.belege.map((b, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: Belege können dieselbe Nummer haben
                      <div key={`${b.info.nr}-${i}`} className={styles.beleg}>
                        <span className={styles.zeit}>{reinerText(b.zeit, 10)}</span>
                        <span className={styles.linie}>
                          <i data-markiert={b.markiert ? "true" : undefined} />
                        </span>
                        <span>
                          <b>{reinerText(b.was, 80)}</b>
                          <span className={styles.weg}>{reinerText(b.weg, 120)}</span>
                        </span>
                        <BelegZeichen info={b.info} />
                      </div>
                    ))}
                  </div>
                  {daten.belegeText && (
                    <p className={styles.notiz}>{reinerText(daten.belegeText, 160)}</p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        <div className={styles.fuss}>
          <div className={styles.zeile}>
            <BudgetZeile prozent={budget.prozent} an={tiefe.an} max={tiefe.max} />
          </div>
          <div className={styles.knoepfe}>
            <button type="button" className={styles.knopf} onClick={() => onStabNehmen?.()}>
              <Sym name="stab" groesse={14} />
              {t("faden.stab.nehmen")}
            </button>
            {stand === "angehalten" ? (
              <button
                type="button"
                className={styles.knopf}
                data-art="haupt"
                onClick={() => onFortsetzen?.()}
              >
                {t("faden.stab.fortsetzen")}
              </button>
            ) : (
              <button type="button" className={styles.knopf} onClick={() => onAnhalten?.()}>
                <Sym name="pause" groesse={14} />
                {t("faden.stab.anhalten")}
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
