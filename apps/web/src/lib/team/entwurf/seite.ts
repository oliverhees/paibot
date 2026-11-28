/**
 * PaiBot – Lesen für die Seite „Team aus Vorlage“: die Vorlagen aus dem Image, der Entwurf, der
 * gerade gilt, und ob der Not-Aus an ist.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { type Database, repo } from "@paibot/db";
import type { EntwurfStatus, Vorlage, VorlageBot } from "@paibot/ui";
import type { TeamEntwurf } from "./format";
import {
  type EntwurfAnsicht,
  entwurfAnsicht,
  entwurfModelle,
  teamVorlagenAnsichten,
  type VorlageAnsicht,
} from "./verwaltung";

/**
 * Wie die Seite den Stand einer Zeile zeigt. `verfallen` ist für den Besitzer dasselbe wie
 * `verworfen`: Es wurde nichts angelegt, und anlegen geht nicht mehr. Der Unterschied steht im
 * Beleg, nicht auf der Seite.
 */
const STAND: Record<repo.entwuerfe.Entwurf["status"], EntwurfStatus> = {
  offen: "offen",
  angelegt: "angelegt",
  zurueckgenommen: "zurueck",
  verworfen: "verworfen",
  verfallen: "verworfen",
};

/** Ein Entwurf, wie die Seite ihn zeigt: die Vorschau-Daten, der Stand und was die Knöpfe brauchen. */
export interface EntwurfSeiteEintrag {
  id: string;
  stand: EntwurfStatus;
  /** Der Abdruck des gespeicherten Inhalts. Ändert die Vorschau etwas, rechnet sie ihn neu. */
  abdruck: string;
  /** Zum Anzeigen. */
  vorlage: Vorlage;
  /**
   * Der geprüfte Inhalt, Feld für Feld. Die Vorschau baut daraus den Inhalt, den sie anlegt: Nur
   * so bleibt alles erhalten, was sie nicht zeigt (etwa die Ausgabegrenze je Bot).
   */
  inhalt: TeamEntwurf;
  /** Nur bei `angelegt`: Ob „Rückgängig“ jetzt noch ginge. */
  rueckgaengig?: boolean;
}

export interface EntwurfSeiteDaten {
  /** Die Vorlagen aus dem Image, alphabetisch nach Kennung. */
  vorlagen: readonly { kennung: string; titel: string; beschreibung?: string; vorlage: Vorlage }[];
  /** Die Entwürfe, neueste zuerst. */
  entwuerfe: readonly EntwurfSeiteEintrag[];
  notAus: boolean;
}

function bot(b: EntwurfAnsicht["inhalt"]["bots"][number]): VorlageBot {
  return {
    name: b.name,
    aufgabe: b.aufgabe,
    anweisung: b.anweisung,
    modell: typeof b.modell === "string" ? b.modell : b.modell.slug,
    form: b.form,
    farbe: b.farbe,
  };
}

/** Der geprüfte Inhalt in der Form, die die Vorschau liest. */
export function zuVorlage(inhalt: EntwurfAnsicht["inhalt"]): Vorlage {
  return {
    titel: inhalt.titel,
    beschreibung: inhalt.beschreibung ?? "",
    team: {
      name: inhalt.team.name,
      leitung: { name: inhalt.team.leitung.name },
      zusammenarbeit: inhalt.team.zusammenarbeit,
      abnahme: inhalt.team.abnahme,
    },
    bots: inhalt.bots.map(bot),
  };
}

function eintrag(e: EntwurfAnsicht): EntwurfSeiteEintrag {
  return {
    id: e.id,
    stand: STAND[e.status],
    abdruck: e.abdruck,
    vorlage: zuVorlage(e.inhalt),
    inhalt: e.inhalt,
    ...(e.rueckgaengig === undefined ? {} : { rueckgaengig: e.rueckgaengig.moeglich }),
  };
}

function vorlageEintrag(v: VorlageAnsicht) {
  return {
    kennung: v.kennung,
    titel: v.titel,
    ...(v.beschreibung === undefined ? {} : { beschreibung: v.beschreibung }),
    vorlage: zuVorlage(v.inhalt),
  };
}

/**
 * Alles, was die Seite „Team aus Vorlage“ zeigt. Liest nur: Die Vorlagen kommen als Dateien aus
 * dem Image (kein Netz), die Entwürfe aus der Datenbank. Geschrieben wird allein über die Routen.
 */
export async function entwurfSeite(db: Database, jetzt = new Date()): Promise<EntwurfSeiteDaten> {
  const modelle = await entwurfModelle(db);
  const [vorlagen, zeilen, einstellungen] = await Promise.all([
    teamVorlagenAnsichten(db, modelle),
    repo.entwuerfe.list(db),
    repo.settings.get(db),
  ]);
  const entwuerfe: EntwurfSeiteEintrag[] = [];
  for (const zeile of zeilen) {
    // Der Verfall wirkt hier mit: Sonst stünde ein Entwurf, dessen Frist um ist, noch als „offen“
    // mit einem Knopf da, den das Tor gleich darauf ablehnt. Wer liest, sieht denselben Stand, mit
    // dem das Anlegen rechnet.
    const stand =
      zeile.status === "offen" ? await repo.entwuerfe.mitVerfall(db, zeile.id, jetzt) : zeile;
    entwuerfe.push(eintrag(await entwurfAnsicht(db, stand ?? zeile, modelle)));
  }
  return {
    vorlagen: vorlagen.map(vorlageEintrag),
    entwuerfe,
    notAus: einstellungen?.killSwitch ?? false,
  };
}
