/**
 * PaiBot – Routing-Regeln von EUrouter auf dem Server: Namen prüfen (je eine sehr kleine echte
 * Anfrage), geprüfte Regeln kurz merken, als wählbaren Eintrag speichern und wieder entfernen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createHash } from "node:crypto";
import { decryptSecret } from "@paibot/crypto";
import { type Database, repo } from "@paibot/db";
import {
  type RoutingRuleCheck,
  routingRuleNameOf,
  routingRuleSlug,
  supportsRoutingRules,
} from "@paibot/llm";
import { providerSecretBinding, secretAad } from "@paibot/shared/bindung";
import { PaiBotError } from "@paibot/shared/fehler";
import type { ServedBy } from "@paibot/shared/grundtypen";
import { isId, type ModelId, type ProviderId } from "@paibot/shared/ids";
import type { Provider } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import type { RoutenKontext } from "../api/route";
import type { EinrichtungsAnbieter } from "../umgebung";
import type { ZugangsDienste } from "../zugang/dienste";
import { antwortHerkunft, type UnterAnbieterListe } from "./herkunft";
import { vorgabeFuerNeueRegel } from "./verwaltung";
import { type RegelVorgabe, vorgabeAus } from "./vorgabe";

/** Ergebnis der Prüfung eines Namens, wie die Oberfläche es zeigt (nie mit Schlüssel). */
export interface RegelErgebnis {
  name: string;
  ok: boolean;
  /** Wer laut Antwort geantwortet hat (nur bei Erfolg, wenn gemeldet). */
  servedBy?: ServedBy;
  /** Herkunft in Worten, z. B. „Antwort von Nebul · Sitz Niederlande laut EUrouter“. */
  herkunft?: string;
  /** Mit zweitem Schlüssel gelesen: Die Regel meldet `data_residency: "EU"`. */
  eu?: boolean;
  /** Mit zweitem Schlüssel gelesen: Satz zur Kennzeichnung bzw. zur Residenz, mit Datum. */
  vorgabeText?: string;
  /** Satz zum Fehler mit Ausweg (nur bei Misserfolg). */
  text?: string;
  ausweg?: string;
}

/** Gespeicherter Eintrag einer Regel, mit den gelesenen Vorgaben, falls es welche gibt. */
export interface RegelEintrag {
  id: ModelId;
  name: string;
  /** Nur mit zweitem Schlüssel gelesen; fehlt bei Regeln, die nur per Name geprüft wurden. */
  vorgabe?: RegelVorgabe;
}

/** So lange gilt eine geprüfte Regel als geprüft (zwischen Prüfen und Abschließen). */
const GEPRUEFT_MS = 15 * 60 * 1000;

const SPEICHER = Symbol.for("paibot.web.regeln-geprueft");
type Halter = { [SPEICHER]?: Map<string, number> };

/** Merkmal aus Adresse, Schlüssel und Name; der Schlüssel selbst wird nicht gemerkt. */
function merkmal(baseUrl: string, schluessel: string, name: string): string {
  return createHash("sha256")
    .update(`${baseUrl}\u0000${schluessel.trim()}\u0000${name}`)
    .digest("base64url");
}

function geprueftSpeicher(): Map<string, number> {
  const halter = globalThis as Halter;
  halter[SPEICHER] ??= new Map();
  return halter[SPEICHER];
}

/** Text und Ausweg zu einem Fehler der Prüfung. */
export function regelFehlerText(
  code: Exclude<RoutingRuleCheck, { ok: true }>["code"],
  name: string,
  anbieter: string,
): { text: string; ausweg: string } {
  const p = { name, anbieter };
  return {
    text: t(`routingregel.fehler.${code}`, p),
    ausweg: t(`routingregel.fehler.${code}.ausweg`, p),
  };
}

/**
 * Prüft jeden Namen einzeln. Falscher Schlüssel, erreichtes Limit oder ein Ausfall des Anbieters
 * gelten für alle und kommen als Fehler (am Feld „Schlüssel“ bzw. allgemein); eine unbekannte
 * Regel steht nur bei ihrem Namen. Erfolgreiche Prüfungen werden eine Viertelstunde gemerkt;
 * `nurNeue` prüft gemerkte Namen nicht noch einmal (spart Token beim Abschließen).
 */
