/**
 * PaiBot – Grundgerüst der App: Navigation, Inhalt und Arbeitsfläche.
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
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Avatar, type AvatarZustand } from "../avatar/Avatar";
import { Icon, type IconName } from "../basis/Icon";
import { IconButton } from "../basis/IconButton";
import { klassen } from "../basis/klassen";
import { Logo } from "../basis/Logo";
import { ScrollBereich } from "../basis/ScrollBereich";
import { useFokusFalle } from "../basis/useFokusFalle";
import { Wortmarke } from "../basis/Wortmarke";
import { Reiter } from "../ueberlagerung/Reiter";
import { Footer } from "../zustaende/Footer";
import styles from "./AppShell.module.css";
import {
  flaecheModal,
  flaecheUeberlagert,
  navAlsMenue,
  type ShellModus,
  shellModus,
} from "./modus";

export interface NavUnterhaltung {
  id: string;
  titel: string;
  href: string;
  aktiv?: boolean;
}

export interface NavBot {
  name: string;
  /** Rolle in einem Satz; wird nie abgeschnitten, sondern umbrochen. */
  rolle: string;
  farbe: BotColor;
  zustand?: AvatarZustand;
  /** Wort zum Zustand, z. B. „arbeitet“ (nur nötig, wenn der Zustand nicht „bereit“ ist). */
  zustandText?: string;
  href?: string;
  unterhaltungen: readonly NavUnterhaltung[];
}

export interface NavEintrag {
  id: string;
  text: string;
  href: string;
  icon: IconName;
  aktiv?: boolean;
}

export interface AppShellNavigation {
  /** Wo PaiBot läuft, z. B. „dein Server“. */
  ort: string;
  /** Herkunft der Modelle, z. B. „EU“. */
  modelle: string;
  bot: NavBot;
  /** Einträge unten: Belege, Regeln, Datenschleuse, Einstellungen, Info. */
  werkzeuge: readonly NavEintrag[];
  /** Knopf „Neue Unterhaltung“ oben in der Leiste. */
  neu?: { href?: string; onClick?: () => void };
}

/** Texte der AppShell, die (noch) keinen eigenen Text-Schlüssel haben. */
export interface AppShellTexte {
  /** „Läuft auf:“ */
  laeuftAuf: string;
  /** „Modelle:“ */
  modelle: string;
  /** Überschrift über dem Bot, z. B. „Dein Bot“. */
  deinBot: string;
  /** Name der Navigation, z. B. „Navigation“. */
  navigation: string;
  /** Name der Liste der Unterhaltungen, z. B. „Unterhaltungen von Pai“. */
  unterhaltungen: string;
  menueOeffnen: string;
  menueSchliessen: string;
  /** Name der rechten Fläche, z. B. „Arbeitsfläche“. */
  flaeche: string;
  flaecheZeigen: string;
  flaecheSchliessen: string;
}

export interface AppShellFlaeche {
  /** Inhalt des Reiters „Belege“. */
  inhalt: ReactNode;
  /** Zahl neben dem Reiter. */
  zahl?: number;
}

export interface AppShellProps {
  navigation: AppShellNavigation;
  texte: AppShellTexte;
  /** Kopfzeile der mittleren Spalte (Titel, Modell, Aktionen). */
  kopf?: ReactNode;
  /** Inhalt der mittleren Spalte; scrollt selbst (z. B. mit `ScrollBereich`). */
  children: ReactNode;
  /** Arbeitsfläche rechts mit dem Reiter „Belege“. */
  flaeche?: AppShellFlaeche;
  /** Arbeitsfläche offen (gesteuert). */
  flaecheOffen?: boolean;
  onFlaecheOffen?: (offen: boolean) => void;
  /** Füllt den umgebenden Rahmen statt des ganzen Fensters (z. B. in einer Vorschau). */
  eingebettet?: boolean;
  /** Zusätzlicher Inhalt unten in der Navigation, über der Fußzeile (z. B. „Abmelden“). */
  unten?: ReactNode;
  /** Link-Komponente, z. B. die des Frameworks; Standard `a`. */
  link?: ComponentType<{
    href: string;
    className?: string;
    children: ReactNode;
    onClick?: () => void;
    "aria-current"?: "page";
  }>;
}

