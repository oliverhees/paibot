<!--
PaiBot – Entwickler-Doku: Einrichtung und Zugang (Einrichtungs-Code, Anmeldung, Sitzungen, Geräte).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Einrichtung und Zugang – für Entwickler

**Anwender-Doku:** [Einrichtung und Zugang](../funktion-einrichtung-und-zugang.md)

## Zweck und Entscheidung

Der Zugang regelt, wer PaiBot benutzen darf: einmalige Einrichtung mit Einrichtungs-Code, danach Anmelden mit Passwort, Sitzungen, bekannte Geräte und Schutz gegen untergeschobene Anfragen. Der Code liegt in `apps/web/src/lib/zugang/`.

Belegte Entscheidungen im Code:

- **Einrichtung in einer Transaktion:** Abschluss „alles oder nichts“ (`apps/web/src/lib/zugang/einrichtung.ts`, Kopfkommentar); unter der Sperre der Zeile `settings` wird der Code noch einmal geprüft (`apps/web/src/lib/zugang/einrichtung.ts#einrichtungAbschliessen`).
- **Code nie im Klartext gespeichert:** Der Einrichtungs-Code steht nur im Log und in der Datenbank nur als Prüfwert und wird mit dem Abschluss verworfen (`apps/web/src/lib/zugang/einrichtungs-code.ts`, Kopfkommentar).
- **Token nie gespeichert:** Die ID einer Sitzung ist der SHA-256 des Tokens (`packages/db/src/schema/zugang.ts#sessions`); dasselbe gilt für Geräte (`token_hash`, `packages/db/src/schema/zugang.ts#geraete`).
- **Seiten prüfen selbst:** Jede Seite der App prüft die Sitzung selbst, nicht nur der Proxy (`apps/web/src/lib/zugang/seite.ts`, Kopfkommentar).
- **Nachweise nicht nachbaubar:** Geprüfte Sitzung und Nachweise für das Tor sind Objekte, die nur der Zugang erzeugt (`apps/web/src/lib/zugang/nachweis.ts`, Kopfkommentar).

## Aufbau

| Datei                                                                         | Aufgabe                                                                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/zugang/einrichtung.ts`                                      | `einrichtungsStatus`, `einrichtungVerbindungstest`, `einrichtungAbschliessen`                     |
| `apps/web/src/lib/zugang/einrichtungs-code.ts`                                | Code erzeugen, prüfen, Log-Zeile, Prüfwert; Gültigkeit `CODE_GUELTIG_MS` (24 Stunden)             |
| `apps/web/src/lib/zugang/start.ts`                                            | `zugangBeimStart`: Code beim Serverstart ins Log, solange nicht eingerichtet                      |
| `apps/web/src/lib/zugang/anmeldung.ts`                                        | `anmelden`, `abmelden`, `alleAbmelden`, `passwortAendern`, `geraetEntfernen`, `geraetHinzufuegen` |
| `apps/web/src/lib/zugang/sitzung.ts`                                          | Sitzung anlegen, aus dem Cookie prüfen, gleitend verlängern, beenden; Cookies                     |
| `apps/web/src/lib/zugang/geraet.ts`                                           | bekannte Geräte: signiertes Cookie, Kennung auf dem Server nur als SHA-256                        |
| `apps/web/src/lib/zugang/hinweis.ts`                                          | Hinweis auf den anderen Geräten bei Anmeldung von einem neuen Gerät                               |
| `apps/web/src/lib/zugang/passwort.ts`                                         | Passwort prüfen mit begrenzter Gleichzeitigkeit und gleicher Dauer ohne Besitzer                  |
| `apps/web/src/lib/zugang/nachweis.ts`                                         | geprüfte Sitzung und Nachweise (`sitzung`, `passwort`, `einrichtungs_code`) für das Tor           |
| `apps/web/src/lib/zugang/weiterleitung.ts`                                    | Entscheidung des Proxys je Anfrage: durchlassen, umleiten oder 401 (reine Funktion)               |
| `apps/web/src/lib/zugang/seite.ts`                                            | Zugang für Server-Seiten                                                                          |
| `apps/web/src/lib/zugang/dienste.ts`                                          | Datenbank, Umgebung, Schlüssel, Uhr, Code je Prozess (`prozessDienste`)                           |
| `apps/web/src/lib/csrf.ts`                                                    | Herkunft prüfen, Prüfzeichen ableiten und vergleichen                                             |
| `apps/web/src/lib/rate-limit.ts`                                              | Rate-Limits zählen (sperren mit `Retry-After` oder verzögern), gemeinsame Bremse `BREMSE`         |
| `apps/web/src/proxy.ts`                                                       | Proxy vor jeder Anfrage: Sicherheits-Kopfzeilen mit Nonce, Körper-Grenze, Weiterleitung           |
| `packages/crypto/src/password.ts`                                             | scrypt (`SCRYPT_PARAMS`: N 32768, r 8, p 1)                                                       |
| `packages/crypto/src/token.ts`                                                | zufällige Tokens und ihre Prüfsumme (`newToken`, `hashToken`)                                     |
| `packages/crypto/src/master.ts`                                               | `PAIBOT_SECRET` laden und Unterschlüssel ableiten (`deriveKey`, `KEY_PURPOSES`)                   |
| `apps/web/src/app/einrichtung/page.tsx`, `apps/web/src/app/anmelden/page.tsx` | Seiten Einrichtung und Anmelden                                                                   |

Ablauf des Abschlusses (`apps/web/src/lib/zugang/einrichtung.ts#einrichtungAbschliessen`):

