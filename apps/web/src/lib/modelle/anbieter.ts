/**
 * PaiBot – Anbieter und Modelle nach der Einrichtung: Liste, Anlegen, Ändern, Entfernen,
 * Verbindungstest und Modell-Liste. Schlüssel gehen nur hinein, nie zurück an den Browser.
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
  baseUrlProblemKey,
  type ConnectionTestResult,
  checkProviderBaseUrl,
  PROVIDER_TEMPLATES,
} from "@paibot/llm";
import { providerSecretBinding, secretAad } from "@paibot/shared/bindung";
import type { ProviderInput } from "@paibot/shared/eingaben";
import { type ErrorCode, PaiBotError } from "@paibot/shared/fehler";
import { isId, type ModelId, newId, type ProviderId } from "@paibot/shared/ids";
import type { Provider, Region } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import type { RoutenKontext } from "../api/route";
import type { EinrichtungsAnbieter } from "../umgebung";
import type { ZugangsDienste } from "../zugang/dienste";

/** Vorlage für einen neuen Anbieter, wie die Einrichtung ihn verbindet (ohne Geheimnisse). */
export type AnbieterVorlage = EinrichtungsAnbieter;

/** Modell aus der Liste des Anbieters, mit der Kennung, unter der es gewählt werden kann. */
export interface ModellEintrag {
  id: ModelId;
  slug: string;
  displayName: string;
  contextWindow?: number;
}

/** Normalform einer Basis-URL zum Vergleichen und Speichern (ohne Schrägstrich am Ende). */
export function adresseNormal(baseUrl: string): string {
  return new URL(baseUrl.trim()).href.replace(/\/+$/, "");
}

/** Ändert sich die Adresse? Dann passt der gespeicherte Schlüssel nicht mehr. */
export function adresseGeaendert(alt: string, neu: string): boolean {
  return adresseNormal(alt) !== adresseNormal(neu);
}

function anbieterParams(name: string) {
  return { anbieter: name };
}

/** Fehler eines Verbindungstests in Worten, mit Ausweg; am Feld „Schlüssel“ nur bei falschem Schlüssel. */
export function verbindungsFehler(
  code: ErrorCode,
  anbieterName: string,
  eigener = false,
): PaiBotError {
  const p = anbieterParams(anbieterName);
  const ausweg = eigener ? "_eigen" : "";
  if (code === "schluessel_ungueltig") {
    return new PaiBotError(code, {
      text: t("modelle.test.schluessel_ungueltig", p),
      ausweg: t(`modelle.test.schluessel_ungueltig.ausweg${ausweg}`, p),
      felder: [{ feld: "apiKey", code: "ungueltig" }],
    });
  }
  if (code === "limit_erreicht") {
    return new PaiBotError(code, {
      text: t("modelle.test.limit_erreicht", p),
      ausweg: t(`modelle.test.limit_erreicht.ausweg${ausweg}`, p),
    });
  }
  return new PaiBotError("anbieter_nicht_erreichbar", {
    text: t("modelle.test.anbieter_nicht_erreichbar", p),
    ausweg: t("modelle.test.anbieter_nicht_erreichbar.ausweg"),
  });
}

function ungueltigeAdresse(text: string): PaiBotError {
  return new PaiBotError("eingabe_ungueltig", {
    text,
    felder: [{ feld: "baseUrl", code: "ungueltig" }],
  });
}

/**
 * Prüft Vorlage, Adresse und Region einer Eingabe und liefert die Adresse in Normalform. Bei der
 * Vorlage EUrouter sind Adresse und Region fest; sonst gilt die Prüfung der Anbieter-Schicht, und
 * jedes Problem kommt als eigener Satz zurück.
 */
