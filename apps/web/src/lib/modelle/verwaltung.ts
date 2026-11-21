/**
 * PaiBot – zweiter Schlüssel eines EUrouter-Eintrags und die daraus gelesenen Vorgaben der
 * Routing-Regeln. Der Schlüssel liegt getrennt und eigens gebunden verschlüsselt, wird nie
 * angezeigt oder protokolliert und nur für die Regel-Liste benutzt, nie für Chat-Aufrufe.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { decryptSecret, encryptSecret } from "@paibot/crypto";
import { type Database, repo } from "@paibot/db";
import {
  type RoutingRulesRead,
  type RoutingRulesReadFailure,
  routingRuleNameOf,
  supportsRoutingRules,
} from "@paibot/llm";
import { providerManagementKeyBinding, secretAad } from "@paibot/shared/bindung";
import { PaiBotError } from "@paibot/shared/fehler";
import { isId, type ModelId, type ProviderId } from "@paibot/shared/ids";
import type { Provider } from "@paibot/shared/objekte";
import type { ListedRule } from "@paibot/shared/regelliste";
import { t } from "@paibot/shared/texte";
import type { RoutenKontext } from "../api/route";
import type { EinrichtungsAnbieter } from "../umgebung";
import type { ZugangsDienste } from "../zugang/dienste";
import { type RegelEintrag, regelnVon } from "./regeln";
import { istEuBelegt, residenzSatz, vorgabeAus } from "./vorgabe";

/** Erfolgreich gelesene Regel-Liste. */
export type GeleseneListe = Extract<RoutingRulesRead, { ok: true }>;

/** Fehler beim Lesen der Regel-Liste in Worten, mit Ausweg; am Feld des zweiten Schlüssels. */
export function listenFehler(code: RoutingRulesReadFailure, anbieter: string): PaiBotError {
  const p = { anbieter };
  const feld = [{ feld: "managementKey", code: "ungueltig" as const }];
  switch (code) {
    case "nicht_erlaubt":
      return new PaiBotError("schluessel_ungueltig", {
        text: t("verwaltung.fehler.nicht_erlaubt"),
        ausweg: t("verwaltung.fehler.nicht_erlaubt.ausweg", p),
        felder: feld,
      });
    case "schluessel_ungueltig":
      return new PaiBotError("schluessel_ungueltig", {
        text: t("verwaltung.fehler.schluessel_ungueltig", p),
        ausweg: t("verwaltung.fehler.schluessel_ungueltig.ausweg", p),
        felder: feld,
      });
    case "zeitueberschreitung":
      return new PaiBotError("anbieter_nicht_erreichbar", {
        text: t("verwaltung.fehler.zeit", p),
        ausweg: t("verwaltung.fehler.zeit.ausweg"),
      });
    case "form":
      return new PaiBotError("anbieter_nicht_erreichbar", {
        text: t("verwaltung.fehler.form", p),
        ausweg: t("verwaltung.fehler.form.ausweg"),
      });
    case "limit_erreicht":
      return new PaiBotError("limit_erreicht", {
        text: t("modelle.test.limit_erreicht", p),
        ausweg: t("modelle.test.limit_erreicht.ausweg", p),
      });
    default:
      return new PaiBotError("anbieter_nicht_erreichbar", {
        text: t("modelle.test.anbieter_nicht_erreichbar", p),
        ausweg: t("modelle.test.anbieter_nicht_erreichbar.ausweg"),
      });
  }
}

/** Zweiten Schlüssel verschlüsseln, gebunden an Datensatz, Adresse und diesen Zweck. */
export function verwaltungsschluesselVerschluesseln(
  d: ZugangsDienste,
  anbieter: Pick<Provider, "id" | "baseUrl">,
  schluessel: string,
): string {
  return encryptSecret(schluessel, d.schluessel().geheimnisse, {
    aad: secretAad(providerManagementKeyBinding(anbieter.id as ProviderId, anbieter.baseUrl)),
  });
}

function verwaltungsschluesselLesen(d: ZugangsDienste, anbieter: Provider, enc: string): string {
  try {
    return decryptSecret(enc, d.schluessel().geheimnisse, {
      aad: secretAad(providerManagementKeyBinding(anbieter.id as ProviderId, anbieter.baseUrl)),
    });
  } catch {
    throw new PaiBotError("schluessel_ungueltig", {
      text: t("verwaltung.schluessel.unlesbar"),
      ausweg: t("verwaltung.schluessel.unlesbar.ausweg"),
      felder: [{ feld: "managementKey", code: "ungueltig" }],
    });
  }
}

