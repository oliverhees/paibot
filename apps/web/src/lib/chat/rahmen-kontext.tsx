/**
 * PaiBot – Verbindung zwischen dem Rahmen der App und einer Seite: Kopfzeile, Arbeitsfläche\n * rechts und die Unterhaltungen der Seitenleiste.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import type { AppShellFlaeche } from "@paibot/ui";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import type { UnterhaltungKurz } from "./typen";

export interface RahmenKontext {
  /** Eigene Kopfzeile der Seite; `undefined` setzt die Standard-Kopfzeile. */
  setKopf(kopf: ReactNode | undefined): void;
  /** Inhalt der Arbeitsfläche (Reiter „Belege“); `undefined` blendet sie aus. */
  setFlaeche(flaeche: AppShellFlaeche | undefined): void;
  flaecheOffen: boolean;
  setFlaecheOffen(offen: boolean): void;
  unterhaltungen: readonly UnterhaltungKurz[];
  /** Neu oder geändert: steht danach mit neuem Titel bzw. neuer Zeit in der Liste. */
  unterhaltungMerken(u: UnterhaltungKurz): void;
  unterhaltungEntfernen(id: string): void;
  /** Not-Aus an: Der Bot nimmt keine Nachrichten an. */
  notAus?: boolean;
}

const ohneRahmen: RahmenKontext = {
  setKopf: () => undefined,
  setFlaeche: () => undefined,
  flaecheOffen: false,
  setFlaecheOffen: () => undefined,
  unterhaltungen: [],
  unterhaltungMerken: () => undefined,
  unterhaltungEntfernen: () => undefined,
};

export const Rahmen = createContext<RahmenKontext>(ohneRahmen);

export function useRahmen(): RahmenKontext {
  return useContext(Rahmen);
}

/** Setzt die Kopfzeile, solange die Seite angezeigt wird. */
export function useKopf(kopf: ReactNode): void {
  const { setKopf } = useRahmen();
  useEffect(() => {
    setKopf(kopf);
  }, [kopf, setKopf]);
  useEffect(() => () => setKopf(undefined), [setKopf]);
}

/** Setzt die Arbeitsfläche, solange die Seite angezeigt wird. */
export function useFlaeche(flaeche: AppShellFlaeche | undefined): void {
  const { setFlaeche } = useRahmen();
  useEffect(() => {
    setFlaeche(flaeche);
  }, [flaeche, setFlaeche]);
  useEffect(() => () => setFlaeche(undefined), [setFlaeche]);
}
