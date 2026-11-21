/**
 * PaiBot – Beispiel-Daten der Fäden: erfundenes Team „Studio“, nur für Vorschau, Tests und Bilder.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { FadenSzene } from "./Ansicht";
import type { EingabeBot } from "./Eingabe";
import { ergebnisZeile, gueltigeMoeglichkeiten, markiereDran } from "./funktionen";
import type {
  Beitrag,
  BelegInfo,
  BelegZeile,
  Etappe,
  FadenBot,
  FadenKopfDaten,
  Frage,
  GespraechsEintrag,
  LeistenDaten,
  SeitenleisteDaten,
  StabPlatz,
  ZettelDaten,
  Ziel,
  Zulieferung,
} from "./typen";

/** Namen der Szenen der Vorschau. */
export const SZENEN = [
  { id: "leer", text: "Leer (noch kein Team)" },
  { id: "arbeitet", text: "Team arbeitet" },
  { id: "wartet", text: "Wartet auf dich" },
  { id: "fertig", text: "Fertig mit Ergebnis" },
  { id: "angehalten", text: "Angehalten (Not-Aus)" },
  { id: "grenze", text: "Grenze erreicht" },
  { id: "gross", text: "Großer Faden (9 Ziele, 8 Mitglieder)" },
] as const;
export type SzenenId = (typeof SZENEN)[number]["id"];

type Zustand = FadenBot["zustand"];

const bot = (
  id: string,
  name: string,
  rolle: string,
  farbe: FadenBot["farbe"],
  zustand: Zustand = "ruhig",
  stand = "ruhig",
  standArt?: FadenBot["standArt"],
  leitung?: boolean,
): FadenBot => ({
  id,
  name,
  rolle,
  farbe,
  zustand,
  stand,
  ...(standArt ? { standArt } : {}),
  ...(leitung ? { leitung } : {}),
});

function basisBots(): Record<string, FadenBot> {
  const liste = [
    bot("pai", "Pai", "dein Haupt-Assistent", "limette"),
    bot("mila", "Mila", "Leitung", "tuerkis", "ruhig", "führt", undefined, true),
    bot("ben", "Ben", "Grafik", "violett"),
    bot("ida", "Ida", "Video", "pink"),
    bot("juri", "Juri", "Text", "blau"),
    bot("lou", "Lou", "Musik und Ton", "gelb"),
    bot("kim", "Kim", "Social Media", "gruen"),
    bot("noa", "Noa", "Fotos", "orange"),
    bot("eli", "Eli", "Webseite", "blau"),
    bot("sam", "Sam", "Termine", "pink"),
    bot("otto", "Otto", "Leitung", "orange", "ruhig", "ruhig", undefined, true),
  ];
  return Object.fromEntries(liste.map((b) => [b.id, b]));
}

function setze(
  bots: Record<string, FadenBot>,
  id: string,
  zustand: Zustand,
  stand: string,
  standArt?: FadenBot["standArt"],
) {
  const alt = bots[id];
  if (!alt) return;
  const { standArt: _weg, ...rest } = alt;
  bots[id] = { ...rest, zustand, stand, ...(standArt ? { standArt } : {}) };
}

const beleg = (nr: number, was: string, weg: string, zeit: string, grenze?: string): BelegInfo => ({
  nr,
  was,
  weg,
  zeit,
  ...(grenze ? { grenze } : {}),
});

const ziel = (
  id: string,
  text: string,
  stand: Ziel["stand"],
  botId?: string,
  hinweis?: string,
): Ziel => ({
  id,
  text,
  stand,
  ...(botId ? { botId } : {}),
  ...(hinweis ? { hinweis } : {}),
});

const eingabeBots = (
  bots: Record<string, FadenBot>,
  ids: string[],
  pausiert = false,
): EingabeBot[] =>
  ids.flatMap((id) => {
    const b = bots[id];
    return b
      ? [
          {
            id,
            name: b.name,
            aufgabe: b.id === "mila" ? "Leitung: verteilt, schaut drüber" : b.rolle,
            farbe: b.farbe,
            ...(pausiert ? { pausiert } : {}),
          },
        ]
      : [];
  });

const paiFaeden = [
  { id: "pf1", titel: "Wie steht es in allen Teams?", stand: "" },
  { id: "pf2", titel: "Newsletter April", stand: "über Studio" },
];

