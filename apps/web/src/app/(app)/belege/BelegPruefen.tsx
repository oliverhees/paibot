/**
 * PaiBot – Baustein „Beleg prüfen“: Knopf und Ergebnis. Prüft im Browser (Web Crypto) mit dem
 * Prüfer aus `@paibot/receipts/pruefen`; nur wenn der Browser das nicht kann, prüft der Server –
 * dann steht es dabei. Auch für andere Seiten (z. B. den Chat) gedacht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { Button, type ButtonArt, PruefUrteil } from "@paibot/ui";
import { useState } from "react";
import {
  LadeFehler,
  ladeRegeln,
  ladeSchluessel,
  ladeServerEinzel,
  ladeUmfeld,
} from "../../../lib/belege/laden";
import { kannImBrowserPruefen, prueferLaden } from "../../../lib/belege/pruefer-laden";
import { type EinzelErgebnis, pruefeEinzeln, urteilZustand } from "../../../lib/belege/pruefung";
import styles from "./belege.module.css";

export interface BelegPruefenProps {
  /** Kennung des Belegs (`blg_…`). */
  belegId: string;
  /** Art des Knopfs; Standard `primaer` (auf der Beleg-Seite der wichtigste Knopf). */
  art?: ButtonArt;
  /** Wird nach jeder Prüfung mit dem Ergebnis aufgerufen. */
  onErgebnis?: (ergebnis: EinzelErgebnis) => void;
}

type Zustand =
  | { art: "bereit" }
  | { art: "laeuft" }
  | { art: "fertig"; ergebnis: EinzelErgebnis }
  | { art: "fehler"; text: string; ausweg?: string };

/** Prüft einen Beleg; Ablauf und Wortlaut wie auf der Beleg-Seite. */
export async function belegPruefenImBrowserOderServer(belegId: string): Promise<EinzelErgebnis> {
  if (!(await kannImBrowserPruefen())) return ladeServerEinzel(belegId);
  const [{ pruefer }, umfeld, schluessel, regeln] = await Promise.all([
    prueferLaden(),
    ladeUmfeld(belegId),
    ladeSchluessel(),
    ladeRegeln(),
  ]);
  return pruefeEinzeln(
    {
      beleg: umfeld.beleg,
      ...(umfeld.vorgaenger === undefined ? {} : { vorgaenger: umfeld.vorgaenger }),
      ...(umfeld.nachfolger === undefined ? {} : { nachfolger: umfeld.nachfolger }),
      schluesselBelege: schluessel.belege,
      regeln,
    },
    pruefer,
    "browser",
  );
}

export function BelegPruefen({ belegId, art = "primaer", onErgebnis }: BelegPruefenProps) {
  const [zustand, setZustand] = useState<Zustand>({ art: "bereit" });

  async function pruefen() {
    setZustand({ art: "laeuft" });
    try {
      const ergebnis = await belegPruefenImBrowserOderServer(belegId);
      setZustand({ art: "fertig", ergebnis });
      onErgebnis?.(ergebnis);
    } catch (fehler) {
      setZustand(
        fehler instanceof LadeFehler
          ? {
              art: "fehler",
              text: fehler.message,
              ...(fehler.ausweg ? { ausweg: fehler.ausweg } : {}),
            }
          : { art: "fehler", text: t("fehler.intern"), ausweg: t("fehler.intern.ausweg") },
      );
    }
  }

  return (
    <div className={styles.pruefen}>
      {zustand.art === "laeuft" && <PruefUrteil zustand="laeuft" titel={t("pruefung.laeuft")} />}
      {zustand.art === "fertig" && (
        <PruefUrteil
          zustand={urteilZustand(zustand.ergebnis.stufe)}
          titel={zustand.ergebnis.titel}
          punkte={zustand.ergebnis.punkte}
          {...(zustand.ergebnis.quelle === "server" ? { quelle: t("pruefung.server") } : {})}
        />
      )}
      {zustand.art === "fehler" && (
        <PruefUrteil
          zustand="ungueltig"
          titel={t("belege.pruefen.fehler", { text: zustand.text })}
          punkte={zustand.ausweg ? [{ art: "hinweis", text: zustand.ausweg }] : []}
        />
      )}
      <Button art={art} laedt={zustand.art === "laeuft"} onClick={() => void pruefen()}>
        {zustand.art === "fertig" ? t("belege.pruefen.erneut") : t("belege.pruefen")}
      </Button>
    </div>
  );
}