export async function regelnPruefen(
  d: ZugangsDienste,
  anbieter: EinrichtungsAnbieter,
  schluessel: string,
  namen: readonly string[],
  optionen: { nurNeue?: boolean } = {},
): Promise<RegelErgebnis[]> {
  const speicher = geprueftSpeicher();
  const jetzt = d.uhr.now().getTime();
  for (const [k, bis] of speicher) if (bis <= jetzt) speicher.delete(k);
  const ergebnisse: RegelErgebnis[] = [];
  let liste: UnterAnbieterListe | undefined | null = null;
  const herkunft = async (servedBy: ServedBy | undefined) => {
    if (servedBy === undefined) return {};
    if (liste === null) liste = await d.unterAnbieter(anbieter);
    const text = antwortHerkunft(anbieter, servedBy, liste);
    return text === undefined ? {} : { herkunft: text };
  };
  for (const name of [...new Set(namen)]) {
    const m = merkmal(anbieter.baseUrl, schluessel, name);
    if (optionen.nurNeue === true && (speicher.get(m) ?? 0) > jetzt) {
      ergebnisse.push({ name, ok: true });
      continue;
    }
    const pruefung = await d.regelPruefen(anbieter, schluessel, name);
    if (pruefung.ok) {
      speicher.set(m, jetzt + GEPRUEFT_MS);
      ergebnisse.push({
        name,
        ok: true,
        ...(pruefung.servedBy === undefined ? {} : { servedBy: pruefung.servedBy }),
        ...(await herkunft(pruefung.servedBy)),
      });
      continue;
    }
    if (pruefung.code === "regel_unbekannt" || pruefung.code === "abgelehnt") {
      ergebnisse.push({ name, ok: false, ...regelFehlerText(pruefung.code, name, anbieter.name) });
      continue;
    }
    const { text, ausweg } = regelFehlerText(pruefung.code, name, anbieter.name);
    throw new PaiBotError(pruefung.code, {
      text,
      ausweg,
      ...(pruefung.code === "schluessel_ungueltig"
        ? { felder: [{ feld: "apiKey", code: "ungueltig" }] }
        : {}),
    });
  }
  return ergebnisse;
}

/**
 * Gespeicherte Regeln eines Anbieters (nur wählbare Einträge mit Regel-Kennung), mit den gelesenen
 * Vorgaben. `jetzt` und `zeitzone` bestimmen, ob eine Angabe als länger nicht geprüft gilt.
 */