const ZETTEL_TOEPFER: ZettelDaten = {
  von: "Mila",
  ziel: "Plakat und 20-Sekunden-Video für den Töpferkurs im März",
  fertigWenn: [
    "Titel und Zeilen stehen",
    "Plakat A3 mit Titel, Datum, Preis",
    "Drehplan für 20 Sekunden",
  ],
  abnahme: "leitung",
  grenzen: "40.000 Token · Tiefe 2 · 30 Minuten",
  belege: beleg(
    401,
    "Auftragszettel angelegt",
    "Mila → Juri, Ben, Ida",
    "14:31:08",
    "40.000 Token · Tiefe 2 · 30 Min",
  ),
};

const seiteStudio = (
  aktiv: string,
  stand: {
    faden: string;
    art?: "warn" | "aktiv";
    botFaden?: string;
    botFadenArt?: "warn" | "aktiv";
  },
  extra: Partial<SeitenleisteDaten> = {},
): SeitenleisteDaten => ({
  notAus: false,
  fragenAnzahl: 0,
  paiFaeden,
  teams: [
    {
      id: "studio",
      name: "Studio",
      leitung: "mila",
      mitglieder: ["ben", "ida", "juri", "lou", "kim"],
      offen: true,
      botFaeden: {
        ben: [
          {
            id: "bf1",
            titel: "Töpferkurs-Plakat",
            stand: stand.botFaden ?? "dran",
            ...(stand.botFadenArt
              ? { standArt: stand.botFadenArt }
              : { standArt: "aktiv" as const }),
          },
        ],
      },
      faeden: [
        {
          id: aktiv,
          titel: "Töpferkurs: Plakat und Video",
          stand: stand.faden,
          ...(stand.art ? { standArt: stand.art } : {}),
        },
        { id: "f2", titel: "Newsletter April", stand: "1 Frage", standArt: "warn" },
        { id: "f3", titel: "Neue Visitenkarte", stand: "fertig" },
      ],
    },
  ],
  weitereTeams: [{ id: "alltag", name: "Alltag", anzahl: 3, leitungId: "otto" }],
  ...extra,
});

function beitrag(b: Omit<Beitrag, "art">): Beitrag {
  return { art: "beitrag", ...b };
}

const duBeitrag: Beitrag = beitrag({
  id: "b1",
  von: "du",
  zeit: "14:30",
  text: "Mach mir ein Plakat und ein 20-Sekunden-Video für den Töpferkurs im März.",
  filter: "ergebnis",
  route: "mila",
});

const zulJuri: Zulieferung = {
  id: "z1",
  titel: "Titel und Zeilen",
  meta: "3 Titel · 6 Zeilen",
  von: "juri",
  an: "mila",
  symbol: "doku",
  beleg: beleg(402, "Zulieferung: Titel und Zeilen", "Juri → Mila", "14:32:41"),
};

const zulIda: Zulieferung = {
  id: "z2",
  titel: "Drehplan, Szene 2",
  meta: "0:06 bis 0:11 · Nahaufnahme Hände",
  von: "ida",
  an: "ben",
  symbol: "auge",
  beleg: beleg(406, "Zulieferung: Drehplan, Szene 2", "Ida → Ben", "14:35:50"),
};

/** Gemeinsamer Anfang des kleinen Fadens (bis zum Schritt „Team arbeitet“). */
function gespraechAnfang(): GespraechsEintrag[] {
  return [
    duBeitrag,
    beitrag({
      id: "b2",
      von: "mila",
      zeit: "14:31",
      text: "Verstanden. Juri, schreib bitte Titel und Zeilen. Ben und Ida, ihr wartet auf seinen Text.",
      filter: "ergebnis",
      beleg: beleg(400, "Übergabe an Juri", "Mila → Juri", "14:31:02"),
      zeilen: [
        {
          art: "uebergabe",
          an: "Juri",
          ergebnis: "erlaubt",
          zettel: ZETTEL_TOEPFER,
          beleg: beleg(
            401,
            "Auftragszettel angelegt",
            "Mila → Juri",
            "14:31:08",
            "40.000 Token · Tiefe 2 · 30 Min",
          ),
        },
      ],
    }),
    beitrag({
      id: "b3",
      von: "juri",
      zeit: "14:32",
      text: "Titel und Zeilen sind fertig: drei Titel zur Wahl, dazu sechs kurze Zeilen für Plakat und Video.",
      filter: "detail",
      zulieferungen: [zulJuri],
    }),
    beitrag({
      id: "b4",
      von: "mila",
      zeit: "14:33",
      text: "Danke, Juri, gefällt mir. @Ben @Ida, ihr seid dran, Juris Text hängt an.",
      filter: "ergebnis",
      beleg: beleg(403, "Übergabe an Ben und Ida", "Mila → Ben, Ida", "14:33:12"),
    }),
    beitrag({
      id: "b5",
      von: "ben",
      zeit: "14:34",
      text: "@Ida, kurze Bitte: Welches Bild ist die Schlüsselszene in deinem Video? Dann nehme ich dasselbe Motiv fürs Plakat, das wirkt wie aus einem Guss.",
      filter: "detail",
      direkteBitte: beleg(
        405,
        "Direkte Bitte unter Kollegen (1 von 1 erlaubt)",
        "Ben → Ida",
        "14:34:20",
      ),
    }),
    beitrag({
      id: "b6",
      von: "ida",
      zeit: "14:35",
      text: "Gute Idee! Szene 2: Hände formen einen Becher auf der Scheibe, ganz nah. Hier der Ausschnitt aus meinem Drehplan.",
      filter: "detail",
      zulieferungen: [zulIda],
    }),
  ];
}

