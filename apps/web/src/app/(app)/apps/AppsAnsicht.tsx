/**
 * PaiBot – Ansicht der Seite „Apps“: Liste der verbundenen Apps, Verbinden, Werkzeuge einstufen,
 * Zugriff je Bot, Trennen. Alles läuft über die Routen unter `/api/apps`; der Token bleibt nur im
 * Feld, bis er abgeschickt ist, und steht danach nirgends mehr (nicht im Zustand, nicht in einer
 * Meldung, nicht in der Seite).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

"use client";

import type { ApiErrorDetail } from "@paibot/shared/api";
import { t } from "@paibot/shared/texte";
import {
  type AppFehlerArt,
  AppZeile,
  type AppZustand,
  Button,
  Dialog,
  EmptyState,
  FremderText,
  Icon,
  NotAusHinweis,
  SeitenSpalte,
  type VerbindungDaten,
  VerbindungForm,
  type WerkzeugArt,
  WerkzeugListe,
  ZugriffUmschalter,
} from "@paibot/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type ApiErgebnis, apiFetch } from "../../../lib/api/client";
import { appFehlerArt, werkzeugEintrag, zugriffZaehler } from "../../../lib/apps/ansicht";
import { APP_PFADE } from "../../../lib/apps/pfade";
import type { AppSeitenEintrag } from "../../../lib/apps/seite";
import styles from "./apps.module.css";

export interface AppsAnsichtEintrag extends AppSeitenEintrag {
  /** Zeit der Trennung schon in Worten (Zeitzone der Installation). */
  getrenntText?: string | undefined;
}

export interface AppsAnsichtProps {
  apps: readonly AppsAnsichtEintrag[];
  notAus: boolean;
}

/** Einstufung der Oberfläche → Klasse der Route. */
const KLASSE: Record<WerkzeugArt, "lesen" | "schreiben" | "gesperrt"> = {
  liest: "lesen",
  schreibt: "schreiben",
  gesperrt: "gesperrt",
};

interface Meldung {
  art: "ok" | "fehler";
  text: string;
  ausweg?: string;
  /** Die Liste der Werkzeuge, die PaiBot nicht prüfen kann (fremde Namen). */
  nichtPruefbar?: readonly string[];
  hinweis?: string;
}

/** Fehler der Route als Meldung: der feste Satz der Route mit Ausweg, nie ein Text der App. */
function fehlerMeldung(r: Extract<ApiErgebnis<unknown>, { ok: false }>): Meldung {
  const fehler: ApiErrorDetail = r.fehler;
  const warten =
    r.wartenSekunden === undefined
      ? ""
      : ` ${t("apps.seite.aktion.warten", { sekunden: String(r.wartenSekunden) })}`;
  return {
    art: "fehler",
    text: fehler.text,
    ...(fehler.ausweg === undefined ? {} : { ausweg: `${fehler.ausweg}${warten}` }),
  };
}

/** Schlüssel für gleiche Namen: der Name mit seiner Nummer unter den gleichen. */
function eindeutigeSchluessel(namen: readonly string[]): [string, string][] {
  const gezaehlt = new Map<string, number>();
  return namen.map((name) => {
    const nr = (gezaehlt.get(name) ?? 0) + 1;
    gezaehlt.set(name, nr);
    return [`${name}#${nr}`, name];
  });
}

