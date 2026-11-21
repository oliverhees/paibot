/**
 * PaiBot – Signaturschlüssel einmal laden und im Speicher halten, mit sauberem Verwerfen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { inspect } from "node:util";
import { CryptoError } from "./errors";
import { publicKeyOf } from "./signing";

/** Was der Lader liefert: Kennung, öffentlicher Teil und entschlüsselter privater Teil. */
export interface LoadedSigningKey<K extends string = string> {
  keyId: K;
  publicKey: string;
  privateKey: string;
}

/**
 * Schlüssel, wie ihn `current()` herausgibt. `privateKey` ist nicht aufzählbar: Er erscheint nicht
 * in `JSON.stringify`, `Object.keys`, beim Kopieren mit `{ ...key }` oder in `console.log`.
 */
export interface HeldSigningKey<K extends string = string> {
  readonly keyId: K;
  readonly publicKey: string;
  readonly privateKey: string;
}

export interface SigningKeyHolder<K extends string = string> {
  /**
   * Lädt den Schlüssel mit dem Lader (z. B. aus der Datenbank, entschlüsselt) und hält ihn im
   * Speicher. Vor dem ersten `current()` aufrufen, beim Start und nach einem Schlüsselwechsel;
   * nie innerhalb einer Transaktion, die auf den Schlüssel wartet. Darf beliebig oft und
   * gleichzeitig laufen:
   *
   * - Liefert der Lader denselben Schlüssel (gleiche Kennung und gleicher öffentlicher Teil), bleibt
   *   der gehaltene unverändert; früher herausgegebene Objekte gelten weiter, der eben geladene
   *   private Teil wird nicht behalten.
   * - Liefert er einen anderen, ersetzt er den gehaltenen; der private Teil des bisherigen wird
   *   verworfen (wie bei `discard()`), früher herausgegebene Objekte scheitern danach beim Lesen.
   * - Laufen mehrere `load()` gleichzeitig, zählt das zuletzt begonnene; ein älteres, das später
   *   fertig wird, ersetzt nichts mehr und liefert den gehaltenen Schlüssel. Ein `discard()`
   *   dazwischen gilt auch für die schon begonnenen.
   *
   * Prüft, dass der private Teil zum öffentlichen passt; sonst `CryptoError("schluessel_nicht_geladen")`
   * und der bisher gehaltene Schlüssel bleibt unverändert.
   */
  load(): Promise<HeldSigningKey<K>>;
  /**
   * Gibt den gehaltenen Schlüssel zurück, ohne den Lader zu rufen (also ohne Datenbank).
   * Fehler: `CryptoError("schluessel_nicht_geladen")`, wenn noch nichts geladen oder verworfen wurde.
   */
  current(): Promise<HeldSigningKey<K>>;
  /** Ob gerade ein Schlüssel gehalten wird. */
  readonly loaded: boolean;
  /**
   * Verwirft den Schlüssel: Danach scheitern `current()` und jedes Lesen von `privateKey` an früher
   * herausgegebenen Objekten. Den Text selbst kann JavaScript nicht überschreiben; es verschwindet
   * nur der letzte Verweis.
   */
  discard(): void;
}

interface Slot<K extends string> {
  keyId: K;
  publicKey: string;
  privateKey: string | undefined;
}

function heldKey<K extends string>(slot: Slot<K>): HeldSigningKey<K> {
  const view = { keyId: slot.keyId, publicKey: slot.publicKey };
  Object.defineProperty(view, "privateKey", {
    enumerable: false,
    get(): string {
      if (slot.privateKey === undefined) throw new CryptoError("schluessel_nicht_geladen");
      return slot.privateKey;
    },
  });
  Object.defineProperty(view, "toJSON", {
    enumerable: false,
    value: () => ({ keyId: slot.keyId, publicKey: slot.publicKey }),
  });
  Object.defineProperty(view, inspect.custom, {
    enumerable: false,
    value: () => `SigningKey { keyId: ${slot.keyId} }`,
  });
  return Object.freeze(view) as HeldSigningKey<K>;
}

/**
 * Hält einen Signaturschlüssel im Speicher. Der Lader wird nur in `load()` gerufen, nie in
 * `current()`; so fragt der Beleg-Schreiber unter seiner Sperre nicht noch einmal die Datenbank.
 */
export function createSigningKeyHolder<K extends string>(
  loader: () => Promise<LoadedSigningKey<K>>,
): SigningKeyHolder<K> {
  let slot: Slot<K> | undefined;
  let view: HeldSigningKey<K> | undefined;
  // Nummer des zuletzt begonnenen und des zuletzt übernommenen (oder verworfenen) Ladens.
  let started = 0;
  let settled = 0;

  const held = (): HeldSigningKey<K> => {
    if (view === undefined || slot?.privateKey === undefined) {
      throw new CryptoError("schluessel_nicht_geladen");
    }
    return view;
  };

  const holder: SigningKeyHolder<K> = {
    async load() {
      started += 1;
      const ticket = started;
      const loaded = await loader();
      let matches = false;
      try {
        matches = publicKeyOf(loaded.privateKey) === loaded.publicKey;
      } catch {
        matches = false;
      }
      if (!matches) throw new CryptoError("schluessel_nicht_geladen");
      // Ein neueres Laden oder ein `discard()` kam schon zum Zug: nichts ersetzen.
      if (ticket <= settled) return held();
      settled = ticket;
      // Derselbe Schlüssel: das Fach bleibt, laufende Nutzer lesen weiter daraus.
      if (
        slot?.privateKey !== undefined &&
        slot.keyId === loaded.keyId &&
        slot.publicKey === loaded.publicKey
      ) {
        return held();
      }
      if (slot !== undefined) slot.privateKey = undefined;
      slot = { keyId: loaded.keyId, publicKey: loaded.publicKey, privateKey: loaded.privateKey };
      view = heldKey(slot);
      return view;
    },
    async current() {
      return held();
    },
    get loaded() {
      return slot?.privateKey !== undefined;
    },
    discard() {
      settled = started;
      if (slot !== undefined) slot.privateKey = undefined;
      slot = undefined;
      view = undefined;
    },
  };
  Object.defineProperty(holder, inspect.custom, {
    enumerable: false,
    value: () => `SigningKeyHolder { loaded: ${holder.loaded} }`,
  });
  return holder;
}