export function pruefeAdresse(eingabe: Pick<ProviderInput, "templateKey" | "baseUrl" | "region">) {
  if (eingabe.templateKey === "eurouter") {
    const vorlage = PROVIDER_TEMPLATES.eurouter;
    if (
      adresseNormal(eingabe.baseUrl) !== adresseNormal(vorlage.baseUrl) ||
      eingabe.region !== vorlage.region
    ) {
      throw ungueltigeAdresse(t("modelle.schluessel.vorlage_fest"));
    }
    return adresseNormal(vorlage.baseUrl);
  }
  const pruefung = checkProviderBaseUrl(eingabe.baseUrl, eingabe.region);
  if (!pruefung.ok) throw ungueltigeAdresse(t(baseUrlProblemKey(pruefung.problem)));
  return adresseNormal(pruefung.url.href);
}

/** Schlüssel verschlüsseln, gebunden an Datensatz und Adresse des Anbieters. */
function verschluesseln(d: ZugangsDienste, id: ProviderId, baseUrl: string, apiKey: string) {
  return encryptSecret(apiKey, d.schluessel().geheimnisse, {
    aad: secretAad(providerSecretBinding(id, baseUrl)),
  });
}

/**
 * Gespeicherten Schlüssel lesen (nur auf dem Server, nur für den Abruf beim Anbieter). Lässt er
 * sich nicht lesen (anderes Geheimnis, alte Fassung, andere Bindung), soll der Besitzer ihn neu
 * eintragen.
 */
function gespeicherterSchluessel(
  d: ZugangsDienste,
  anbieter: Provider,
  apiKeyEnc: string | undefined,
): string | undefined {
  if (apiKeyEnc === undefined) return undefined;
  try {
    return decryptSecret(apiKeyEnc, d.schluessel().geheimnisse, {
      aad: secretAad(providerSecretBinding(anbieter.id as ProviderId, anbieter.baseUrl)),
    });
  } catch {
    throw new PaiBotError("schluessel_ungueltig", {
      text: t("modelle.schluessel.unlesbar"),
      ausweg: t("modelle.schluessel.unlesbar.ausweg"),
      felder: [{ feld: "apiKey", code: "ungueltig" }],
    });
  }
}

function ohneSchluesselErlaubt(region: Region): boolean {
  return region === "local";
}

function schluesselFehlt(): PaiBotError {
  return new PaiBotError("eingabe_ungueltig", {
    text: t("modelle.schluessel.leer"),
    felder: [{ feld: "apiKey", code: "fehlt" }],
  });
}

async function verbindungPruefen(
  d: ZugangsDienste,
  endpunkt: AnbieterVorlage,
  apiKey: string | undefined,
): Promise<ConnectionTestResult & { ok: true }> {
  const ergebnis = await d.verbindungTesten(endpunkt, apiKey ?? "");
  if (!ergebnis.ok)
    throw verbindungsFehler(ergebnis.code, endpunkt.name, endpunkt.templateKey === "eigener");
  return ergebnis;
}

async function anbieterMitSchluessel(db: Database, id: string) {
  if (!isId("provider", id)) throw new PaiBotError("nicht_gefunden");
  const gefunden = await repo.providers.getWithKey(db, id as ProviderId);
  if (gefunden === undefined) throw new PaiBotError("nicht_gefunden");
  return gefunden;
}

function endpunktVon(anbieter: Provider): AnbieterVorlage {
  return {
    templateKey: anbieter.templateKey,
    name: anbieter.name,
    baseUrl: anbieter.baseUrl,
    region: anbieter.region,
  };
}

/** Antwort von `GET /api/anbieter`: gespeicherte Anbieter (nur „Schlüssel gesetzt“) und Vorlage. */
export interface AnbieterListe {
  anbieter: Provider[];
  vorlage: AnbieterVorlage;
}

export async function anbieterListe(k: RoutenKontext<"anbieterListe">) {
  const daten: AnbieterListe = {
    anbieter: await repo.providers.list(k.db),
    vorlage: k.dienste.einrichtungsAnbieter(),
  };
  return { daten };
}

/**
 * `POST /api/anbieter`: legt einen Anbieter an. Gespeichert wird nur, was der Anbieter beim
 * Verbindungstest annimmt; außer bei Region „lokal“ ist ein Schlüssel Pflicht.
 */