function StandardLink(props: {
  href: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  "aria-current"?: "page";
}) {
  return <a {...props} />;
}

function useModus(element: React.RefObject<HTMLElement | null>): ShellModus | null {
  const [modus, setModus] = useState<ShellModus | null>(null);
  useEffect(() => {
    const el = element.current;
    if (!el) return;
    const messen = () => setModus(shellModus(el.getBoundingClientRect().width));
    messen();
    if (typeof ResizeObserver !== "function") return;
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, [element]);
  return modus;
}

/**
 * Grundgerüst der App: Navigation links, Inhalt in der Mitte, Arbeitsfläche rechts.
 * Mittlere Breite: Arbeitsfläche legt sich über den Inhalt. Handy: Navigation als Menü
 * von links, Arbeitsfläche als Blatt von unten.
 */
export function AppShell({
  navigation,
  texte,
  kopf,
  children,
  flaeche,
  flaecheOffen,
  onFlaecheOffen,
  eingebettet = false,
  unten,
  link: Link = StandardLink,
}: AppShellProps) {
  const huelle = useRef<HTMLDivElement>(null);
  const leiste = useRef<HTMLElement>(null);
  const flaecheRef = useRef<HTMLElement>(null);
  const modus = useModus(huelle);
  const [navOffen, setNavOffen] = useState(false);
  const [eigeneFlaeche, setEigeneFlaeche] = useState(false);
  const [reiter, setReiter] = useState("belege");
  const flaecheIstOffen = Boolean(flaeche) && (flaecheOffen ?? eigeneFlaeche);
  const navId = useId();
  const flaecheId = useId();

  const setFlaeche = useCallback(
    (offen: boolean) => {
      if (flaecheOffen === undefined) setEigeneFlaeche(offen);
      onFlaecheOffen?.(offen);
    },
    [flaecheOffen, onFlaecheOffen],
  );

  const navModal = modus !== null && navAlsMenue(modus) && navOffen;
  const flaecheIstModal = modus !== null && flaecheModal(modus) && flaecheIstOffen;
  const flaecheUeber = modus !== null && flaecheUeberlagert(modus) && flaecheIstOffen;

  // Wird die Fläche breit genug, ist das Menü keins mehr.
  useEffect(() => {
    if (modus && !navAlsMenue(modus)) setNavOffen(false);
  }, [modus]);

  useFokusFalle(leiste, navModal, { onEscape: () => setNavOffen(false) });
  useFokusFalle(flaecheRef, flaecheUeber, {
    falle: flaecheIstModal,
    onEscape: () => setFlaeche(false),
  });

  const schliesseNav = () => setNavOffen(false);
  const { bot } = navigation;

  return (
    <div
      ref={huelle}
      className={klassen(styles.shell, eingebettet && styles.eingebettet)}
      data-nav-offen={navOffen || undefined}
      data-flaeche-offen={flaecheIstOffen || undefined}
    >
      <div className={styles.raster}>
        <aside
          ref={leiste}
          id={navId}
          className={styles.leiste}
          aria-label={texte.navigation}
          {...(navModal ? { role: "dialog", "aria-modal": true } : {})}
        >
          <div className={styles.oben}>
            <div className={styles.markenzeile}>
              <span className={styles.marke}>
                <Logo groesse={24} />
                <Wortmarke />
              </span>
              {navigation.neu &&
                (navigation.neu.href ? (
                  <Link href={navigation.neu.href} className={styles.neu} onClick={schliesseNav}>
                    <Icon name="plus" />
                    <span className={styles.nurLesbar}>{t("chat.neu")}</span>
                  </Link>
                ) : (
                  <IconButton
                    icon="plus"
                    label={t("chat.neu")}
                    onClick={() => {
                      navigation.neu?.onClick?.();
                      schliesseNav();
                    }}
                  />
                ))}
              <IconButton
                icon="x"
                label={texte.menueSchliessen}
                className={styles.nurMenue}
                onClick={schliesseNav}
              />
            </div>
            <div className={styles.ort}>
              <span className={styles.ortChip}>
                <Icon name="server" groesse={11} />
                {texte.laeuftAuf} <b>{navigation.ort}</b>
              </span>
              <span className={styles.ortChip}>
                {texte.modelle} <b>{navigation.modelle}</b>
              </span>
            </div>
          </div>

          <ScrollBereich className={styles.mitte}>
            <div className={styles.block}>
              <h2 className={styles.etikett}>{texte.deinBot}</h2>
              <div
                className={styles.botReihe}
                data-aktiv={bot.unterhaltungen.some((u) => u.aktiv) || undefined}
              >
                <Avatar farbe={bot.farbe} groesse={20} zustand={bot.zustand} still />
                <span className={styles.botText}>
                  <span className={styles.botName}>
                    {bot.href ? (
                      <Link href={bot.href} onClick={schliesseNav} className={styles.botLink}>
                        {bot.name}
                      </Link>
                    ) : (
                      bot.name
                    )}
                    {bot.zustand && bot.zustand !== "bereit" && bot.zustandText && (
                      <span className={styles.botZustand} data-zustand={bot.zustand}>
                        {bot.zustandText}
                      </span>
                    )}
                  </span>
                  <span className={styles.rolle}>{bot.rolle}</span>
                </span>
              </div>
              {bot.unterhaltungen.length > 0 && (
                <nav aria-label={texte.unterhaltungen}>
                  <ul className={styles.unterhaltungen}>
                    {bot.unterhaltungen.map((u) => (
                      <li key={u.id}>
                        <Link
                          href={u.href}
                          className={styles.zeile}
                          onClick={schliesseNav}
                          {...(u.aktiv ? { "aria-current": "page" as const } : {})}
                        >
                          <span className={styles.zeilenText}>{u.titel}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
            </div>
          </ScrollBereich>

          <div className={styles.unten}>
            <ul className={styles.werkzeuge}>
              {navigation.werkzeuge.map((w) => (
                <li key={w.id}>
                  <Link
                    href={w.href}
                    className={styles.zeile}
                    onClick={schliesseNav}
                    {...(w.aktiv ? { "aria-current": "page" as const } : {})}
                  >
                    <Icon name={w.icon} />
                    <span className={styles.zeilenText}>{w.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {unten}
            <Footer className={styles.fuss} />
          </div>
        </aside>

        <div className={styles.haupt}>
          <header className={styles.kopf}>
            <IconButton
              icon="menue"
              label={texte.menueOeffnen}
              className={styles.menueKnopf}
              aria-expanded={navOffen}
              aria-controls={navId}
              onClick={() => setNavOffen(true)}
            />
            <div className={styles.kopfInhalt}>{kopf}</div>
            {flaeche && (
              <IconButton
                icon="panel"
                label={texte.flaecheZeigen}
                aria-pressed={flaecheIstOffen}
                aria-controls={flaecheId}
                onClick={() => setFlaeche(!flaecheIstOffen)}
              />
            )}
          </header>
          <main className={styles.inhalt}>{children}</main>
        </div>

        {flaeche && flaecheIstOffen && (
          <aside
            ref={flaecheRef}
            id={flaecheId}
            className={styles.flaeche}
            aria-label={texte.flaeche}
            {...(flaecheIstModal ? { role: "dialog", "aria-modal": true } : {})}
          >
            <span className={styles.griff} aria-hidden="true" />
            <Reiter
              label={texte.flaeche}
              reiter={[
                {
                  id: "belege",
                  text: t("seite.belege"),
                  zahl: flaeche.zahl,
                  inhalt: (
                    <ScrollBereich className={styles.flaecheScroll} label={t("seite.belege")}>
                      {flaeche.inhalt}
                    </ScrollBereich>
                  ),
                },
              ]}
              aktiv={reiter}
              onWechsel={setReiter}
              className={styles.flaecheReiter}
              leisteClassName={styles.flaecheKopf}
              inhaltClassName={styles.flaecheInhalt}
              zusatz={
                <IconButton
                  icon="x"
                  label={texte.flaecheSchliessen}
                  onClick={() => setFlaeche(false)}
                />
              }
            />
          </aside>
        )}
      </div>
      <div
        className={klassen(
          styles.schleier,
          (navModal || flaecheIstModal) && styles.schleierSichtbar,
        )}
        aria-hidden="true"
        onClick={() => {
          setNavOffen(false);
          if (flaecheIstModal) setFlaeche(false);
        }}
      />
    </div>
  );
}
