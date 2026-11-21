/**
 * PaiBot – Kein Kreis im Auftragsbaum
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/**
 * Fakten zum Kreis im Auftragsbaum: ist der Empfänger der Geber selbst oder einer seiner
 * Vorfahren? Die Funktion liefert nur Fakten („Kreis erkannt“, Tiefe) und entscheidet nichts;
 * ob eine Übergabe abgelehnt wird, entscheidet allein das Tor.
 */

export interface AuftragsKnoten {
  readonly id: string;
  /** `null` bei der Wurzel. */
  readonly elternId: string | null;
  readonly botId: string;
}

export interface KreisFakten {
  /** Der Auftrag des Gebers steht im Baum. */
  readonly auftragBekannt: boolean;
  /** Der Baum ließ sich bis zur Wurzel lesen (keine Schleife, kein fehlender Elternknoten, keine doppelte Kennung, nicht zu lang). */
  readonly baumLesbar: boolean;
  /** Der Empfänger ist der Bot des Gebers. */
  readonly empfaengerIstGeber: boolean;
  /** Der Empfänger ist ein Bot über dem Geber im Baum. */
  readonly empfaengerIstVorfahre: boolean;
  /** `empfaengerIstGeber` oder `empfaengerIstVorfahre`: der Empfänger arbeitet schon im Strang. */
  readonly kreisErkannt: boolean;
  /** Tiefe des neuen Auftrags (Tiefe des Gebers + 1, Wurzel = 0); `null`, wenn der Baum nicht lesbar ist. */
  readonly tiefeDesNeuen: number | null;
}

/** Ein Baum aus Tausenden Ebenen ist kein Baum mehr; die Suche nach oben bricht dort ab. */
const MAX_KETTE = 1_000;

const UNBEKANNT: KreisFakten = {
  auftragBekannt: false,
  baumLesbar: false,
  empfaengerIstGeber: false,
  empfaengerIstVorfahre: false,
  kreisErkannt: false,
  tiefeDesNeuen: null,
};

/**
 * Ermittelt die Kreis-Fakten für eine Übergabe vom Auftrag `vonAuftragId` an `anBotId`. Wirft nie;
 * ein kaputter Baum (Schleife, fehlender Elternknoten, doppelte Kennung) steht als
 * `baumLesbar = false`. Bot-Kennungen werden genau verglichen.
 */
export function ermittleKreisFakten(
  knoten: readonly AuftragsKnoten[],
  vonAuftragId: string,
  anBotId: string,
): KreisFakten {
  const nachId = new Map<string, AuftragsKnoten>();
  let doppelt = false;
  for (const k of knoten) {
    if (nachId.has(k.id)) doppelt = true;
    nachId.set(k.id, k);
  }
  let aktuell = nachId.get(vonAuftragId);
  if (!aktuell) return UNBEKANNT;
  const geber = aktuell.botId === anBotId;
  const unlesbar: KreisFakten = {
    auftragBekannt: true,
    baumLesbar: false,
    empfaengerIstGeber: geber,
    empfaengerIstVorfahre: false,
    kreisErkannt: geber,
    tiefeDesNeuen: null,
  };
  if (doppelt) return unlesbar;
  const besucht = new Set<string>([aktuell.id]);
  let abstand = 0;
  let vorfahre = false;
  while (aktuell.elternId !== null) {
    const eltern = nachId.get(aktuell.elternId);
    if (!eltern || besucht.has(eltern.id) || abstand >= MAX_KETTE) {
      return { ...unlesbar, empfaengerIstVorfahre: vorfahre, kreisErkannt: geber || vorfahre };
    }
    if (eltern.botId === anBotId) vorfahre = true;
    besucht.add(eltern.id);
    aktuell = eltern;
    abstand += 1;
  }
  return {
    auftragBekannt: true,
    baumLesbar: true,
    empfaengerIstGeber: geber,
    empfaengerIstVorfahre: vorfahre,
    kreisErkannt: geber || vorfahre,
    tiefeDesNeuen: abstand + 1,
  };
}
