/**
 * PaiBot – AppShell der angemeldeten App: Navigation der ersten Version und Abmelden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

"use client";

import type { BotColor } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import { AppShell, type AppShellTexte, Icon, type NavEintrag } from "@paibot/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ComponentProps, type ReactNode, useState } from "react";
import { apiFetch } from "../../lib/api/client";
import styles from "./app.module.css";

export interface AppRahmenProps {
  bot: { name: string; farbe: BotColor };
  children: ReactNode;
}

/** Einträge der Navigation in der ersten Version (Seiten aus dem Bauplan der Oberfläche). */
export const NAVIGATION: readonly Omit<NavEintrag, "aktiv">[] = [
  { id: "modelle", text: t("seite.modelle"), href: "/modelle", icon: "zahnrad" },
  { id: "datenschleuse", text: t("seite.datenschleuse"), href: "/datenschleuse", icon: "schleuse" },
  { id: "belege", text: t("seite.belege"), href: "/belege", icon: "beleg" },
  { id: "einstellungen", text: t("seite.einstellungen"), href: "/einstellungen", icon: "regeln" },
  { id: "info", text: t("seite.info"), href: "/info", icon: "info" },
];

function shellTexte(botName: string): AppShellTexte {
  return {
    laeuftAuf: t("navigation.laeuft_auf"),
    modelle: t("navigation.modelle"),
    deinBot: t("navigation.dein_bot"),
    navigation: t("navigation.name"),
    unterhaltungen: t("navigation.unterhaltungen", { name: botName }),
    menueOeffnen: t("navigation.menue_oeffnen"),
    menueSchliessen: t("navigation.menue_schliessen"),
    flaeche: t("navigation.flaeche"),
    flaecheZeigen: t("navigation.flaeche_zeigen"),
    flaecheSchliessen: t("navigation.flaeche_schliessen"),
  };
}

function Abmelden() {
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
    <div className={styles.abmelden}>
      <button
        type="button"
        className={styles.abmeldenKnopf}
        onClick={() => void abmelden()}
        disabled={laeuft}
        aria-busy={laeuft || undefined}
      >
        <Icon name="abmelden" />
        <span>{laeuft ? t("navigation.abmelden.laeuft") : t("navigation.abmelden")}</span>
      </button>
      {fehler && (
        <p className={styles.fehler} role="alert">
          {fehler}
        </p>
      )}
    </div>
  );
}

/** Link ohne Vorabladen: Seiten werden erst beim Klick geholt. */
function NavLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} prefetch={false} />;
}

export function AppRahmen({ bot, children }: AppRahmenProps) {
  const pfad = usePathname();
  return (
    <AppShell
      link={NavLink}
      texte={shellTexte(bot.name)}
      navigation={{
        ort: t("navigation.ort"),
        modelle: t("modelle.region.eu"),
        bot: {
          name: bot.name,
          rolle: t("navigation.bot.rolle"),
          farbe: bot.farbe,
          href: "/",
          unterhaltungen: [],
        },
        werkzeuge: NAVIGATION.map((eintrag) => ({
          ...eintrag,
          aktiv: pfad === eintrag.href || pfad.startsWith(`${eintrag.href}/`),
        })),
      }}
      unten={<Abmelden />}
      kopf={<span className={styles.kopfTitel}>{t("seite.chat")}</span>}
    >
      {children}
    </AppShell>
  );
}
