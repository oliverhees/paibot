/**
 * PaiBot – „Team aus Vorlage“ in der App: Vorlage öffnen, Vorschau lesen und ändern, mit einem
 * Klick anlegen, als Ganzes zurücknehmen. Jede Änderung geht über die Routen des Tors und bekommt
 * dort einen Beleg; die Seite selbst schreibt nichts.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

"use client";

import { t } from "@paibot/shared/texte";
import { Button, type EntwurfAuswahlBot, EntwurfVorschau } from "@paibot/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "../../../lib/api/client";
import type { EntwurfSeiteDaten, EntwurfSeiteEintrag } from "../../../lib/team/entwurf/seite";
import {
  entwurfDerSeite,
  geprueftMitAbdruck,
  inhaltMitAuswahl,
} from "../../../lib/team/entwurf/vorschau";
import { TEAM_PFADE } from "../../../lib/teams/pfade";
import styles from "./entwurf.module.css";

function fehlerText(fehler: { text: string; ausweg?: string }): string {
  return fehler.ausweg ? `${fehler.text} ${fehler.ausweg}` : fehler.text;
}

export function TeamEntwurfSeite({ daten }: { daten: EntwurfSeiteDaten }) {
  const router = useRouter();
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();
  // Die Kennung des geschlossenen Entwurfs, den „Entwurf wieder öffnen“ beiseitegeschoben hat.
  const [uebersprungen, setUebersprungen] = useState<string | undefined>();
  // Ohne offenen Entwurf steht der letzte da, damit „Rückgängig“ erreichbar bleibt. „Entwurf wieder
  // öffnen“ zeigt stattdessen die Vorlagen: Ein verworfener Entwurf lässt sich nicht aufwecken, ein
  // neuer entsteht aus derselben Vorlage.
  const letzter = entwurfDerSeite(daten.entwuerfe, uebersprungen);

  async function rufe(methode: "POST" | "DELETE", pfad: string, koerper?: unknown) {
    if (sendet) return;
    setSendet(true);
    setFehler(undefined);
    const antwort = await apiFetch<unknown>(methode, pfad, koerper);
    setSendet(false);
    if (!antwort.ok) {
      setFehler(fehlerText(antwort.fehler));
      return;
    }
    router.refresh();
  }

  /**
   * „Team anlegen“: Die Vorschau prüft ihren Inhalt, rechnet den Abdruck und schickt beides mit.
   * Der Server rechnet den Abdruck über denselben Inhalt nach; stimmen die beiden nicht, legt er
   * nichts an. So bindet die Bestätigung genau das, was auf dem Schirm stand.
   */
  async function anlegen(eintrag: EntwurfSeiteEintrag, bots: readonly EntwurfAuswahlBot[]) {
    const ergebnis = await geprueftMitAbdruck(inhaltMitAuswahl(eintrag.inhalt, bots));
    if (!ergebnis.ok) {
      setFehler(t("teams.entwurf.inhalt_ungueltig", { stelle: ergebnis.stelle }));
      return;
    }
    await rufe("POST", TEAM_PFADE.teamEntwurfAnlegen(eintrag.id), {
      seenDigest: ergebnis.abdruck,
      content: ergebnis.inhalt,
    });
  }

  return (
    <div className={styles.seite}>
      {/* Titel und Vorspann stehen bei der Vorlagen-Liste. Die Vorschau bringt ihre eigene
          Hauptüberschrift mit („Entwurf: Team …“); stünden beide da, hätte die Seite zwei davon,
          und der Vorspann erklärte etwas, das schon offen auf dem Schirm liegt. */}
      {letzter === undefined ? (
        <section aria-labelledby="vorlagen" data-baustein="vorlagen">
          <h1 className={styles.titel}>{t("teams.entwurf.seite_titel")}</h1>
          <p className={styles.vorspann}>{t("teams.entwurf.seite_vorspann")}</p>
          <h2 id="vorlagen" className={styles.abschnitt}>
            {t("teams.entwurf.vorlagen")}
          </h2>
          {fehler !== undefined && (
            <p className={styles.fehler} role="alert">
              {fehler}
            </p>
          )}
          {daten.vorlagen.length === 0 ? (
            <p className={styles.leise}>{t("teams.entwurf.keine_vorlagen")}</p>
          ) : (
            <ul className={styles.liste}>
              {daten.vorlagen.map((v) => (
                <li key={v.kennung} className={styles.karte} data-baustein="vorlage">
                  <div>
                    <b>{v.titel}</b>
                    <p className={styles.leise}>
                      {v.beschreibung ??
                        t("teams.entwurf.vorlage_bots", { anzahl: v.vorlage.bots.length })}
                    </p>
                  </div>
                  <Button
                    art="primaer"
                    laedt={sendet}
                    onClick={() =>
                      rufe("POST", TEAM_PFADE.teamEntwuerfe(), { template: v.kennung })
                    }
                  >
                    {t("teams.entwurf.vorlage_oeffnen")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <EntwurfVorschau
          vorlage={letzter.vorlage}
          status={letzter.stand}
          notAus={daten.notAus}
          sendet={sendet}
          {...(fehler === undefined ? {} : { fehler })}
          onAnlegen={(bots) => void anlegen(letzter, bots)}
          onVerwerfen={() => rufe("DELETE", TEAM_PFADE.teamEntwurf(letzter.id))}
          onRueckgaengig={() =>
            rufe("POST", TEAM_PFADE.teamEntwurfZuruecknehmen(letzter.id), undefined)
          }
          onWiederOeffnen={() => setUebersprungen(letzter.id)}
        />
      )}
    </div>
  );
}
