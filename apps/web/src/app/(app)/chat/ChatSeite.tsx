/**
 * PaiBot – Chat mit dem Bot: Verlauf, Antworten live Stück für Stück, Stopp, Schalter der
 * Datenschleuse, Zeile mit Beleg, Weg und Modell unter jeder Antwort, Belege rechts.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import "../../../lib/ohne-auswertung";
import type { ApiErrorDetail } from "@paibot/shared/api";
import type { ConversationId } from "@paibot/shared/ids";
import { LIMITS } from "@paibot/shared/konstanten";
import { errorText, errorWayOut, t } from "@paibot/shared/texte";
import {
  AntwortZeile,
  AvatarLebendig,
  BelegZeile,
  Button,
  ChatBubble,
  ChatEingabe,
  Dialog,
  EmptyState,
  FestHinweis,
  Icon,
  Markdown,
  Menue,
  Phase,
  type PhaseArt,
  ScrollBereich,
  Select,
  Startbereich,
  StartStilleSitz,
  StatusChip,
  TextField,
  tageszeitIn,
  VorlaeufigerText,
  WerkzeugZeile,
  Zwischenschritt,
} from "@paibot/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiDatei, apiFetch } from "../../../lib/api/client";
import { dateiSichern } from "../../../lib/belege/datei";
import {
  type AnsichtEintrag,
  type AnsichtLaufEnde,
  type AnsichtNachricht,
  type AnsichtSchritt,
  type AnsichtWerkzeug,
  abbruchAngefragt,
  abbruchZurueck,
  ansichtAus,
  belegeMischen,
  belegZurAntwort,
  ereignisAnwenden,
  gesendet,
  kopfModell as kopfModellVon,
  leereAnsicht,
  nachfrageUebernehmen,
  neuErzeugbar,
  neuErzeugt,
  offeneNachfragen,
  ohneVorgabe,
  schritteVon,
  schrittSichtbar,
  sendenGesperrt,
} from "../../../lib/chat/ansicht";
import {
  belegKennung,
  kurzTagText,
  laengenHinweis,
  schleuseFehler,
  schleuseFehlerArt,
  tagesbudgetAusweg,
  tagSchluessel,
  tagText,
  titelAusNachricht,
  uhrzeit,
  wegAngabe,
  zielZuCode,
  zielZuSchleuseFehler,
} from "../../../lib/chat/anzeige";
import { antwortHatText, avatarWort, chatAvatarZustand } from "../../../lib/chat/avatar";
import { type Fassung, fassungenVon } from "../../../lib/chat/fassungen";
import { CHAT_PFADE, unterhaltungsAdresse } from "../../../lib/chat/pfade";
import { useFlaeche, useKopf, useRahmen } from "../../../lib/chat/rahmen-kontext";
import {
  herkunftKette,
  werkzeugZeileAngaben,
  zahlWerkzeuge,
} from "../../../lib/chat/schritte-anzeige";
import { STANDARD_FASSUNG, type StartFassung } from "../../../lib/chat/startbereich";
import type {
  BelegKurz,
  ChatBereitschaft,
  ChatVerlauf,
  LaufWerkzeuge,
  ModellInfo,
  ModellWahl,
  UnterhaltungInfo,
} from "../../../lib/chat/typen";
import { regelImSatz } from "../../../lib/modelle/ansicht";
import { antwortHerkunft } from "../../../lib/modelle/herkunft";
import { ausweichKurz, euMarke, euSatz, kennzeichnungKurz } from "../../../lib/modelle/vorgabe";
import { entwurfLesen, entwurfMerken } from "../../../lib/speicher";
import { useConversationEvents } from "../../../lib/sse/use-conversation-events";
import { BelegeFlaeche } from "./BelegeFlaeche";
import styles from "./chat.module.css";
import { useChatAvatar } from "./useChatAvatar";

export interface ChatSeiteProps {
  bereitschaft: ChatBereitschaft;
  /** Geladener Verlauf; fehlt bei einer neuen Unterhaltung. */
  verlauf?: ChatVerlauf;
  /** Nachricht, zu der der Verlauf springen soll (Treffer der Suche). */
  stelle?: string;
  /** Fassung des Startbereichs einer leeren Unterhaltung (aus dem Cookie des Browsers). */
  fassung?: StartFassung;
  /** Ob der Knopf „Schritte“ anfangs an ist (Werkzeug- und Beleg-Zeilen sichtbar); sonst immer an. */
  schritteAnfangs?: boolean;
}

const BLOCK_TEXTE = {
  etikett: t("chat.entwurf.etikett"),
  kopieren: t("chat.entwurf.kopieren"),
  kopiert: t("chat.entwurf.kopiert"),
};

/** Abstand zum unteren Rand, bis zu dem der Verlauf neuen Text automatisch mitrollt. */
const ANKLEBEN_PX = 96;
/** Wartezeit, bevor angekündigte Belege vollständig geholt werden (sie kommen oft paarweise). */
const BELEGE_WARTEN_MS = 300;
/** So oft wird das Lesen der Werkzeug-Aufrufe nach einem Fehlschlag neu versucht. */
const NACHFRAGE_VERSUCHE = 3;
/** Abstand vor dem ersten neuen Versuch; er verdoppelt sich je Versuch. */
const NACHFRAGE_ABSTAND_MS = 1000;

interface Gesendet {
  messageId: string;
  runId: string;
  zeit: string;
}

function Fehlerhinweis({
  fehler,
  onSchliessen,
}: {
  fehler: ApiErrorDetail;
  onSchliessen: () => void;
}) {
  const ziel = zielZuCode(fehler.code);
  return (
    <div className={styles.fehler} role="alert">
      <div>
        <strong>{fehler.text}</strong>
        {fehler.ausweg && <p>{fehler.ausweg}</p>}
        {ziel && (
          <Link href={ziel.href} prefetch={false} className={styles.link}>
            {ziel.text}
          </Link>
        )}
      </div>
      <button type="button" className={styles.schliessen} onClick={onSchliessen}>
        {t("chat.schliessen")}
      </button>
    </div>
  );
}

/** Name des Modells im Kopf; der Name einer Routing-Regel ist frei vergebener Text. */
function modellName(modell: ModellInfo): string {
  return modell.anbieter?.templateKey === "eurouter" ? regelImSatz(modell.name) : modell.name;
}

/** Beschriftung des Modell-Knopfs im Kopf; die Kennzeichnung von PaiBot steht getrennt vom Namen. */
function kopfBeschriftung(modell: ModellInfo): string {
  const kennzeichnung = euSatz(modell.vorgabe, modell.anbieter?.name ?? "EUrouter");
  const name = modellName(modell);
  const region = modell.herkunft ?? "";
  return kennzeichnung === undefined
    ? t("chat.kopf.modell", { name, region })
    : t("chat.kopf.modell_kennzeichnung", { name, region, kennzeichnung });
}

