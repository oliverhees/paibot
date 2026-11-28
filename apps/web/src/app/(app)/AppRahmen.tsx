/**
 * PaiBot – AppShell der angemeldeten App: Navigation mit dem Haupt-Assistenten, den Teams und
 * ihren Bots samt Unterhaltungen, Arbeitsfläche rechts (von der Seite gefüllt) und Abmelden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

"use client";

import "../../lib/ohne-auswertung";
import { t } from "@paibot/shared/texte";
import {
  AppShell,
  type AppShellFlaeche,
  type AppShellTexte,
  Icon,
  Menue,
  type MenueEintrag,
  type NavBot,
  type NavTeam,
} from "@paibot/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import { INFO_LINKS } from "../../lib/einstellungen/info";
import {
  BOT_ADRESSE,
  botAdresse,
  botAktiv,
  duEintraege,
  kopfTitel,
  liegtUnter,
  modelleHerkunft,
  NAVIGATION,
  neueUnterhaltungAdresse,
  teamAdresse,
} from "../../lib/navigation";
import type { AnsichtBot, BotsUndTeams } from "../../lib/teams/ansicht";
import styles from "./app.module.css";
import { NotAusDialog, type NotAusFrage, NotAusKnopf, NotAusLeiste } from "./NotAus";
import notausStyles from "./notaus.module.css";
import { useSuche } from "./Suche";

export interface AppRahmenProps {
  /** Haupt-Assistent, Teams mit ihren Bots und die Bots ohne Team (vom Server). */
  gruppen: BotsUndTeams;
  /** Herkunft der Modelle in Worten (`anbieterHerkunft`); fehlt ohne Anbieter. */
  herkunft?: string;
  /** Unterhaltungen des Bots, neueste zuerst (vom Server; danach hält der Rahmen sie aktuell). */
  unterhaltungen: readonly UnterhaltungKurz[];
  /** Not-Aus an (vom Server); danach hält der Rahmen den Zustand selbst aktuell. */
  notAus?: boolean;
  /** Weitere Hinweise über der Kopfzeile, unter der Leiste des Not-Aus (z. B. neue Anmeldung). */
  hinweise?: ReactNode;
  /** Zeitzone der Einstellungen (Zeiten der Suchtreffer). */
  zeitzone: string;
  /** Stand der Installation (Menü „Du“ → Neuigkeiten). */
  stand: string;
  children: ReactNode;
}

function shellTexte(): AppShellTexte {
  return {
    laeuftAuf: t("navigation.laeuft_auf"),
    modelle: t("navigation.modelle"),
    deinBot: t("navigation.dein_bot"),
    navigation: t("navigation.name"),
    menueOeffnen: t("navigation.menue_oeffnen"),
    menueSchliessen: t("navigation.menue_schliessen"),
    flaeche: t("navigation.flaeche"),
    flaecheZeigen: t("navigation.flaeche_zeigen"),
    flaecheSchliessen: t("navigation.flaeche_schliessen"),
  };
}

/**
 * Menü „Du“ unten in der Seitenleiste: Persönliches (Zugang, Einstellungen, Neuigkeiten, Hilfe,
 * Info) und – abgesetzt – „Abmelden“ (zwei Klicks). Weitere Einträge lassen sich in `eintraege`
 * ergänzen.
 */
