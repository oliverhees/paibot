/**
 * PaiBot – Anmelden im Browser: Passwort, „angemeldet bleiben“, Hinweis bei zu vielen Versuchen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

"use client";

import { t } from "@paibot/shared/texte";
import { Avatar, Button, TextField, Wortmarke } from "@paibot/ui";
import { type FormEvent, useState } from "react";
import { apiFetch } from "../../lib/api/client";
import styles from "./anmelden.module.css";

const FELD_ID = "anmelden-passwort";

export function Anmelden() {
  const [passwort, setPasswort] = useState("");
  const [bleiben, setBleiben] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();
  const [sendet, setSendet] = useState(false);

  async function anmelden(event: FormEvent) {
    event.preventDefault();
    if (passwort === "") {
      setFehler(t("anmelden.leer"));
      document.getElementById(FELD_ID)?.focus();
      return;
    }
    setSendet(true);
    setFehler(undefined);
    const antwort = await apiFetch<{ angemeldet: true }>("POST", "/api/zugang/anmelden", {
      password: passwort,
      remember: bleiben,
    });
    if (antwort.ok) {
      window.location.assign("/");
      return;
    }
    setSendet(false);
    setPasswort("");
    setFehler(
      antwort.fehler.code === "zu_viele_versuche" && antwort.wartenSekunden
        ? t("anmelden.warten", { sekunden: antwort.wartenSekunden })
        : antwort.fehler.text,
    );
    document.getElementById(FELD_ID)?.focus();
  }

  return (
    <main className={styles.seite}>
      <form className={styles.karte} onSubmit={(e) => void anmelden(e)} noValidate>
        <div className={styles.oben}>
          <Avatar farbe="limette" groesse={60} zustand={sendet ? "arbeitet" : "schlaeft"} />
          <h1 className={styles.titel}>{t("anmelden.willkommen")}</h1>
          <p className={styles.leise}>{t("anmelden.hinweis")}</p>
        </div>
        <TextField
          id={FELD_ID}
          label={t("anmelden.passwort")}
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder={t("anmelden.platzhalter")}
          value={passwort}
          onChange={(e) => setPasswort(e.target.value)}
          fehler={fehler}
          autoFocus
        />
        <label className={styles.bleiben}>
          <input type="checkbox" checked={bleiben} onChange={(e) => setBleiben(e.target.checked)} />
          <span>{t("anmelden.bleiben")}</span>
        </label>
        <Button art="primaer" type="submit" breit groesse="gross" laedt={sendet}>
          {sendet ? t("anmelden.laeuft") : t("anmelden.knopf")}
        </Button>
        <p className={styles.leise}>{t("anmelden.vergessen")}</p>
        <div className={styles.marke}>
          <Wortmarke />
        </div>
      </form>
    </main>
  );
}