export function ChatSeite({
  bereitschaft,
  verlauf,
  stelle,
  fassung = STANDARD_FASSUNG,
  schritteAnfangs = true,
}: ChatSeiteProps) {
  const router = useRouter();
  const rahmen = useRahmen();
  const { unterhaltungMerken, unterhaltungEntfernen, setFlaecheOffen } = rahmen;
  const kontext = useMemo(
    () => (bereitschaft.modell ? { modell: bereitschaft.modell } : {}),
    [bereitschaft.modell],
  );
  const [unterhaltung, setUnterhaltung] = useState<UnterhaltungInfo | undefined>(
    verlauf?.unterhaltung,
  );
  const [ansicht, setAnsicht] = useState(() =>
    verlauf ? ansichtAus(verlauf, kontext) : leereAnsicht(),
  );
  // Der Kopf zeigt die Kennzeichnung nur, solange kein Lauf mit „Regel unbekannt“ endete.
  const kopfModell = useMemo(
    () => kopfModellVon(bereitschaft.modell, ansicht.eintraege),
    [bereitschaft.modell, ansicht.eintraege],
  );
  const [text, setText] = useState("");
  const avatar = useChatAvatar();
  const { neuesAnfangen, blickNeu } = avatar;
  const [schleuseAn, setSchleuseAn] = useState(
    (verlauf?.unterhaltung.schleuse ?? bereitschaft.schleuseStandard) === "on",
  );
  const [sendet, setSendet] = useState<string | undefined>();
  // Eigene Nachrichten, die schon vor dem Senden im Verlauf standen (für die vorläufige Anzeige).
  const vorSenden = useRef<ReadonlySet<string>>(new Set());
  const [fehler, setFehler] = useState<ApiErrorDetail | undefined>();
  const [schritte, setSchritte] = useState(schritteAnfangs);
  // Aufgeklappte Zwischenschritte und Werkzeug-Zeilen; ohne Eintrag sind sie zu und werden nicht gemerkt.
  const [aufgeklappt, setAufgeklappt] = useState<Record<string, boolean>>({});
  const [belegOffen, setBelegOffen] = useState<string | undefined>();
  const [dialog, setDialog] = useState<
    "umbenennen" | "loeschen" | "sichern" | "modell" | undefined
  >();
  // Gewählte Fassung je Antwort (Schlüssel: älteste Fassung); ohne Wahl die neueste.
  const [wahl, setWahl] = useState<Record<string, string>>({});
  const [neuLaeuft, setNeuLaeuft] = useState(false);
  const [ansage, setAnsage] = useState("");
  const [cursorAmEnde, setCursorAmEnde] = useState(0);
  const [eingabeFeld, setEingabeFeld] = useState<HTMLElement | null>(null);
  const verlaufRef = useRef<HTMLElement>(null);
  const eingabeRef = useRef<HTMLDivElement>(null);
  const ankleben = useRef(stelle === undefined);
  const [ziel, setZiel] = useState<string | undefined>(stelle);
  const jetzt = useMemo(() => new Date(), []);
  const { botName, zeitzone } = bereitschaft;
  const bereit = bereitschaft.modell !== undefined && bereitschaft.schluessel;
  const id = unterhaltung?.id;

  // Live-Verlauf: ab der letzten bekannten Nummer, ohne Lücke und ohne Doppel.
  const { zustand: verbindung, neuVerbinden } = useConversationEvents(
    id as ConversationId | undefined,
    {
      nachSeq: ansicht.letzteSeq,
      onEvent: (e) => {
        setAnsicht((a) => ereignisAnwenden(a, e, kontext));
        avatar.ereignis(e);
      },
    },
  );

  // Der Avatar schaut zur Schreibstelle; ein Fehler ist erledigt, sobald etwas Neues getippt wird.
  useEffect(() => {
    if (text !== "") neuesAnfangen();
    blickNeu();
  }, [text, neuesAnfangen, blickNeu]);

  // Das Eingabefeld, auf das der Sitz in der Fassung „Stille“ hört.
  useEffect(() => {
    setEingabeFeld(eingabeRef.current?.querySelector("textarea") ?? null);
  });

  // Nach einem gewählten Anfang: Fokus ins Feld, Cursor hinter den Text.
  useEffect(() => {
    if (cursorAmEnde === 0) return;
    const feld = eingabeRef.current?.querySelector("textarea");
    if (!feld) return;
    feld.focus();
    feld.setSelectionRange(feld.value.length, feld.value.length);
  }, [cursorAmEnde]);

  // Entwurf je Unterhaltung merken.
  useEffect(() => {
    if (id !== undefined) setText((alt) => alt || entwurfLesen(id));
  }, [id]);
  useEffect(() => {
    if (id !== undefined) entwurfMerken(id, text);
  }, [id, text]);

  // Angekündigte Belege vollständig holen (nicht, während die Unterhaltung gelöscht wird).
  const offeneBelege = ansicht.belege.filter((b) => !b.vollstaendig).length;
  const loescht = dialog === "loeschen";
  useEffect(() => {
    if (id === undefined || offeneBelege === 0 || loescht) return;
    let aktiv = true;
    const zeitgeber = setTimeout(async () => {
      const r = await apiFetch<{ belege: BelegKurz[] }>("GET", CHAT_PFADE.unterhaltung(id));
      if (aktiv && r.ok) setAnsicht((a) => belegeMischen(a, r.daten.belege));
    }, BELEGE_WARTEN_MS);
    return () => {
      aktiv = false;
      clearTimeout(zeitgeber);
    };
  }, [id, offeneBelege, loescht]);

  // Werkzeug-Aufrufe der Läufe holen (Fundstellen, Frage, Belege) und feste Antworten erkennen:
  // jeden offenen Lauf einzeln, einmal je Änderung am Zustand. Scheitert das Lesen, wird begrenzt
  // und mit wachsendem Abstand neu versucht (`NACHFRAGE_VERSUCHE`), nie in einer Schleife.
  const nachfragen = useMemo(() => offeneNachfragen(ansicht), [ansicht]);
  const nachfragenRef = useRef(nachfragen);
  nachfragenRef.current = nachfragen;
  const nachfrageSchluessel = nachfragen.map((n) => n.schluessel).join("§");
  const [versuche, setVersuche] = useState({ schluessel: "", n: 0 });
  const versuch = versuche.schluessel === nachfrageSchluessel ? versuche.n : 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nachfragenRef` gehört zum Schlüssel
  useEffect(() => {
    if (id === undefined || nachfrageSchluessel === "" || loescht) return;
    let aktiv = true;
    let zeitgeber: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      let gescheitert = false;
      for (const n of nachfragenRef.current) {
        const r = await apiFetch<LaufWerkzeuge>("GET", CHAT_PFADE.laufWerkzeuge(id, n.runId));
        if (!aktiv) return;
        if (r.ok) setAnsicht((a) => nachfrageUebernehmen(a, n.runId, r.daten));
        else gescheitert = true;
      }
      if (gescheitert && versuch < NACHFRAGE_VERSUCHE) {
        zeitgeber = setTimeout(
          () => {
            if (aktiv) setVersuche({ schluessel: nachfrageSchluessel, n: versuch + 1 });
          },
          NACHFRAGE_ABSTAND_MS * 2 ** versuch,
        );
      }
    })();
    return () => {
      aktiv = false;
      if (zeitgeber !== undefined) clearTimeout(zeitgeber);
    };
  }, [id, nachfrageSchluessel, versuch, loescht]);

  // Fertige Antwort im Live-Bereich ansagen (nicht jedes Stück); eine feste Antwort mit ihrem Hinweis.
  useEffect(() => {
    const fertig = ansicht.fertigeAntwort;
    if (fertig === undefined) return;
    const n = ansicht.eintraege.find((e) => e.art === "nachricht" && e.id === fertig);
    if (n?.art !== "nachricht") return;
    const kurz = n.text.length > 400 ? `${n.text.slice(0, 400)} …` : n.text;
    const hinweis = n.herkunft === "fest" ? ` (${t("schritte.fest.hinweis")})` : "";
    setAnsage(`${t("chat.antwort.fertig", { name: botName })}${hinweis}: ${kurz}`);
  }, [ansicht.fertigeAntwort, ansicht.eintraege, botName]);

  // Ein Nachschlagen beginnt: einmal ansagen (der vorläufige Text selbst wird nie vorgelesen).
  const nachschlagend = ansicht.lauf?.phase === "schlaegt_nach";
  useEffect(() => {
    if (nachschlagend) setAnsage(`${botName} ${t("schritte.phase.schlaegt_nach")}`);
  }, [nachschlagend, botName]);

  // Mitrollen, solange man unten ist.
  useEffect(() => {
    const el = verlaufRef.current;
    if (!el) return;
    const messen = () => {
      ankleben.current = el.scrollHeight - el.scrollTop - el.clientHeight < ANKLEBEN_PX;
    };
    el.addEventListener("scroll", messen, { passive: true });
    return () => el.removeEventListener("scroll", messen);
  }, []);
  useLayoutEffect(() => {
    const el = verlaufRef.current;
    if (el && ankleben.current) el.scrollTop = el.scrollHeight;
  });

  // Sprung zu einer Nachricht (Treffer der Suche): hinrollen, Fokus, kurz hervorheben.
  useEffect(() => {
    if (stelle !== undefined) setZiel(stelle);
  }, [stelle]);
  const fassungen = useMemo(
    () =>
      fassungenVon(
        ansicht.eintraege.map((e) =>
          e.art === "nachricht" ? { id: e.id, rolle: e.rolle } : { id: `ende-${e.runId}` },
        ),
      ),
    [ansicht.eintraege],
  );
  const gezeigt = useCallback(
    (f: Fassung): string => {
      const w = wahl[f.alle[0] as string];
      return w !== undefined && f.alle.includes(w) ? w : (f.alle.at(-1) as string);
    },
    [wahl],
  );
  useEffect(() => {
    if (ziel === undefined) return;
    const f = fassungen.get(ziel);
    if (f !== undefined && gezeigt(f) !== ziel) {
      setWahl((w) => ({ ...w, [f.alle[0] as string]: ziel }));
      return;
    }
    const el = document.getElementById(ankerId(ziel));
    if (id !== undefined) window.history.replaceState(null, "", unterhaltungsAdresse(id));
    if (el === null) {
      setZiel(undefined);
      setFehler({ code: "nicht_gefunden", text: t("chat.stelle.nicht_da") });
      return;
    }
    ankleben.current = false;
    el.scrollIntoView({ block: "center" });
    el.focus({ preventScroll: true });
    el.dataset.ziel = "ja";
    const zeitgeber = setTimeout(() => {
      delete el.dataset.ziel;
      setZiel(undefined);
    }, 2500);
    return () => clearTimeout(zeitgeber);
  }, [ziel, id, fassungen, gezeigt]);

  const oeffneBeleg = useCallback(
    (belegId: string | undefined) => {
      setBelegOffen(belegId);
      setFlaecheOffen(true);
    },
    [setFlaecheOffen],
  );

  async function senden(roh: string) {
    if (sendet !== undefined || sendenGesperrt(ansicht) || !bereit) return;
    if (laengenHinweis(roh, LIMITS.messageChars).art === "zu_lang") {
      // Die Eingabe leert sich nach dem Senden; der Text kommt zurück.
      queueMicrotask(() => setText(roh));
      avatar.ausdruck("kopfschuetteln");
      return;
    }
    setFehler(undefined);
    vorSenden.current = new Set(
      ansicht.eintraege.flatMap((e) => (e.art === "nachricht" && e.rolle === "du" ? [e.id] : [])),
    );
    setSendet(roh);
    neuesAnfangen();
    ankleben.current = true;
    const zurueck = (f: ApiErrorDetail) => {
      setSendet(undefined);
      setFehler(f);
      setText((stand) => stand || roh);
    };
    let ziel = unterhaltung;
    if (ziel === undefined) {
      const r = await apiFetch<{ unterhaltung: UnterhaltungInfo; zuletzt: string }>(
        "POST",
        CHAT_PFADE.unterhaltungen(),
        { title: titelAusNachricht(roh) },
      );
      if (!r.ok) return zurueck(r.fehler);
      ziel = r.daten.unterhaltung;
      setUnterhaltung(ziel);
      unterhaltungMerken({ id: ziel.id, titel: ziel.titel, zuletzt: r.daten.zuletzt });
      window.history.replaceState(null, "", unterhaltungsAdresse(ziel.id));
    }
    const modus = schleuseAn ? "on" : "off";
    const r = await apiFetch<Gesendet>("POST", CHAT_PFADE.nachrichten(ziel.id), {
      text: roh,
      schleuse: modus,
    });
    if (!r.ok) return zurueck(r.fehler);
    setAnsicht((a) => gesendet(a, { ...r.daten, text: roh }));
    setSendet(undefined);
    avatar.ausdruck("nicken");
    entwurfMerken(ziel.id, "");
    setUnterhaltung({ ...ziel, schleuse: modus });
    unterhaltungMerken({ id: ziel.id, titel: ziel.titel, zuletzt: r.daten.zeit });
  }

  async function stoppen() {
    const lauf = ansicht.lauf;
    if (id === undefined || lauf === undefined || lauf.abbruch) return;
    setAnsicht(abbruchAngefragt);
    const r = await apiFetch("POST", CHAT_PFADE.abbrechen(id, lauf.id));
    if (r.ok) return;
    setAnsicht(abbruchZurueck);
    // Schon zu Ende: dann ist nichts mehr abzubrechen, die Ereignisse zeigen das Ergebnis.
    if (r.status !== 404) setFehler(r.fehler);
  }

  async function neuErzeugen(antwortId: string): Promise<boolean> {
    if (id === undefined || ansicht.lauf !== undefined || neuLaeuft) return false;
    setNeuLaeuft(true);
    setFehler(undefined);
    ankleben.current = true;
    const r = await apiFetch<{ runId: string }>("POST", CHAT_PFADE.neuErzeugen(id, antwortId));
    setNeuLaeuft(false);
    if (!r.ok) {
      setFehler(r.fehler);
      return false;
    }
    const f = fassungen.get(antwortId);
    if (f !== undefined) {
      setWahl((w) => {
        const { [f.alle[0] as string]: _, ...rest } = w;
        return rest;
      });
    }
    setAnsicht((a) => neuErzeugt(a, r.daten));
    neuesAnfangen();
    avatar.ausdruck("anpacken");
    return true;
  }

  async function schleuseSchalten(an: boolean) {
    setSchleuseAn(an);
    if (unterhaltung === undefined) return;
    const r = await apiFetch<{ unterhaltung: UnterhaltungInfo }>(
      "PUT",
      CHAT_PFADE.schleuse(unterhaltung.id),
      { mode: an ? "on" : "off" },
    );
    if (r.ok) {
      setUnterhaltung(r.daten.unterhaltung);
      setSchleuseAn(r.daten.unterhaltung.schleuse === "on");
    } else {
      setSchleuseAn(!an);
      setFehler(r.fehler);
    }
  }

  /** Ein Anfang: sein Text kommt ins Feld, der Cursor ans Ende, nichts wird gesendet. */
  function beispiel(satz: string) {
    setText(satz);
    setCursorAmEnde((n) => n + 1);
  }

  // ---------- Kopfzeile ----------
  const lauf = ansicht.lauf;
  const botZustand = lauf ? "arbeitet" : "bereit";
  const hatText = antwortHatText(ansicht);
  const avatarZ = chatAvatarZustand(ansicht, avatar.merkmale, {
    notAus: rahmen.notAus === true,
    eingabe: text,
  });
  // Das Wort neben dem Avatar folgt seinem Zustand; „in der Schlange“ und „wird gestoppt“ sind genauer.
  const statusText = lauf?.abbruch
    ? t("chat.lauf.stoppt")
    : lauf?.phase === "wartet"
      ? t("chat.lauf.wartet")
      : lauf?.phase === "schlaegt_nach"
        ? t("schritte.phase.schlaegt_nach")
        : t(avatarWort(avatarZ));
  /** Phase des laufenden Laufs für die Zeile über der vorläufigen Anzeige. */
  const phaseArt: PhaseArt = lauf?.abbruch
    ? "stoppt"
    : lauf?.phase === "wartet"
      ? "wartet"
      : lauf?.phase === "schlaegt_nach"
        ? "schlaegt_nach"
        : hatText
          ? "schreibt"
          : "denkt";
  /** Wo im Fenster der Cursor des Eingabefelds ungefähr steht (der Avatar schaut dorthin). */
  const schreibstelle = useCallback(() => {
    const feld = eingabeRef.current?.querySelector("textarea");
    if (!feld) return null;
    const r = feld.getBoundingClientRect();
    const zeile = feld.value
      .slice(0, feld.selectionStart ?? feld.value.length)
      .split("\n")
      .pop();
    const x = r.left + 18 + Math.min((zeile ?? "").length * 8, Math.max(0, r.width - 60));
    return { x, y: r.bottom - 22 };
  }, []);
  const titel = unterhaltung?.titel ?? t("chat.titel.neu");
  const kopf = useMemo(
    () => (
      <div className={styles.kopf}>
        <span className={styles.botTitel}>
          <AvatarLebendig
            ref={avatar.avatarRef}
            farbe={bereitschaft.botFarbe}
            groesse={28}
            zustand={avatarZ}
            blickBezug={schreibstelle}
          />
          <span className={styles.botText}>
            <strong>{titel}</strong>
            <small>
              {botName} ·{" "}
              <span className={styles.status} data-zustand={botZustand}>
                {statusText}
              </span>
            </small>
          </span>
        </span>
        <span className={styles.platz} />
        <button
          type="button"
          className={styles.textKnopf}
          aria-pressed={schritte}
          title={t("chat.kopf.schritte_label")}
          onClick={() => setSchritte((s) => !s)}
        >
          <Icon name="beleg" />
          <span className={styles.nurBreit}>{t("chat.kopf.schritte")}</span>
          <span className={styles.nurLesbar}>{t("chat.kopf.schritte_label")}</span>
        </button>
        {kopfModell && (
          <Link
            href="/modelle"
            prefetch={false}
            className={styles.modellKnopf}
            aria-label={kopfBeschriftung(kopfModell)}
          >
            <span className={styles.nurBreit}>{modellName(kopfModell)}</span>
            {kopfModell.herkunft && <span className={styles.region}>{kopfModell.herkunft}</span>}
            {euMarke(kopfModell.vorgabe) !== undefined && (
              <StatusChip art="eu" className={styles.kennzeichnung}>
                {euMarke(kopfModell.vorgabe) ?? ""}
              </StatusChip>
            )}
          </Link>
        )}
        {unterhaltung && (
          <Menue
            label={t("chat.kopf.menue")}
            eintraege={[
              {
                id: "umbenennen",
                text: t("chat.umbenennen"),
                icon: "stift",
                onWaehlen: () => setDialog("umbenennen"),
              },
              {
                id: "sichern",
                text: `${t("chat.sichern")} …`,
                icon: "sichern",
                onWaehlen: () => setDialog("sichern"),
              },
              {
                id: "belege",
                text: t("chat.menue.belege"),
                icon: "beleg",
                onWaehlen: () => oeffneBeleg(undefined),
              },
              {
                id: "loeschen",
                text: `${t("chat.loeschen")} …`,
                icon: "papierkorb",
                gefahr: true,
                onWaehlen: () => setDialog("loeschen"),
              },
            ]}
          />
        )}
      </div>
    ),
    [
      bereitschaft.botFarbe,
      kopfModell,
      avatar.avatarRef,
      avatarZ,
      botName,
      botZustand,
      schreibstelle,
      oeffneBeleg,
      schritte,
      statusText,
      titel,
      unterhaltung,
    ],
  );
  useKopf(kopf);

  // ---------- Arbeitsfläche ----------
  const flaeche = useMemo(
    () =>
      unterhaltung === undefined
        ? undefined
        : {
            inhalt: (
              <BelegeFlaeche
                belege={ansicht.belege}
                zeitzone={zeitzone}
                botName={botName}
                {...(belegOffen === undefined ? {} : { offen: belegOffen })}
                onOeffnen={setBelegOffen}
              />
            ),
            zahl: ansicht.belege.length,
          },
    [unterhaltung, ansicht.belege, zeitzone, botName, belegOffen],
  );
  useFlaeche(flaeche);

  // ---------- Verlauf ----------
  function antwortZeile(n: AnsichtNachricht): ReactNode {
    if (!schritte) return null;
    if (n.zustand === "streamt") {
      return (
        <p className={styles.arbeitet}>
          <span className={styles.status} data-zustand="arbeitet">
            {lauf?.phase === "wartet"
              ? t("chat.lauf.wartet")
              : t(avatarWort(hatText ? "schreibt" : "denkt"))}
          </span>
          <span>{t("chat.lauf.beleg_folgt")}</span>
        </p>
      );
    }
    const b = belegZurAntwort(ansicht.belege, n.runId);
    const beleg =
      b?.seq === undefined
        ? undefined
        : {
            kennung: belegKennung(b.seq),
            zustand: "offen" as const,
            zustandText: t("chat.beleg.zeile"),
            onPruefen: () => oeffneBeleg(b.id),
          };
    // Ohne eigene Modell-Angabe der Nachricht gilt das heutige Modell des Bots nur dem Namen nach:
    // seine Vorgabe sagt nichts darüber, was zur Zeit der Antwort galt.
    const modell = n.modell ?? (bereitschaft.modell && ohneVorgabe(bereitschaft.modell));
    if (n.route === undefined || modell === undefined) {
      return beleg ? (
        <div className={styles.nurBeleg}>
          <BelegZeile beleg={beleg} />
        </div>
      ) : null;
    }
    const satz = kennzeichnungKurz(modell.vorgabe);
    const marke = euMarke(modell.vorgabe);
    const herkunft = [
      ausweichKurz(modell.vorgabe),
      antwortHerkunft(modell.anbieter, n.servedBy, bereitschaft.unterAnbieter),
    ]
      .filter((teil): teil is string => teil !== undefined)
      .join(" · ");
    // Antwort aus mehreren Schritten: Modell und Unter-Anbieter je Schritt, dazu die Zahl der Aufrufe.
    const kette = n.runId === undefined ? [] : schritteVon(ansicht, n.runId);
    const mehrere =
      kette.length > 0
        ? herkunftKette(
            kette,
            { modell, ...(n.servedBy === undefined ? {} : { servedBy: n.servedBy }) },
            bereitschaft.modell,
            bereitschaft.unterAnbieter,
          )
        : undefined;
    const anzahl = zahlWerkzeuge(kette);
    return (
      <AntwortZeile
        {...(beleg ? { beleg } : {})}
        schleuse={wegAngabe(n.route)}
        modell={{
          name: modell.name,
          ...(modell.anbieter?.templateKey === "eurouter" ? { nameFrei: true } : {}),
          ...(satz === undefined || marke === undefined ? {} : { kennzeichnung: { marke, satz } }),
          ...(herkunft === "" ? {} : { herkunft }),
        }}
        {...(mehrere === undefined ? {} : { schritte: mehrere })}
        {...(anzahl > 0 ? { werkzeuge: anzahl } : {})}
      />
    );
  }

  /** Klappt eine Zeile oder einen Zwischenschritt auf oder zu. */
  function umschalten(schluessel: string) {
    setAufgeklappt((a) => ({ ...a, [schluessel]: !a[schluessel] }));
  }

  /** Eine Werkzeug-Zeile; der Zustand kommt nur aus dem Aufruf, Beleg und Regel aus den Belegen. */
  function werkzeugZeile(w: AnsichtWerkzeug) {
    const { beleg, ...rest } = werkzeugZeileAngaben(w, ansicht.belege);
    const schluessel = `w:${w.actionId}`;
    return (
      <WerkzeugZeile
        key={schluessel}
        {...rest}
        {...(beleg === undefined
          ? {}
          : { beleg: { kennung: beleg.kennung, onOeffnen: () => oeffneBeleg(beleg.id) } })}
        offen={aufgeklappt[schluessel] === true}
        onUmschalten={() => umschalten(schluessel)}
      />
    );
  }

  /**
   * Ein Schritt über der Antwort: sein Text (vorläufig, eingeklappter Zwischenschritt, verworfen
   * oder abgebrochen) und seine Werkzeug-Zeilen. Der Knopf „Schritte“ blendet Werkzeug-Zeilen und
   * eingeklappte Zwischenschritte aus; vorläufiger Text, „verworfen“ und „abgebrochen“ bleiben.
   */
  function schrittElement(x: AnsichtSchritt): ReactNode {
    const schluessel = `s:${x.runId}:${x.step}`;
    const teile: ReactNode[] = [];
    if (x.text !== "") {
      if (x.ende === "laeuft" || x.ende === "antwort") {
        teile.push(<VorlaeufigerText key="text" name={botName} zustand="laeuft" text={x.text} />);
      } else if (x.ende === "abgebrochen") {
        teile.push(
          <VorlaeufigerText key="text" name={botName} zustand="abgebrochen" text={x.text} />,
        );
      } else if (x.ende === "verworfen" || schritte) {
        teile.push(
          <Zwischenschritt
            key="text"
            name={botName}
            art={x.ende}
            text={x.text}
            offen={aufgeklappt[schluessel] === true}
            onUmschalten={() => umschalten(schluessel)}
          />,
        );
      }
    }
    if (schritte) {
      for (const w of [...x.werkzeuge].sort((a, b) => a.position - b.position)) {
        teile.push(werkzeugZeile(w));
      }
    }
    return teile.length === 0 ? null : <Fragment key={schluessel}>{teile}</Fragment>;
  }

  /** Alle Schritte eines Laufs, die gerade etwas zu zeigen haben. */
  function schrittListe(runId: string): ReactNode[] {
    return schritteVon(ansicht, runId)
      .filter(schrittSichtbar)
      .map(schrittElement)
      .filter((e) => e !== null);
  }

  /** Block des Bots ohne Blase: die Schritte eines Laufs, der noch keine Antwort hat (oder keine bekam). */
  function schrittBlock(runId: string, aktiv: boolean): ReactNode {
    return (
      <ChatBubble
        key={`schritte-${runId}`}
        von="bot"
        name={botName}
        avatar={antwortAvatar(aktiv)}
        ohneBlase
        zustand={aktiv ? "streamt" : "fertig"}
        davor={
          <>
            {aktiv && <Phase art={phaseArt} />}
            {schrittListe(runId)}
          </>
        }
      />
    );
  }

  /** Avatar neben einer Antwort: steht still; nur die laufende Antwort zeigt, was der Bot tut. */
  function antwortAvatar(arbeitet: boolean) {
    return (
      <AvatarLebendig
        farbe={bereitschaft.botFarbe}
        groesse={30}
        zustand={arbeitet ? (hatText ? "schreibt" : "denkt") : "ruhig"}
        still
      />
    );
  }

  function nachricht(n: AnsichtNachricht): ReactNode {
    if (n.rolle === "du") {
      return (
        <ChatBubble key={n.id} von="du" zeit={uhrzeit(n.zeit, zeitzone)}>
          <span className={styles.duText}>{n.text}</span>
        </ChatBubble>
      );
    }
    const zustand =
      n.zustand === "fehler" ? "fehler" : n.zustand === "abgebrochen" ? "abgebrochen" : n.zustand;
    const schleuseArt =
      n.zustand === "fehler" && n.fehlerCode
        ? schleuseFehlerArt({
            ergebnis: "fehlgeschlagen",
            code: n.fehlerCode,
            ueberSchleuse: n.route === "schleuse",
          })
        : undefined;
    const hinweis =
      n.zustand === "abgebrochen"
        ? n.fehlerCode === "angehalten"
          ? t("notaus.chat.angehalten_teil")
          : t("chat.ende.abgebrochen_teil")
        : schleuseArt
          ? schleuseFehler(schleuseArt).text
          : n.zustand === "fehler"
            ? (n.fehlerText ?? (n.fehlerCode ? errorText(n.fehlerCode) : t("fehler.intern")))
            : undefined;
    const ziel = schleuseArt
      ? zielZuSchleuseFehler(schleuseArt)
      : n.zustand === "fehler" && n.fehlerCode
        ? zielZuCode(n.fehlerCode)
        : undefined;
    const davor = n.runId === undefined ? [] : schrittListe(n.runId);
    return (
      <ChatBubble
        key={n.id}
        von="bot"
        name={botName}
        zeit={uhrzeit(n.zeit, zeitzone)}
        avatar={antwortAvatar(n.zustand === "streamt")}
        zustand={zustand}
        {...(hinweis ? { zustandText: hinweis } : {})}
        {...(davor.length > 0 ? { davor: <>{davor}</> } : {})}
        fuss={
          <>
            {ziel && (
              <Link href={ziel.href} prefetch={false} className={styles.link}>
                {ziel.text}
              </Link>
            )}
            {n.herkunft === "fest" && <FestHinweis />}
            {antwortZeile(n)}
            {fassungsZeile(n)}
          </>
        }
      >
        {n.text === "" ? (
          <span className={styles.leise}>{t("chat.antwort.denkt", { name: botName })}</span>
        ) : (
          <Markdown
            text={n.text}
            blockTexte={BLOCK_TEXTE}
            fremd={n.fremd === true || n.zustand === "streamt" || n.herkunftOffen === true}
            onKopiert={() => avatar.ausdruck("zwinkern")}
          />
        )}
      </ChatBubble>
    );
  }

  const erzeugbar = neuErzeugbar(ansicht);
  const letzteNachricht = ansicht.eintraege
    .filter((e): e is AnsichtNachricht => e.art === "nachricht")
    .at(-1);
  const letzteGruppe =
    letzteNachricht?.rolle === "bot" ? fassungen.get(letzteNachricht.id)?.alle : undefined;

  /** Fassungen blättern und „neu erzeugen“ unter einer Antwort des Bots. */
  function fassungsZeile(n: AnsichtNachricht): ReactNode {
    const f = fassungen.get(n.id);
    if (f === undefined) return null;
    const letzte = letzteGruppe?.includes(n.id) ?? false;
    if (f.von < 2 && !letzte) return null;
    const blaettern = (schritt: number) => {
      const ziel = f.alle[f.nr - 1 + schritt];
      if (ziel !== undefined) setWahl((w) => ({ ...w, [f.alle[0] as string]: ziel }));
    };
    const andere = (bereitschaft.waehlbar ?? []).filter((m) => m.id !== bereitschaft.modellId);
    const ziel = letzteNachricht?.id;
    const angehalten = rahmen.notAus === true;
    const gesperrt =
      lauf !== undefined ||
      neuLaeuft ||
      !bereit ||
      angehalten ||
      erzeugbar === undefined ||
      erzeugbar.id !== ziel;
    return (
      <div className={styles.fassungen}>
        {f.von > 1 && (
          <span className={styles.blaettern}>
            <button
              type="button"
              className={styles.blatt}
              aria-label={t("chat.fassung.vorige")}
              title={t("chat.fassung.vorige")}
              disabled={f.nr === 1}
              onClick={() => blaettern(-1)}
            >
              <Icon name="links" groesse={14} />
            </button>
            <span className={styles.fassungText} aria-live="polite">
              {f.nr < f.von
                ? t("chat.fassung.frueher", { nr: f.nr, von: f.von })
                : t("chat.fassung", { nr: f.nr, von: f.von })}
            </span>
            <button
              type="button"
              className={styles.blatt}
              aria-label={t("chat.fassung.naechste")}
              title={t("chat.fassung.naechste")}
              disabled={f.nr === f.von}
              onClick={() => blaettern(1)}
            >
              <Icon name="rechts" groesse={14} />
            </button>
          </span>
        )}
        {letzte && ziel !== undefined && (n.id === ziel || lauf !== undefined) && (
          <span className={styles.neuErzeugen}>
            <Button
              art="leise"
              icon="neuLaden"
              laedt={neuLaeuft}
              disabled={gesperrt}
              aria-describedby={gesperrt && lauf ? "pb-neu-gesperrt" : undefined}
              onClick={() => void neuErzeugen(ziel)}
            >
              {t("chat.neu_erzeugen")}
            </Button>
            {andere.length > 0 && (
              <Menue
                label={t("chat.neu_erzeugen.label")}
                icon="runter"
                eintraege={[
                  {
                    id: "anderes",
                    text: t("chat.neu_erzeugen.anderes"),
                    icon: "neuLaden",
                    deaktiviert: gesperrt,
                    onWaehlen: () => setDialog("modell"),
                  },
                ]}
              />
            )}
          </span>
        )}
        {letzte && angehalten && lauf === undefined && (
          <span className={styles.leise}>{t("chat.neu_erzeugen.angehalten")}</span>
        )}
        {letzte && lauf !== undefined && (
          <span id="pb-neu-gesperrt" className={styles.leise}>
            {t("chat.neu_erzeugen.gesperrt", { name: botName })}
          </span>
        )}
        {f.nr < f.von && <span className={styles.leise}>{t("chat.fassung.ersetzt")}</span>}
      </div>
    );
  }

  function laufEnde(e: AnsichtLaufEnde): ReactNode {
    const schleuseArt = schleuseFehlerArt({
      ergebnis: e.ergebnis,
      code: e.code,
      schleuseGemeldet: e.schleuseGrund !== undefined,
    });
    const schleuse = schleuseArt ? schleuseFehler(schleuseArt) : undefined;
    const budget = tagesbudgetAusweg(e, [
      e.text,
      ...ansicht.belege
        .filter((x) => x.runId === e.runId && x.art === "decision")
        .map((x) => x.entscheidung?.grund),
    ]);
    const ziel =
      budget?.ziel ?? (schleuseArt ? zielZuSchleuseFehler(schleuseArt) : zielZuCode(e.code));
    const b = belegZurAntwort(ansicht.belege, e.runId);
    const ueberschrift =
      e.ergebnis === "abgebrochen"
        ? e.code === "angehalten"
          ? t("notaus.chat.angehalten", { name: botName })
          : t("chat.ende.abgebrochen", { name: botName })
        : e.ergebnis === "abgelehnt"
          ? t("chat.ende.abgelehnt")
          : t("chat.antwort.fehlgeschlagen");
    const satz =
      e.ergebnis === "abgebrochen" ? undefined : (schleuse?.text ?? e.text ?? errorText(e.code));
    const ausweg =
      e.ergebnis === "abgebrochen"
        ? undefined
        : (budget?.ausweg ?? schleuse?.ausweg ?? errorWayOut(e.code));
    return (
      <ChatBubble
        key={`ende-${e.runId}`}
        von="bot"
        name={botName}
        zeit={uhrzeit(e.zeit, zeitzone)}
        avatar={antwortAvatar(false)}
        zustand={e.ergebnis === "abgebrochen" ? "abgebrochen" : "fehler"}
        fuss={
          schritte && b?.seq !== undefined ? (
            <div className={styles.nurBeleg}>
              <BelegZeile
                beleg={{
                  kennung: belegKennung(b.seq),
                  zustand: "offen",
                  zustandText: t("chat.beleg.zeile"),
                  onPruefen: () => oeffneBeleg(b.id),
                }}
              />
            </div>
          ) : undefined
        }
      >
        <div className={styles.ende}>
          <strong>{ueberschrift}</strong>
          {satz && <p>{satz}</p>}
          {e.schleuseGrund && !schleuse && (
            <p>{t("chat.ende.schleuse", { grund: e.schleuseGrund })}</p>
          )}
          {ausweg && <p className={styles.leise}>{ausweg}</p>}
          {ziel && (
            <Link href={ziel.href} prefetch={false} className={styles.link}>
              {ziel.text}
            </Link>
          )}
        </div>
      </ChatBubble>
    );
  }

  function eintrag(e: AnsichtEintrag): ReactNode {
    const schluessel = e.art === "nachricht" ? e.id : `ende-${e.runId}`;
    return (
      <div key={schluessel} id={ankerId(schluessel)} className={styles.anker} tabIndex={-1}>
        {e.art === "nachricht" ? nachricht(e) : laufEnde(e)}
      </div>
    );
  }

  const mitTagen: ReactNode[] = [];
  let tag = "";
  for (const e of ansicht.eintraege) {
    if (e.art === "nachricht" && e.rolle === "bot") {
      const f = fassungen.get(e.id);
      if (f !== undefined && f.von > 1 && gezeigt(f) !== e.id) continue;
    }
    const neu = tagSchluessel(e.zeit, zeitzone);
    if (neu !== tag) {
      tag = neu;
      mitTagen.push(
        <span key={`tag-${neu}`} className={styles.tag}>
          {tagText(e.zeit, zeitzone, jetzt)}
        </span>,
      );
    }
    // Ein Lauf ohne Antwort zeigt seine Schritte (z. B. den abgebrochenen Text) vor seinem Hinweis.
    if (e.art === "lauf-ende" && schrittListe(e.runId).length > 0) {
      mitTagen.push(schrittBlock(e.runId, false));
    }
    mitTagen.push(eintrag(e));
  }
  const streamtSchon = ansicht.eintraege.some(
    (e) => e.art === "nachricht" && e.rolle === "bot" && e.runId === lauf?.id,
  );
  // Hat der Lauf schon etwas zu zeigen (vorläufigen Text oder einen Aufruf), ersetzt das den Platzhalter.
  const laufSchritte = lauf !== undefined && schrittListe(lauf.id).length > 0;
  const leer = ansicht.eintraege.length === 0 && sendet === undefined;
  // Kam die Nachricht schon über den Ereignis-Strom, steht sie im Verlauf; die vorläufige entfällt.
  const vorlaeufig =
    sendet !== undefined &&
    !ansicht.eintraege.some(
      (e) =>
        e.art === "nachricht" &&
        e.rolle === "du" &&
        e.text === sendet &&
        !vorSenden.current.has(e.id),
    );

  const nichtBereit = !bereit ? (
    <EmptyState
      bild={<AvatarLebendig farbe={bereitschaft.botFarbe} groesse={56} still />}
      titel={
        bereitschaft.modell === undefined
          ? t("chat.kein_modell.titel", { name: botName })
          : t("chat.kein_schluessel.titel")
      }
      text={
        <p className={styles.absatz}>
          {bereitschaft.modell === undefined
            ? t("chat.kein_modell.text", { name: botName })
            : t("chat.kein_schluessel.text", { name: botName })}
        </p>
      }
      aktion={
        <Link href="/modelle" prefetch={false} className={styles.primaerLink}>
          {t("chat.ziel.modelle")}
        </Link>
      }
    />
  ) : null;

  // ---------- Startbereich der leeren Unterhaltung ----------
  const notAus = rahmen.notAus;
  const tageszeit = tageszeitIn(jetzt, zeitzone);
  const startAvatar = (zustand: typeof avatarZ, mitZeiger: boolean) => (
    <AvatarLebendig
      farbe={bereitschaft.botFarbe}
      groesse={112}
      zustand={zustand}
      folgtZeiger={mitZeiger}
      blickBezug={schreibstelle}
    />
  );
  const startUnterhaltungen = rahmen.unterhaltungen.flatMap((u) => {
    const zeit = kurzTagText(u.zuletzt, zeitzone, jetzt);
    return zeit === undefined ? [] : [{ id: u.id, titel: u.titel, zeit }];
  });
  const startDaten = {
    avatar: startAvatar(avatarZ, true),
    avatarNotAus: startAvatar("angehalten", false),
    avatarKlein: <AvatarLebendig farbe={bereitschaft.botFarbe} groesse={18} still />,
    botName,
    ...(bereitschaft.modell === undefined ? {} : { modell: bereitschaft.modell.name }),
    ...(bereitschaft.modell?.herkunft === undefined
      ? {}
      : { herkunftText: bereitschaft.modell.herkunft }),
    schleuseAn,
    ...(notAus === undefined ? {} : { notAus }),
    belege: bereitschaft.belegeGesamt,
    unterhaltungen: startUnterhaltungen,
    ...(tageszeit === undefined ? {} : { tageszeit }),
    onAnfang: beispiel,
    onUnterhaltung: (id: string) => router.push(unterhaltungsAdresse(id)),
  };

  const laenge = laengenHinweis(text, LIMITS.messageChars);
  const schleuseHinweis = !bereitschaft.schleuseInstalliert ? (
    <>
      {t("chat.schleuse.nicht_eingerichtet")}{" "}
      <Link href="/datenschleuse" prefetch={false} className={styles.link}>
        {t("chat.schleuse.zuschalten")}
      </Link>
    </>
  ) : ansicht.schleuseBlockiert && schleuseAn ? (
    <>
      {t("chat.schleuse.nicht_bereit")}{" "}
      <Link href="/datenschleuse" prefetch={false} className={styles.link}>
        {t("chat.ziel.datenschleuse")}
      </Link>
    </>
  ) : null;
  const hinweise =
    laenge.art !== "ok" || schleuseHinweis ? (
      <div className={styles.hinweise}>
        {laenge.art !== "ok" && (
          <p
            className={styles.laenge}
            data-art={laenge.art}
            {...(laenge.art === "zu_lang" ? { role: "alert" } : {})}
          >
            {laenge.text}
          </p>
        )}
        {schleuseHinweis && <p className={styles.notizZeile}>{schleuseHinweis}</p>}
      </div>
    ) : null;

  return (
    <div className={styles.seite}>
      <ScrollBereich
        ref={verlaufRef}
        className={styles.verlauf}
        role="log"
        aria-live="off"
        label={t("chat.verlauf")}
      >
        <div className={styles.spalte}>
          {leer && !bereit && nichtBereit}
          {leer && bereit && <Startbereich fassung={fassung} {...startDaten} />}
          {mitTagen}
          {vorlaeufig && (
            <div className={styles.ausstehend} aria-busy="true">
              <ChatBubble von="du" zeit={t("chat.ausstehend")}>
                <span className={styles.duText}>{sendet}</span>
              </ChatBubble>
            </div>
          )}
          {lauf && !streamtSchon && laufSchritte && schrittBlock(lauf.id, true)}
          {lauf && !streamtSchon && !laufSchritte && (
            <ChatBubble
              von="bot"
              name={botName}
              avatar={antwortAvatar(true)}
              zustand="streamt"
              fuss={
                schritte ? (
                  <p className={styles.arbeitet}>
                    <span className={styles.status} data-zustand="arbeitet">
                      {lauf.abbruch
                        ? t("chat.lauf.stoppt")
                        : lauf.phase === "wartet"
                          ? t("chat.lauf.wartet")
                          : t(avatarWort(hatText ? "schreibt" : "denkt"))}
                    </span>
                    <span>{t("chat.lauf.beleg_folgt")}</span>
                  </p>
                ) : undefined
              }
            >
              <span className={styles.leise}>{t("chat.antwort.denkt", { name: botName })}</span>
            </ChatBubble>
          )}
        </div>
      </ScrollBereich>
      <p className={styles.nurLesbar} aria-live="polite">
        {ansage}
      </p>
      <div className={styles.unten} ref={eingabeRef}>
        {verbindung !== "verbunden" && id !== undefined && (
          <div className={styles.verbindung} role="status">
            {verbindung === "verbindet_neu" ? (
              <span>{t("chat.verbindung.neu")}</span>
            ) : (
              <>
                <span>{t("chat.verbindung.getrennt")}</span>
                <button type="button" className={styles.link} onClick={neuVerbinden}>
                  {t("chat.verbindung.knopf")}
                </button>
              </>
            )}
          </div>
        )}
        {fehler && <Fehlerhinweis fehler={fehler} onSchliessen={() => setFehler(undefined)} />}
        {!leer && nichtBereit}
        {hinweise}
        {leer && bereit && fassung === "stille" && (
          <StartStilleSitz
            avatar={startAvatar(avatarZ, true)}
            {...(notAus === undefined ? {} : { notAus })}
            onAnfang={beispiel}
            eingabe={eingabeFeld}
            leer={text === ""}
          />
        )}
        <ChatEingabe
          wert={text}
          onWert={setText}
          onSenden={(roh) => void senden(roh)}
          laeuft={lauf !== undefined}
          onStopp={() => void stoppen()}
          schleuseAn={schleuseAn}
          onSchleuse={(an) => void schleuseSchalten(an)}
          schleuseDeaktiviert={!bereitschaft.schleuseInstalliert && !schleuseAn}
          platzhalter={
            rahmen.notAus === true
              ? t("notaus.chat.eingabe")
              : t("chat.eingabe.platzhalter_bot", { name: botName })
          }
          deaktiviert={!bereit || sendet !== undefined || rahmen.notAus === true}
          notiz={t("chat.notiz", { name: botName })}
        />
      </div>

      <Dialog
        offen={dialog === "umbenennen"}
        onSchliessen={() => setDialog(undefined)}
        titel={t("chat.umbenennen.titel")}
        schliessenLabel={t("chat.schliessen")}
      >
        {unterhaltung && (
          <Umbenennen
            unterhaltung={unterhaltung}
            onFertig={(u) => {
              setUnterhaltung(u);
              const alt = rahmen.unterhaltungen.find((x) => x.id === u.id);
              unterhaltungMerken({
                id: u.id,
                titel: u.titel,
                zuletzt: alt?.zuletzt ?? new Date().toISOString(),
              });
              setDialog(undefined);
            }}
            onAbbrechen={() => setDialog(undefined)}
          />
        )}
      </Dialog>
      <Dialog
        offen={dialog === "modell"}
        onSchliessen={() => setDialog(undefined)}
        titel={t("chat.neu_erzeugen.wahl.titel")}
        schliessenLabel={t("chat.schliessen")}
      >
        {letzteNachricht && (
          <AnderesModell
            modelle={(bereitschaft.waehlbar ?? []).filter((m) => m.id !== bereitschaft.modellId)}
            botName={botName}
            onAbbrechen={() => setDialog(undefined)}
            onNeu={async () => {
              const ok = await neuErzeugen(letzteNachricht.id);
              if (ok) {
                setDialog(undefined);
                router.refresh();
              }
              return ok;
            }}
          />
        )}
      </Dialog>
      <Dialog
        offen={dialog === "sichern"}
        onSchliessen={() => setDialog(undefined)}
        titel={t("chat.sichern.titel")}
        schliessenLabel={t("chat.schliessen")}
      >
        {unterhaltung && (
          <Sichern
            unterhaltung={unterhaltung}
            leer={!ansicht.eintraege.some((e) => e.art === "nachricht")}
            laeuft={lauf !== undefined}
            botName={botName}
            onAbbrechen={() => setDialog(undefined)}
          />
        )}
      </Dialog>
      <Dialog
        offen={dialog === "loeschen"}
        onSchliessen={() => setDialog(undefined)}
        titel={t("chat.loeschen.frage", { titel })}
        schliessenLabel={t("chat.schliessen")}
        rueckfrage
      >
        {unterhaltung && (
          <Loeschen
            unterhaltung={unterhaltung}
            onFertig={() => {
              entwurfMerken(unterhaltung.id, "");
              unterhaltungEntfernen(unterhaltung.id);
              setDialog(undefined);
              router.push("/");
            }}
            onAbbrechen={() => setDialog(undefined)}
          />
        )}
      </Dialog>
    </div>
  );
}

/** Kennung des Elements einer Nachricht im Verlauf (Sprungziel der Suche). */
function ankerId(nachrichtId: string): string {
  return `nachricht-${nachrichtId}`;
}

function Umbenennen({
  unterhaltung,
  onFertig,
  onAbbrechen,
}: {
  unterhaltung: UnterhaltungInfo;
  onFertig: (u: UnterhaltungInfo) => void;
  onAbbrechen: () => void;
}) {
  const [wert, setWert] = useState(unterhaltung.titel);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();
  async function speichern() {
    const titel = wert.trim();
    if (titel === "") {
      setFehler(t("fehler.eingabe_ungueltig"));
      return;
    }
    setLaeuft(true);
    const r = await apiFetch<{ unterhaltung: UnterhaltungInfo }>(
      "PATCH",
      CHAT_PFADE.unterhaltung(unterhaltung.id),
      { title: titel },
    );
    setLaeuft(false);
    if (r.ok) onFertig(r.daten.unterhaltung);
    else setFehler(r.fehler.text);
  }
  return (
    <form
      className={styles.dialogForm}
      onSubmit={(e) => {
        e.preventDefault();
        void speichern();
      }}
    >
      <TextField
        label={t("chat.umbenennen.feld")}
        value={wert}
        maxLength={LIMITS.conversationTitleChars}
        onChange={(e) => setWert(e.target.value)}
        {...(fehler ? { fehler } : {})}
        data-erster-fokus
      />
      <div className={styles.dialogAktionen}>
        <Button art="zweit" onClick={onAbbrechen}>
          {t("allgemein.abbrechen")}
        </Button>
        <Button art="primaer" type="submit" laedt={laeuft}>
          {t("allgemein.speichern")}
        </Button>
      </div>
    </form>
  );
}

function AnderesModell({
  modelle,
  botName,
  onAbbrechen,
  onNeu,
}: {
  modelle: readonly ModellWahl[];
  botName: string;
  onAbbrechen: () => void;
  onNeu: () => Promise<boolean>;
}) {
  const [wert, setWert] = useState(modelle[0]?.id ?? "");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<ApiErrorDetail | undefined>();
  const gewaehlt = modelle.find((m) => m.id === wert);
  async function los() {
    if (gewaehlt === undefined) return;
    setLaeuft(true);
    setFehler(undefined);
    const r = await apiFetch("PUT", "/api/bot/modell", { modelId: gewaehlt.id });
    if (!r.ok) {
      setLaeuft(false);
      setFehler(r.fehler);
      return;
    }
    await onNeu();
    setLaeuft(false);
  }
  if (modelle.length === 0) {
    return (
      <div className={styles.dialogForm}>
        <p className={styles.absatz}>{t("chat.neu_erzeugen.wahl.leer")}</p>
        <div className={styles.dialogAktionen}>
          <Button art="zweit" onClick={onAbbrechen} data-erster-fokus>
            {t("chat.schliessen")}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form
      className={styles.dialogForm}
      onSubmit={(e) => {
        e.preventDefault();
        void los();
      }}
    >
      <p className={styles.absatz}>{t("chat.neu_erzeugen.wahl.text", { name: botName })}</p>
      <Select
        label={t("chat.neu_erzeugen.wahl.feld")}
        value={wert}
        onChange={(e) => setWert(e.target.value)}
        optionen={modelle.map((m) => ({
          wert: m.id,
          text: m.herkunft === undefined ? m.name : `${m.name} · ${m.herkunft}`,
        }))}
        data-erster-fokus
      />
      {fehler && (
        <p className={styles.dialogFehler} role="alert">
          {fehler.text} {fehler.ausweg}
        </p>
      )}
      <div className={styles.dialogAktionen}>
        <Button art="zweit" onClick={onAbbrechen}>
          {t("allgemein.abbrechen")}
        </Button>
        <Button art="primaer" type="submit" icon="neuLaden" laedt={laeuft}>
          {t("chat.neu_erzeugen.mit", { modell: gewaehlt?.name ?? "" })}
        </Button>
      </div>
    </form>
  );
}

function Sichern({
  unterhaltung,
  leer,
  laeuft: antwortLaeuft,
  botName,
  onAbbrechen,
}: {
  unterhaltung: UnterhaltungInfo;
  leer: boolean;
  laeuft: boolean;
  botName: string;
  onAbbrechen: () => void;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<ApiErrorDetail | undefined>();
  const [fertig, setFertig] = useState<string | undefined>();
  async function sichern() {
    setLaeuft(true);
    setFehler(undefined);
    setFertig(undefined);
    const r = await apiDatei("POST", CHAT_PFADE.export(unterhaltung.id));
    setLaeuft(false);
    if (!r.ok) {
      setFehler(r.fehler);
      return;
    }
    dateiSichern(r.name, r.inhalt, "text/markdown");
    setFertig(r.name);
  }
  return (
    <div className={styles.dialogForm}>
      <p className={styles.absatz}>{t("chat.sichern.text")}</p>
      <p className={styles.dialogHinweis}>
        <Icon name="info" />
        <span>{t("chat.sichern.hinweis")}</span>
      </p>
      {leer && <p className={styles.absatz}>{t("chat.sichern.leer")}</p>}
      {antwortLaeuft && (
        <p className={styles.absatz}>{t("chat.sichern.lauf", { name: botName })}</p>
      )}
      {fehler && (
        <p className={styles.dialogFehler} role="alert">
          {fehler.text} {fehler.ausweg}
        </p>
      )}
      <p className={styles.dialogErfolg} role="status">
        {fertig ? t("chat.sichern.fertig", { datei: fertig }) : ""}
      </p>
      <div className={styles.dialogAktionen}>
        <Button art="zweit" onClick={onAbbrechen} data-erster-fokus>
          {fertig ? t("chat.schliessen") : t("allgemein.abbrechen")}
        </Button>
        <Button art="primaer" icon="sichern" laedt={laeuft} onClick={() => void sichern()}>
          {laeuft ? t("chat.sichern.laeuft") : t("chat.sichern.knopf")}
        </Button>
      </div>
    </div>
  );
}

function Loeschen({
  unterhaltung,
  onFertig,
  onAbbrechen,
}: {
  unterhaltung: UnterhaltungInfo;
  onFertig: () => void;
  onAbbrechen: () => void;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<ApiErrorDetail | undefined>();
  async function loeschen() {
    setLaeuft(true);
    const r = await apiFetch("DELETE", CHAT_PFADE.unterhaltung(unterhaltung.id));
    setLaeuft(false);
    if (r.ok) onFertig();
    else setFehler(r.fehler);
  }
  return (
    <div className={styles.dialogForm}>
      <p className={styles.absatz}>{t("chat.loeschen.text")}</p>
      {fehler && (
        <p className={styles.dialogFehler} role="alert">
          {fehler.text} {fehler.ausweg}
        </p>
      )}
      <div className={styles.dialogAktionen}>
        <Button art="zweit" onClick={onAbbrechen} data-erster-fokus>
          {t("allgemein.abbrechen")}
        </Button>
        <Button art="gefahr" laedt={laeuft} onClick={() => void loeschen()}>
          {t("allgemein.loeschen")}
        </Button>
      </div>
    </div>
  );
}