function MeldungsZeile({ meldung }: { meldung: Meldung }) {
  return (
    <div
      className={meldung.art === "fehler" ? styles.meldungFehler : styles.meldung}
      role={meldung.art === "fehler" ? "alert" : "status"}
    >
      <p className={styles.leise}>
        {meldung.text}
        {meldung.ausweg !== undefined && ` ${meldung.ausweg}`}
      </p>
      {meldung.hinweis !== undefined && <p className={styles.leise}>{meldung.hinweis}</p>}
      {meldung.nichtPruefbar !== undefined && meldung.nichtPruefbar.length > 0 && (
        <>
          <p className={styles.leise}>{t("apps.seite.nicht_pruefbar")}</p>
          <ul className={styles.nichtPruefbar}>
            {eindeutigeSchluessel(meldung.nichtPruefbar).map(([schluessel, name]) => (
              // Der Name stammt von der App: nur als Text.
              <li key={schluessel}>
                <FremderText text={name} art="name" />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function AppsAnsicht({ apps, notAus }: AppsAnsichtProps) {
  const router = useRouter();
  const [, uebergang] = useTransition();
  const [formOffen, setFormOffen] = useState(false);
  const [verbindet, setVerbindet] = useState(false);
  const [formFehler, setFormFehler] = useState<
    { art: AppFehlerArt; grund?: string } | { art?: undefined; meldung: Meldung } | undefined
  >();
  const [seitenMeldung, setSeitenMeldung] = useState<Meldung>();
  const [offen, setOffen] = useState<ReadonlySet<string>>(new Set());
  const [laeuft, setLaeuft] = useState<string>();
  const [meldungen, setMeldungen] = useState<Readonly<Record<string, Meldung>>>({});
  const [testFehler, setTestFehler] = useState<Readonly<Record<string, AppFehlerArt>>>({});
  const [trennen, setTrennen] = useState<AppsAnsichtEintrag>();

  const verbundene = apps.filter((a) => a.zustand === "verbunden");
  const getrennte = apps.filter((a) => a.zustand !== "verbunden");

  const meldeFuer = (id: string, meldung: Meldung | undefined) =>
    setMeldungen((alt) => {
      const neu = { ...alt };
      if (meldung === undefined) delete neu[id];
      else neu[id] = meldung;
      return neu;
    });

  const neuLaden = () => uebergang(() => router.refresh());

  const oeffnen = (id: string) =>
    setOffen((alt) => {
      const neu = new Set(alt);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });

  async function appVerbinden(daten: VerbindungDaten) {
    setVerbindet(true);
    setFormFehler(undefined);
    setSeitenMeldung(undefined);
    // Der Token geht nur in diese Anfrage; er wird nirgends gemerkt.
    const r = await apiFetch<{
      app: { id: string };
      werkzeuge: unknown[];
      nichtPruefbar: { name: string }[];
    }>("POST", APP_PFADE.verbinden(), {
      url: daten.adresse,
      ...(daten.token === "" ? {} : { token: daten.token }),
    });
    setVerbindet(false);
    if (!r.ok) {
      const art = appFehlerArt(r.fehler.code);
      setFormFehler(
        art === undefined
          ? { meldung: fehlerMeldung(r) }
          : { art, ...(art === "adresse_unzulaessig" ? { grund: r.fehler.text } : {}) },
      );
      return;
    }
    const anzahl = r.daten.werkzeuge.length;
    setFormOffen(false);
    setOffen((alt) => new Set(alt).add(r.daten.app.id));
    setSeitenMeldung({
      art: "ok",
      text:
        anzahl === 1
          ? t("apps.seite.verbunden.eins")
          : t("apps.seite.verbunden.mehr", { anzahl: String(anzahl) }),
      hinweis: t("apps.seite.verbunden.hinweis"),
      nichtPruefbar: r.daten.nichtPruefbar.map((n) => n.name),
    });
    neuLaden();
  }

  async function erneutTesten(app: AppsAnsichtEintrag) {
    setLaeuft(`${app.id}:testen`);
    meldeFuer(app.id, undefined);
    const r = await apiFetch<{ nichtPruefbar: { name: string }[] }>(
      "POST",
      APP_PFADE.werkzeuge(app.id),
    );
    setLaeuft(undefined);
    if (!r.ok) {
      const art = appFehlerArt(r.fehler.code);
      if (art !== undefined) {
        setTestFehler((alt) => ({ ...alt, [app.id]: art }));
      } else {
        meldeFuer(app.id, fehlerMeldung(r));
      }
      return;
    }
    setTestFehler((alt) => {
      const neu = { ...alt };
      delete neu[app.id];
      return neu;
    });
    meldeFuer(app.id, {
      art: "ok",
      text: t("apps.seite.erneut.fertig"),
      nichtPruefbar: r.daten.nichtPruefbar.map((n) => n.name),
    });
    neuLaden();
  }

  async function einstufen(
    app: AppsAnsichtEintrag,
    werkzeug: string,
    art: WerkzeugArt,
    fassung: string | undefined,
  ) {
    if (fassung === undefined) return;
    setLaeuft(`${app.id}:${werkzeug}`);
    meldeFuer(app.id, undefined);
    const r = await apiFetch("PUT", APP_PFADE.werkzeugEinstufen(app.id, werkzeug), {
      klasse: KLASSE[art],
      gesehenerAbdruck: fassung,
    });
    setLaeuft(undefined);
    if (!r.ok) {
      meldeFuer(app.id, fehlerMeldung(r));
      return;
    }
    neuLaden();
  }

  async function zugriffSetzen(app: AppsAnsichtEintrag, botId: string, wert: "keiner" | "lesen") {
    setLaeuft(`${app.id}:zugriff:${botId}`);
    meldeFuer(app.id, undefined);
    const r = await apiFetch("PUT", APP_PFADE.zugriff(app.id, botId), { zugriff: wert });
    setLaeuft(undefined);
    if (!r.ok) {
      meldeFuer(app.id, fehlerMeldung(r));
      return;
    }
    neuLaden();
  }

  async function appTrennen(app: AppsAnsichtEintrag) {
    setLaeuft(`${app.id}:trennen`);
    const r = await apiFetch("DELETE", APP_PFADE.trennen(app.id));
    setLaeuft(undefined);
    setTrennen(undefined);
    if (!r.ok) {
      meldeFuer(app.id, fehlerMeldung(r));
      return;
    }
    neuLaden();
  }

  const formular = (
    <>
      <VerbindungForm
        laeuft={verbindet}
        {...(formFehler?.art === undefined ? {} : { fehlerArt: formFehler.art })}
        onVerbinden={(daten) => {
          void appVerbinden(daten);
        }}
        onAbbrechen={() => {
          setFormOffen(false);
          setFormFehler(undefined);
        }}
        ebene={2}
      />
      {formFehler?.art === "adresse_unzulaessig" && formFehler.grund !== undefined && (
        <p className={styles.meldungFehler} role="alert">
          {formFehler.grund}
        </p>
      )}
      {formFehler !== undefined && formFehler.art === undefined && (
        <MeldungsZeile meldung={formFehler.meldung} />
      )}
    </>
  );

  return (
    <SeitenSpalte titel={t("seite.apps")} einleitung={t("apps.seite.einleitung")}>
      <div className={styles.innen}>
        {notAus && <NotAusHinweis />}
        {seitenMeldung !== undefined && <MeldungsZeile meldung={seitenMeldung} />}

        {verbundene.length === 0 && !formOffen ? (
          <EmptyState
            titel={t("apps.leer.titel")}
            text={t("apps.leer.text")}
            aktion={
              <Button art="primaer" onClick={() => setFormOffen(true)}>
                {t("apps.leer.aktion")}
              </Button>
            }
          />
        ) : (
          <>
            {verbundene.length > 0 && !formOffen && (
              <div className={styles.kopfzeile}>
                <Button art="primaer" onClick={() => setFormOffen(true)}>
                  <Icon name="plus" groesse={14} /> {t("apps.seite.verbinden")}
                </Button>
              </div>
            )}
            {formOffen && formular}
            <ul className={styles.liste} aria-label={t("apps.liste.label")}>
              {verbundene.map((app) => {
                const eintraege = app.werkzeuge.map(werkzeugEintrag);
                const zustand: AppZustand =
                  laeuft === `${app.id}:testen`
                    ? "verbindet"
                    : testFehler[app.id] !== undefined
                      ? "fehler"
                      : notAus
                        ? "notaus"
                        : "verbunden";
                const lesend = app.werkzeuge.filter(
                  (w) => w.stand === "bestaetigt" && w.klasse === "lesen",
                ).length;
                const fehlerArt = testFehler[app.id];
                const meldung = meldungen[app.id];
                return (
                  <li key={app.id}>
                    <AppZeile
                      name={app.name}
                      adresse={app.adresse}
                      zustand={zustand}
                      {...(fehlerArt === undefined ? {} : { fehlerArt })}
                      tokenGesetzt={app.tokenGesetzt}
                      werkzeuge={{
                        gesamt: app.werkzeuge.length,
                        lesend,
                        offen: app.werkzeuge.filter((w) => w.stand === "neu").length,
                        geaendert: app.werkzeuge.filter((w) => w.stand === "geaendert").length,
                      }}
                      botsMitZugriff={zugriffZaehler(app.zugriff)}
                      ebene={2}
                      geoeffnet={offen.has(app.id)}
                      onOeffnen={() => oeffnen(app.id)}
                      onErneutTesten={() => {
                        void erneutTesten(app);
                      }}
                      onTrennen={() => setTrennen(app)}
                    >
                      {offen.has(app.id) && (
                        <div className={styles.innen}>
                          {meldung !== undefined && <MeldungsZeile meldung={meldung} />}
                          <WerkzeugListe
                            werkzeuge={eintraege}
                            {...(laeuft?.startsWith(`${app.id}:tool_`)
                              ? { speichertId: laeuft.slice(app.id.length + 1) }
                              : {})}
                            onEinstufen={(id, art, fassung) => {
                              void einstufen(app, id, art, fassung);
                            }}
                            ebene={3}
                          />
                          <section className={styles.zugriffe}>
                            <h3 className={styles.zugriffTitel}>{t("apps.seite.zugriff.titel")}</h3>
                            {app.zugriff.length === 0 && (
                              <p className={styles.leise}>{t("apps.seite.zugriff.keine")}</p>
                            )}
                            {app.zugriff.map((z) => (
                              <ZugriffUmschalter
                                key={z.botId}
                                bot={{ name: z.name }}
                                app={app.name}
                                wert={z.zugriff}
                                lesendeWerkzeuge={lesend}
                                speichert={laeuft === `${app.id}:zugriff:${z.botId}`}
                                onAendern={(wert) => {
                                  void zugriffSetzen(app, z.botId, wert);
                                }}
                              />
                            ))}
                          </section>
                        </div>
                      )}
                    </AppZeile>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {getrennte.length > 0 && (
          <section aria-labelledby="getrennte-apps">
            <h2 id="getrennte-apps" className={styles.zugriffTitel}>
              {t("apps.seite.getrennt.titel")}
            </h2>
            <p className={styles.leise}>{t("apps.seite.getrennt.text")}</p>
            <ul className={styles.getrennt}>
              {getrennte.map((app) => (
                <li key={app.id} className={styles.getrenntZeile}>
                  <FremderText text={app.name} art="name" />
                  {app.getrenntText !== undefined && (
                    <span className={styles.leise}>
                      {t("apps.seite.getrennt.am", { datum: app.getrenntText })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <Dialog
        offen={trennen !== undefined}
        onSchliessen={() => setTrennen(undefined)}
        titel={t("apps.seite.trennen.titel")}
        schliessenLabel={t("apps.seite.schliessen")}
        rueckfrage
        aktionen={
          <>
            <Button art="leise" onClick={() => setTrennen(undefined)}>
              {t("apps.seite.trennen.abbrechen")}
            </Button>
            <Button
              art="gefahr"
              laedt={trennen !== undefined && laeuft === `${trennen.id}:trennen`}
              onClick={() => {
                if (trennen !== undefined) void appTrennen(trennen);
              }}
            >
              {t("apps.seite.trennen.bestaetigen")}
            </Button>
          </>
        }
      >
        <p>{t("apps.seite.trennen.text")}</p>
      </Dialog>
    </SeitenSpalte>
  );
}
