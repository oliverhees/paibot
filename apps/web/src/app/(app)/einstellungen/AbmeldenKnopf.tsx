/**
 * PaiBot – Knopf „Abmelden“ für Einstellungen und Info: beendet nur die Sitzung dieses Geräts.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { Button } from "@paibot/ui";
import { useState } from "react";
import { apiFetch } from "../../../lib/api/client";
import styles from "./einstellungen.module.css";

export function AbmeldenKnopf() {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();

  async function abmelden() {
    setLaeuft(true);
    setFehler(undefined);
    const antwort = await apiFetch("POST", "/api/zugang/abmelden");
    // Auch wenn die Sitzung schon abgelaufen war: danach zur Anmeldung.
    if (antwort.ok || antwort.status === 401) {
      window.location.assign("/anmelden");
      return;
    }
    setLaeuft(false);
    setFehler(antwort.fehler.text);
  }

  return (
    <>
      <Button icon="abmelden" laedt={laeuft} onClick={() => void abmelden()}>
        {laeuft ? t("navigation.abmelden.laeuft") : t("navigation.abmelden")}
      </Button>
      {fehler && (
        <p className={styles.fehlerText} role="alert">
          {fehler}
        </p>
      )}
    </>
  );
}
