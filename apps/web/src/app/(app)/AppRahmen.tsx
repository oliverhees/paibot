/**
 * PaiBot – AppShell der angemeldeten App: Navigation der ersten Version, Unterhaltungen des Bots,
 * Arbeitsfläche rechts (von der Seite gefüllt) und Abmelden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

"use client";

import "../../lib/ohne-auswertung";
import type { BotColor, Region } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import { AppShell, type AppShellFlaeche, type AppShellTexte, Icon } from "@paibot/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch } from "../../lib/api/client";
import { unterhaltungsAdresse } from "../../lib/chat/pfade";
import { Rahmen, type RahmenKontext } from "../../lib/chat/rahmen-kontext";
import type { UnterhaltungKurz } from "../../lib/chat/typen";
import {
  BOT_ADRESSE,
  botAktiv,
  kopfTitel,
  liegtUnter,
  modelleHerkunft,
  NAVIGATION,
} from "../../lib/navigation";
import styles from "./app.module.css";

export interface AppRahmenProps {
  bot: { name: string; farbe: BotColor };
  /** Region des Anbieters, über den der Bot sein Modell bezieht; fehlt ohne Anbieter oder Modell. */
  region?: Region;
  /** Unterhaltungen des Bots, neueste zuerst (vom Server; danach hält der Rahmen sie aktuell). */
  unterhaltungen: readonly UnterhaltungKurz[];
  children: ReactNode;
}

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

function neuesteZuerst(liste: readonly UnterhaltungKurz[]): UnterhaltungKurz[] {
  return [...liste].sort((a, b) => (a.zuletzt < b.zuletzt ? 1 : a.zuletzt > b.zuletzt ? -1 : 0));
}

export function AppRahmen({ bot, region, unterhaltungen: vomServer, children }: AppRahmenProps) {
  const pfad = usePathname();
  const [unterhaltungen, setUnterhaltungen] = useState(() => neuesteZuerst(vomServer));
  const [kopf, setKopf] = useState<ReactNode | undefined>(undefined);
  const [flaeche, setFlaeche] = useState<AppShellFlaeche | undefined>(undefined);
  const [flaecheOffen, setFlaecheOffen] = useState(false);

  // Neue Daten vom Server (z. B. nach dem Neuladen der Seite) übernehmen.
  useEffect(() => setUnterhaltungen(neuesteZuerst(vomServer)), [vomServer]);

  const unterhaltungMerken = useCallback((u: UnterhaltungKurz) => {
    setUnterhaltungen((liste) => neuesteZuerst([u, ...liste.filter((x) => x.id !== u.id)]));
  }, []);
  const unterhaltungEntfernen = useCallback((id: string) => {
    setUnterhaltungen((liste) => liste.filter((x) => x.id !== id));
  }, []);

  const kontext = useMemo<RahmenKontext>(
    () => ({
      setKopf,
      setFlaeche,
      flaecheOffen,
      setFlaecheOffen,
      unterhaltungen,
      unterhaltungMerken,
      unterhaltungEntfernen,
    }),
    [flaecheOffen, unterhaltungen, unterhaltungMerken, unterhaltungEntfernen],
  );

  const navUnterhaltungen = unterhaltungen.map((u) => {
    const href = unterhaltungsAdresse(u.id);
    return { id: u.id, titel: u.titel, href, aktiv: pfad === href };
  });

  return (
    <Rahmen.Provider value={kontext}>
      <AppShell
        link={NavLink}
        texte={shellTexte(bot.name)}
        navigation={{
          ort: t("navigation.ort"),
          modelle: modelleHerkunft(region),
          neu: { href: "/" },
          bot: {
            name: bot.name,
            rolle: t("navigation.bot.rolle"),
            farbe: bot.farbe,
            href: BOT_ADRESSE,
            aktiv: botAktiv(
              pfad,
              navUnterhaltungen.some((u) => u.aktiv),
            ),
            unterhaltungen: navUnterhaltungen,
          },
          werkzeuge: NAVIGATION.map((eintrag) => ({
            ...eintrag,
            aktiv: liegtUnter(pfad, eintrag.href),
          })),
        }}
        unten={<Abmelden />}
        kopf={kopf ?? <span className={styles.kopfTitel}>{kopfTitel(pfad)}</span>}
        {...(flaeche === undefined ? {} : { flaeche })}
        flaecheOffen={flaecheOffen}
        onFlaecheOffen={setFlaecheOffen}
      >
        {children}
      </AppShell>
    </Rahmen.Provider>
  );
}