1. Einrichtungs-Code prüfen; ist der Standard der Datenschleuse „an“, muss sie eingerichtet sein (`schleuse_nicht_installiert`).
2. Mit Schlüssel: Verbindung zum Anbieter testen, gewähltes Modell muss in der Liste sein.
3. Passwort-Hash berechnen (vor der Transaktion).
4. In einer Transaktion: `settings` sperren, prüfen, dass es weder Abschluss noch Besitzer gibt (`einrichtung_fertig`), Code unter der Sperre erneut prüfen.
5. Signaturschlüssel erzeugen und verschlüsselt in `installation_keys` speichern, gebunden an Kennung und öffentlichen Teil; Beleg „Start“ (`appendStart`).
6. Durch das Tor: `einrichtung.abschliessen` (Besitzer, Einstellungen, erste Sitzung), `geraet.hinzufuegen`, `bot.aendern` (erster Bot), mit Schlüssel `anbieter.speichern` (Schlüssel verschlüsselt, gebunden an Anbieter und Adresse) und mit gewähltem Modell `modell.waehlen`; nur bei Standard „an“ `schleuse.umschalten`.

## Datenmodell und Migrationen

| Tabelle             | Schema                               | Wofür                                                               |
| ------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| `owner`             | `packages/db/src/schema/zugang.ts`   | die eine Person; höchstens eine Zeile (`owner_einzige_zeile`)       |
| `sessions`          | `packages/db/src/schema/zugang.ts`   | Sitzungen; ID ist SHA-256 des Tokens; optional Gerät                |
| `geraete`           | `packages/db/src/schema/zugang.ts`   | bekannte Geräte, nur `token_hash`                                   |
| `rate_limits`       | `packages/db/src/schema/zugang.ts`   | Zähler der Rate-Limits                                              |
| `settings`          | `packages/db/src/schema/settings.ts` | u. a. Prüfwert des Einrichtungs-Codes und Abschluss der Einrichtung |
| `installation_keys` | `packages/db/src/schema/tor.ts`      | Signaturschlüssel, beim Abschluss angelegt                          |

