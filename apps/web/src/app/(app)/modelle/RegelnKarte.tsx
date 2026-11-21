/**
 * PaiBot – Karte „Routing-Regeln“ für EUrouter auf der Seite „Modell und Anbieter“: geprüfte Regeln
 * zur Wahl, neue Regel per Name prüfen und hinzufügen, Regel entfernen; frühere Einträge aus der
 * Modell-Liste bleiben benutzbar und bekommen einen Hinweis zum Umstellen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import type { Provider } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import { Button, EmptyState, Karte, StatusChip, TestErgebnis, TextField } from "@paibot/ui";
import { useId, useState } from "react";
import { apiFetch } from "../../../lib/api/client";
import type { BotModell } from "../../../lib/bot/bot";
import type { AlterEintrag } from "../../../lib/modelle/seite";
import type { KontoRegel } from "../../../lib/modelle/verwaltung";
import {
  ausweichSatz,
  euMarke,
  euSatz,
  type RegelVorgabe,
  residenzSatz,
} from "../../../lib/modelle/vorgabe";
import styles from "./modelle.module.css";

export interface RegelEintragAnsicht {
  id: string;
  name: string;
  /** Nur mit zweitem Schlüssel gelesen. */
  vorgabe?: RegelVorgabe;
}

export interface RegelnKarteProps {
  anbieter: Provider;
  botName: string;
  regeln: RegelEintragAnsicht[];
  alte: AlterEintrag[];
  modell?: BotModell;
  onRegeln: (regeln: RegelEintragAnsicht[]) => void;
  onModell: (modell: BotModell) => void;
}

type Ergebnis = { art: "ok" | "fehler"; titel: string; text: string } | undefined;

type KontoListe =
  | { zustand: "aus" }
  | { zustand: "laedt" }
  | { zustand: "fehler"; text: string }
  | {
      zustand: "fertig";
      regeln: KontoRegel[];
      unvollstaendig: boolean;
      uebersprungen: number;
    };

/** Sätze zu den Vorgaben einer gespeicherten Regel: Kennzeichnung nur mit Beleg. */
function Vorgabe({ regel, anbieter }: { regel: RegelEintragAnsicht; anbieter: string }) {
  const v = regel.vorgabe;
  if (v === undefined) return <span className={styles.leise}>{t("vorgabe.nur_name")}</span>;
  const eu = euSatz(v, anbieter);
  const residenz = residenzSatz(v);
  const ausweichen = ausweichSatz(v);
  return (
    <span className={styles.vorgabe}>
      {eu !== undefined && (
        <span>
          <StatusChip art="eu">{euMarke(v) ?? ""}</StatusChip>{" "}
          <span className={styles.leise}>{eu}</span>
        </span>
      )}
      {residenz !== undefined && <span className={styles.leise}>{residenz}</span>}
      {eu !== undefined && <span className={styles.leise}>{t("vorgabe.eu.hinweis")}</span>}
      {ausweichen !== undefined && <span className={styles.leise}>{ausweichen}</span>}
      {v.veraltet && (
        <span className={styles.leise}>
          {t("vorgabe.zuletzt", { datum: v.geprueftText })} ({t("vorgabe.alt")})
        </span>
      )}
    </span>
  );
}

