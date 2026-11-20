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
   * nie innerhalb einer Transaktion, die auf den Schlüssel wartet.
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

  const holder: SigningKeyHolder<K> = {
    async load() {
      const loaded = await loader();
      let matches = false;
      try {
        matches = publicKeyOf(loaded.privateKey) === loaded.publicKey;
      } catch {
        matches = false;
      }
      if (!matches) throw new CryptoError("schluessel_nicht_geladen");
      if (slot !== undefined) slot.privateKey = undefined;
      slot = { keyId: loaded.keyId, publicKey: loaded.publicKey, privateKey: loaded.privateKey };
      view = heldKey(slot);
      return view;
    },
    async current() {
      if (view === undefined || slot?.privateKey === undefined) {
        throw new CryptoError("schluessel_nicht_geladen");
      }
      return view;
    },
    get loaded() {
      return slot?.privateKey !== undefined;
    },
    discard() {
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