function DuMenue({ stand }: { stand: string }) {
  const router = useRouter();
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
  const neuerTab = t("info.neuer_tab");
  const eintraege: MenueEintrag[] = duEintraege(stand, INFO_LINKS).map((e) => {
    const basis = {
      id: e.id,
      text: e.text,
      icon: e.icon,
      ...(e.hinweis === undefined ? {} : { hinweis: e.hinweis }),
      ...(e.gruppe === undefined ? {} : { trennerDavor: true, gruppe: e.gruppe }),
    };
    if (e.ziel === "abmelden") {
      return {
        ...basis,
        text: laeuft ? t("navigation.abmelden.laeuft") : e.text,
        gefahr: true,
        deaktiviert: laeuft,
        onWaehlen: () => void abmelden(),
      };
    }
    if ("extern" in e.ziel) return { ...basis, extern: { href: e.ziel.extern, neuerTab } };
    const href = e.ziel.intern;
    return { ...basis, onWaehlen: () => router.push(href) };
  });
  return (
    <div className={styles.du}>
      <Menue
        label={t("nav.du")}
        eintraege={eintraege}
        ausrichtung="start"
        richtung="oben"
        className={styles.duHuelle}
        ausloeser={(props) => (
          <button
            type="button"
            className={styles.duKnopf}
            aria-busy={laeuft || undefined}
            {...props}
          >
            <span className={styles.duZeichen}>
              <Icon name="person" groesse={14} />
            </span>
            <span className={styles.duText}>{t("nav.du")}</span>
            <Icon name="runter" groesse={14} className={styles.duPfeil} />
          </button>
        )}
      />
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

export function AppRahmen({
  gruppen,
  herkunft,
  unterhaltungen: vomServer,
  notAus: notAusVomServer = false,
  hinweise,
  zeitzone,
  stand,
  children,
}: AppRahmenProps) {
  const pfad = usePathname();
  const router = useRouter();
  const haupt = gruppen.haupt;
  const hauptName = haupt?.name ?? t("einrichtung.bot.vorschlag");
  const suche = useSuche({ botName: hauptName, zeitzone });
  const [notAus, setNotAus] = useState(notAusVomServer);
  const [notAusFrage, setNotAusFrage] = useState<NotAusFrage | undefined>(undefined);
  useEffect(() => setNotAus(notAusVomServer), [notAusVomServer]);
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
      notAus,
    }),
    [flaecheOffen, unterhaltungen, unterhaltungMerken, unterhaltungEntfernen, notAus],
  );

  // Unterhaltungen eines Bots, in der Reihenfolge der Liste (zuletzt benutzte zuerst).
  const navUnterhaltungen = (botId: string | undefined) =>
    unterhaltungen
      .filter((u) => botId !== undefined && u.botId === botId)
      .map((u) => {
        const href = unterhaltungsAdresse(u.id);
        return { id: u.id, titel: u.titel, href, aktiv: pfad === href };
      });

  // Der Haupt-Assistent behält seine eigene Seite (`/bot`, mit Name, Anweisung und Modell); jeder
  // weitere Bot hat seinen Steckbrief unter `/bot/<Kennung>`.
  const navBot = (b: AnsichtBot): NavBot => {
    const eigene = navUnterhaltungen(b.id);
    const href = botAdresse(b.id, b.haupt);
    return {
      id: b.id,
      name: b.name,
      rolle: b.haupt && b.rolle === "" ? t("navigation.bot.rolle") : b.rolle,
      farbe: b.farbe,
      // In der Liste steht der Avatar still; nur der Not-Aus ändert sein Gesicht.
      ...(notAus ? { zustand: "angehalten" as const } : {}),
      ...(b.pausiert ? { pausiert: true } : {}),
      ...(b.leitung ? { leitung: true } : {}),
      href,
      aktiv: b.haupt
        ? botAktiv(
            pfad,
            eigene.some((u) => u.aktiv),
          )
        : pfad === href,
      unterhaltungen: eigene,
      neu: { href: neueUnterhaltungAdresse(b.id) },
    };
  };

  const hauptNav: NavBot = haupt
    ? navBot(haupt)
    : {
        id: "ohne",
        name: hauptName,
        rolle: t("navigation.bot.rolle"),
        farbe: "limette",
        href: BOT_ADRESSE,
        aktiv: liegtUnter(pfad, BOT_ADRESSE),
        unterhaltungen: [],
      };

  const navTeams: NavTeam[] = gruppen.teams.map((tm) => ({
    id: tm.id,
    name: tm.name,
    href: teamAdresse(tm.id),
    aktiv: pfad === teamAdresse(tm.id),
    bots: tm.bots.map(navBot),
  }));

  return (
    <Rahmen.Provider value={kontext}>
      <AppShell
        link={NavLink}
        texte={shellTexte()}
        navigation={{
          ort: t("navigation.ort"),
          modelle: modelleHerkunft(herkunft),
          neu: { href: neueUnterhaltungAdresse() },
          bot: hauptNav,
          teams: navTeams,
          weitereBots: gruppen.ohneTeam.map(navBot),
          werkzeuge: NAVIGATION.map((eintrag) => ({
            ...eintrag,
            aktiv: liegtUnter(pfad, eintrag.href),
          })),
        }}
        unten={<DuMenue stand={stand} />}
        obenZusatz={
          <NotAusKnopf an={notAus} onClick={() => setNotAusFrage(notAus ? "aus" : "an")} />
        }
        hinweis={
          <>
            {notAus && <NotAusLeiste onFortsetzen={() => setNotAusFrage("aus")} />}
            {hinweise !== undefined && <div className={notausStyles.hinweise}>{hinweise}</div>}
          </>
        }
        suche={suche}
        kopf={kopf ?? <span className={styles.kopfTitel}>{kopfTitel(pfad)}</span>}
        {...(flaeche === undefined ? {} : { flaeche })}
        flaecheOffen={flaecheOffen}
        onFlaecheOffen={setFlaecheOffen}
      >
        {children}
      </AppShell>
      <NotAusDialog
        frage={notAusFrage}
        onSchliessen={() => setNotAusFrage(undefined)}
        onGeschaltet={(an) => {
          setNotAus(an);
          setNotAusFrage(undefined);
          router.refresh();
        }}
      />
    </Rahmen.Provider>
  );
}
