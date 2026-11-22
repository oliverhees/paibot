/**
 * PaiBot – Seite „Modell und Anbieter“ im Browser: Anbieter mit belegbarer Herkunfts-Angabe,
 * Schlüssel ersetzen oder entfernen (mit deutlichem Verbindungstest), Modell aus der Liste des
 * Anbieters bzw. bei EUrouter eine Routing-Regel wählen. Anbieter (EUrouter, Mistral AI, eigener
 * oder lokaler) lassen sich hinzufügen; eigene ändern und entfernen.
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
  Select,
  StatusChip,
  TestErgebnis,
  TextField,
} from "@paibot/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { apiFetch } from "../../../lib/api/client";
import type { BotModell } from "../../../lib/bot/bot";
import type { AnbieterVorlage } from "../../../lib/modelle/anbieter";
import {
  anbieterImSatz,
  anbieterStatus,
  eigenerAnbieter,
  listeLeerAusweg,
  listeMoeglich,
  type ModellZeile,
  modelleFiltern,
  regionText,
  sucheZeigen,
} from "../../../lib/modelle/ansicht";
import { gezeigterAnbieter } from "../../../lib/modelle/eigen";
import { anbieterHerkunft } from "../../../lib/modelle/herkunft";
import type { ModelleSeitenDaten } from "../../../lib/modelle/seite";
import { AnbieterAngaben, BedingungenLink, KontoLink } from "../../AnbieterAuswahl";
import { AnbieterHinzufuegen } from "./AnbieterHinzufuegen";
import { EigenerAnbieterForm } from "./EigenerAnbieterForm";
import styles from "./modelle.module.css";
import { type RegelEintragAnsicht, RegelnKarte } from "./RegelnKarte";

export interface ModelleAnsichtProps {
  botName: string;
  /** Alle gespeicherten Anbieter, ohne Schlüssel. */
  anbieterListe: Provider[];
  vorlage: AnbieterVorlage;
  vorlagen?: ModelleSeitenDaten["vorlagen"];
  regeln?: Record<string, RegelEintragAnsicht[]>;
  alteEintraege?: ModelleSeitenDaten["alteEintraege"];
  modell?: BotModell;
}

type Liste =
  | { zustand: "aus" }
  | { zustand: "laedt" }
  | { zustand: "fehler"; fehler: ApiErrorDetail }
  | { zustand: "fertig"; modelle: ModellZeile[] };

type Meldung = { art: "ok" | "fehler"; text: string; ausweg?: string } | undefined;

