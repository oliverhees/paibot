<!--
PaiBot – Entwickler-Seite: Datenmodell für Apps (Tabellen, Rechte, Trigger, Zugriffsfunktionen).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-22
-->

# Apps: Datenmodell – für Entwickler

**Anwender-Doku:** [Das Tor](../funktion-tor.md#pai-liest-in-apps-fassung-3)

**Stand:** Das Datenmodell ist da und von Tests abgedeckt. Die Funktion „Apps“ ist für Nutzer noch nicht erreichbar: Es gibt dafür weder Routen noch Oberfläche noch einen Aufruf im Lauf. Diese Seite beschreibt nur die Datenbank und ihre Zugriffsfunktionen.

## Zweck und Entscheidung

Die Datenbank hält fest, welche Apps (Server mit MCP-Schnittstelle unter einer https-Adresse) der Besitzer verbunden hat, welche Werkzeuge sie anbieten, wie der Besitzer jedes Werkzeug eingestuft hat und welcher Bot lesen darf. Daraus bekommt das Tor die Fakten für Aufrufe von App-Werkzeugen (`packages/shared/src/tor-fassung-3.ts#MCP_TOOL_CALL_FACTS`).

Entscheidungen, jede am Code belegt:

- **Nur anhängen statt ändern:** Werkzeuge und Zugriffe sind Protokolle (`packages/db/src/schema/apps.ts#appTools`, `packages/db/src/schema/apps.ts#botAppGrants`). Jede Änderung ist eine neue Zeile; gültig ist die letzte. So bleibt sichtbar, was der Besitzer wann bestätigt hat. Trigger lehnen Ändern, Löschen und Leeren ab, auch für den Besitzer der Tabelle (`packages/db/drizzle/0016_apps_datenbank.sql`, Funktion `paibot_apps_nur_anhaengen`).
- **„Liest“ gibt es nur mit der Entscheidung des Besitzers:** Eine Zeile mit Stand `bestaetigt` oder `gesperrt` trägt die Kennung der Entscheidung (`action_id`). Ein Trigger prüft im Beleg-Protokoll, dass es eine erlaubte Entscheidung `app.werkzeuge_bestaetigen` des Besitzers gibt, für genau dieses Werkzeug, genau diese Einstufung, genau diesen Abdruck und genau das Ziel (`packages/db/drizzle/0016_apps_datenbank.sql`, Funktion `paibot_app_tools_regeln`). Der Worker-Weg (`packages/db/src/repo/apps.ts#sehen`) kennt nur `neu`, `geaendert` und `entfernt`.
- **Der Modell-Name wird einmal vergeben:** Beim ersten Sehen eines Werkzeugs entstehen Modell-Name (`<kurzname>__<name>`) und Kennung (`mcp/<kurzname>/<name>`), mit Zähler bei Kollision (`packages/db/src/repo/apps.ts#vergebeNamen`). Sie stehen in Fassung 1 des Werkzeugs, bleiben in allen späteren gleich (Trigger) und sind eindeutig (Indizes `app_tools_modell_name_eindeutig`, `app_tools_kennung_je_app_eindeutig`). Sie hängen nie von den anderen Werkzeugen der Liste ab.
- **Der Zugang ist an die volle Adresse gebunden:** Das Token liegt nur verschlüsselt in `apps.token_enc` (`packages/db/src/schema/apps.ts#apps`), im Format `v2` und gebunden an Kennung und volle Adresse (`packages/shared/src/bindung.ts#appTokenBinding`). Die Datenbank nimmt nur dieses Format an (Prüfregel `apps_token_format`). Ein anderer Pfad oder Host macht es unbrauchbar (`packages/crypto/src/datenbank.test.ts`).

## Aufbau

| Datei                                         | Aufgabe                                                                                                              |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/schema/apps.ts`              | Tabellen `apps`, `app_tools`, `bot_app_grants`                                                                       |
| `packages/db/drizzle/0016_apps_datenbank.sql` | Migration: Tabellen, Prüfregeln, Werte der Aktionen, Regel R-014, Funktionen und Trigger                             |
| `packages/db/src/repo/apps.ts`                | Zugriffsfunktionen (Namensraum `apps` in `packages/db/src/repo/index.ts`)                                            |
| `packages/db/src/repo/nachrichten.ts`         | Kennzeichen „fremder Inhalt“ an Nachrichten (`markRunUntrusted`, `markUntrusted`, `anyUntrusted`, `untrustedIds`)    |
| `packages/db/src/rollen.ts`                   | Rechte der App-Rolle je Tabelle (`APP_TABLE_RIGHTS`) und Liste der Tabellen, die nur anhängen (`APPEND_ONLY_TABLES`) |
| `deploy/sicherung-db.sh`                      | Liste der erlaubten Funktionen beim Zurückspielen (`ERLAUBTE_FUNKTIONEN`), um die neuen Funktionen erweitert         |

Datenfluss, wie ihn die späteren Pakete nutzen:

1. Die Hülle ruft die Liste der Werkzeuge einer App ab und übergibt sie an `packages/db/src/repo/apps.ts#sehen`. Neue Werkzeuge bekommen Namen und Stand `neu`, geänderte Abdrücke den Stand `geaendert`, fehlende `entfernt`.
2. Der Besitzer stuft ein Werkzeug ein. Die Route schreibt zuerst die Entscheidung `app.werkzeuge_bestaetigen` durch das Tor, danach ruft sie `packages/db/src/repo/apps.ts#einstufen` mit der Kennung dieser Entscheidung.
3. Zugriff gibt `packages/db/src/repo/apps.ts#setAccess`, ebenfalls mit der Kennung einer Entscheidung `app.zugriff_setzen`.
4. Vor einem Aufruf liest der Lauf `packages/db/src/repo/apps.ts#currentAccess` und `packages/db/src/repo/apps.ts#confirmedTool` und setzt die Fakten fürs Tor (`appAccess`, `toolStatus`, `confirmedToolDigest`, `confirmedTargetDigest`).

## Datenmodell und Migrationen

| Tabelle          | Schema                           | Wofür                                                                                                                      |
| ---------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `apps`           | `packages/db/src/schema/apps.ts` | Verbundene Apps: Kurzname, Name, volle https-Adresse, Art der Anmeldung, Token (verschlüsselt), Zustand, Verbindungsnummer |
| `app_tools`      | `packages/db/src/schema/apps.ts` | Fassungen der Werkzeuge je App (nur anhängen)                                                                              |
| `bot_app_grants` | `packages/db/src/schema/apps.ts` | Zugriff der Bots je App (nur anhängen)                                                                                     |

Spalten, die das Tor und die Fakten betreffen:

| Tabelle.Spalte                                          | Bedeutung                                                                                                                                                                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps.id`, `apps.short_name`                            | Kennung `app_…` und Kurzname (Teil der Modell-Namen, nie mit zwei Unterstrichen hintereinander); beide bleiben nach dem Anlegen gleich                                                                                     |
| `apps.url`                                              | volle Adresse in der Form von `normalizedAppUrl` (https, ohne Benutzer, Anfrage und Anker, ohne Schrägstrich am Ende, nur sichtbare ASCII-Zeichen)                                                                         |
| `apps.auth_kind`, `apps.token_enc`                      | `keine` oder `token`; Token nur bei `token` und verbundener App, nur als `v2`-Text; beim Trennen gelöscht                                                                                                                  |
| `apps.state`, `apps.connection_no`                      | `verbunden` oder `getrennt`; die Nummer steigt nur beim erneuten Verbinden einer getrennten App um genau eins                                                                                                              |
| `apps.server_version`                                   | vom Server gemeldete Fassung, nur zur Anzeige                                                                                                                                                                              |
| `app_tools.tool_id`, `app_tools.version`                | Kennung `wzg_…` des Werkzeugs und Nummer der Fassung ab 1; zusammen der Schlüssel                                                                                                                                          |
| `app_tools.original_name`, `.model_name`, `.tool_key`   | Name beim Server, einmal vergebener Name fürs Modell, Kennung `mcp/<kurzname>/<name>`                                                                                                                                      |
| `app_tools.tool_digest`                                 | Abdruck der Rohform in voller Länge (`sha256:` und 64 Hex-Zeichen)                                                                                                                                                         |
| `app_tools.description`, `.input_schema`                | bereinigte Beschreibung (höchstens 2000 Zeichen) und bereinigtes Eingabe-Schema (ein Objekt, höchstens 65 536 Bytes; der Trigger prüft `octet_length` des Textes, nicht die Zahl der Zeichen), so wie sie ans Modell gehen |
| `app_tools.hint_read_only`, `.hint_destructive`         | Hinweise des Servers, nur zur Anzeige, nie eine Einstufung                                                                                                                                                                 |
| `app_tools.status`, `.tool_class`                       | `neu`, `bestaetigt`, `geaendert`, `entfernt`, `gesperrt` und die Einstufung `lesen`, `schreiben`, `gesperrt` (außer bei Bestätigung und Sperre immer `schreiben`)                                                          |
| `app_tools.action_id`, `.seen_digest`, `.target_digest` | Entscheidung des Besitzers, gesehener Abdruck und Abdruck des Ziels; genau bei `bestaetigt` und `gesperrt` gesetzt                                                                                                         |
| `bot_app_grants.access`, `.connection_no`               | `keiner` oder `lesen` und die Verbindungsnummer der App, unter der der Zugriff gesetzt wurde                                                                                                                               |
| `bot_app_grants.action_id`                              | Entscheidung des Besitzers (`app.zugriff_setzen`); jede Kennung nur einmal                                                                                                                                                 |
| `tool_calls.app_id`, `.app_tool_id`, `.tool_version`    | App, Werkzeug und Fassung eines Aufrufs; alle drei oder keins, nur bei Quelle `mcp`                                                                                                                                        |
| `messages.untrusted`                                    | Kennzeichen „fremder Inhalt“, Standard `false`                                                                                                                                                                             |

Migration: `packages/db/drizzle/0016_apps_datenbank.sql`, erzeugt mit `drizzle-kit`, der Teil nach dem letzten erzeugten Befehl von Hand ergänzt (Kommentar im Kopf der Datei). Sie

- legt die drei Tabellen an und erweitert `tool_calls` und `messages`;
- erlaubt die vier Aktionen für Apps in den Prüfregeln `rules_action_werte` und `belege_action_werte` (`app.aendern`, `app.oauth_*` und eigene Regeln bleiben draußen);
- legt die Regel R-014 an, genau wie `packages/shared/src/tor-fassung-3.ts#R014_V1`;
- ersetzt die Funktionen `paibot_messages_unveraenderlich` und `paibot_tool_calls_regeln` und legt die neuen an.

Bestehende Daten bleiben unverändert; die neuen Spalten haben Standardwerte (`untrusted` ist `false`, die Angaben zur App leer). Ein Test auf einer Datenbank im Stand vor der Migration mit Läufen, Nachrichten, Belegen und Werkzeug-Aufrufen prüft das, und danach die gültige Kette (`tools/durchstich/src/aufstieg-0014.test.ts`, `packages/db/src/apps-postgres.test.ts`).

**Kein Zurück:** Nach dieser Migration lässt sich die Datenbank mit einer älteren Version von PaiBot nicht mehr betreiben (die Prüfregeln und Funktionen kennen sie nicht). Vor dem Wechsel gehört eine Sicherung dazu ([Sicherung](sicherung.md), [Aktualisieren](../aktualisieren.md)); wie bei den Migrationen davor geht der Rückweg nur über die Sicherung.

Zugriff nur über `repo` in `packages/db/src/repo/apps.ts`.

## Schnittstellen

| Art      | Name                                                                              | Datei                                    |
| -------- | --------------------------------------------------------------------------------- | ---------------------------------------- |
| Aktion   | `app.verbinden`, `app.werkzeuge_bestaetigen`, `app.zugriff_setzen`, `app.trennen` | `packages/shared/src/actions.ts#ACTIONS` |
| Funktion | `create`, `get`, `list`, `getTokenEnc`, `update`                                  | `packages/db/src/repo/apps.ts`           |
| Funktion | `changeAccess`, `disconnect`, `reconnect`                                         | `packages/db/src/repo/apps.ts`           |
| Funktion | `sehen`, `currentTools`, `currentTool`, `toolHistory`, `toolByModelName`          | `packages/db/src/repo/apps.ts`           |
| Funktion | `einstufen`, `confirmedTool`                                                      | `packages/db/src/repo/apps.ts`           |
| Funktion | `setAccess`, `currentAccess`, `readableApps`                                      | `packages/db/src/repo/apps.ts`           |
| Funktion | `markRunUntrusted`, `markUntrusted`, `anyUntrusted`, `untrustedIds`               | `packages/db/src/repo/nachrichten.ts`    |

Was die Funktionen leisten:

- `create` normalisiert die Adresse (`packages/shared/src/bindung.ts#normalizedAppUrl`) und gibt die App ohne Token zurück (nur `tokenSet`). `getTokenEnc` gibt den verschlüsselten Text nur für eine verbundene App heraus.
- `changeAccess` wechselt Adresse und Token; danach sind alle Werkzeuge der App wieder `neu` (Trigger `apps_aenderung`). Das gilt auch für bestätigte und gesperrte. `disconnect` löscht das Token; ab dann ist der Zugriff aller Bots `keiner`. `reconnect` erhöht die Verbindungsnummer; frühere Zugriffe gelten nicht mehr, und alle Werkzeuge sind `neu`.
- `confirmedTool` gibt ein Werkzeug nur zurück, wenn seine neueste Fassung `bestaetigt` ist, ihr Abdruck dem übergebenen entspricht (dem der beim Start des Laufs abgerufenen Liste) und die App verbunden ist. Es liefert `confirmedToolDigest` und `confirmedTargetDigest` für die Fakten.
- `currentAccess` liefert `lesen` nur für die letzte Zeile des Bots unter der jetzigen Verbindungsnummer einer verbundenen App (bei Anmeldung mit Token nur mit hinterlegtem Token); sonst `keiner`.
- `toolByModelName` ist die Zuordnung Modell-Name → Werkzeug und liest nur aus der Datenbank.

## Sicherheit

- **Eingestuft wird nur mit Entscheidung:** Ohne passende Entscheidung des Besitzers im Beleg-Protokoll (erlaubt, Akteur Besitzer, gleiches Werkzeug, gleiche Einstufung, gleicher Abdruck, gleiche Fassung, gleiches Ziel) legt die Datenbank keine Zeile `bestaetigt` oder `gesperrt` an. Ein gesehener Abdruck, der nicht der gespeicherte ist, genügt nicht (Test `packages/db/src/apps.test.ts`, „gesehener Abdruck ≠ gespeicherter“). Das Ziel wird in der Datenbank nachgerechnet (`paibot_app_ziel_abdruck`) und gleicht dem Abdruck im Code (`packages/shared/src/bindung.ts#appTargetDigestInput`).
- **Zugriff ebenso:** Eine Zeile in `bot_app_grants` gibt es nur mit einer erlaubten Entscheidung `app.zugriff_setzen` des Besitzers für genau diese App, diesen Bot und diesen Zugriff, und nur für eine verbundene App unter ihrer jetzigen Verbindungsnummer.
- **Rechte der App-Rolle** (`packages/db/src/rollen.ts#APP_TABLE_RIGHTS`): `app_tools` und `bot_app_grants` nur lesen und einfügen; `apps` lesen, einfügen und nur Name, Adresse, Zugang, Zustand, Verbindungsnummer, gemeldete Fassung und Zeiten ändern, nie löschen; `messages.untrusted` darf sie setzen. Beide Protokolle stehen in `APPEND_ONLY_TABLES`, damit die Prüfung der Rolle jedes Änderungsrecht darauf meldet. Test mit der echten Rolle: `packages/db/src/apps-postgres.test.ts`.
- **Token:** nie im Klartext, nie in einer Rückgabe außer `getTokenEnc`, nie im Beleg (dort steht nur `tokenSet`). Die Prüfregel verlangt `v2`.
- **Fremde Inhalte:** `messages.untrusted` lässt sich nur setzen, nie zurücknehmen (Trigger `messages_unveraenderlich`); neue Nachrichten eines Laufs erben das Kennzeichen, sobald eine andere Nachricht des Laufs es trägt (Trigger `messages_erben`). Welche Läufe fremde Inhalte lesen, entscheidet der Lauf; die Datenbank stellt `markRunUntrusted` und `anyUntrusted` bereit.
- **Wiederherstellung:** Die neuen Funktionen stehen mit Name und Prüfsumme in `ERLAUBTE_FUNKTIONEN` (`deploy/sicherung-db.sh`); ein Test vergleicht die Liste mit den Migrationen (`tools/durchstich/src/sicherung.test.ts`). Prüfregeln der Tabellen nutzen nur erlaubte Ausdrücke.
- Eine App wird nie gelöscht, nur getrennt (Fremdschlüssel `restrict`, kein Löschrecht).

## Tests

| Test                                            | Prüft                                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/db/src/apps.test.ts`                  | Tabellen, Prüfregeln, Namen, Einstufung mit und ohne Entscheidung, Token- und Adresswechsel, Trennen, Zugriff, Nur-Anhängen, fremde Inhalte, R-014, Aufrufe von App-Werkzeugen |
| `packages/db/src/apps-postgres.test.ts`         | Rechte der App-Rolle gegen echtes Postgres (nur mit `PAIBOT_TEST_DATABASE_URL`), Aufstieg vom Stand vor der Migration mit Bestandsdaten                                        |
| `tools/durchstich/src/aufstieg-0014.test.ts`    | Aufstieg aus den veröffentlichten Ständen mit Bestandsdaten: nichts geht verloren, Kette gültig, neue Entscheidungen hängen an                                                 |
| `tools/durchstich/src/sicherung.test.ts`        | Sicherung und Zurückspielen mit den neuen Funktionen, Liste der erlaubten Funktionen                                                                                           |
| `packages/crypto/src/datenbank.test.ts`         | Token einer App: gebunden an Kennung und volle Adresse                                                                                                                         |
| `packages/gate/src/fassungen/fassung-3.test.ts` | Fassung 3 in Kraft: ein erlaubter App-Aufruf läuft durch das echte Tor, ein geänderter Abdruck wird abgelehnt                                                                  |

Ausführen:

```bash
pnpm --filter @paibot/db test
PAIBOT_TEST_DATABASE_URL=postgres://… pnpm --filter @paibot/db test
```

## Bekannte Schwächen

- **Noch keine Anwendung:** Keine Route, keine Oberfläche, kein Aufruf im Lauf nutzt die Tabellen. Dass ein getrennter Zugang im Lauf als `appAccess: keiner` ankommt, prüft erst der Test im Paket des Laufs; die Datenbank liefert es über `currentAccess`.
- **Kennzeichen „fremder Inhalt“ je Lauf:** Die Datenbank kennt nur das Kennzeichen und die Vererbung innerhalb eines Laufs. Ob ein Lauf in irgendeinem Schritt fremde Inhalte hatte, entscheidet der Lauf und ruft dann `markRunUntrusted`.
- **Zugriff überlebt einen Bot nicht:** `bot_app_grants.bot_id` hat keinen Fremdschlüssel; Zeilen gelöschter Bots bleiben als Protokoll stehen.
- **Größe der Texte:** `description` und `input_schema` sind die bereinigten Texte; ihre Grenzen hier (2000 Zeichen und 65 536 Bytes) sind Obergrenzen der Datenbank, nicht die der Schicht, die sie liefert.
- **Kein Löschen von Werkzeugen:** Entfernte Werkzeuge bleiben als Zeilen stehen; die Protokolle wachsen nur.
