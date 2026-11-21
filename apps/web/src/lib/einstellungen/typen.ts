/**
 * PaiBot – Antwortformen der Einstellungen, gemeinsam für Server, Routen und Oberfläche.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/** Die änderbaren Grenzen und der Verbrauch von heute (Antwort von `GET /api/einstellungen`). */
export interface EinstellungenAnzeige {
  zeitzone: string;
  /** Tagesgrenze in Token; `null`: keine. */
  tagesbudget: number | null;
  /** Verlaufsgrenze in Token; `null`: so viel, wie passt. */
  verlaufsgrenze: number | null;
  /** Verbrauchte Token seit Tagesbeginn (`seit`, ISO) in der Zeitzone. */
  heute: { token: number; seit: string };
  /** Größte erlaubte Werte. */
  hoechstwerte: { tagesbudget: number; verlaufsgrenze: number };
}

/** Antwort von `PATCH /api/einstellungen`: neue Werte und der Beleg „Ergebnis“. */
export interface EinstellungenGespeichert {
  einstellungen: EinstellungenAnzeige;
  beleg: { id: string; nummer: number };
}

/** Eine Sitzung, wie `GET /api/zugang/sitzungen` sie liefert (ohne Kennung). */
export interface SitzungZeile {
  aktuell: boolean;
  angelegt: string;
  zuletzt: string;
  endet: string;
  geraet?: string;
}

/** Ein bekanntes Gerät, wie `GET /api/zugang/geraete` es liefert. */
export interface GeraetZeile {
  id: string;
  art: "browser";
  /** Browser-Kennung, aus der die Oberfläche eine grobe Angabe macht. */
  name?: string;
  angelegt: string;
  zuletzt: string;
  endet: string;
  aktuell: boolean;
}
