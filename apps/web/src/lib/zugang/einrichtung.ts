/**
 * PaiBot – Einrichtung: Zustand, Verbindungstest mit Einrichtungs-Code und der Abschluss in einer
 * einzigen Transaktion (alles oder nichts).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { encryptSecret, fingerprint, generateSigningKey } from "@paibot/crypto";
import { type Database, repo } from "@paibot/db";
import type { ModelInfo } from "@paibot/llm";
import type { ReceiptKeys } from "@paibot/receipts";
import { createReceiptWriter } from "@paibot/receipts";
import { providerSecretBinding, secretAad, signingKeySecretBinding } from "@paibot/shared/bindung";
import type { SetupConnectionTestInput, SetupInput } from "@paibot/shared/eingaben";
import { type ErrorCode, PaiBotError } from "@paibot/shared/fehler";
import { type BotId, type KeyId, newId, type OwnerId, type ProviderId } from "@paibot/shared/ids";
import { LIMITS } from "@paibot/shared/konstanten";
import { t } from "@paibot/shared/texte";
import type { RoutenKontext } from "../api/route";
import type { ZugangsDienste } from "./dienste";
import { codeSicherstellen } from "./einrichtungs-code";
import { _nachweisCode, type Nachweis, nachweisAusSitzung } from "./nachweis";
import { neuerPasswortHash } from "./passwort";
import {
  cookieLoeschen,
  type NeueSitzung,
  sitzungAnlegen,
  sitzungsCookie,
  vorabCookieName,
} from "./sitzung";

/** Was die Seite der Einrichtung vom Server wissen muss (ohne Geheimnisse). */
export interface EinrichtungsStatus {
  offen: boolean;
  /** Ist die Datenschleuse eingerichtet? Nur dann ist „An“ wählbar. */
  schleuseInstalliert: boolean;
  /** Name des Anbieters, den die Einrichtung verbindet. */
  anbieter: string;
  passwortMin: number;
  botVorschlag: string;
  /** Ohne `TRUST_PROXY=1`: Hinweis, dass Versuche nur gebremst werden. */
  ohneProxy: boolean;
}

/** Zustand der Einrichtung; sorgt während der offenen Einrichtung dafür, dass ein Code existiert. */
export async function einrichtungsStatus(
  db: Database,
  d: ZugangsDienste,
): Promise<EinrichtungsStatus> {
  const offen = !(await repo.settings.isSetupComplete(db));
  if (offen) await codeSicherstellen(d.code, db, d.uhr.now(), d.log.info);
  return {
    offen,
    schleuseInstalliert: d.schleuseInstalliert(),
    anbieter: d.einrichtungsAnbieter().name,
    passwortMin: LIMITS.passwordMinChars,
    botVorschlag: t("einrichtung.bot.vorschlag"),
    ohneProxy: !d.hinterProxy(),
  };
}

/**
 * Prüft den Einrichtungs-Code in konstanter Zeit. Falsch: `einrichtungs_code_falsch` (der Versuch
 * ist schon auf `einrichtungIp` gezählt). Richtig: das Limit der Adresse wird zurückgesetzt und es
 * gibt den Nachweis „Einrichtungs-Code“.
 */
async function codePruefen(
  kontext: RoutenKontext<"einrichtungAbschliessen" | "einrichtungVerbindungstest">,
  code: string,
): Promise<Nachweis> {
  if (!(await kontext.dienste.code.pruefen(kontext.db, code))) {
    throw new PaiBotError("einrichtungs_code_falsch", {
      felder: [{ feld: "setupCode", code: "ungueltig" }],
    });
  }
  await kontext.limitZuruecksetzen("einrichtungIp");
  return _nachweisCode();
}

/** Fehler des Anbieters als Fehler am Feld „Schlüssel“. */
function anbieterFehler(code: ErrorCode): PaiBotError {
  return new PaiBotError(code, { felder: [{ feld: "apiKey", code: "ungueltig" }] });
}

/** Ergebnis des Verbindungstests: die Modelle, aus denen die Einrichtung eins wählt. */
export interface VerbindungsErgebnis {
  modelle: ModelInfo[];
}

/** `POST /api/einrichtung/verbindungstest`: nur mit gültigem Code, nur mit neuem Schlüssel. */
export async function einrichtungVerbindungstest(
  kontext: RoutenKontext<"einrichtungVerbindungstest">,
): Promise<VerbindungsErgebnis> {
  const eingabe: SetupConnectionTestInput = kontext.eingabe;
  await codePruefen(kontext, eingabe.setupCode);
  const ergebnis = await kontext.dienste.verbindungTesten(
    kontext.dienste.einrichtungsAnbieter(),
    eingabe.apiKey,
  );
  if (!ergebnis.ok) throw anbieterFehler(ergebnis.code);
  return { modelle: ergebnis.models };
}