Migrationen: `packages/db/drizzle/0001_basis.sql` (`owner`, `sessions`, `rate_limits`), `packages/db/drizzle/0006_regeln_und_belege.sql` (`setup_code_hash`, `setup_code_created_at` mit CHECKs und Trigger `settings_einrichtungs_code_ohne_besitzer`), `packages/db/drizzle/0008_bekannte_geraete.sql` (`geraete`, `sessions.device_id`), `packages/db/drizzle/0009_hinweis_neue_geraete.sql` (`geraete.notice_seen_at`).

Zugriff über `packages/db/src/repo/besitzer.ts`, `packages/db/src/repo/sitzungen.ts`, `packages/db/src/repo/geraete.ts` (`MAX_GERAETE` 10, `AUFBEWAHREN_TAGE` 30) und `packages/db/src/repo/ratenbegrenzung.ts`.

## Schnittstellen

Aus dem Routen-Vertrag `apps/web/src/lib/routen.ts#API_ROUTEN`:

| Route                                    | Zugang   | Aktion                     |
| ---------------------------------------- | -------- | -------------------------- |
| `GET /api/einrichtung`                   | vorab    | – (lesend)                 |
| `POST /api/einrichtung/verbindungstest`  | vorab    | – (nicht verändernd)       |
| `POST /api/einrichtung`                  | vorab    | `einrichtung.abschliessen` |
| `POST /api/zugang/anmelden`              | vorab    | `zugang.anmelden`          |
| `POST /api/zugang/abmelden`              | besitzer | `zugang.abmelden`          |
| `POST /api/zugang/alle-abmelden`         | besitzer | `zugang.alle_abmelden`     |
| `GET /api/zugang/sitzungen`              | besitzer | – (lesend)                 |
| `GET /api/zugang/geraete`                | besitzer | – (lesend)                 |
| `POST /api/zugang/geraete/:id/entfernen` | besitzer | `geraet.entfernen`         |
| `POST /api/zugang/geraete/hinweis`       | besitzer | `geraet.bestaetigen`       |
| `POST /api/zugang/passwort`              | besitzer | `zugang.passwort_aendern`  |

`geraet.hinzufuegen` hat keine eigene Route; sie läuft als Folge von Anmelden, Einrichtung und Passwort ändern (`apps/web/src/lib/routen.ts#FOLGE_AKTIONEN`).

Die Route-Dateien liegen unter `apps/web/src/app/api/einrichtung/` und `apps/web/src/app/api/zugang/`.

## Sicherheit

- **Reihenfolge im Rahmen:** Methode, Einrichtung, Sitzung, CSRF, Limits, Eingabe, Tor (`apps/web/src/lib/api/route.ts`, Kopfkommentar). Zugang `vorab` heißt: ohne Sitzung, aber mit Vorab-Prüfzeichen (`apps/web/src/lib/routen.ts`, Typ `Zugang`).
- **Nachweis an die Aktion gebunden:** Einrichtungs-Code nur für `einrichtung.abschliessen` (R-003), Passwort nur für `zugang.anmelden` (R-004), sonst nur Sitzung (R-006, R-001) (`packages/shared/src/gate.ts#CREDENTIAL_SCOPE`).
- **Rate-Limits:** `anmeldenIp` 5 je 15 Minuten (sperren), `anmeldenGesamt` 20 je 15 Minuten (verzögern), `einrichtungIp` 5 je 15 Minuten, `verbindungstestIp` 10 je 15 Minuten (`packages/shared/src/constants.ts#RATE_LIMITS`); weitere Limits in `apps/web/src/lib/rate-limit.ts#ZUSATZ_LIMITS`. IPv6 zählt je /64 (`apps/web/src/lib/rate-limit.ts#limitSchluessel`). Über dem Gesamt-Limit prüft die Bremse höchstens ein Passwort je Takt, bekannte Geräte unter ihrem eigenen Limit ausgenommen (`apps/web/src/lib/rate-limit.ts#BREMSE`).
- **Passwort-Prüfung:** höchstens `PASSWORD_HASH_CONCURRENCY` (2) gleichzeitig (`packages/shared/src/constants.ts#PASSWORD_HASH_CONCURRENCY`), gleiche Dauer auch ohne Besitzer (`apps/web/src/lib/zugang/passwort.ts`).
- **Sitzungsdauer:** gleitend 30 Tage, höchstens 90 Tage (`packages/shared/src/constants.ts#SESSION`); Cookies mit Präfix `__Host-` nur über https (`packages/shared/src/constants.ts#COOKIE`).
- **Proxy:** Für zwei Routen mit größerer Körper-Grenze (Nachricht senden, Bot ändern) läuft der Proxy nicht; diese Routen prüfen Sitzung, Herkunft und Prüfzeichen selbst (Kommentar an `config` in `apps/web/src/proxy.ts`).
- **Einrichtungs-Code in der Datenbank:** nur als `sha256:…`, nur vor dem Abschluss und nur ohne Besitzer (CHECKs und Trigger in `packages/db/drizzle/0006_regeln_und_belege.sql`).

