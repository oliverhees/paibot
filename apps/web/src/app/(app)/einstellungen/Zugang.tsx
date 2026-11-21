/**
 * PaiBot – Reiter „Zugang“: Passwort ändern, aktive Sitzungen, alle Sitzungen beenden, abmelden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { Button, Dialog, ErrorState, Icon, LoadingState, StatusChip, TextField } from "@paibot/ui";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api/client";
import { grobesGeraet, passwortPruefliste, zeitpunkt } from "../../../lib/einstellungen/anzeige";
import type { SitzungZeile } from "../../../lib/einstellungen/typen";
import { AbmeldenKnopf } from "./AbmeldenKnopf";
import styles from "./einstellungen.module.css";

export interface ZugangProps {
  zeitzone: string;
  passwortMin: number;
  /** Nach einem Passwortwechsel neu geladen: Erfolg anzeigen. */
  passwortGeaendert: boolean;
}

type Liste =
  | { zustand: "laedt" }
  | { zustand: "fehler"; text: string; ausweg?: string }
  | { zustand: "fertig"; sitzungen: SitzungZeile[] };

function PasswortAendern({ passwortMin, geaendert }: { passwortMin: number; geaendert: boolean }) {
  const [aktuell, setAktuell] = useState("");
  const [neu, setNeu] = useState("");
  const [wiederholt, setWiederholt] = useState("");
  const [fehlerAktuell, setFehlerAktuell] = useState<string | undefined>();
  const [fehlerNeu, setFehlerNeu] = useState<string | undefined>();
  const [fehler, setFehler] = useState<string | undefined>();
  const [sendet, setSendet] = useState(false);
  const liste = passwortPruefliste(neu, wiederholt, passwortMin);

  async function absenden(event: FormEvent) {
    event.preventDefault();
    setFehler(undefined);
    setFehlerAktuell(undefined);
    setFehlerNeu(undefined);
    if (aktuell === "") {
      setFehlerAktuell(t("einstellungen.passwort.leer"));
      document.getElementById("passwort-aktuell")?.focus();
      return;
    }
    if (!liste.fertig) {
      setFehlerNeu(t("einstellungen.passwort.unfertig"));
      document.getElementById("passwort-neu")?.focus();
      return;
    }
    setSendet(true);
    const antwort = await apiFetch<{ geaendert: true }>("POST", "/api/zugang/passwort", {
      currentPassword: aktuell,
      newPassword: neu,
    });
    if (antwort.ok) {
      // Die Sitzung dieses Geräts ist neu: Seite neu laden, damit auch das Prüfzeichen neu ist.
      window.location.assign("/einstellungen?passwort=geaendert");
      return;
    }
    setSendet(false);
    if (antwort.fehler.code === "passwort_falsch") {
      setAktuell("");
      // Das Tor nennt die verletzte Vorbedingung; für die Person zählt: das Passwort stimmt nicht.
      setFehlerAktuell(t("fehler.passwort_falsch"));
      document.getElementById("passwort-aktuell")?.focus();
      return;
    }
    const feld = antwort.fehler.felder?.[0]?.feld;
    const text = antwort.fehler.ausweg
      ? `${antwort.fehler.text} ${antwort.fehler.ausweg}`
      : antwort.fehler.text;
    if (feld === "newPassword") setFehlerNeu(text);
    else setFehler(text);
  }

  return (
    <form className={styles.kachel} onSubmit={(e) => void absenden(e)} noValidate>
      <h2>{t("einstellungen.passwort.aendern")}</h2>
      <p className={styles.leise}>{t("einstellungen.passwort.text")}</p>
      {geaendert && (
        <p className={`${styles.hinweis} ${styles.hinweisOk}`} role="status">
          <Icon name="check" />
          <span>{t("einstellungen.passwort.erfolg")}</span>
        </p>
      )}
      <TextField
        id="passwort-aktuell"
        label={t("einstellungen.passwort.aktuell")}
        type="password"
        name="currentPassword"
        autoComplete="current-password"
        value={aktuell}
        onChange={(e) => setAktuell(e.target.value)}
        fehler={fehlerAktuell}
      />
      <div className={styles.felder}>
        <TextField
          id="passwort-neu"
          label={t("einstellungen.passwort.neu")}
          type="password"
          name="newPassword"
          autoComplete="new-password"
          value={neu}
          onChange={(e) => setNeu(e.target.value)}
          fehler={fehlerNeu}
        />
        <TextField
          label={t("einstellungen.passwort.wiederholen")}
          type="password"
          name="newPasswordRepeat"
          autoComplete="new-password"
          value={wiederholt}
          onChange={(e) => setWiederholt(e.target.value)}
        />
      </div>
      <ul className={styles.pruefliste} aria-live="polite">
        <li data-ok={liste.laenge || undefined}>
          <Icon name={liste.laenge ? "check" : "x"} />
          {t("einrichtung.passwort.laenge", { min: passwortMin })}
        </li>
        <li data-ok={liste.gleich || undefined}>
          <Icon name={liste.gleich ? "check" : "x"} />
          {t("einrichtung.passwort.gleich")}
        </li>
      </ul>
      <p className={styles.hinweis}>
        <Icon name="info" />
        <span>{t("einstellungen.passwort.hinweis")}</span>
      </p>
      {fehler && (
        <p className={styles.fehlerText} role="alert">
          {fehler}
        </p>
      )}
      <div className={styles.knoepfe}>
        <Button art="primaer" type="submit" laedt={sendet}>
          {sendet ? t("einstellungen.passwort.laeuft") : t("einstellungen.passwort.aendern")}
        </Button>
      </div>
    </form>
  );
}