/** Störstelle für Tests: wirft an der genannten Stelle mitten in der Transaktion. */
export type EinrichtungsSchritt = "besitzer" | "bot" | "anbieter" | "modell" | "schleuse";

export interface AbschlussOptionen {
  stoerung?: EinrichtungsSchritt;
}

/** Ergebnis des Abschlusses (ohne Geheimnisse). */
export interface AbschlussErgebnis {
  installationId: string;
  botId: BotId;
  botName: string;
  anbieter: boolean;
  modell?: string;
  schleuse: "on" | "off";
}

function stoeren(optionen: AbschlussOptionen, schritt: EinrichtungsSchritt): void {
  if (optionen.stoerung === schritt) throw new Error(`Störung im Schritt ${schritt}`);
}

/**
 * `POST /api/einrichtung`: schließt die Einrichtung ab.
 *
 * Vorab (ohne Transaktion): Code prüfen, beim Anbieter die Modelle holen und das gewählte Modell
 * suchen, Passwort-Hash rechnen. Danach in **einer** Transaktion: Einstellungen sperren und prüfen,
 * dass noch niemand eingerichtet hat; Signaturschlüssel erzeugen und verschlüsselt (gebunden an
 * Kennung und öffentlichen Teil) speichern; Beleg „Start“; dann über das Tor
 * `einrichtung.abschliessen` (Besitzer, Einstellungen, erste Sitzung), `bot.aendern` (erster Bot),
 * `anbieter.speichern` (Schlüssel gebunden an Anbieter und Host) und `modell.waehlen` (falls ein
 * Schlüssel angegeben ist) sowie `schleuse.umschalten` (falls „An“ gewählt). Scheitert ein Schritt,
 * bleibt nichts davon in der Datenbank, und der Code bleibt gültig. Mit dem Abschluss löscht
 * `completeSetup` den Prüfwert des Codes in derselben Transaktion; danach gilt er nicht mehr.
 */