const FRAGE_IDA: Frage = {
  id: "q1",
  botId: "ida",
  text: "Musik unter das Video oder nur das Geräusch der Scheibe?",
  vorschlaege: gueltigeMoeglichkeiten(["Leise Musik", "Nur Geräusch"]),
};
const FRAGE_BEN: Frage = {
  id: "q2",
  botId: "ben",
  text: "Soll der Preis aufs Plakat?",
  vorschlaege: gueltigeMoeglichkeiten(["Ja, Preis drauf", "Nein"]),
};

const KRITERIEN_KLEIN = (
  stand: [Ziel["stand"], Ziel["stand"], Ziel["stand"], Ziel["stand"]],
): Etappe[] => [
  {
    id: "e1",
    ziele: [
      ziel("k1", "Titel und Zeilen", stand[0], "juri"),
      ziel("k2", "Plakat A3 mit Preis", stand[1], "ben"),
      ziel("k3", "Drehplan 20 s", stand[2], "ida"),
      ziel("k4", "Abnahme durch Mila", stand[3], "mila"),
    ],
  },
];

function stab(
  bots: Record<string, FadenBot>,
  wort: Record<string, { wort: string; art?: "warn" | "aktiv" }>,
  dran: string[],
): StabPlatz[] {
  const reihe = ["mila", "juri", "ben", "ida"] as const;
  const plaetze: StabPlatz[] = reihe.flatMap((id) => {
    const b = bots[id];
    const w = wort[id];
    return b && w
      ? [
          {
            id,
            name: b.name,
            wort: w.wort,
            ...(w.art ? { wortArt: w.art } : {}),
            farbe: b.farbe,
            zustand: b.zustand,
            ...(id === "mila" ? { fuehrt: true } : {}),
          } satisfies StabPlatz,
        ]
      : [];
  });
  const du = wort.du;
  plaetze.push({
    id: "du",
    name: "Du",
    wort: du?.wort ?? "liest mit",
    ...(du?.art ? { wortArt: du.art } : {}),
  });
  return markiereDran(plaetze, dran);
}

function kopfKlein(
  o: Partial<FadenKopfDaten> &
    Pick<FadenKopfDaten, "stand" | "standText" | "etappen" | "stab" | "budget">,
): FadenKopfDaten {
  return {
    id: "faden-toepfer",
    titel: "Plakat und 20-Sekunden-Video für den Töpferkurs",
    abnahme: "Mila",
    tiefe: { an: 2, max: 2 },
    beteiligte: 5,
    ...o,
  };
}

function szeneArbeitet(): FadenSzene {
  const bots = basisBots();
  setze(bots, "juri", "fertig", "geliefert");
  setze(bots, "ben", "schreibt", "Plakat", "aktiv");
  setze(bots, "ida", "schreibt", "Drehplan", "aktiv");
  return {
    id: "faden-toepfer",
    teamName: "Studio",
    leitung: "mila",
    bots,
    sichtbarBeiPai: true,
    aufrufText: "Aufrufen:",
    seitenleiste: seiteStudio("f1", { faden: "läuft", art: "aktiv" }, { fragenAnzahl: 1 }),
    kopf: kopfKlein({
      stand: "laeuft",
      standText: "läuft · 8 Min",
      etappen: KRITERIEN_KLEIN(["erledigt", "laeuft", "laeuft", "offen"]),
      stab: stab(
        bots,
        {
          mila: { wort: "führt" },
          juri: { wort: "geliefert" },
          ben: { wort: "Plakat", art: "aktiv" },
          ida: { wort: "Drehplan", art: "aktiv" },
          du: { wort: "liest mit" },
        },
        ["ben", "ida"],
      ),
      budget: { prozent: 38 },
    }),
    gespraech: gespraechAnfang(),
    eingabeBots: eingabeBots(bots, ["mila", "ben", "ida", "juri", "lou", "kim"]),
  };
}

