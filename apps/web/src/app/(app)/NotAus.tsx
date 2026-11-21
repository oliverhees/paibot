/**
 * PaiBot – Not-Aus in der Oberfläche: Schalter in der Seitenleiste, Leiste „angehalten“ auf jeder
 * Seite, Rückfrage beim Anhalten und Passwort-Abfrage beim Fortsetzen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { Button, Dialog, Icon, TextField } from "@paibot/ui";
import { type FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api/client";
import type { NotAusGeschaltet } from "../../lib/notaus/notaus";
import styles from "./notaus.module.css";

/** Schalter oben in der Seitenleiste; zeigt den Zustand und öffnet die Rückfrage. */
export function NotAusKnopf({ an, onClick }: { an: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles.knopf}
      aria-pressed={an}
      aria-label={an ? t("notaus.knopf.name_an") : t("notaus.knopf.name_aus")}
      onClick={onClick}
      data-notaus-knopf=""
    >
      <span className={styles.lampe} aria-hidden="true" />
      <span className={styles.text} aria-hidden="true">
        <strong>{an ? t("notaus.knopf.angehalten") : t("notaus.knopf.laufen")}</strong>
        <small>{an ? t("notaus.knopf.angehalten_zusatz") : t("notaus.knopf.laufen_zusatz")}</small>
      </span>
      <span className={styles.mini} aria-hidden="true">
        {an ? t("notaus.knopf.fortsetzen") : t("notaus.knopf.anhalten")}
      </span>
    </button>
  );
}

/** Leiste über der Kopfzeile, solange der Not-Aus an ist. */
export function NotAusLeiste({ onFortsetzen }: { onFortsetzen: () => void }) {
  return (
    <div className={styles.leiste} role="status" data-notaus-leiste="">
      <Icon name="warnung" />
      <p className={styles.leisteText}>
        <strong>{t("notaus.leiste.titel")}</strong> <span>{t("notaus.leiste.text")}</span>
      </p>
      <Button art="zweit" onClick={onFortsetzen}>
        {t("notaus.knopf.fortsetzen")}
      </Button>
    </div>
  );
}

export type NotAusFrage = "an" | "aus";

/**
 * Rückfrage zum Umschalten. „an“: Bestätigen hält alle Bots an. „aus“: verlangt das aktuelle
 * Passwort. Nach Erfolg meldet `onGeschaltet` den neuen Zustand.
 */
export function NotAusDialog({
  frage,
  onSchliessen,
  onGeschaltet,
}: {
  frage: NotAusFrage | undefined;
  onSchliessen: () => void;
  onGeschaltet: (an: boolean) => void;
}) {
  const [passwort, setPasswort] = useState("");
  const [fehlerPasswort, setFehlerPasswort] = useState<string | undefined>();
  const [fehler, setFehler] = useState<string | undefined>();
  const [sendet, setSendet] = useState(false);

  useEffect(() => {
    if (frage === undefined) return;
    setPasswort("");
    setFehler(undefined);
    setFehlerPasswort(undefined);
    setSendet(false);
  }, [frage]);

  async function absenden(event?: FormEvent) {
    event?.preventDefault();
    if (frage === undefined || sendet) return;
    setFehler(undefined);
    setFehlerPasswort(undefined);
    if (frage === "aus" && passwort === "") {
      setFehlerPasswort(t("notaus.dialog.aus.leer"));
      document.getElementById("notaus-passwort")?.focus();
      return;
    }
    setSendet(true);
    const antwort = await apiFetch<NotAusGeschaltet>(
      "PUT",
      "/api/notaus",
      frage === "an" ? { on: true } : { on: false, currentPassword: passwort },
    );
    setSendet(false);
    if (antwort.ok) {
      onGeschaltet(antwort.daten.an);
      return;
    }
    if (antwort.status === 401 && antwort.fehler.code === "nicht_angemeldet") {
      window.location.assign("/anmelden");
      return;
    }
    if (antwort.fehler.code === "passwort_falsch") {
      setPasswort("");
      setFehlerPasswort(t("fehler.passwort_falsch"));
      document.getElementById("notaus-passwort")?.focus();
      return;
    }
    setFehler(
      antwort.fehler.ausweg
        ? `${antwort.fehler.text} ${antwort.fehler.ausweg}`
        : antwort.fehler.text,
    );
  }

  const an = frage === "an";
  return (
    <Dialog
      offen={frage !== undefined}
      onSchliessen={onSchliessen}
      titel={an ? t("notaus.dialog.an.titel") : t("notaus.dialog.aus.titel")}
      schliessenLabel={t("notaus.dialog.schliessen")}
      rueckfrage
      aktionen={
        <>
          <Button art="zweit" onClick={onSchliessen}>
            {t("notaus.dialog.abbrechen")}
          </Button>
          <Button art={an ? "gefahr" : "primaer"} type="submit" form="notaus-form" laedt={sendet}>
            {sendet
              ? t("notaus.laeuft")
              : an
                ? t("notaus.dialog.an.ja")
                : t("notaus.dialog.aus.ja")}
          </Button>
        </>
      }
    >
      <form
        id="notaus-form"
        className={styles.formular}
        onSubmit={(e) => void absenden(e)}
        noValidate
      >
        <p>{an ? t("notaus.dialog.an.text") : t("notaus.dialog.aus.text")}</p>
        {an ? (
          <p className={styles.leise}>{t("notaus.dialog.an.hinweis")}</p>
        ) : (
          <TextField
            id="notaus-passwort"
            label={t("notaus.dialog.aus.passwort")}
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            value={passwort}
            onChange={(e) => setPasswort(e.target.value)}
            fehler={fehlerPasswort}
            autoFocus
          />
        )}
        {fehler && (
          <p className={styles.fehler} role="alert">
            {fehler}
          </p>
        )}
      </form>
    </Dialog>
  );
}