export async function einrichtungAbschliessen(
  kontext: RoutenKontext<"einrichtungAbschliessen">,
  optionen: AbschlussOptionen = {},
): Promise<AbschlussErgebnis> {
  const eingabe: SetupInput = kontext.eingabe;
  const d = kontext.dienste;
  const codeNachweis = await codePruefen(kontext, eingabe.setupCode);

  if (eingabe.schleuseModeDefault === "on" && !d.schleuseInstalliert()) {
    throw new PaiBotError("schleuse_nicht_installiert", {
      felder: [{ feld: "schleuseModeDefault", code: "ungueltig" }],
    });
  }

  const anbieter = d.einrichtungsAnbieter();
  let modell: ModelInfo | undefined;
  if (eingabe.apiKey !== undefined) {
    const test = await d.verbindungTesten(anbieter, eingabe.apiKey);
    if (!test.ok) throw anbieterFehler(test.code);
    if (eingabe.modelSlug !== undefined) {
      modell = test.models.find((m) => m.slug === eingabe.modelSlug);
      if (modell === undefined) {
        throw new PaiBotError("eingabe_ungueltig", {
          felder: [{ feld: "modelSlug", code: "ungueltig" }],
        });
      }
    }
  }
  const passwortHash = await neuerPasswortHash(eingabe.password);
  const schluessel = d.schluessel();
  const userAgent = kontext.request.headers.get("user-agent");

  const ergebnis = await kontext.db.transaction(async (tx) => {
    await repo.settings.ensure(tx);
    await tx.execute(`select 1 from "public"."settings" where id = 'singleton' for update`);
    const einstellungen = await repo.settings.get(tx);
    const vorhanden = await repo.owner.get(tx);
    if (einstellungen?.setupCompletedAt !== undefined || vorhanden !== undefined) {
      throw new PaiBotError("einrichtung_fertig");
    }
    // Unter der Sperre noch einmal: Gilt der geprüfte Code noch (nicht inzwischen ersetzt)?
    if (!(await d.code.pruefen(tx, eingabe.setupCode))) {
      throw new PaiBotError("einrichtungs_code_falsch", {
        felder: [{ feld: "setupCode", code: "ungueltig" }],
      });
    }

    // Signaturschlüssel der Installation, verschlüsselt und gebunden an Kennung und öffentlichen Teil.
    const installationId = newId("installation");
    const paar = generateSigningKey();
    const keyId = newId("key") as KeyId;
    await repo.installationKeys.create(tx, {
      id: keyId,
      publicKey: paar.publicKey,
      privateKeyEnc: encryptSecret(paar.privateKey, schluessel.belege, {
        aad: secretAad(signingKeySecretBinding(keyId, paar.publicKey)),
      }),
      fingerprint: fingerprint(paar.publicKey),
    });
    const belegSchluessel: ReceiptKeys = {
      current: async () => ({ keyId, privateKey: paar.privateKey }),
    };
    const torOptionen = { db: tx, schluessel: belegSchluessel };

    // Beleg „Start“: erster Eintrag der Kette, vor jedem Lauf des Tors.
    await createReceiptWriter(tx, belegSchluessel).appendStart({
      installationId,
      key: { keyId, publicKey: paar.publicKey, privateKey: paar.privateKey },
      software: d.stand(),
      time: d.uhr.now(),
    });

    // Einrichtung abschließen: Besitzer, Einstellungen, erste Sitzung.
    const abschluss = await kontext.tor(
      codeNachweis,
      { type: "einrichtung.abschliessen", target: { installationId } },
      { setupOpen: true },
      async () => {
        const besitzer = await repo.owner.create(tx, { passwordHash: passwortHash });
        stoeren(optionen, "besitzer");
        await repo.settings.completeSetup(tx, {
          installationId,
          now: d.uhr.now(),
          ...(eingabe.timezone === undefined ? {} : { timezone: eingabe.timezone }),
        });
        const neu: NeueSitzung = await sitzungAnlegen(tx, besitzer.id as OwnerId, {
          now: d.uhr.now(),
          userAgent,
        });
        return { value: neu, result: { status: "ok" } };
      },
      torOptionen,
    );
    const sitzung = nachweisAusSitzung(abschluss.value.sitzung);

    // Erster Bot (mit der neuen Sitzung als Nachweis).
    const botId = newId("bot") as BotId;
    await kontext.tor(
      sitzung,
      { type: "bot.aendern", target: { botId } },
      { fields: ["name", "avatarShape", "color"] },
      async () => {
        await repo.bots.create(tx, {
          id: botId,
          name: eingabe.botName,
          avatarShape: "blatt",
          color: "limette",
        });
        await repo.settings.update(tx, { defaultBotId: botId });
        stoeren(optionen, "bot");
        return { value: undefined, result: { status: "ok" } };
      },
      torOptionen,
    );

    // Anbieter und Modell, wenn ein Schlüssel angegeben ist.
    if (eingabe.apiKey !== undefined) {
      const providerId = newId("provider") as ProviderId;
      const apiKey = eingabe.apiKey;
      await kontext.tor(
        sitzung,
        { type: "anbieter.speichern", target: { providerId } },
        { created: true, region: anbieter.region, keySet: true },
        async () => {
          await repo.providers.create(tx, {
            id: providerId,
            templateKey: anbieter.templateKey,
            name: anbieter.name,
            baseUrl: anbieter.baseUrl,
            region: anbieter.region,
            apiKeyEnc: encryptSecret(apiKey, schluessel.geheimnisse, {
              aad: secretAad(providerSecretBinding(providerId, anbieter.baseUrl)),
            }),
          });
          stoeren(optionen, "anbieter");
          return { value: undefined, result: { status: "ok" } };
        },
        torOptionen,
      );
      if (modell !== undefined) {
        const gewaehlt = modell;
        const modelId = newId("model");
        await kontext.tor(
          sitzung,
          { type: "modell.waehlen", target: { botId, modelId } },
          {},
          async () => {
            await repo.models.create(tx, {
              id: modelId,
              providerId,
              slug: gewaehlt.slug,
              displayName: gewaehlt.displayName,
              ...(gewaehlt.contextWindow === undefined
                ? {}
                : { contextWindow: gewaehlt.contextWindow }),
            });
            await repo.bots.setModel(tx, botId, modelId);
            stoeren(optionen, "modell");
            return { value: undefined, result: { status: "ok" } };
          },
          torOptionen,
        );
      }
    }

    // Datenschleuse als Standard, nur wenn „An“ gewählt und eingerichtet.
    if (eingabe.schleuseModeDefault === "on") {
      await kontext.tor(
        sitzung,
        { type: "schleuse.umschalten", target: {} },
        { scope: "standard", mode: "on", previousMode: "off", schleuseInstalled: true },
        async () => {
          await repo.settings.update(tx, { schleuseModeDefault: "on" });
          stoeren(optionen, "schleuse");
          return { value: undefined, result: { status: "ok" } };
        },
        torOptionen,
      );
    }

    return {
      sitzung: abschluss.value,
      daten: {
        installationId,
        botId,
        botName: eingabe.botName,
        anbieter: eingabe.apiKey !== undefined,
        ...(modell === undefined ? {} : { modell: modell.displayName }),
        schleuse: eingabe.schleuseModeDefault,
      } satisfies AbschlussErgebnis,
    };
  });

  // Den Prüfwert des Codes hat `completeSetup` in derselben Transaktion gelöscht.
  const rahmen = { appUrl: d.appOrigin() };
  kontext.cookie(sitzungsCookie(rahmen, ergebnis.sitzung.token, false));
  kontext.cookie(cookieLoeschen(vorabCookieName(rahmen), rahmen, "Strict"));
  return ergebnis.daten;
}