export async function anbieterAnlegen(k: RoutenKontext<"anbieterAnlegen">) {
  const eingabe = k.eingabe;
  if (eingabe.removeApiKey !== undefined) {
    throw new PaiBotError("eingabe_ungueltig", {
      felder: [{ feld: "removeApiKey", code: "ungueltig" }],
    });
  }
  const baseUrl = pruefeAdresse(eingabe);
  if (eingabe.apiKey === undefined && !ohneSchluesselErlaubt(eingabe.region)) {
    throw schluesselFehlt();
  }
  const endpunkt: AnbieterVorlage = {
    templateKey: eingabe.templateKey,
    name: eingabe.name,
    baseUrl,
    region: eingabe.region,
  };
  await verbindungPruefen(k.dienste, endpunkt, eingabe.apiKey);
  const providerId = newId("provider") as ProviderId;
  const apiKey = eingabe.apiKey;
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "anbieter.speichern", target: { providerId } },
    { created: true, region: eingabe.region, keySet: apiKey !== undefined },
    async () => {
      await repo.providers.create(k.db, {
        id: providerId,
        templateKey: eingabe.templateKey,
        name: eingabe.name,
        baseUrl,
        region: eingabe.region,
        enabled: eingabe.enabled,
        ...(eingabe.country === undefined ? {} : { country: eingabe.country }),
        ...(apiKey === undefined
          ? {}
          : { apiKeyEnc: verschluesseln(k.dienste, providerId, baseUrl, apiKey) }),
      });
      const gespeichert = await repo.providers.setCheckResult(k.db, providerId, {
        ok: true,
        at: k.dienste.uhr.now(),
      });
      return { value: gespeichert, result: { status: "ok" } };
    },
  );
  return { daten: { anbieter: ergebnis.value }, status: 201 };
}

/**
 * `PUT /api/anbieter/:id`: ändert einen Anbieter. Ohne `apiKey` bleibt der gespeicherte Schlüssel
 * – aber nur, solange die Adresse gleich bleibt: Der Schlüssel ist an die Adresse gebunden, eine
 * neue Adresse verlangt ihn in derselben Änderung neu (kein stilles Umbinden). Mit `removeApiKey`
 * wird der Schlüssel gelöscht; das geht nur bei Region „lokal“. Die Vorlage eines Anbieters bleibt,
 * wie sie ist: Aus einem Vorlagen-Anbieter wird nie ein eigener (und umgekehrt).
 */
export async function anbieterAendern(k: RoutenKontext<"anbieterAendern">) {
  const eingabe = k.eingabe;
  const { provider: alt, apiKeyEnc } = await anbieterMitSchluessel(k.db, k.params.id ?? "");
  const id = alt.id as ProviderId;
  if (eingabe.templateKey !== alt.templateKey) {
    throw new PaiBotError("eingabe_ungueltig", {
      text: t("modelle.eigen.vorlage_bleibt"),
      felder: [{ feld: "templateKey", code: "ungueltig" }],
    });
  }
  const baseUrl = pruefeAdresse(eingabe);
  const neueAdresse = adresseGeaendert(alt.baseUrl, baseUrl);
  const apiKey = eingabe.apiKey;
  const entferntSchluessel = eingabe.removeApiKey === true && apiKeyEnc !== undefined;
  if (eingabe.removeApiKey === true && !ohneSchluesselErlaubt(eingabe.region)) {
    throw new PaiBotError("eingabe_ungueltig", {
      text: t("modelle.eigen.ohne_schluessel_nur_lokal"),
      felder: [{ feld: "apiKey", code: "fehlt" }],
    });
  }
  if (neueAdresse && apiKey === undefined && apiKeyEnc !== undefined && !entferntSchluessel) {
    throw new PaiBotError("eingabe_ungueltig", {
      text: t("modelle.schluessel.adresse_neu"),
      felder: [{ feld: "apiKey", code: "fehlt" }],
    });
  }
  const behaeltSchluessel = apiKey === undefined && apiKeyEnc !== undefined && !entferntSchluessel;
  if (apiKey === undefined && !behaeltSchluessel && !ohneSchluesselErlaubt(eingabe.region)) {
    throw schluesselFehlt();
  }
  const endpunkt: AnbieterVorlage = {
    templateKey: eingabe.templateKey,
    name: eingabe.name,
    baseUrl,
    region: eingabe.region,
  };
  const testen =
    apiKey !== undefined || entferntSchluessel || neueAdresse || eingabe.region !== alt.region;
  if (testen) {
    await verbindungPruefen(
      k.dienste,
      endpunkt,
      apiKey ??
        (behaeltSchluessel ? gespeicherterSchluessel(k.dienste, alt, apiKeyEnc) : undefined),
    );
  }
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "anbieter.speichern", target: { providerId: id } },
    { created: false, region: eingabe.region, keySet: apiKey !== undefined || behaeltSchluessel },
    async () => {
      const neu = await repo.providers.update(k.db, id, {
        templateKey: eingabe.templateKey,
        name: eingabe.name,
        baseUrl,
        region: eingabe.region,
        enabled: eingabe.enabled,
        country: eingabe.country ?? null,
        ...(apiKey === undefined
          ? entferntSchluessel
            ? { apiKeyEnc: null }
            : {}
          : { apiKeyEnc: verschluesseln(k.dienste, id, baseUrl, apiKey) }),
      });
      if (neu === undefined) throw new PaiBotError("nicht_gefunden");
      const value = testen
        ? await repo.providers.setCheckResult(k.db, id, { ok: true, at: k.dienste.uhr.now() })
        : neu;
      return { value, result: { status: "ok" } };
    },
  );
  return { daten: { anbieter: ergebnis.value } };
}