export function RegelnKarte(props: RegelnKarteProps) {
  const { anbieter, botName, regeln, alte, modell } = props;
  const [name, setName] = useState("");
  const [feldFehler, setFeldFehler] = useState<string | undefined>();
  const [prueft, setPrueft] = useState(false);
  const [ergebnis, setErgebnis] = useState<Ergebnis>();
  const [auswahl, setAuswahl] = useState<string | undefined>(modell?.id);
  const [uebernimmt, setUebernimmt] = useState(false);
  const [wahlErgebnis, setWahlErgebnis] = useState<Ergebnis>();
  const [konto, setKonto] = useState<KontoListe>({ zustand: "aus" });
  const [neuLaeuft, setNeuLaeuft] = useState<string | undefined>();
  const [neuErgebnis, setNeuErgebnis] = useState<Ergebnis>();
  const gruppe = useId();
  const nameFeld = name.trim();
  const mitSchluessel = anbieter.managementKeySet === true;

  async function kontoZeigen() {
    setKonto({ zustand: "laedt" });
    const antwort = await apiFetch<{
      regeln: KontoRegel[];
      unvollstaendig: boolean;
      uebersprungen: number;
    }>("POST", `/api/anbieter/${encodeURIComponent(anbieter.id)}/regeln/liste`);
    if (!antwort.ok) {
      setKonto({
        zustand: "fehler",
        text: [antwort.fehler.text, antwort.fehler.ausweg].filter(Boolean).join(" "),
      });
      return;
    }
    setKonto({ zustand: "fertig", ...antwort.daten });
  }

  async function neuPruefen(regel?: RegelEintragAnsicht) {
    setNeuErgebnis(undefined);
    setNeuLaeuft(regel?.id ?? "alle");
    const antwort = await apiFetch<{
      regeln: RegelEintragAnsicht[];
      vorgaben: { aktualisiert: string[]; entfernt: string[]; unveraendert: string[] };
      unvollstaendig: boolean;
    }>(
      "POST",
      `/api/anbieter/${encodeURIComponent(anbieter.id)}/regeln/neu-pruefen`,
      regel === undefined ? {} : { modelId: regel.id },
    );
    setNeuLaeuft(undefined);
    if (!antwort.ok) {
      setNeuErgebnis({
        art: "fehler",
        titel: t("verwaltung.neu.fehler"),
        text: [antwort.fehler.text, antwort.fehler.ausweg].filter(Boolean).join(" "),
      });
      return;
    }
    props.onRegeln(antwort.daten.regeln);
    const v = antwort.daten.vorgaben;
    const teile = [t("verwaltung.neu.ok", { anzahl: v.aktualisiert.length })];
    if (v.entfernt.length > 0) {
      teile.push(t("verwaltung.neu.entfernt", { namen: v.entfernt.join(", ") }));
    }
    if (v.unveraendert.length > 0) {
      teile.push(t("verwaltung.neu.unveraendert", { namen: v.unveraendert.join(", ") }));
    }
    setNeuErgebnis({
      art: "ok",
      titel: t("verwaltung.neu.eine"),
      text: teile.join(" "),
    });
  }

  async function hinzufuegen(vorgegeben?: string) {
    setErgebnis(undefined);
    const gewaehlt = vorgegeben ?? nameFeld;
    if (gewaehlt === "") {
      setFeldFehler(t("regelkarte.name.leer"));
      return;
    }
    setFeldFehler(undefined);
    setPrueft(true);
    const antwort = await apiFetch<{
      regel: RegelEintragAnsicht;
      herkunft?: string;
      hinweis?: string;
    }>("POST", `/api/anbieter/${encodeURIComponent(anbieter.id)}/regeln`, { name: gewaehlt });
    setPrueft(false);
    if (!antwort.ok) {
      const text = [antwort.fehler.text, antwort.fehler.ausweg].filter(Boolean).join(" ");
      if (antwort.fehler.felder?.some((f) => f.feld === "name")) setFeldFehler(antwort.fehler.text);
      setErgebnis({ art: "fehler", titel: t("regelkarte.fehler.titel"), text });
      return;
    }
    const neu = antwort.daten.regel;
    props.onRegeln(
      [...regeln.filter((r) => r.id !== neu.id), neu].sort((a, b) =>
        a.name.localeCompare(b.name, "de"),
      ),
    );
    setName("");
    setAuswahl(neu.id);
    setKonto((k) =>
      k.zustand === "fertig"
        ? {
            ...k,
            regeln: k.regeln.map((r) => (r.name === neu.name ? { ...r, gespeichert: true } : r)),
          }
        : k,
    );
    setErgebnis({
      art: "ok",
      titel: t("regelkarte.ok.titel", { name: neu.name }),
      text: [antwort.daten.herkunft ?? t("regelkarte.ok.ohne_herkunft"), antwort.daten.hinweis]
        .filter(Boolean)
        .join(". "),
    });
  }

  async function entfernen(regel: RegelEintragAnsicht) {
    setWahlErgebnis(undefined);
    const antwort = await apiFetch<{ entfernt: boolean }>(
      "DELETE",
      `/api/anbieter/${encodeURIComponent(anbieter.id)}/regeln/${encodeURIComponent(regel.id)}`,
    );
    if (!antwort.ok) {
      setWahlErgebnis({
        art: "fehler",
        titel: t("regelkarte.entfernen.fehler"),
        text: [antwort.fehler.text, antwort.fehler.ausweg].filter(Boolean).join(" "),
      });
      return;
    }
    props.onRegeln(regeln.filter((r) => r.id !== regel.id));
    if (auswahl === regel.id) setAuswahl(undefined);
    setWahlErgebnis({
      art: "ok",
      titel: t("regelkarte.entfernt", { name: regel.name }),
      text: modell?.id === regel.id ? t("regelkarte.entfernt.bot", { name: botName }) : "",
    });
  }

  async function uebernehmen() {
    if (auswahl === undefined) return;
    setWahlErgebnis(undefined);
    setUebernimmt(true);
    const antwort = await apiFetch<{ modell?: BotModell }>("PUT", "/api/bot/modell", {
      modelId: auswahl,
    });
    setUebernimmt(false);
    if (!antwort.ok) {
      setWahlErgebnis({
        art: "fehler",
        titel: t("regelkarte.wahl.fehler"),
        text: [antwort.fehler.text, antwort.fehler.ausweg].filter(Boolean).join(" "),
      });
      return;
    }
    if (antwort.daten.modell) {
      props.onModell(antwort.daten.modell);
      setWahlErgebnis({
        art: "ok",
        titel: t("modelle.uebernommen", {
          name: botName,
          modell: antwort.daten.modell.displayName,
        }),
        text: "",
      });
    }
  }

  const altGewaehlt = modell !== undefined && alte.some((a) => a.id === modell.id);

  return (
    <Karte titel={t("regelkarte.titel", { name: botName })}>
      <p className={styles.aktuell}>
        {modell
          ? t("modelle.aktuell.text", { name: botName, modell: modell.displayName })
          : t("modelle.aktuell.keins", { name: botName })}
      </p>
      <p className={styles.leise}>{t("regelkarte.text", { anbieter: anbieter.name })}</p>
      {altGewaehlt && (
        <div className={styles.meldung} data-art="warn" role="note">
          <p>{t("regelkarte.alt.hinweis", { name: botName, anbieter: anbieter.name })}</p>
        </div>
      )}

      {regeln.length === 0 && alte.length === 0 ? (
        <EmptyState
          titel={t("regelkarte.leer.titel")}
          text={t("regelkarte.leer.text", { anbieter: anbieter.name })}
        />
      ) : (
        <fieldset className={styles.liste}>
          <legend className={styles.unsichtbar}>
            {t("anbieterwahl.regel.liste", { anbieter: anbieter.name })}
          </legend>
          {regeln.map((r) => (
            <div key={r.id} className={styles.regelZeile}>
              <label className={styles.modell} data-gewaehlt={auswahl === r.id || undefined}>
                <input
                  type="radio"
                  name={gruppe}
                  value={r.id}
                  checked={auswahl === r.id}
                  onChange={() => setAuswahl(r.id)}
                />
                <span className={styles.modellText}>
                  <span className={styles.modellName}>
                    <strong>{r.name}</strong>
                    {modell?.id === r.id && (
                      <StatusChip art="ok">{t("modelle.aktuell")}</StatusChip>
                    )}
                  </span>
                  <span className={styles.leise}>{t("regelkarte.eintrag.regel")}</span>
                  <Vorgabe regel={r} anbieter={anbieter.name} />
                </span>
              </label>
              <span className={styles.regelKnoepfe}>
                {mitSchluessel && (
                  <Button
                    art="leise"
                    onClick={() => void neuPruefen(r)}
                    laedt={neuLaeuft === r.id}
                    aria-label={t("verwaltung.neu.eine.label", { name: r.name })}
                  >
                    {t("verwaltung.neu.eine")}
                  </Button>
                )}
                <Button
                  art="leise"
                  icon="papierkorb"
                  onClick={() => void entfernen(r)}
                  aria-label={t("regelkarte.entfernen.label", { name: r.name })}
                >
                  {t("regelkarte.entfernen")}
                </Button>
              </span>
            </div>
          ))}
          {alte.map((m) => (
            <label
              key={m.id}
              className={styles.modell}
              data-gewaehlt={auswahl === m.id || undefined}
            >
              <input
                type="radio"
                name={gruppe}
                value={m.id}
                checked={auswahl === m.id}
                onChange={() => setAuswahl(m.id)}
              />
              <span className={styles.modellText}>
                <span className={styles.modellName}>
                  <strong>{m.displayName}</strong>
                  {modell?.id === m.id && <StatusChip art="ok">{t("modelle.aktuell")}</StatusChip>}
                  <StatusChip art="warn">{t("regelkarte.eintrag.alt")}</StatusChip>
                </span>
                <span className={styles.leise}>
                  <span className={styles.mono}>{m.slug}</span> · {t("regelkarte.eintrag.alt.text")}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {(regeln.length > 0 || alte.length > 0) && (
        <div className={styles.knoepfe}>
          <Button
            art="primaer"
            onClick={() => void uebernehmen()}
            laedt={uebernimmt}
            disabled={auswahl === undefined || auswahl === modell?.id}
          >
            {t("modelle.uebernehmen")}
          </Button>
        </div>
      )}
      <div aria-live="polite" className={styles.live}>
        {wahlErgebnis && (
          <TestErgebnis art={wahlErgebnis.art} titel={wahlErgebnis.titel}>
            {wahlErgebnis.text === "" ? undefined : wahlErgebnis.text}
          </TestErgebnis>
        )}
      </div>

      {mitSchluessel && regeln.length > 0 && (
        <div className={styles.knoepfe}>
          <Button art="zweit" onClick={() => void neuPruefen()} laedt={neuLaeuft === "alle"}>
            {t("verwaltung.neu.alle")}
          </Button>
        </div>
      )}
      <div aria-live="polite" className={styles.live}>
        {neuErgebnis && (
          <TestErgebnis art={neuErgebnis.art} titel={neuErgebnis.titel}>
            {neuErgebnis.text}
          </TestErgebnis>
        )}
      </div>

      {mitSchluessel && (
        <div className={styles.form}>
          <div className={styles.knoepfe}>
            <Button
              art="zweit"
              onClick={() => void kontoZeigen()}
              laedt={konto.zustand === "laedt"}
            >
              {t("verwaltung.holen")}
            </Button>
          </div>
          <div aria-live="polite" className={styles.live}>
            {konto.zustand === "laedt" && (
              <span className={styles.leise}>{t("verwaltung.holen.laeuft")}</span>
            )}
            {konto.zustand === "fehler" && (
              <TestErgebnis art="fehler" titel={t("verwaltung.fehler.titel")}>
                {konto.text}
              </TestErgebnis>
            )}
            {konto.zustand === "fertig" && (
              <div className={styles.liste}>
                <strong>{t("verwaltung.liste.titel")}</strong>
                {konto.regeln.length === 0 && (
                  <span className={styles.leise}>{t("verwaltung.liste.leer")}</span>
                )}
                {konto.regeln.map((r) => (
                  <div key={r.name} className={styles.regelZeile}>
                    <span className={styles.modellText}>
                      <span className={styles.modellName}>
                        <strong>{r.name}</strong>
                        {r.eu && <StatusChip art="eu">{t("vorgabe.eu.marke")}</StatusChip>}
                      </span>
                      {r.residenz !== undefined && (
                        <span className={styles.leise}>{r.residenz}</span>
                      )}
                    </span>
                    {r.gespeichert ? (
                      <span className={styles.leise}>{t("verwaltung.liste.gespeichert")}</span>
                    ) : (
                      <Button
                        art="zweit"
                        icon="plus"
                        onClick={() => void hinzufuegen(r.name)}
                        aria-label={t("verwaltung.liste.hinzufuegen.label", { name: r.name })}
                      >
                        {t("verwaltung.liste.hinzufuegen")}
                      </Button>
                    )}
                  </div>
                ))}
                {konto.unvollstaendig && (
                  <p className={styles.leise}>{t("verwaltung.liste.unvollstaendig")}</p>
                )}
                {konto.uebersprungen > 0 && (
                  <p className={styles.leise}>
                    {t("verwaltung.liste.uebersprungen", { anzahl: konto.uebersprungen })}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={styles.form}>
        <TextField
          label={t("regelkarte.name.feld")}
          name="regelName"
          autoComplete="off"
          spellCheck={false}
          maxLength={100}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setFeldFehler(undefined);
            setErgebnis(undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void hinzufuegen();
            }
          }}
          laedt={prueft}
          fehler={feldFehler}
          hilfe={t("anbieterwahl.regeln.wo", { anbieter: anbieter.name })}
        />
        <p className={styles.leise}>
          {t("anbieterwahl.regeln.kosten", { anbieter: anbieter.name })}
        </p>
      </div>
      <div className={styles.knoepfe}>
        <Button art="zweit" icon="plus" onClick={() => void hinzufuegen()} laedt={prueft}>
          {t("regelkarte.hinzufuegen")}
        </Button>
      </div>
      <div aria-live="polite" className={styles.live}>
        {prueft && <span className={styles.leise}>{t("anbieterwahl.regeln.laeuft")}</span>}
        {ergebnis && (
          <TestErgebnis art={ergebnis.art} titel={ergebnis.titel}>
            {ergebnis.text}
          </TestErgebnis>
        )}
      </div>
    </Karte>
  );
}
