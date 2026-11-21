/**
 * PaiBot – Beleg-Karte im Browser: lesbare Zeilen, „Beleg prüfen“ und die aufklappbare technische
 * Ansicht (kanonisches JSON, Prüfsumme, Signatur, Schlüssel, Vorgänger) zum Kopieren.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { BelegKarte, type BelegSiegel, Button, Icon, ScrollBereich, StatusChip } from "@paibot/ui";
import Link from "next/link";
import { useState } from "react";
import type { BelegKarteDaten, KartenTeil } from "../../../../lib/belege/karte";
import type { EinzelErgebnis } from "../../../../lib/belege/pruefung";
import { BelegPruefen } from "../BelegPruefen";
import styles from "../belege.module.css";

const SIEGEL: Record<EinzelErgebnis["stufe"], BelegSiegel> = {
  gueltig: "ok",
  gebrochen: "warn",
  ungueltig: "fehler",
};
const CHIP = { gueltig: "ok", gebrochen: "warn", ungueltig: "fehler" } as const;

function Teil({ teil }: { teil: KartenTeil }) {
  const klassen = [teil.mono ? styles.mono : "", teil.leise ? styles.leise : ""].join(" ").trim();
  if (teil.href !== undefined) {
    return (
      <Link href={teil.href} prefetch={false} className={`${styles.link} ${klassen}`}>
        {teil.text}
      </Link>
    );
  }
  return <span className={klassen || undefined}>{teil.text}</span>;
}

function Kopieren({ text, label }: { text: string; label: string }) {
  const [meldung, setMeldung] = useState<string | undefined>();
  async function kopieren() {
    try {
      await navigator.clipboard.writeText(text);
      setMeldung(t("belege.anker.kopiert"));
    } catch {
      setMeldung(t("belege.anker.kopieren_fehler"));
    }
  }
  return (
    <span className={styles.reihe}>
      <Button art="leise" icon="kopieren" onClick={() => void kopieren()} aria-label={label}>
        {t("belege.technik.kopieren")}
      </Button>
      <span className={styles.leise} role="status" aria-live="polite">
        {meldung}
      </span>
    </span>
  );
}

export function BelegDetail({ karte }: { karte: BelegKarteDaten }) {
  const [stufe, setStufe] = useState<EinzelErgebnis["stufe"] | undefined>();
  return (
    <ScrollBereich
      className={styles.seite}
      label={t("belege.detail.titel", { kennung: karte.kennung })}
    >
      <div className={styles.spalte}>
        <header className={styles.kopf}>
          <Link
            href="/belege"
            prefetch={false}
            className={styles.zurueck}
            aria-label={t("belege.detail.zurueck")}
          >
            <Icon name="runter" groesse={16} className={styles.pfeilLinks} />
          </Link>
          <h1>{t("belege.detail.titel", { kennung: karte.kennung })}</h1>
        </header>
        <div className={styles.raster}>
          <div className={styles.haupt}>
            <BelegKarte
              etikett={`${t("belege.detail.etikett", { kennung: karte.kennung })} · ${karte.artText}`}
              titel={karte.titel}
              label={t("belege.detail.titel", { kennung: karte.kennung })}
              siegel={stufe === undefined ? "offen" : SIEGEL[stufe]}
              status={
                stufe === undefined ? (
                  <StatusChip art="neutral">{t("pruefung.offen")}</StatusChip>
                ) : (
                  <StatusChip art={CHIP[stufe]}>{t(`belege.stand.${stufe}`)}</StatusChip>
                )
              }
              zeilen={karte.zeilen.map((zeile) => ({
                titel: zeile.titel,
                inhalt: (
                  <>
                    {zeile.zeilen.map((teile, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
                      <span key={i} className={styles.karteZeile}>
                        {teile.map((teil, j) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
                          <Teil key={j} teil={teil} />
                        ))}
                      </span>
                    ))}
                  </>
                ),
              }))}
              aktionen={<BelegPruefen belegId={karte.id} onErgebnis={(e) => setStufe(e.stufe)} />}
            />

            <details className={styles.technik}>
              <summary>{t("belege.technik.titel")}</summary>
              <div className={styles.technikInhalt}>
                <p className={`${styles.leise} ${styles.klein}`}>{t("belege.technik.text")}</p>
                <dl>
                  <dt>{t("belege.technik.pruefsumme")}</dt>
                  <dd>{karte.technik.hash}</dd>
                  <dt>{t("belege.technik.signatur")}</dt>
                  <dd>{karte.technik.signatur}</dd>
                  <dt>{t("belege.technik.schluessel")}</dt>
                  <dd>{karte.technik.schluessel}</dd>
                  <dt>{t("belege.technik.vorgaenger")}</dt>
                  <dd>{karte.technik.vorgaenger}</dd>
                  <dt>{t("belege.technik.kennung")}</dt>
                  <dd>{karte.id}</dd>
                </dl>
                <textarea
                  className={styles.json}
                  readOnly
                  value={karte.technik.json}
                  aria-label={t("belege.technik.json")}
                  spellCheck={false}
                />
                <Kopieren
                  text={`{"seq":${karte.seq},"id":${JSON.stringify(karte.id)},"hash":${JSON.stringify(karte.technik.hash)},"signature":${JSON.stringify(karte.technik.signatur)},"keyId":${JSON.stringify(karte.technik.schluessel)},"body":${karte.technik.json}}`}
                  label={t("belege.technik.kopieren_label")}
                />
              </div>
            </details>
          </div>
          <aside className={styles.seitlich} aria-label={t("belege.seitlich.label")}>
            <section className={styles.abschnitt}>
              <h2>{t("belege.erklaerung.beleg.titel")}</h2>
              <p>{t("belege.erklaerung.beleg.text")}</p>
            </section>
            <section className={styles.abschnitt}>
              <h2>{t("belege.erklaerung.kette.titel")}</h2>
              <p>{t("belege.erklaerung.kette.text")}</p>
            </section>
          </aside>
        </div>
      </div>
    </ScrollBereich>
  );
}
