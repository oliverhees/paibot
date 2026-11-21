/**
 * PaiBot – Kleine gemeinsame Teile der drei Fassungen des Startbereichs.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import type { ReactNode } from "react";
import { klassen } from "../basis/klassen";
import type { Tageszeit } from "./gruss";
import styles from "./Startbereich.module.css";
import type { StartHerkunft } from "./typen";

/** Gruß nach Tageszeit; ohne Angabe ein neutrales „Hallo“, nie eine erfundene Tageszeit. */
export function grussText(tageszeit: Tageszeit | undefined): string {
  switch (tageszeit) {
    case "morgen":
      return t("startbereich.gruss.morgen");
    case "tag":
      return t("startbereich.gruss.tag");
    case "abend":
      return t("startbereich.gruss.abend");
    case "spaet":
      return t("startbereich.gruss.spaet");
    default:
      return t("startbereich.gruss.neutral");
  }
}

function Linie({ children, groesse = 16 }: { children: ReactNode; groesse?: number }) {
  return (
    <svg
      className={styles.symbol}
      viewBox="0 0 24 24"
      width={groesse}
      height={groesse}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function PfeilSymbol() {
  return (
    <Linie>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Linie>
  );
}

const GRUPPEN_SYMBOLE = {
  schreiben: (
    <>
      <path d="M5 19l1-4L16 5l3 3L9 18z" />
      <path d="M14 7l3 3" />
    </>
  ),
  planen: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  verstehen: (
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
  ),
  zuletzt: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  stand: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
} as const;

export function GruppenSymbol({ name }: { name: keyof typeof GRUPPEN_SYMBOLE }) {
  return <Linie groesse={15}>{GRUPPEN_SYMBOLE[name]}</Linie>;
}

/** Herkunft des Modells in dem Wort, das die App überall zeigt („EU“, „außerhalb der EU“, „lokal“). */
export function HerkunftMarke({ herkunft }: { herkunft: StartHerkunft }) {
  return (
    <span className={klassen(styles.herkunft, herkunft === "non_eu" && styles.herkunftFremd)}>
      {t(`modelle.region.${herkunft}`)}
    </span>
  );
}

/** Avatar im Quadrat; die Größe bestimmt der Baustein (und wird auf kleinen Bildschirmen kleiner). */
export function AvatarFeld({
  groesse,
  children,
  className,
}: {
  groesse: "gross" | "mittel" | "klein";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={klassen(styles.avatar, className)} data-groesse={groesse}>
      {children}
    </span>
  );
}

/** Ersatz-Ansicht bei Not-Aus: klarer Hinweis statt Einladung zum Schreiben. */
export function NotAusAnsicht({
  avatar,
  botName,
  mitZusatz,
  titelId,
}: {
  avatar: ReactNode;
  botName: string | undefined;
  mitZusatz?: boolean;
  titelId: string;
}) {
  const satz =
    botName === undefined
      ? t("startbereich.notaus.satz_ohne_name")
      : t("startbereich.notaus.satz", { name: botName });
  return (
    <section className={styles.halt} aria-labelledby={titelId} data-notaus="">
      <AvatarFeld groesse="mittel">{avatar}</AvatarFeld>
      <h1 id={titelId} className={styles.haltTitel}>
        {t("notaus.leiste.titel")}
      </h1>
      <p className={styles.haltText}>
        {satz}
        {mitZusatz ? ` ${t("startbereich.notaus.zusatz")}` : ""}
      </p>
    </section>
  );
}