function szeneWartet(): FadenSzene {
  const bots = basisBots();
  setze(bots, "juri", "ruhig", "geliefert");
  setze(bots, "ben", "wartet", "fragt dich", "warn");
  setze(bots, "ida", "wartet", "fragt dich", "warn");
  const gesp = [
    ...gespraechAnfang(),
    beitrag({
      id: "b7",
      von: "ida",
      zeit: "14:36",
      text: "Eine Frage an dich: Soll Musik unter das Video, oder nur das Geräusch der Scheibe?",
      filter: "frage",
      fragt: true,
    }),
    beitrag({
      id: "b8",
      von: "ben",
      zeit: "14:36",
      text: "Und fürs Plakat: Soll der Preis drauf?",
      filter: "frage",
      fragt: true,
    }),
  ];
  return {
    id: "faden-toepfer",
    teamName: "Studio",
    leitung: "mila",
    bots,
    sichtbarBeiPai: true,
    seitenleiste: seiteStudio(
      "f1",
      { faden: "wartet", art: "warn", botFaden: "heute", botFadenArt: undefined },
      { fragenAnzahl: 3 },
    ),
    kopf: kopfKlein({
      stand: "wartet_auf_dich",
      standText: "wartet auf dich",
      etappen: KRITERIEN_KLEIN(["erledigt", "wartet", "wartet", "offen"]),
      stab: stab(
        bots,
        {
          mila: { wort: "führt" },
          juri: { wort: "geliefert" },
          ben: { wort: "fragt dich", art: "warn" },
          ida: { wort: "fragt dich", art: "warn" },
          du: { wort: "2 Fragen", art: "warn" },
        },
        ["du"],
      ),
      budget: { prozent: 48 },
      fragen: [FRAGE_IDA, FRAGE_BEN],
    }),
    gespraech: gesp,
    eingabeBots: eingabeBots(bots, ["mila", "ben", "ida", "juri", "lou", "kim"]),
  };
}

function szeneFertig(): FadenSzene {
  const bots = basisBots();
  setze(bots, "mila", "fertig", "abgenommen");
  const lieferungen = [{ text: "Plakat-Entwurf" }, { text: "Drehplan" }];
  const z = ergebnisZeile({ beitraege: 12, autoren: ["Mila", "Juri", "Ben", "Ida"], lieferungen });
  const gesp: GespraechsEintrag[] = [
    { art: "trenner", id: "t1", text: "Faden „Töpferkurs“ · Team Studio · heute" },
    {
      art: "gruppe",
      id: "g1",
      autoren: ["juri", "ben", "ida", "mila"],
      kopf: z.kopf,
      ergebnis: z.ergebnis,
      filter: "detail",
      inhalt: [],
    },
    beitrag({
      id: "b9",
      von: "mila",
      zeit: "14:47",
      text: "Jetzt passt alles. Abgenommen, das Ergebnis steht oben.",
      filter: "ergebnis",
      abnahme: { text: "alle Punkte erfüllt", fertig: true },
      beleg: beleg(420, "Abnahme", "Mila", "14:47:09"),
    }),
  ];
  return {
    id: "faden-toepfer-fertig",
    teamName: "Studio",
    leitung: "mila",
    bots,
    sichtbarBeiPai: true,
    seitenleiste: seiteStudio(
      "f1",
      { faden: "fertig", botFaden: "heute", botFadenArt: undefined },
      { fragenAnzahl: 1 },
    ),
    kopf: kopfKlein({
      stand: "fertig",
      standText: "fertig",
      etappen: KRITERIEN_KLEIN(["erledigt", "erledigt", "erledigt", "erledigt"]),
      stab: stab(
        bots,
        {
          mila: { wort: "abgenommen" },
          juri: { wort: "ruhig" },
          ben: { wort: "ruhig" },
          ida: { wort: "ruhig" },
          du: { wort: "ruhig" },
        },
        [],
      ),
      budget: { prozent: 68 },
      ergebnis: {
        titel: "Plakat und Drehplan",
        untertitel: "von Mila abgenommen · 14:47 · 4 von 4 Punkten erfüllt",
        lieferungen: [
          {
            id: "l1",
            titel: "Plakat-Entwurf",
            meta: "A3 hoch · Fassung 2",
            symbol: "plakat",
            beleg: beleg(421, "Lieferung: Plakat-Entwurf", "Ben → Mila", "14:44:30"),
          },
          {
            id: "l2",
            titel: "Drehplan",
            meta: "4 Szenen · 20 Sekunden",
            symbol: "auge",
            beleg: beleg(422, "Lieferung: Drehplan", "Ida → Mila", "14:45:10"),
          },
        ],
        uebergaben: "10 Übergaben, alle mit Beleg",
        dauer: "17 Min",
      },
    }),
    gespraech: gesp,
    eingabeBots: eingabeBots(bots, ["mila", "ben", "ida", "juri", "lou", "kim"]),
  };
}