function Sitzungen({ zeitzone }: { zeitzone: string }) {
  const [liste, setListe] = useState<Liste>({ zustand: "laedt" });
  const [frage, setFrage] = useState(false);
  const [beendet, setBeendet] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();

  const laden = useCallback(async () => {
    setListe({ zustand: "laedt" });
    const antwort = await apiFetch<{ sitzungen: SitzungZeile[] }>("GET", "/api/zugang/sitzungen");
    if (antwort.ok) {
      setListe({ zustand: "fertig", sitzungen: antwort.daten.sitzungen });
      return;
    }
    if (antwort.status === 401) {
      window.location.assign("/anmelden");
      return;
    }
    setListe({
      zustand: "fehler",
      text: antwort.fehler.text,
      ...(antwort.fehler.ausweg ? { ausweg: antwort.fehler.ausweg } : {}),
    });
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  async function alleBeenden() {
    setBeendet(true);
    setFehler(undefined);
    const antwort = await apiFetch<{ beendet: number }>("POST", "/api/zugang/alle-abmelden");
    if (antwort.ok || antwort.status === 401) {
      window.location.assign("/anmelden");
      return;
    }
    setBeendet(false);
    setFrage(false);
    setFehler(
      antwort.fehler.ausweg
        ? `${antwort.fehler.text} ${antwort.fehler.ausweg}`
        : antwort.fehler.text,
    );
  }

  return (
    <section className={styles.kachel} aria-labelledby="sitzungen-titel">
      <h2 id="sitzungen-titel">{t("einstellungen.sitzungen")}</h2>
      <p className={styles.leise}>{t("einstellungen.sitzungen.text")}</p>
      {liste.zustand === "laedt" && <LoadingState />}
      {liste.zustand === "fehler" && (
        <ErrorState
          titel={t("einstellungen.sitzungen.fehler")}
          ursache={liste.text}
          ausweg={liste.ausweg ?? t("fehler.intern.ausweg")}
          aktion={<Button onClick={() => void laden()}>{t("allgemein.erneut")}</Button>}
        />
      )}
      {liste.zustand === "fertig" && liste.sitzungen.length === 0 && (
        <p className={styles.leise}>{t("einstellungen.sitzungen.leer")}</p>
      )}
      {liste.zustand === "fertig" && liste.sitzungen.length > 0 && (
        <ul className={styles.sitzungen}>
          {liste.sitzungen.map((s) => (
            <li key={`${s.angelegt}-${s.zuletzt}`} className={styles.sitzung}>
              <span className={styles.sitzungText}>
                <span className={styles.sitzungGeraet}>{grobesGeraet(s.geraet)}</span>
                <span className={styles.sitzungZeit}>
                  {t("einstellungen.sitzung.angemeldet", { zeit: zeitpunkt(s.angelegt, zeitzone) })}
                  {" · "}
                  {t("einstellungen.sitzung.zuletzt", { zeit: zeitpunkt(s.zuletzt, zeitzone) })}
                </span>
              </span>
              {s.aktuell && <StatusChip art="ok">{t("einstellungen.sitzung.diese")}</StatusChip>}
            </li>
          ))}
        </ul>
      )}
      <p className={styles.leise}>{t("einstellungen.sitzungen.alle_hinweis")}</p>
      {fehler && (
        <p className={styles.fehlerText} role="alert">
          {fehler}
        </p>
      )}
      <div className={styles.knoepfe}>
        <Button art="gefahr" onClick={() => setFrage(true)}>
          {t("einstellungen.sitzungen.alle_beenden")}
        </Button>
      </div>
      <Dialog
        offen={frage}
        onSchliessen={() => setFrage(false)}
        titel={`${t("einstellungen.sitzungen.alle_beenden")}?`}
        schliessenLabel={t("einstellungen.schliessen")}
        rueckfrage
        aktionen={
          <>
            <Button onClick={() => setFrage(false)}>{t("allgemein.abbrechen")}</Button>
            <Button art="gefahr" laedt={beendet} onClick={() => void alleBeenden()}>
              {beendet
                ? t("einstellungen.sitzungen.laeuft")
                : t("einstellungen.sitzungen.alle_beenden")}
            </Button>
          </>
        }
      >
        <p className={styles.absatz}>{t("einstellungen.sitzungen.rueckfrage")}</p>
      </Dialog>
    </section>
  );
}

export function Zugang({ zeitzone, passwortMin, passwortGeaendert }: ZugangProps) {
  return (
    <>
      <PasswortAendern passwortMin={passwortMin} geaendert={passwortGeaendert} />
      <Sitzungen zeitzone={zeitzone} />
      <section className={styles.kachel} aria-labelledby="abmelden-titel">
        <h2 id="abmelden-titel">{t("navigation.abmelden")}</h2>
        <p className={styles.leise}>{t("einstellungen.abmelden.text")}</p>
        <div className={styles.knoepfe}>
          <AbmeldenKnopf />
        </div>
      </section>
    </>
  );
}