/** Liest die Regel-Liste mit dem Schlüssel; bei einem Fehler wirft sie den Satz mit Ausweg. */
export async function listeLesen(
  d: ZugangsDienste,
  anbieter: EinrichtungsAnbieter,
  verwaltungsschluessel: string,
): Promise<GeleseneListe> {
  const ergebnis = await d.kontoRegelnLesen(anbieter, verwaltungsschluessel);
  if (!ergebnis.ok) throw listenFehler(ergebnis.code, anbieter.name);
  return ergebnis;
}

async function anbieterMitSchluesseln(db: Database, id: string) {
  if (!isId("provider", id)) throw new PaiBotError("nicht_gefunden");
  const gefunden = await repo.providers.getWithKey(db, id as ProviderId);
  if (gefunden === undefined) throw new PaiBotError("nicht_gefunden");
  if (!supportsRoutingRules(gefunden.provider.templateKey)) {
    throw new PaiBotError("eingabe_ungueltig", { text: t("routingregel.nur_eurouter") });
  }
  return gefunden;
}

/** Der Besitzer-Zeitzone und die Uhr für die Anzeige des Alters einer Angabe. */
async function anzeigeKontext(db: Database, d: ZugangsDienste) {
  const einstellungen = await repo.settings.get(db);
  return { jetzt: d.uhr.now(), zeitzone: einstellungen?.timezone ?? "Europe/Berlin" };
}

/** Gespeicherte Regeln eines Anbieters mit Namen und Kennung des Modell-Eintrags. */
async function gespeicherteRegeln(db: Database, anbieter: Provider) {
  const ergebnis: { id: ModelId; name: string }[] = [];
  for (const m of await repo.models.list(db, { providerId: anbieter.id as ProviderId })) {
    const name = routingRuleNameOf(anbieter.templateKey, m.slug);
    if (name !== undefined) ergebnis.push({ id: m.id as ModelId, name });
  }
  return ergebnis;
}

/**
 * Löscht alle gelesenen Vorgaben der Regeln eines Anbieters. Nötig, sobald sich ein Schlüssel des
 * Eintrags ändert oder entfällt: PaiBot kann nicht prüfen, ob beide Schlüssel zum selben Konto
 * gehören, und eine Vorgabe hängt nur am Namen der Regel. Die Kennzeichnung fehlt dann, bis neu
 * geprüft wird.
 */
export async function vorgabenLoeschen(db: Database, anbieter: Provider): Promise<void> {
  for (const regel of await gespeicherteRegeln(db, anbieter)) {
    await repo.models.setRulePolicy(db, regel.id, null);
  }
}

export interface VorgabenErgebnis {
  /** Regeln, deren Vorgaben aktualisiert wurden. */
  aktualisiert: string[];
  /** Regeln, die in der gelesenen Liste fehlen; ihre alten Vorgaben sind entfernt. */
  entfernt: string[];
  /** Regeln, die fehlen, aber bei unvollständiger Liste unverändert blieben. */
  unveraendert: string[];
}

/**
 * Schreibt die gelesenen Vorgaben an die gespeicherten Regeln (`ziele`, Standard alle). Eine Regel
 * in der Liste: Vorgaben mit Zeitpunkt ersetzen. Eine Regel, die in einer vollständigen Liste
 * fehlt (oder ausgeschaltet ist): alte Vorgaben entfernen, denn sie sind nicht mehr belegt. Ist
 * die Liste vielleicht unvollständig: unverändert lassen.
 */
export async function vorgabenAnwenden(
  db: Database,
  anbieter: Provider,
  liste: GeleseneListe,
  jetzt: Date,
  ziele?: readonly ModelId[],
): Promise<VorgabenErgebnis> {
  const ergebnis: VorgabenErgebnis = { aktualisiert: [], entfernt: [], unveraendert: [] };
  const nachName = new Map<string, ListedRule>(liste.regeln.map((r) => [r.name, r]));
  for (const regel of await gespeicherteRegeln(db, anbieter)) {
    if (ziele !== undefined && !ziele.includes(regel.id)) continue;
    const gelesen = nachName.get(regel.name);
    if (gelesen !== undefined) {
      await repo.models.setRulePolicy(db, regel.id, {
        policy: gelesen.policy,
        source: "verwaltungsschluessel",
        checkedAt: jetzt,
      });
      ergebnis.aktualisiert.push(regel.name);
    } else if (liste.unvollstaendig) {
      ergebnis.unveraendert.push(regel.name);
    } else {
      await repo.models.setRulePolicy(db, regel.id, null);
      ergebnis.entfernt.push(regel.name);
    }
  }
  return ergebnis;
}