function szeneAngehalten(): FadenSzene {
  const bots = basisBots();
  for (const id of Object.keys(bots)) setze(bots, id, "angehalten", "angehalten");
  setze(bots, "pai", "ruhig", "ruhig");
  return {
    id: "faden-toepfer-halt",
    teamName: "Studio",
    leitung: "mila",
    bots,
    sichtbarBeiPai: true,
    halt: true,
    seitenleiste: seiteStudio(
      "f1",
      { faden: "angehalten", botFaden: "angehalten", botFadenArt: undefined },
      { notAus: true },
    ),
    kopf: kopfKlein({
      stand: "angehalten",
      standText: "angehalten",
      etappen: KRITERIEN_KLEIN(["erledigt", "laeuft", "laeuft", "offen"]),
      stab: stab(
        bots,
        {
          mila: { wort: "angehalten" },
          juri: { wort: "geliefert" },
          ben: { wort: "angehalten" },
          ida: { wort: "angehalten" },
          du: { wort: "liest mit" },
        },
        [],
      ),
      budget: { prozent: 38 },
    }),
    gespraech: [
      ...gespraechAnfang(),
      {
        art: "band",
        id: "h1",
        titel: "Alle Bots sind angehalten.",
        text: "Nichts läuft weiter, bis du fortsetzt.",
        ton: "halt",
      },
    ],
    eingabeBots: eingabeBots(bots, ["mila", "ben", "ida", "juri", "lou", "kim"], true),
  };
}

function szeneGrenze(): FadenSzene {
  const bots = basisBots();
  setze(bots, "mila", "angehalten", "pausiert");
  setze(bots, "juri", "ruhig", "geliefert");
  setze(bots, "ben", "ruhig", "geliefert");
  setze(bots, "ida", "ruhig", "geliefert");
  const gesp = [
    ...gespraechAnfang(),
    {
      art: "grenze" as const,
      id: "gr1",
      zeit: "14:46",
      titel: "Das Budget dieses Fadens ist aufgebraucht.",
      text: "Ben hat das Plakat nachgebessert. Mila konnte noch nicht drüberschauen. Es läuft nichts weiter, bis du wählst.",
      zuschlaege: { benutzt: 0, max: 5 },
      beleg: beleg(430, "Grenze erreicht: Budget des Auftrags", "Tor", "14:46:02", "40.000 Token"),
      wahl: [
        {
          id: "zuschlag",
          art: "zuschlag" as const,
          titel: "",
          text: "Mila schaut drüber · reicht laut bisherigem Verbrauch für eine Abnahme",
          empfohlen: true,
        },
        {
          id: "selbst",
          art: "selbst" as const,
          titel: "Ich schaue selbst drüber",
          text: "Abnahme geht an dich, kein Budget nötig",
        },
        {
          id: "abschliessen",
          art: "abschliessen" as const,
          titel: "So abschließen",
          text: "ohne Abnahme, alles bleibt im Faden",
        },
      ],
    },
  ];
  return {
    id: "faden-toepfer-grenze",
    teamName: "Studio",
    leitung: "mila",
    bots,
    sichtbarBeiPai: true,
    seitenleiste: seiteStudio(
      "f1",
      { faden: "wartet", art: "warn", botFaden: "heute", botFadenArt: undefined },
      { fragenAnzahl: 2, fragenText: "2 Punkte" },
    ),
    kopf: kopfKlein({
      stand: "grenze",
      standText: "Grenze erreicht",
      etappen: KRITERIEN_KLEIN(["erledigt", "erledigt", "erledigt", "offen"]),
      stab: stab(
        bots,
        {
          mila: { wort: "pausiert" },
          juri: { wort: "geliefert" },
          ben: { wort: "geliefert" },
          ida: { wort: "geliefert" },
          du: { wort: "entscheidest", art: "warn" },
        },
        ["du"],
      ),
      budget: { prozent: 100 },
    }),
    gespraech: gesp,
    eingabeBots: eingabeBots(bots, ["mila", "ben", "ida", "juri", "lou", "kim"]),
  };
}