/** So weit in der Zukunft, dass jeder wartende oder laufende Lauf davor liegt. */
const ALLE_LAEUFE_MS = 100 * 365 * 24 * 60 * 60 * 1000;

/**
 * Arbeitet der Bot gerade (Lauf wartet oder läuft) mit einem Modell dieses Anbieters? Dann wird
 * der Anbieter nicht entfernt: Ein wartender Lauf fände sonst kein Modell mehr.
 */
async function schreibtMitAnbieter(
  db: Database,
  providerId: ProviderId,
  jetzt: Date,
): Promise<{ bot: string } | undefined> {
  const bot = await repo.bots.getDefault(db);
  if (bot?.modelId === undefined) return undefined;
  const modell = await repo.models.get(db, bot.modelId as ModelId);
  if (modell?.providerId !== providerId) return undefined;
  const laeufe = await repo.runs.findStale(db, {
    before: new Date(jetzt.getTime() + ALLE_LAEUFE_MS),
    statuses: ["queued", "running"],
  });
  return laeufe.length > 0 ? { bot: bot.name } : undefined;
}

/**
 * `DELETE /api/anbieter/:id`: entfernt Anbieter samt Schlüssel; Modelle des Anbieters gehen mit.
 * Nutzt der Bot ein Modell dieses Anbieters, hat er danach keins mehr (der Chat zeigt dann den Weg
 * zu „Modell und Anbieter“); frühere Nachrichten bleiben. Schreibt der Bot gerade mit einem Modell
 * des Anbieters, lehnt die Route ab (`lauf_aktiv`), bis die Antwort fertig oder abgebrochen ist.
 */
export async function anbieterLoeschen(k: RoutenKontext<"anbieterLoeschen">) {
  const { provider } = await anbieterMitSchluessel(k.db, k.params.id ?? "");
  const providerId = provider.id as ProviderId;
  const schreibt = await schreibtMitAnbieter(k.db, providerId, k.dienste.uhr.now());
  if (schreibt !== undefined) {
    const p = { name: schreibt.bot, anbieter: provider.name };
    throw new PaiBotError("lauf_aktiv", {
      text: t("modelle.eigen.lauf_aktiv", p),
      ausweg: t("modelle.eigen.lauf_aktiv.ausweg"),
    });
  }
  await k.tor(k.nachweis, { type: "anbieter.loeschen", target: { providerId } }, {}, async () => {
    const weg = await repo.providers.remove(k.db, providerId);
    if (!weg) throw new PaiBotError("nicht_gefunden");
    return { value: undefined, result: { status: "ok" } };
  });
  return { daten: { entfernt: true } };
}