/**
 * `PUT /api/anbieter/:id/verwaltungsschluessel`: legt den zweiten Schlüssel ab. Er wird nur
 * gespeichert, wenn die Regel-Liste damit gelesen werden kann (sonst Fehler mit Ausweg, nichts
 * gespeichert). Mit der Liste in der Hand werden die Vorgaben der gespeicherten Regeln gleich
 * gelesen und gespeichert.
 */
export async function anbieterVerwaltungsschluesselSetzen(
  k: RoutenKontext<"anbieterVerwaltungsschluesselSetzen">,
) {
  const { provider } = await anbieterMitSchluesseln(k.db, k.params.id ?? "");
  const liste = await listeLesen(k.dienste, provider, k.eingabe.managementKey);
  const jetzt = k.dienste.uhr.now();
  const providerId = provider.id as ProviderId;
  const enc = verwaltungsschluesselVerschluesseln(k.dienste, provider, k.eingabe.managementKey);
  const gespeichert = await k.tor(
    k.nachweis,
    { type: "anbieter.speichern", target: { providerId } },
    { created: false, region: provider.region, keySet: provider.keySet, managementKeySet: true },
    async () => {
      const neu = await repo.providers.update(k.db, providerId, { managementKeyEnc: enc });
      if (neu === undefined) throw new PaiBotError("nicht_gefunden");
      // Ein anderer zweiter Schlüssel kann zu einem anderen Konto gehören: Altes gilt nicht mehr.
      await vorgabenLoeschen(k.db, provider);
      const vorgaben = await vorgabenAnwenden(k.db, provider, liste, jetzt);
      return { value: { anbieter: neu, vorgaben }, result: { status: "ok" } };
    },
  );
  const regeln = await regelnVon(k.db, provider, await anzeigeKontext(k.db, k.dienste));
  return {
    daten: {
      anbieter: gespeichert.value.anbieter,
      regeln,
      vorgaben: gespeichert.value.vorgaben,
      unvollstaendig: liste.unvollstaendig,
    },
  };
}

/**
 * `DELETE /api/anbieter/:id/verwaltungsschluessel`: entfernt den zweiten Schlüssel und die damit
 * gelesenen Vorgaben (ohne Schlüssel lassen sie sich nicht mehr prüfen).
 */
export async function anbieterVerwaltungsschluesselEntfernen(
  k: RoutenKontext<"anbieterVerwaltungsschluesselEntfernen">,
) {
  const { provider } = await anbieterMitSchluesseln(k.db, k.params.id ?? "");
  const providerId = provider.id as ProviderId;
  const gespeichert = await k.tor(
    k.nachweis,
    { type: "anbieter.speichern", target: { providerId } },
    { created: false, region: provider.region, keySet: provider.keySet, managementKeySet: false },
    async () => {
      const neu = await repo.providers.update(k.db, providerId, { managementKeyEnc: null });
      if (neu === undefined) throw new PaiBotError("nicht_gefunden");
      await vorgabenLoeschen(k.db, provider);
      return { value: neu, result: { status: "ok" } };
    },
  );
  const regeln = await regelnVon(k.db, provider, await anzeigeKontext(k.db, k.dienste));
  return { daten: { anbieter: gespeichert.value, regeln } };
}

/** Eine eingeschaltete Regel des Kontos, wie die Oberfläche sie zur Auswahl zeigt. */
export interface KontoRegel {
  name: string;
  /** Die Regel meldet `data_residency: "EU"`. */
  eu: boolean;
  /** Was die Regel zur Datenresidenz sagt, wenn nicht „EU“. */
  residenz?: string;
  /** Schon als Regel gespeichert. */
  gespeichert: boolean;
  models?: string[];
  allowFallbacks?: boolean;
}

/**
 * `POST /api/anbieter/:id/regeln/liste`: liest die Regeln des Kontos mit dem zweiten Schlüssel und
 * zeigt die eingeschalteten zur Auswahl. Schreibt nichts.
 */