## Tests

| Test                                                                         | Prüft                                                                                   |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `apps/web/src/lib/zugang/einrichtung.test.ts`                                | Code, Limits, Abschluss in einer Transaktion, Belege, danach gesperrt                   |
| `apps/web/src/lib/zugang/einrichtung-postgres.test.ts`                       | zwei gleichzeitige Abschlüsse, genau einer gewinnt (nur mit `PAIBOT_TEST_DATABASE_URL`) |
| `apps/web/src/lib/zugang/einrichtungs-code.test.ts`                          | Form, Zufall, Prüfung, Log-Zeile, Prüfwert, Neustart, mehrere Prozesse                  |
| `apps/web/src/lib/zugang/anmeldung.test.ts`                                  | Anmelden, Sitzung, Abmelden, Passwortwechsel, CSRF                                      |
| `apps/web/src/lib/zugang/anmelde-schutz.test.ts`                             | Schutz beim Anmelden und Passwort ändern (Netze, gemeinsame Bremse)                     |
| `apps/web/src/lib/zugang/passwort.test.ts`                                   | höchstens zwei gleichzeitig, gleiche Dauer ohne Besitzer                                |
| `apps/web/src/lib/zugang/hinweis.test.ts`                                    | Gerät im Beleg, Hinweis bei neuem Gerät                                                 |
| `apps/web/src/lib/zugang/start.test.ts`                                      | Code genau einmal ins Log, Sitzungsprüfung für den Ereignis-Strom                       |
| `apps/web/src/lib/csrf.test.ts`, `apps/web/src/lib/rate-limit.test.ts`       | Herkunft und Prüfzeichen; Rate-Limits                                                   |
| `apps/web/src/proxy.test.ts`                                                 | Weiterleitungen, Nonce, CSP, HSTS nur bei https, 401 für API                            |
| `packages/crypto/src/password.test.ts`, `packages/crypto/src/master.test.ts` | Passwort-Hash; Wurzel-Geheimnis und Ableitung                                           |
| `packages/db/src/repo/zugang.test.ts`                                        | Besitzer, Sitzungen, Rate-Limit in der Datenbank                                        |

Ausführen:

```bash
pnpm --filter @paibot/web test
pnpm --filter @paibot/crypto test
```

## Bekannte Schwächen

- **Not-Aus sperrt den Zugang nicht:** Der Not-Aus hält Bots an; angemeldete Sitzungen bleiben gültig (Anwender-Doku [Das Tor](../funktion-tor.md#grenzen); im Code betrifft G-05 nur Aktionen, deren Fakten `killSwitch` kennen, `packages/gate/src/limits/index.ts#limitNotAus`).
- **Geräte begrenzt:** höchstens `MAX_GERAETE` (10) gültige Geräte; ein weiteres widerruft das älteste (`packages/db/src/repo/geraete.ts#MAX_GERAETE`).