/**
 * `POST /api/anbieter/verbindungstest`: prüft einen neuen Schlüssel (für einen gespeicherten
 * Anbieter oder für die Vorlage) oder den gespeicherten Schlüssel eines Anbieters. Speichert nichts.
 */
export async function anbieterVerbindungstest(k: RoutenKontext<"anbieterVerbindungstest">) {
  const { providerId, apiKey } = k.eingabe;
  let endpunkt: AnbieterVorlage;
  let schluessel = apiKey;
  if (providerId !== undefined) {
    const { provider, apiKeyEnc } = await anbieterMitSchluessel(k.db, providerId);
    endpunkt = endpunktVon(provider);
    if (schluessel === undefined) {
      schluessel = gespeicherterSchluessel(k.dienste, provider, apiKeyEnc);
      if (schluessel === undefined && !ohneSchluesselErlaubt(provider.region)) {
        throw schluesselFehlt();
      }
    }
  } else {
    endpunkt = k.dienste.einrichtungsAnbieter();
  }
  const ergebnis = await verbindungPruefen(k.dienste, endpunkt, schluessel);
  return { daten: { anzahl: ergebnis.models.length } };
}

/**
 * `POST /api/anbieter/:id/modelle`: holt die passenden Modelle beim Anbieter und hält sie in der
 * Datenbank vor, damit der Bot eines davon über seine Kennung wählen kann. Modelle, die der
 * Anbieter nicht mehr meldet, sind danach nicht mehr wählbar. Das Abgleichen ist eine Änderung am
 * Anbieter und läuft durch das Tor (Aktion `anbieter.speichern`, mit Beleg).
 */
export async function anbieterModelle(k: RoutenKontext<"anbieterModelle">) {
  const { provider, apiKeyEnc } = await anbieterMitSchluessel(k.db, k.params.id ?? "");
  const id = provider.id as ProviderId;
  const schluessel = gespeicherterSchluessel(k.dienste, provider, apiKeyEnc);
  if (schluessel === undefined && !ohneSchluesselErlaubt(provider.region)) {
    throw verbindungsFehler(
      "schluessel_ungueltig",
      provider.name,
      provider.templateKey === "eigener",
    );
  }
  const ergebnis = await verbindungPruefen(k.dienste, endpunktVon(provider), schluessel);
  const abgleich = await k.tor(
    k.nachweis,
    { type: "anbieter.speichern", target: { providerId: id } },
    { created: false, region: provider.region, keySet: schluessel !== undefined },
    async () => {
      const liste = await modelleAbgleichen(k, id, ergebnis.models);
      return { value: liste, result: { status: "ok" } };
    },
  );
  const modelle = abgleich.value;
  return { daten: { modelle } };
}

async function modelleAbgleichen(
  k: RoutenKontext<"anbieterModelle">,
  id: ProviderId,
  gemeldeteModelle: readonly { slug: string; displayName: string; contextWindow?: number }[],
): Promise<ModellEintrag[]> {
  return k.db.transaction(async (tx) => {
    const liste: ModellEintrag[] = [];
    for (const info of gemeldeteModelle) {
      const m = await repo.models.upsert(tx, {
        providerId: id,
        slug: info.slug,
        displayName: info.displayName,
        ...(info.contextWindow === undefined ? {} : { contextWindow: info.contextWindow }),
      });
      if (!m.enabled) await repo.models.setEnabled(tx, m.id as ModelId, true);
      liste.push({
        id: m.id as ModelId,
        slug: m.slug,
        displayName: m.displayName,
        ...(m.contextWindow === undefined ? {} : { contextWindow: m.contextWindow }),
      });
    }
    const gemeldet = new Set(gemeldeteModelle.map((m) => m.slug));
    for (const m of await repo.models.list(tx, { providerId: id })) {
      if (m.enabled && !gemeldet.has(m.slug)) {
        await repo.models.setEnabled(tx, m.id as ModelId, false);
      }
    }
    return liste;
  });
}