function szeneGross(): FadenSzene {
  const bots = basisBots();
  setze(bots, "ida", "schreibt", "Drehplan", "aktiv");
  setze(bots, "eli", "wartet", "fragt dich", "warn");
  setze(bots, "kim", "wartet", "fragt dich", "warn");
  setze(bots, "sam", "wartet", "fragt dich", "warn");
  setze(bots, "ben", "ruhig", "als Nächstes");
  setze(bots, "juri", "ruhig", "geliefert");
  setze(bots, "noa", "ruhig", "geliefert");
  const etappen: Etappe[] = [
    {
      id: "g-e1",
      name: "Entwurf",
      ziele: [
        ziel("g1", "Titel und Texte", "erledigt", "juri", "geliefert, abgenommen"),
        ziel("g2", "Fotos auswählen", "erledigt", "noa", "12 Fotos"),
        ziel("g3", "Plakat-Entwürfe", "erledigt", "ben", "2 Fassungen"),
      ],
    },
    {
      id: "g-e2",
      name: "Feinschliff",
      ziele: [
        ziel("g4", "Drehplan Kurs-Video", "laeuft", "ida", "Ida schreibt"),
        ziel("g5", "Webseite-Text", "wartet", "eli", "Eli fragt dich: Preise?"),
        ziel("g6", "Social-Posts", "wartet", "kim", "Kim wartet auf Ida und dich"),
        ziel("g7", "Termine als Text", "erledigt", "sam", "geliefert"),
      ],
    },
    {
      id: "g-e3",
      name: "Abnahme",
      ziele: [
        ziel("g8", "Druckdateien Plakate", "offen", "ben", "als Nächstes: Ben"),
        ziel("g9", "Abnahme durch Mila", "offen", "mila", "am Ende"),
      ],
    },
  ];
  const fragen: Frage[] = [
    {
      id: "gq1",
      botId: "eli",
      text: "Sollen die Preise auf die Webseite?",
      vorschlaege: gueltigeMoeglichkeiten(["Ja, mit Preisen", "Nein, „auf Anfrage“"]),
    },
    {
      id: "gq2",
      botId: "kim",
      text: "Posts nur für Instagram oder auch für den Newsletter?",
      vorschlaege: gueltigeMoeglichkeiten(["Nur Instagram", "Beides"]),
    },
    {
      id: "gq3",
      botId: "sam",
      text: "Sollen die Termine auch in den Newsletter?",
      vorschlaege: gueltigeMoeglichkeiten(["Ja", "Nein"]),
    },
  ];
  const lief: Zulieferung[] = [
    { id: "gl1", titel: "Titel und Texte", von: "juri", an: "mila", meta: "", symbol: "doku" },
    { id: "gl2", titel: "12 Fotos", von: "noa", an: "ben", meta: "", symbol: "auge" },
    { id: "gl3", titel: "Plakat-Entwürfe", von: "ben", an: "mila", meta: "", symbol: "doku" },
    { id: "gl4", titel: "Termine als Text", von: "sam", an: "eli", meta: "", symbol: "doku" },
    { id: "gl5", titel: "Fotoauswahl Webseite", von: "noa", an: "eli", meta: "", symbol: "auge" },
    { id: "gl6", titel: "Szenenliste", von: "ida", an: "mila", meta: "", symbol: "auge" },
  ];
  const belege: BelegZeile[] = (
    [
      ["09:12", "Du → Mila", "Auftrag", false],
      ["09:13", "Mila → Juri, Noa, Ben", "Etappe 1", false],
      ["09:40", "Noa → Ben", "12 Fotos", false],
      ["10:38", "Mila", "Abnahme Etappe 1", false],
      ["10:41", "Mila → Ida, Eli, Kim, Sam", "Etappe 2", false],
      ["11:02", "Kim → Ida", "direkte Bitte", true],
      ["11:05", "Eli, Kim, Sam → dich", "3 Fragen", true],
    ] as const
  ).map(([zeit, weg, was, markiert], i) => ({
    zeit,
    weg,
    was,
    ...(markiert ? { markiert } : {}),
    info: beleg(550 + i, was, weg, zeit),
  }));
  const eg = ergebnisZeile({
    beitraege: 18,
    autoren: ["Mila", "Juri", "Noa", "Ben"],
    lieferungen: [{ text: "Titel und Texte" }, { text: "12 Fotos" }, { text: "2 Plakat-Entwürfe" }],
  });
  const eg2 = ergebnisZeile({
    beitraege: 9,
    autoren: ["Sam", "Eli", "Noa"],
    lieferungen: [{ text: "Termine als Text" }, { text: "Fotoauswahl für die Webseite" }],
  });
  const ZETTEL_E2: ZettelDaten = {
    von: "Mila",
    ziel: "Feinschliff: Drehplan, Webseite-Text, Social-Posts, Termine",
    fertigWenn: [
      "Drehplan steht",
      "Webseite-Text mit Preisen",
      "Social-Posts für drei Tage",
      "Termine als Text",
    ],
    abnahme: "leitung",
    grenzen: "60.000 Token · Tiefe 2",
    belege: beleg(
      520,
      "Auftragszettel Etappe 2",
      "Mila → Ida, Eli, Kim, Sam",
      "10:41:30",
      "Tiefe 2 · Budget des Fadens",
    ),
  };
  const gesp: GespraechsEintrag[] = [
    { art: "trenner", id: "gt", text: "Faden „Frühjahrs-Programm“ · seit 09:12" },
    {
      art: "gruppe",
      id: "gg1",
      titel: "Etappe 1 · Entwurf",
      autoren: ["mila", "juri", "noa", "ben"],
      kopf: eg.kopf,
      ergebnis: eg.ergebnis,
      abgenommen: true,
      filter: "ergebnis",
      inhalt: [
        beitrag({
          id: "gg1a",
          von: "juri",
          zeit: "09:30",
          text: "Titel und Texte sind fertig.",
          filter: "detail",
        }),
      ],
    },
    beitrag({
      id: "gb1",
      von: "mila",
      zeit: "10:41",
      text: "Etappe 1 ist abgenommen, danke euch. Jetzt Feinschliff: @Ida Drehplan, @Eli Webseite-Text, @Kim Social-Posts, @Sam Termine. @Ben, du bist danach mit den Druckdateien dran.",
      filter: "ergebnis",
      zeilen: [
        {
          art: "uebergabe",
          an: "Ida",
          ergebnis: "erlaubt",
          zettel: ZETTEL_E2,
          beleg: beleg(520, "Auftragszettel Etappe 2", "Mila → Ida", "10:41:30"),
        },
        {
          art: "uebergabe",
          an: "Eli",
          ergebnis: "erlaubt",
          zettelText: "Webseite-Text mit Preisen für alle drei Kurse.",
          beleg: beleg(521, "Übergabe an Eli", "Mila → Eli", "10:41:31"),
        },
        {
          art: "uebergabe",
          an: "Kim",
          ergebnis: "erlaubt",
          zettelText: "Social-Posts für drei Tage.",
          beleg: beleg(522, "Übergabe an Kim", "Mila → Kim", "10:41:32"),
        },
        {
          art: "uebergabe",
          an: "Sam",
          ergebnis: "erlaubt",
          zettelText: "Termine als Text.",
          beleg: beleg(523, "Übergabe an Sam", "Mila → Sam", "10:41:33"),
        },
      ],
    }),
    {
      art: "gruppe",
      id: "gg2",
      autoren: ["sam", "eli", "noa"],
      kopf: eg2.kopf,
      ergebnis: eg2.ergebnis,
      filter: "detail",
      inhalt: [
        beitrag({
          id: "gg2a",
          von: "sam",
          zeit: "10:50",
          text: "Die Termine stehen als Text bereit.",
          filter: "detail",
        }),
      ],
    },
    beitrag({
      id: "gb2",
      von: "kim",
      zeit: "11:02",
      text: "@Ida, kurze Bitte: Schick mir drei Standbilder für die Posts, sobald dein Drehplan steht.",
      filter: "detail",
      direkteBitte: beleg(
        531,
        "Direkte Bitte unter Kollegen (1 von 1 erlaubt)",
        "Kim → Ida",
        "11:02:14",
      ),
    }),
    beitrag({
      id: "gb3",
      von: "ida",
      zeit: "11:03",
      text: "Mach ich, in etwa zehn Minuten.",
      filter: "detail",
    }),
    beitrag({
      id: "gb4",
      von: "eli",
      zeit: "11:05",
      text: "Eine Frage an dich: Sollen die Preise auf die Webseite? Kim und Sam haben auch je eine Frage, alle drei stehen gesammelt unter Fragen.",
      filter: "frage",
      fragt: true,
    }),
  ];
  const alle = ["ida", "eli", "kim", "sam", "ben", "juri", "noa", "lou"];
  const stabPlaetze = markiereDran(
    [
      {
        id: "mila",
        name: "Mila",
        wort: "führt",
        farbe: bots.mila?.farbe ?? "tuerkis",
        fuehrt: true,
      },
      { id: "ida", name: "Ida", wort: "Drehplan", farbe: "pink", zustand: "schreibt" },
      { id: "ben", name: "Ben", wort: "als Nächstes", farbe: "violett", naechste: true },
    ],
    ["ida"],
  );
  const weitere: StabPlatz[] = ["eli", "kim", "sam", "juri", "noa"].map((id) => ({
    id,
    name: bots[id]?.name ?? id,
    wort: "",
    ...(bots[id] ? { farbe: bots[id].farbe, zustand: bots[id].zustand } : {}),
  }));
  const leiste: LeistenDaten = {
    etappen,
    naechstOffen: {
      titel: "Drehplan Kurs-Video",
      text: "Ida schreibt · Kim wartet auf ihre Standbilder",
    },
    lieferungen: lief,
    fragen,
    belege,
    belegeText: "7 von 34 Belegen · alle im Nur-Anhängen-Protokoll",
    beteiligte: ["mila", ...alle],
    fuehrt: "mila",
    dran: ["ida"],
    naechste: ["ben"],
  };
  return {
    id: "faden-fruehjahr",
    teamName: "Studio",
    leitung: "mila",
    bots,
    sichtbarBeiPai: false,
    mitglieder: 9,
    beteiligt: 7,
    aufrufText: "Beteiligt:",
    seitenleiste: {
      notAus: false,
      fragenAnzahl: 3,
      paiFaeden,
      teams: [
        {
          id: "studio",
          name: "Studio",
          leitung: "mila",
          mitglieder: alle,
          offen: true,
          botFaeden: {
            ida: [
              { id: "gbf1", titel: "Frühjahrs-Programm", stand: "dran", standArt: "aktiv" },
              { id: "gbf2", titel: "Töpferkurs-Dreh…", stand: "gestern" },
            ],
          },
          faeden: [
            {
              id: "faden-fruehjahr",
              titel: "Frühjahrs-Programm",
              stand: "3 Fragen",
              standArt: "warn",
            },
            { id: "f1", titel: "Töpferkurs: Plakat und Video", stand: "fertig" },
            { id: "f2", titel: "Newsletter April", stand: "1 Frage", standArt: "warn" },
          ],
        },
      ],
      weitereTeams: [{ id: "alltag", name: "Alltag", anzahl: 3, leitungId: "otto" }],
    },
    kopf: {
      id: "faden-fruehjahr",
      titel: "Frühjahrs-Programm: drei Kurse bewerben",
      abnahme: "Mila",
      stand: "wartet_auf_dich",
      standText: "3 Fragen an dich",
      etappen,
      stab: stabPlaetze,
      weitere,
      budget: { prozent: 46 },
      tiefe: { an: 2, max: 2 },
      beteiligte: 8,
      fragen,
    },
    leiste,
    gespraech: gesp,
    eingabeBots: eingabeBots(bots, [
      "mila",
      "ida",
      "eli",
      "kim",
      "sam",
      "ben",
      "juri",
      "noa",
      "lou",
    ]),
  };
}

function szeneLeer(): FadenSzene {
  const bots = basisBots();
  return {
    id: "leer",
    teamName: "",
    leitung: "mila",
    bots,
    seitenleiste: { notAus: false, fragenAnzahl: 0, paiFaeden, teams: [] },
    gespraech: [],
    eingabeBots: [],
  };
}

/** Eine Szene der Vorschau mit allen Beispiel-Daten; jedes Mal neu, damit nichts geteilt wird. */
export function beispielSzene(id: SzenenId): FadenSzene {
  switch (id) {
    case "leer":
      return szeneLeer();
    case "arbeitet":
      return szeneArbeitet();
    case "wartet":
      return szeneWartet();
    case "fertig":
      return szeneFertig();
    case "angehalten":
      return szeneAngehalten();
    case "grenze":
      return szeneGrenze();
    case "gross":
      return szeneGross();
  }
}

/** Ein Beispiel für Bot-Text mit allem, was entschärft werden muss (Tests und Vorschau). */
export const GEFAEHRLICHER_TEXT =
  'Hallo <script>alert(1)</script> <img src="https://beispiel.invalid/x.png"> [Link](https://beispiel.invalid/a?b=geheim) \u202ekcatta\u202c';
