/**
 * PaiBot – gemeinsamer Rahmen der Einstellungen und der Info: Reiterzeile und scrollender Inhalt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import { NurLesbar, type ReiterLink, ReiterLinks, ScrollBereich } from "@paibot/ui";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import styles from "./einstellungen.module.css";

/** Reiter der Einstellungen: Modell und Anbieter, Zugang, Grenzen, Info. */
export const EINSTELLUNGEN_REITER: readonly ReiterLink[] = [
  { id: "modelle", text: t("seite.modelle"), href: "/modelle" },
  { id: "zugang", text: t("einstellungen.reiter.zugang"), href: "/einstellungen" },
  { id: "grenzen", text: t("einstellungen.reiter.grenzen"), href: "/einstellungen/grenzen" },
  {
    id: "darstellung",
    text: t("einstellungen.reiter.darstellung"),
    href: "/einstellungen/darstellung",
  },
  { id: "info", text: t("seite.info"), href: "/info" },
  {
    id: "selbsttest",
    text: t("einstellungen.reiter.selbsttest"),
    href: "/einstellungen/selbsttest",
  },
];

export type EinstellungenReiter = "zugang" | "grenzen" | "darstellung" | "info" | "selbsttest";

/** Link ohne Vorabladen: Seiten werden erst beim Klick geholt. */
function OhneVorabladen(props: ComponentProps<typeof Link>) {
  return <Link {...props} prefetch={false} />;
}

export function EinstellungenRahmen({
  aktiv,
  children,
}: {
  aktiv: EinstellungenReiter;
  children: ReactNode;
}) {
  return (
    <div className={styles.rahmen}>
      <h1>
        <NurLesbar>{t("seite.einstellungen")}</NurLesbar>
      </h1>
      <ReiterLinks
        label={t("einstellungen.reiter.name")}
        reiter={EINSTELLUNGEN_REITER}
        aktiv={aktiv}
        link={OhneVorabladen}
      />
      <ScrollBereich className={styles.inhalt} label={t("seite.einstellungen")}>
        <div className={styles.spalte}>{children}</div>
      </ScrollBereich>
    </div>
  );
}