export async function regelnVon(
  db: Database,
  anbieter: Provider,
  kontext: { jetzt: Date; zeitzone: string } = { jetzt: new Date(), zeitzone: "Europe/Berlin" },
): Promise<RegelEintrag[]> {
  if (!supportsRoutingRules(anbieter.templateKey)) return [];
  const eintraege: RegelEintrag[] = [];
  const vorgaben = await repo.models.rulePolicies(db, anbieter.id as ProviderId);
  for (const m of await repo.models.list(db, { providerId: anbieter.id as ProviderId })) {
    const name = routingRuleNameOf(anbieter.templateKey, m.slug);
    if (name === undefined || !m.enabled) continue;
    const gespeichert = vorgaben[m.id];
    eintraege.push({
      id: m.id as ModelId,
      name,
      ...(gespeichert === undefined
        ? {}
        : {
            vorgabe: vorgabeAus(
              gespeichert.policy,
              gespeichert.checkedAt,
              kontext.jetzt,
              kontext.zeitzone,
            ),
          }),
    });
  }
  return eintraege.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/**
 * Frühere Einträge aus der Modell-Liste eines Anbieters mit Regeln (EUrouter, vor den Regeln
 * eingerichtet). Sie bleiben benutzbar, haben aber keine Herkunfts-Angabe aus einer Regel.
 */
export async function alteModelleVon(
  db: Database,
  anbieter: Provider,
): Promise<{ id: ModelId; slug: string; displayName: string }[]> {
  if (!supportsRoutingRules(anbieter.templateKey)) return [];
  return (await repo.models.list(db, { providerId: anbieter.id as ProviderId }))
    .filter((m) => m.enabled && routingRuleNameOf(anbieter.templateKey, m.slug) === undefined)
    .map((m) => ({ id: m.id as ModelId, slug: m.slug, displayName: m.displayName }));
}

async function anbieterMitRegeln(db: Database, id: string) {
  if (!isId("provider", id)) throw new PaiBotError("nicht_gefunden");
  const gefunden = await repo.providers.getWithKey(db, id as ProviderId);
  if (gefunden === undefined) throw new PaiBotError("nicht_gefunden");
  if (!supportsRoutingRules(gefunden.provider.templateKey)) {
    throw new PaiBotError("eingabe_ungueltig", { text: t("routingregel.nur_eurouter") });
  }
  return gefunden;
}

function gespeicherterSchluessel(d: ZugangsDienste, anbieter: Provider, enc: string | undefined) {
  if (enc === undefined) {
    throw new PaiBotError("schluessel_ungueltig", {
      text: t("modelle.schluessel.fehlt"),
      ausweg: t("routingregel.schluessel_fehlt.ausweg"),
    });
  }
  try {
    return decryptSecret(enc, d.schluessel().geheimnisse, {
      aad: secretAad(providerSecretBinding(anbieter.id as ProviderId, anbieter.baseUrl)),
    });
  } catch {
    throw new PaiBotError("schluessel_ungueltig", {
      text: t("modelle.schluessel.unlesbar"),
      ausweg: t("modelle.schluessel.unlesbar.ausweg"),
    });
  }
}

/**
 * `POST /api/anbieter/:id/regeln`: prüft den Namen mit dem gespeicherten Schlüssel und speichert die
 * Regel als wählbaren Eintrag (Aktion `anbieter.speichern`). Eine unbekannte Regel wird nicht
 * gespeichert (`eingabe_ungueltig` am Feld `name`, mit Ausweg).
 */
export async function anbieterRegelHinzufuegen(k: RoutenKontext<"anbieterRegelHinzufuegen">) {
  const { provider, apiKeyEnc, managementKeyEnc } = await anbieterMitRegeln(
    k.db,
    k.params.id ?? "",
  );
  const name = k.eingabe.name;
  const schluessel = gespeicherterSchluessel(k.dienste, provider, apiKeyEnc);
  const [ergebnis] = await regelnPruefen(k.dienste, provider, schluessel, [name]);
  if (ergebnis === undefined || !ergebnis.ok) {
    throw new PaiBotError("eingabe_ungueltig", {
      text:
        ergebnis?.text ??
        t("routingregel.fehler.regel_unbekannt", { name, anbieter: provider.name }),
      ...(ergebnis?.ausweg ? { ausweg: ergebnis.ausweg } : {}),
      felder: [{ feld: "name", code: "ungueltig" }],
    });
  }
  const providerId = provider.id as ProviderId;
  // Mit zweitem Schlüssel: Vorgaben der Regel aus der Liste des Kontos (nur lesend, vor dem Tor).
  const vorgabe = await vorgabeFuerNeueRegel(k.dienste, provider, managementKeyEnc, name);
  const jetzt = k.dienste.uhr.now();
  const gespeichert = await k.tor(
    k.nachweis,
    { type: "anbieter.speichern", target: { providerId } },
    { created: false, region: provider.region, keySet: true },
    async () => {
      const m = await repo.models.upsert(k.db, {
        providerId,
        slug: routingRuleSlug(name),
        displayName: name,
      });
      if (!m.enabled) await repo.models.setEnabled(k.db, m.id as ModelId, true);
      if (vorgabe.policy !== undefined) {
        await repo.models.setRulePolicy(k.db, m.id as ModelId, {
          policy: vorgabe.policy,
          source: "verwaltungsschluessel",
          checkedAt: jetzt,
        });
      }
      await repo.providers.setCheckResult(k.db, providerId, { ok: true, at: k.dienste.uhr.now() });
      return { value: m, result: { status: "ok" } };
    },
  );
  const regel: RegelEintrag = {
    id: gespeichert.value.id as ModelId,
    name,
    ...(vorgabe.policy === undefined
      ? {}
      : {
          vorgabe: vorgabeAus(
            vorgabe.policy,
            jetzt,
            jetzt,
            (await repo.settings.get(k.db))?.timezone ?? "Europe/Berlin",
          ),
        }),
  };
  return {
    daten: {
      regel,
      ...(vorgabe.hinweis === undefined ? {} : { hinweis: vorgabe.hinweis }),
      ...(ergebnis.servedBy === undefined ? {} : { servedBy: ergebnis.servedBy }),
      ...(ergebnis.herkunft === undefined ? {} : { herkunft: ergebnis.herkunft }),
    },
    status: 201,
  };
}

/**
 * `DELETE /api/anbieter/:id/regeln/:modellId`: entfernt eine gespeicherte Regel. Nutzt der Bot sie
 * gerade für eine laufende Antwort, lehnt die Route ab (`lauf_aktiv`); sonst hat der Bot danach
 * kein Modell mehr, wenn er diese Regel benutzt hat.
 */
export async function anbieterRegelEntfernen(k: RoutenKontext<"anbieterRegelEntfernen">) {
  const { provider } = await anbieterMitRegeln(k.db, k.params.id ?? "");
  const modellId = k.params.modellId ?? "";
  if (!isId("model", modellId)) throw new PaiBotError("nicht_gefunden");
  const modell = await repo.models.get(k.db, modellId as ModelId);
  if (
    modell === undefined ||
    modell.providerId !== provider.id ||
    routingRuleNameOf(provider.templateKey, modell.slug) === undefined
  ) {
    throw new PaiBotError("nicht_gefunden");
  }
  const bot = await repo.bots.getDefault(k.db);
  if (bot?.modelId === modell.id) {
    const laeufe = await repo.runs.findStale(k.db, {
      before: new Date(k.dienste.uhr.now().getTime() + 100 * 365 * 24 * 60 * 60 * 1000),
      statuses: ["queued", "running"],
    });
    if (laeufe.length > 0) {
      throw new PaiBotError("lauf_aktiv", {
        text: t("modelle.eigen.lauf_aktiv", { name: bot.name, anbieter: provider.name }),
        ausweg: t("modelle.eigen.lauf_aktiv.ausweg"),
      });
    }
  }
  await k.tor(
    k.nachweis,
    { type: "anbieter.speichern", target: { providerId: provider.id as ProviderId } },
    { created: false, region: provider.region, keySet: true },
    async () => {
      const weg = await repo.models.remove(k.db, modell.id as ModelId);
      if (!weg) throw new PaiBotError("nicht_gefunden");
      return { value: undefined, result: { status: "ok" } };
    },
  );
  return { daten: { entfernt: true } };
}
