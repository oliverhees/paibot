/**
 * PaiBot – Seite „Modell und Anbieter“ im Browser: Anbieter mit Region, Schlüssel eintragen,
 * ersetzen oder entfernen (mit Verbindungstest), Modell aus der Liste des Anbieters wählen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import type { ApiErrorDetail } from "@paibot/shared/api";
import type { Provider } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Icon,
  Karte,
  LoadingState,
  SeitenSpalte,
  StatusChip,
  TextField,
} from "@paibot/ui";
import { useCallback, useEffect, useId, useState } from "react";
import { apiFetch } from "../../../lib/api/client";
import type { BotModell } from "../../../lib/bot/bot";
import type { AnbieterVorlage } from "../../../lib/modelle/anbieter";
import {
  anbieterStatus,
  listeMoeglich,
  type ModellZeile,
  modelleFiltern,
  regionText,
  sucheZeigen,
} from "../../../lib/modelle/ansicht";
import styles from "./modelle.module.css";

export interface ModelleAnsichtProps {
  botName: string;
  anbieter?: Provider;
  vorlage: AnbieterVorlage;
  modell?: BotModell;
}

type Liste =
  | { zustand: "aus" }
  | { zustand: "laedt" }
  | { zustand: "fehler"; fehler: ApiErrorDetail }
  | { zustand: "fertig"; modelle: ModellZeile[] };

type Meldung = { art: "ok" | "fehler"; text: string; ausweg?: string } | undefined;

function koerperVon(a: Pick<Provider, "templateKey" | "name" | "baseUrl" | "region">) {
  return { templateKey: a.templateKey, name: a.name, baseUrl: a.baseUrl, region: a.region };
}

function MeldungZeile({ meldung }: { meldung: Meldung }) {
  if (meldung === undefined) return null;
  return (
    <div className={styles.meldung} data-art={meldung.art}>
      <Icon name={meldung.art === "ok" ? "check" : "info"} />
      <p>
        {meldung.text}
        {meldung.ausweg && <span className={styles.ausweg}> {meldung.ausweg}</span>}
      </p>
    </div>
  );
}

export function ModelleAnsicht(props: ModelleAnsichtProps) {
  const { botName, vorlage } = props;
  const [anbieter, setAnbieter] = useState<Provider | undefined>(props.anbieter);
  const [modell, setModell] = useState<BotModell | undefined>(props.modell);
  const [formOffen, setFormOffen] = useState(props.anbieter === undefined);
  const [schluessel, setSchluessel] = useState("");
  const [feldFehler, setFeldFehler] = useState<string | undefined>();
  const [testLaeuft, setTestLaeuft] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [schluesselMeldung, setSchluesselMeldung] = useState<Meldung>();
  const [dialogOffen, setDialogOffen] = useState(false);
  const [entfernt, setEntfernt] = useState(false);
  const [liste, setListe] = useState<Liste>({
    zustand: listeMoeglich(props.anbieter) ? "laedt" : "aus",
  });
  const [suche, setSuche] = useState("");
  const [auswahl, setAuswahl] = useState<string | undefined>(props.modell?.id);
  const [modellMeldung, setModellMeldung] = useState<Meldung>();
  const [uebernimmt, setUebernimmt] = useState(false);
  const listenName = useId();

  const name = anbieter?.name ?? vorlage.name;
  const region = anbieter?.region ?? vorlage.region;

  const listeLaden = useCallback(async (a: Provider | undefined) => {
    if (!listeMoeglich(a) || a === undefined) {
      setListe({ zustand: "aus" });
      return;
    }
    setListe({ zustand: "laedt" });
    const antwort = await apiFetch<{ modelle: ModellZeile[] }>(
      "GET",
      `/api/anbieter/${encodeURIComponent(a.id)}/modelle`,
    );
    if (antwort.ok) setListe({ zustand: "fertig", modelle: antwort.daten.modelle });
    else setListe({ zustand: "fehler", fehler: antwort.fehler });
  }, []);

  useEffect(() => {
    void listeLaden(props.anbieter);
  }, [listeLaden, props.anbieter]);

  function formSchliessen() {
    setFormOffen(false);
    setSchluessel("");
    setFeldFehler(undefined);
  }

  async function verbindungTesten() {
    setSchluesselMeldung(undefined);
    if (formOffen && schluessel.trim() === "") {
      setFeldFehler(t("modelle.schluessel.leer"));
      return;
    }
    setFeldFehler(undefined);
    setTestLaeuft(true);
    const koerper: { providerId?: string; apiKey?: string } = {};
    if (anbieter !== undefined) koerper.providerId = anbieter.id;
    if (formOffen) koerper.apiKey = schluessel;
    const antwort = await apiFetch<{ anzahl: number }>(
      "POST",
      "/api/anbieter/verbindungstest",
      koerper,
    );
    setTestLaeuft(false);
    if (antwort.ok) {
      setSchluesselMeldung({
        art: "ok",
        text: t("modelle.verbindung.ok_anzahl", { anzahl: antwort.daten.anzahl }),
      });
    } else {
      setSchluesselMeldung({
        art: "fehler",
        text: antwort.fehler.text,
        ...(antwort.fehler.ausweg ? { ausweg: antwort.fehler.ausweg } : {}),
      });
    }
  }

  async function schluesselSpeichern() {
    setSchluesselMeldung(undefined);
    if (schluessel.trim() === "") {
      setFeldFehler(t("modelle.schluessel.leer"));
      return;
    }
    setFeldFehler(undefined);
    setSpeichert(true);
    const antwort =
      anbieter === undefined
        ? await apiFetch<{ anbieter: Provider }>("POST", "/api/anbieter", {
            ...koerperVon(vorlage),
            apiKey: schluessel,
          })
        : await apiFetch<{ anbieter: Provider }>(
            "PUT",
            `/api/anbieter/${encodeURIComponent(anbieter.id)}`,
            { ...koerperVon(anbieter), apiKey: schluessel },
          );
    setSpeichert(false);
    if (!antwort.ok) {
      const amFeld = antwort.fehler.felder?.some((f) => f.feld === "apiKey");
      if (amFeld) setFeldFehler(antwort.fehler.text);
      setSchluesselMeldung({
        art: "fehler",
        text: antwort.fehler.text,
        ...(antwort.fehler.ausweg ? { ausweg: antwort.fehler.ausweg } : {}),
      });
      return;
    }
    setAnbieter(antwort.daten.anbieter);
    setEntfernt(false);
    formSchliessen();
    setSchluesselMeldung({
      art: "ok",
      text: t("modelle.schluessel.gespeichert", { anbieter: antwort.daten.anbieter.name }),
    });
    void listeLaden(antwort.daten.anbieter);
  }

  async function entfernen() {
    if (anbieter === undefined) return;
    const antwort = await apiFetch<{ entfernt: boolean }>(
      "DELETE",
      `/api/anbieter/${encodeURIComponent(anbieter.id)}`,
    );
    setDialogOffen(false);
    if (!antwort.ok) {
      setSchluesselMeldung({
        art: "fehler",
        text: antwort.fehler.text,
        ...(antwort.fehler.ausweg ? { ausweg: antwort.fehler.ausweg } : {}),
      });
      return;
    }
    setAnbieter(undefined);
    setModell(undefined);
    setAuswahl(undefined);
    setListe({ zustand: "aus" });
    setEntfernt(true);
    setSchluesselMeldung({ art: "ok", text: t("modelle.schluessel.entfernt") });
    setFormOffen(true);
  }

  async function modellUebernehmen() {
    if (auswahl === undefined) return;
    setModellMeldung(undefined);
    setUebernimmt(true);
    const antwort = await apiFetch<{ modell?: BotModell }>("PUT", "/api/bot/modell", {
      modelId: auswahl,
    });
    setUebernimmt(false);
    if (!antwort.ok) {
      setModellMeldung({
        art: "fehler",
        text: antwort.fehler.text,
        ...(antwort.fehler.ausweg ? { ausweg: antwort.fehler.ausweg } : {}),
      });
      return;
    }
    const neu = antwort.daten.modell;
    if (neu) {
      setModell(neu);
      setModellMeldung({
        art: "ok",
        text: t("modelle.uebernommen", { name: botName, modell: neu.displayName }),
      });
    }
  }

  const status = anbieter ? anbieterStatus(anbieter) : undefined;
  const gefiltert = liste.zustand === "fertig" ? modelleFiltern(liste.modelle, suche) : [];

  return (
    <SeitenSpalte
      titel={t("seite.modelle")}
      einleitung={t("modelle.seite.text", { name: botName })}
    >
      <Karte
        titel={t("modelle.anbieter.titel")}
        rechts={status && <StatusChip art={status.art}>{status.text}</StatusChip>}
      >
        <div className={styles.anbieterKopf}>
          <span className={styles.anbieterSymbol} aria-hidden="true">
            <Icon name="zahnrad" />
          </span>
          <div className={styles.anbieterText}>
            <strong>{name}</strong>
            <span className={styles.leise}>
              {t(`modelle.anbieter.vorlage.${anbieter?.templateKey ?? vorlage.templateKey}`)}
            </span>
          </div>
        </div>
        <dl className={styles.angaben}>
          <dt>{t("modelle.anbieter.adresse")}</dt>
          <dd className={styles.mono}>{anbieter?.baseUrl ?? vorlage.baseUrl}</dd>
          <dt>{t("modelle.anbieter.region")}</dt>
          <dd>
            <StatusChip art="eu">{regionText(region)}</StatusChip>{" "}
            <span className={styles.leise}>
              {t(`modelle.region.text.${region}`, { anbieter: name })}
            </span>
          </dd>
          <dt>{t("modelle.schluessel")}</dt>
          <dd>
            {anbieter === undefined ? (
              <span>{t("modelle.schluessel.fehlt")}</span>
            ) : anbieter.keySet ? (
              <span className={styles.hinterlegt}>
                <Icon name="check" />
                {t("modelle.schluessel.hinterlegt")}
              </span>
            ) : (
              <span>
                {anbieter.region === "local"
                  ? t("modelle.schluessel.lokal")
                  : t("modelle.schluessel.fehlt")}
              </span>
            )}
          </dd>
        </dl>
        {anbieter === undefined && !entfernt && (
          <EmptyState
            titel={t("modelle.anbieter.keiner.titel")}
            text={t("modelle.anbieter.keiner.text", { anbieter: name, name: botName })}
          />
        )}
        <p className={styles.leise}>{t("modelle.schluessel.verdeckt")}</p>

        {formOffen && (
          <div className={styles.form}>
            <TextField
              label={t("modelle.schluessel.neu", { anbieter: name })}
              type="password"
              name="apiKey"
              autoComplete="off"
              spellCheck={false}
              className={styles.mono}
              value={schluessel}
              onChange={(e) => {
                setSchluessel(e.target.value);
                setFeldFehler(undefined);
                setSchluesselMeldung(undefined);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void schluesselSpeichern();
                }
              }}
              laedt={testLaeuft}
              fehler={feldFehler}
              hilfe={t("modelle.schluessel.hilfe", { anbieter: name })}
            />
          </div>
        )}

        <div className={styles.knoepfe}>
          {formOffen ? (
            <>
              <Button art="zweit" onClick={() => void verbindungTesten()} laedt={testLaeuft}>
                {t("modelle.verbindungstest")}
              </Button>
              <Button art="primaer" onClick={() => void schluesselSpeichern()} laedt={speichert}>
                {speichert ? t("modelle.schluessel.speichert") : t("modelle.schluessel.speichern")}
              </Button>
              {anbieter !== undefined && (
                <Button art="leise" onClick={formSchliessen}>
                  {t("allgemein.abbrechen")}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button art="zweit" onClick={() => void verbindungTesten()} laedt={testLaeuft}>
                {t("modelle.verbindungstest")}
              </Button>
              <Button
                art="leise"
                onClick={() => {
                  setSchluesselMeldung(undefined);
                  setFormOffen(true);
                }}
              >
                {anbieter?.keySet
                  ? t("modelle.schluessel.ersetzen")
                  : t("modelle.schluessel.eintragen")}
              </Button>
              {anbieter !== undefined && (
                <Button art="leise" icon="papierkorb" onClick={() => setDialogOffen(true)}>
                  {t("modelle.schluessel.entfernen")}
                </Button>
              )}
            </>
          )}
        </div>
        <div role="status" aria-live="polite" className={styles.live}>
          {testLaeuft && <span className={styles.leise}>{t("modelle.verbindung.laeuft")}</span>}
          <MeldungZeile meldung={schluesselMeldung} />
        </div>
      </Karte>

      <Karte
        titel={t("modelle.liste.titel", { name: botName })}
        rechts={
          liste.zustand === "fertig" ? (
            <span className={styles.leise}>
              {t("modelle.liste.anzahl", { anzahl: liste.modelle.length })}
            </span>
          ) : undefined
        }
      >
        <p className={styles.aktuell}>
          {modell
            ? t("modelle.aktuell.text", { name: botName, modell: modell.displayName })
            : t("modelle.aktuell.keins", { name: botName })}
        </p>
        <p className={styles.leise}>{t("modelle.liste.text", { anbieter: name })}</p>

        {liste.zustand === "aus" && (
          <p className={styles.leise}>{t("modelle.liste.ohne_schluessel")}</p>
        )}
        {liste.zustand === "laedt" && (
          <LoadingState text={t("modelle.liste.laedt", { anbieter: name })} />
        )}
        {liste.zustand === "fehler" && (
          <ErrorState
            code={liste.fehler.code}
            titel={liste.fehler.text}
            {...(liste.fehler.ausweg ? { ausweg: liste.fehler.ausweg } : {})}
            aktion={
              <Button art="zweit" onClick={() => void listeLaden(anbieter)}>
                {t("modelle.liste.neu_laden")}
              </Button>
            }
          />
        )}
        {liste.zustand === "fertig" && liste.modelle.length === 0 && (
          <ErrorState
            titel={t("modelle.liste.leer", { anbieter: name })}
            ausweg={t("modelle.liste.leer.ausweg", { anbieter: name })}
            aktion={
              <Button art="zweit" onClick={() => void listeLaden(anbieter)}>
                {t("modelle.liste.neu_laden")}
              </Button>
            }
          />
        )}
        {liste.zustand === "fertig" && liste.modelle.length > 0 && (
          <>
            {sucheZeigen(liste.modelle) && (
              <TextField
                label={t("modelle.suche")}
                type="search"
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
              />
            )}
            {gefiltert.length === 0 ? (
              <p className={styles.leise}>{t("modelle.liste.keine_treffer", { suche })}</p>
            ) : (
              <fieldset className={styles.liste}>
                <legend className={styles.unsichtbar}>
                  {t("modelle.liste.name", { anbieter: name })}
                </legend>
                {gefiltert.map((m) => {
                  const istAktuell = modell?.id === m.id;
                  return (
                    <label
                      key={m.id}
                      className={styles.modell}
                      data-gewaehlt={auswahl === m.id || undefined}
                    >
                      <input
                        type="radio"
                        name={listenName}
                        value={m.id}
                        checked={auswahl === m.id}
                        onChange={() => {
                          setAuswahl(m.id);
                          setModellMeldung(undefined);
                        }}
                      />
                      <span className={styles.modellText}>
                        <span className={styles.modellName}>
                          <strong>{m.displayName}</strong>
                          {istAktuell && <StatusChip art="ok">{t("modelle.aktuell")}</StatusChip>}
                        </span>
                        <span className={styles.leise}>
                          <span className={styles.mono}>{m.slug}</span> ·{" "}
                          {t("modelle.herkunft", { anbieter: name, region: regionText(region) })}
                        </span>
                      </span>
                      <StatusChip art="eu">{regionText(region)}</StatusChip>
                    </label>
                  );
                })}
              </fieldset>
            )}
            <div className={styles.knoepfe}>
              <Button
                art="primaer"
                onClick={() => void modellUebernehmen()}
                laedt={uebernimmt}
                disabled={auswahl === undefined || auswahl === modell?.id}
              >
                {t("modelle.uebernehmen")}
              </Button>
            </div>
          </>
        )}
        <div role="status" aria-live="polite" className={styles.live}>
          <MeldungZeile meldung={modellMeldung} />
        </div>
      </Karte>

      <Dialog
        offen={dialogOffen}
        onSchliessen={() => setDialogOffen(false)}
        titel={t("modelle.schluessel.entfernen.titel")}
        schliessenLabel={t("allgemein.abbrechen")}
        rueckfrage
        aktionen={
          <>
            <Button art="leise" onClick={() => setDialogOffen(false)}>
              {t("allgemein.abbrechen")}
            </Button>
            <Button art="gefahr" onClick={() => void entfernen()}>
              {t("modelle.schluessel.entfernen.ja")}
            </Button>
          </>
        }
      >
        <p>{t("modelle.schluessel.entfernen.text", { anbieter: name, name: botName })}</p>
      </Dialog>
    </SeitenSpalte>
  );
}