export async function anbieterRegelListe(k: RoutenKontext<"anbieterRegelListe">) {
  const { provider, managementKeyEnc } = await anbieterMitSchluesseln(k.db, k.params.id ?? "");
  if (managementKeyEnc === undefined) {
    throw new PaiBotError("eingabe_ungueltig", {
      text: t("verwaltung.fehler.kein_schluessel"),
      ausweg: t("verwaltung.fehler.kein_schluessel.ausweg"),
      felder: [{ feld: "managementKey", code: "fehlt" }],
    });
  }
  const schluessel = verwaltungsschluesselLesen(k.dienste, provider, managementKeyEnc);
  const liste = await listeLesen(k.dienste, provider, schluessel);
  const kontext = await anzeigeKontext(k.db, k.dienste);
  const gespeichert = new Set((await gespeicherteRegeln(k.db, provider)).map((r) => r.name));
  const regeln: KontoRegel[] = liste.regeln.map((r) => {
    const vorgabe = vorgabeAus(r.policy, kontext.jetzt, kontext.jetzt, kontext.zeitzone);
    const residenz = residenzSatz(vorgabe);
    return {
      name: r.name,
      eu: istEuBelegt(vorgabe),
      ...(residenz === undefined ? {} : { residenz }),
      gespeichert: gespeichert.has(r.name),
      ...(r.policy.models === undefined ? {} : { models: r.policy.models }),
      ...(r.policy.allow_fallbacks === undefined
        ? {}
        : { allowFallbacks: r.policy.allow_fallbacks }),
    };
  });
  return {
    daten: {
      regeln,
      unvollstaendig: liste.unvollstaendig,
      uebersprungen: liste.uebersprungen,
      gelesenAm: kontext.jetzt.toISOString(),
    },
  };
}

/**
 * `POST /api/anbieter/:id/regeln/neu-pruefen`: liest die Vorgaben einer (`modelId`) oder aller
 * gespeicherten Regeln erneut und speichert sie mit dem neuen Zeitpunkt.
 */
export async function anbieterRegelNeuPruefen(k: RoutenKontext<"anbieterRegelNeuPruefen">) {
  const { provider, managementKeyEnc } = await anbieterMitSchluesseln(k.db, k.params.id ?? "");
  if (managementKeyEnc === undefined) {
    throw new PaiBotError("eingabe_ungueltig", {
      text: t("verwaltung.fehler.kein_schluessel"),
      ausweg: t("verwaltung.fehler.kein_schluessel.ausweg"),
      felder: [{ feld: "managementKey", code: "fehlt" }],
    });
  }
  const providerId = provider.id as ProviderId;
  const ziel = k.eingabe.modelId as ModelId | undefined;
  if (ziel !== undefined) {
    const modell = await repo.models.get(k.db, ziel);
    if (
      modell === undefined ||
      modell.providerId !== provider.id ||
      routingRuleNameOf(provider.templateKey, modell.slug) === undefined
    ) {
      throw new PaiBotError("nicht_gefunden");
    }
  }
  const schluessel = verwaltungsschluesselLesen(k.dienste, provider, managementKeyEnc);
  const liste = await listeLesen(k.dienste, provider, schluessel);
  const jetzt = k.dienste.uhr.now();
  const gespeichert = await k.tor(
    k.nachweis,
    { type: "anbieter.speichern", target: { providerId } },
    { created: false, region: provider.region, keySet: provider.keySet, managementKeySet: true },
    async () => {
      const vorgaben = await vorgabenAnwenden(
        k.db,
        provider,
        liste,
        jetzt,
        ziel === undefined ? undefined : [ziel],
      );
      return { value: vorgaben, result: { status: "ok" } };
    },
  );
  const regeln: RegelEintrag[] = await regelnVon(
    k.db,
    provider,
    await anzeigeKontext(k.db, k.dienste),
  );
  return {
    daten: { regeln, vorgaben: gespeichert.value, unvollstaendig: liste.unvollstaendig },
  };
}

/**
 * Zum Hinzufügen einer Regel: Vorgaben der Regel aus der Liste des Kontos, wenn ein zweiter
 * Schlüssel hinterlegt ist. Schlägt das Lesen fehl, ist das kein Grund, die Regel nicht zu
 * speichern; der Satz zum Fehler kommt als `hinweis` zurück.
 */
export async function vorgabeFuerNeueRegel(
  d: ZugangsDienste,
  anbieter: Provider,
  managementKeyEnc: string | undefined,
  name: string,
): Promise<{ policy?: ListedRule["policy"]; hinweis?: string }> {
  if (managementKeyEnc === undefined) return {};
  try {
    const schluessel = verwaltungsschluesselLesen(d, anbieter, managementKeyEnc);
    const liste = await listeLesen(d, anbieter, schluessel);
    const gefunden = liste.regeln.find((r) => r.name === name);
    if (gefunden !== undefined) return { policy: gefunden.policy };
    return {
      hinweis: liste.unvollstaendig
        ? t("verwaltung.hinweis.nicht_gesehen_unvollstaendig", { name })
        : t("verwaltung.hinweis.nicht_in_liste", { name }),
    };
  } catch (fehler) {
    if (fehler instanceof PaiBotError) {
      return {
        hinweis: [fehler.text, fehler.ausweg].filter((x) => x !== undefined && x !== "").join(" "),
      };
    }
    throw fehler;
  }
}