/** Kann die Seite die Modell-Liste holen? Bei EUrouter nie (dort Routing-Regeln). */
function listeHolbar(a: Provider | undefined): boolean {
  return a !== undefined && a.templateKey !== "eurouter" && listeMoeglich(a);
}

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
  // Die Seitenleiste zeigt die Herkunft der Modelle; nach einer Änderung neu vom Server holen.
  const router = useRouter();
  const [alle, setAlle] = useState<Provider[]>(props.anbieterListe);
  const [modell, setModell] = useState<BotModell | undefined>(props.modell);
  const [gezeigtId, setGezeigtId] = useState<string | undefined>(
    gezeigterAnbieter(props.anbieterListe, undefined, props.modell?.anbieterId)?.id,
  );
  const anbieter = gezeigterAnbieter(alle, gezeigtId, modell?.anbieterId);
  const erster = gezeigterAnbieter(props.anbieterListe, undefined, props.modell?.anbieterId);
  const [formOffen, setFormOffen] = useState(false);
  const [regeln, setRegeln] = useState<Record<string, RegelEintragAnsicht[]>>(props.regeln ?? {});
  const [testErgebnis, setTestErgebnis] = useState<
    { art: "ok" | "fehler"; titel: string; text: string } | undefined
  >();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [schluessel, setSchluessel] = useState("");
  const [feldFehler, setFeldFehler] = useState<string | undefined>();
  const [testLaeuft, setTestLaeuft] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [schluesselMeldung, setSchluesselMeldung] = useState<Meldung>();
  const [dialogOffen, setDialogOffen] = useState(false);
  const [liste, setListe] = useState<Liste>({
    zustand: listeHolbar(erster) ? "laedt" : "aus",
  });
  const [suche, setSuche] = useState("");
  const [auswahl, setAuswahl] = useState<string | undefined>(props.modell?.id);
  const [modellMeldung, setModellMeldung] = useState<Meldung>();
  const [uebernimmt, setUebernimmt] = useState(false);
  const listenName = useId();

  const name = anbieter?.name ?? vorlage.name;
  const satzName = anbieterImSatz(anbieter ?? vorlage);

  const listeLaden = useCallback(async (a: Provider | undefined): Promise<number | undefined> => {
    if (!listeHolbar(a) || a === undefined) {
      setListe({ zustand: "aus" });
      return undefined;
    }
    setListe({ zustand: "laedt" });
    const antwort = await apiFetch<{ modelle: ModellZeile[] }>(
      "POST",
      `/api/anbieter/${encodeURIComponent(a.id)}/modelle`,
    );
    if (antwort.ok) {
      setListe({ zustand: "fertig", modelle: antwort.daten.modelle });
      return antwort.daten.modelle.length;
    }
    setListe({ zustand: "fehler", fehler: antwort.fehler });
    return undefined;
  }, []);

  const ersterRef = useRef(erster);
  useEffect(() => {
    void listeLaden(ersterRef.current);
  }, [listeLaden]);

  /** Gespeicherten Anbieter in der Liste ersetzen bzw. anhängen und anzeigen. */
  function anbieterUebernehmen(neu: Provider) {
    setAlle((liste) =>
      liste.some((a) => a.id === neu.id)
        ? liste.map((a) => (a.id === neu.id ? neu : a))
        : [...liste, neu],
    );
    setGezeigtId(neu.id);
  }

  function anbieterZeigen(id: string) {
    const neu = alle.find((a) => a.id === id);
    if (neu === undefined || neu.id === anbieter?.id) return;
    setGezeigtId(id);
    formSchliessen();
    setBearbeiten(false);
    setSchluesselMeldung(undefined);
    setModellMeldung(undefined);
    setSuche("");
    setAuswahl(modell?.id);
    void listeLaden(neu);
  }

  function formSchliessen() {
    setFormOffen(false);
    setSchluessel("");
    setFeldFehler(undefined);
  }

  async function verbindungTesten() {
    setSchluesselMeldung(undefined);
    setTestErgebnis(undefined);
    if (formOffen && schluessel.trim() === "") {
      setFeldFehler(t("modelle.schluessel.leer"));
      return;
    }
    setFeldFehler(undefined);
    setTestLaeuft(true);
    const koerper: { providerId?: string; apiKey?: string } = {};
    if (anbieter !== undefined) koerper.providerId = anbieter.id;
    if (formOffen) koerper.apiKey = schluessel;
    const antwort = await apiFetch<{ anzahl: number; regel?: string }>(
      "POST",
      "/api/anbieter/verbindungstest",
      koerper,
    );
    setTestLaeuft(false);
    if (antwort.ok) {
      setTestErgebnis({
        art: "ok",
        titel: t("anbieterwahl.test.ok"),
        text:
          antwort.daten.regel !== undefined
            ? t("modelle.verbindung.ok_regel", { name: antwort.daten.regel })
            : anbieter?.templateKey === "eurouter"
              ? t("modelle.verbindung.ok_ohne_regel")
              : t("modelle.verbindung.ok_anzahl", { anzahl: antwort.daten.anzahl }),
      });
    } else {
      setTestErgebnis({
        art: "fehler",
        titel: t("anbieterwahl.test.fehler"),
        text: [antwort.fehler.text, antwort.fehler.ausweg].filter(Boolean).join(" "),
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
    anbieterUebernehmen(antwort.daten.anbieter);
    formSchliessen();
    setSchluesselMeldung({
      art: "ok",
      text: t("modelle.schluessel.gespeichert", {
        anbieter: anbieterImSatz(antwort.daten.anbieter),
      }),
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
    const weg = anbieter;
    const rest = alle.filter((a) => a.id !== weg.id);
    const modellWeg = modell?.anbieterId === weg.id;
    setAlle(rest);
    setBearbeiten(false);
    if (modellWeg) {
      setModell(undefined);
      setAuswahl(undefined);
    }
    const naechster = gezeigterAnbieter(
      rest,
      undefined,
      modellWeg ? undefined : modell?.anbieterId,
    );
    setGezeigtId(naechster?.id);
    if (naechster === undefined) {
      setListe({ zustand: "aus" });
      setSchluesselMeldung({
        art: "ok",
        text: eigenerAnbieter(weg)
          ? t("modelle.eigen.entfernt", { anbieter: anbieterImSatz(weg) })
          : t("modelle.schluessel.entfernt"),
      });
    } else {
      setSchluesselMeldung({
        art: "ok",
        text: t("modelle.eigen.entfernt", { anbieter: anbieterImSatz(weg) }),
      });
      void listeLaden(naechster);
    }
    router.refresh();
  }

  function eigenGespeichert(neu: Provider, angelegt: boolean) {
    const vorher = anbieter;
    anbieterUebernehmen(neu);
    setBearbeiten(false);
    formSchliessen();
    setModellMeldung(undefined);
    const gespeichert: Meldung = {
      art: "ok",
      text: t("modelle.eigen.gespeichert", { anbieter: anbieterImSatz(neu) }),
    };
    setSchluesselMeldung(gespeichert);
    if (angelegt || vorher?.id !== neu.id) setSuche("");
    void listeLaden(neu);
    router.refresh();
  }

  async function listeAbgleichen() {
    setModellMeldung(undefined);
    const anzahl = await listeLaden(anbieter);
    if (anzahl !== undefined) {
      setModellMeldung({ art: "ok", text: t("modelle.liste.abgeglichen", { anzahl }) });
    }
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
      router.refresh();
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
        {alle.length > 1 && anbieter !== undefined && (
          <Select
            label={t("modelle.eigen.auswahl")}
            name="anbieter"
            value={anbieter.id}
            optionen={alle.map((a) => ({
              wert: a.id,
              text: a.templateKey === "eigener" ? anbieterHerkunft(a) : a.name,
            }))}
            onChange={(e) => anbieterZeigen(e.target.value)}
            hilfe={t("modelle.eigen.auswahl.hilfe")}
          />
        )}
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
          <dt>{t("herkunft.titel")}</dt>
          <dd>
            {anbieter === undefined ? (
              <span className={styles.leise}>{t("herkunft.keiner")}</span>
            ) : anbieter.templateKey === "eigener" ? (
              <>
                <StatusChip art="neutral">{regionText(anbieter.region)}</StatusChip>{" "}
                <span className={styles.leise}>{t("herkunft.eigen.text")}</span>
              </>
            ) : (
              <span className={styles.herkunftAngaben}>
                {anbieter.templateKey === "eurouter" && (
                  <span className={styles.leise}>
                    {t("herkunft.eurouter.text", { anbieter: anbieter.name })}
                  </span>
                )}
                <AnbieterAngaben wahl={anbieter.templateKey} />
                <BedingungenLink wahl={anbieter.templateKey} />
                <KontoLink wahl={anbieter.templateKey} />
              </span>
            )}
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
        {anbieter === undefined && (
          <EmptyState
            titel={t("modelle.anbieter.keiner.titel")}
            text={t("anbieterwahl.keiner.text", { name: botName })}
          />
        )}
        <p className={styles.leise}>{t("modelle.schluessel.verdeckt")}</p>

        {bearbeiten && anbieter !== undefined && (
          <EigenerAnbieterForm
            key={anbieter.id}
            anbieter={anbieter}
            onGespeichert={(neu) => eigenGespeichert(neu, false)}
            onAbbrechen={() => setBearbeiten(false)}
          />
        )}

        {formOffen && !bearbeiten && anbieter !== undefined && (
          <div className={styles.form}>
            <TextField
              label={t("modelle.schluessel.neu", { anbieter: satzName })}
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
              hilfe={t("modelle.schluessel.hilfe", { anbieter: satzName })}
            />
          </div>
        )}

        {!bearbeiten && anbieter !== undefined && (
          <div className={styles.knoepfe}>
            {formOffen ? (
              <>
                <Button art="zweit" onClick={() => void verbindungTesten()} laedt={testLaeuft}>
                  {t("modelle.verbindungstest")}
                </Button>
                <Button art="primaer" onClick={() => void schluesselSpeichern()} laedt={speichert}>
                  {speichert
                    ? t("modelle.schluessel.speichert")
                    : t("modelle.schluessel.speichern")}
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
                {anbieter !== undefined && eigenerAnbieter(anbieter) && (
                  <Button
                    art="leise"
                    icon="stift"
                    onClick={() => {
                      setSchluesselMeldung(undefined);
                      setBearbeiten(true);
                    }}
                  >
                    {t("modelle.eigen.aendern")}
                  </Button>
                )}
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
                    {eigenerAnbieter(anbieter)
                      ? t("modelle.eigen.entfernen")
                      : t("modelle.schluessel.entfernen")}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
        <div role="status" aria-live="polite" className={styles.live}>
          {testLaeuft && <span className={styles.leise}>{t("modelle.verbindung.laeuft")}</span>}
          {testErgebnis && (
            <TestErgebnis art={testErgebnis.art} titel={testErgebnis.titel}>
              {testErgebnis.text}
            </TestErgebnis>
          )}
          <MeldungZeile meldung={schluesselMeldung} />
        </div>
      </Karte>

      {anbieter?.templateKey === "eurouter" ? (
        <RegelnKarte
          key={anbieter.id}
          anbieter={anbieter}
          botName={botName}
          regeln={regeln[anbieter.id] ?? []}
          alte={props.alteEintraege?.[anbieter.id] ?? []}
          {...(modell === undefined ? {} : { modell })}
          onRegeln={(neu) => setRegeln((alt) => ({ ...alt, [anbieter.id]: neu }))}
          onModell={(neu) => {
            setModell(neu);
            router.refresh();
          }}
        />
      ) : (
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
          <p className={styles.leise}>{t("modelle.liste.text", { anbieter: satzName })}</p>

          {liste.zustand === "aus" && (
            <p className={styles.leise}>{t("modelle.liste.ohne_schluessel")}</p>
          )}
          {liste.zustand === "laedt" && (
            <LoadingState text={t("modelle.liste.laedt", { anbieter: satzName })} />
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
              titel={t("modelle.liste.leer", { anbieter: satzName })}
              ausweg={listeLeerAusweg({
                name,
                templateKey: anbieter?.templateKey ?? vorlage.templateKey,
              })}
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
                    {t("modelle.liste.name", { anbieter: satzName })}
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
                            <span className={styles.mono}>{m.slug}</span>
                            {anbieter !== undefined && ` · ${anbieterHerkunft(anbieter)}`}
                          </span>
                        </span>
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
                <Button art="leise" onClick={() => void listeAbgleichen()}>
                  {t("modelle.liste.abgleichen")}
                </Button>
              </div>
            </>
          )}
          <div role="status" aria-live="polite" className={styles.live}>
            <MeldungZeile meldung={modellMeldung} />
          </div>
        </Karte>
      )}

      <AnbieterHinzufuegen
        vorlagen={props.vorlagen ?? { eurouter: vorlage, mistral: vorlage }}
        vorhanden={alle}
        onGespeichert={(neu) => {
          if (neu.templateKey === "eurouter") {
            setRegeln((alt) => ({ ...alt, [neu.id]: alt[neu.id] ?? [] }));
          }
          eigenGespeichert(neu, true);
        }}
      />

      <Dialog
        offen={dialogOffen}
        onSchliessen={() => setDialogOffen(false)}
        titel={
          anbieter !== undefined && eigenerAnbieter(anbieter)
            ? t("modelle.eigen.entfernen.titel", { anbieter: satzName })
            : t("modelle.schluessel.entfernen.titel")
        }
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
        {anbieter !== undefined && eigenerAnbieter(anbieter) ? (
          <>
            <p>{t("modelle.eigen.entfernen.text", { anbieter: satzName })}</p>
            {modell !== undefined && modell.anbieterId === anbieter.id && (
              <p>
                {t("modelle.eigen.entfernen.modell", {
                  name: botName,
                  modell: modell.displayName,
                  anbieter: satzName,
                })}
              </p>
            )}
          </>
        ) : (
          <p>{t("modelle.schluessel.entfernen.text", { anbieter: satzName, name: botName })}</p>
        )}
      </Dialog>
    </SeitenSpalte>
  );
}
