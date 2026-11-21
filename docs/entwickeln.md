<!--
PaiBot – Entwickeln und Testen: lokale Entwicklung und der Test-Anbieter.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-20
-->

# Entwickeln und Testen

**Ergebnis:** Du kannst PaiBot lokal entwickeln und testen, ohne ein echtes Modell oder Internet zu brauchen, denn der Test-Anbieter antwortet wie ein OpenAI-kompatibler Dienst, aber mit Antworten, die du vorgibst.

## Wofür

Tests dürfen weder Geld kosten noch von einem fremden Dienst abhängen. Der Test-Anbieter (`tools/fake-provider`) steht deshalb an der Stelle eines Modell-Anbieters. Du legst fest, was er antwortet, wie schnell, und wann er absichtlich scheitert. Danach kannst du auslesen, was PaiBot ihm geschickt hat.

## So benutzt du es

### Lokal entwickeln

```bash
pnpm install        # Abhängigkeiten
pnpm dev            # Web-App starten
pnpm lint && pnpm headers:check && pnpm typecheck && pnpm test && pnpm build
```

Den Text-Index der Doku, der ins Image kommt, baut `pnpm doku:index` (Datei `doku-index.json` im Ordner `doku-index`, nicht im Repo); beim Bau des Images läuft das von selbst ([Doku-Index](entwickler/doku-index.md)).

Mit `pnpm dev` (nicht Produktion) migriert die Web-App die Datenbank aus `DATABASE_URL` beim Start selbst. In Produktion und im Docker-Stack tut sie das nie: Dort richtet zuerst der Einmal-Dienst `migrate` Migrationen und App-Rolle ein, danach starten `web` und `worker` nur mit der App-Rolle. Wer den Produktions-Build lokal startet, führt deshalb vorher denselben Schritt aus (`PAIBOT_ROLE=migrate` mit `DATABASE_URL` der App-Rolle und `DATABASE_MIGRATION_URL`).

Voraussetzungen: Node.js 22 und pnpm 10 (siehe [CONTRIBUTING.md](../CONTRIBUTING.md)).

### Test-Anbieter im Test starten

```ts
import { createFakeProvider } from "@paibot/fake-provider";

const provider = createFakeProvider({ apiKey: "test-schluessel" });
const { baseUrl } = await provider.start({ port: 0 }); // freier Port, nur 127.0.0.1

provider.configure({ reply: "Hallo!", chunkChars: 4, chunkDelayMs: 20 });
provider.failNext({ kind: "status", status: 429 }); // nächste Anfrage: Fehler 429

// ... PaiBot-Code gegen baseUrl laufen lassen ...

provider.requests; // alles, was beim Test-Anbieter angekommen ist
await provider.stop();
```

Dazu braucht dein Paket `@paibot/fake-provider` als Entwicklungs-Abhängigkeit (nur in Tests erlaubt).

### Test-Anbieter als eigenen Prozess starten

```bash
pnpm --filter @paibot/fake-provider build
FAKE_PROVIDER_PORT=8080 FAKE_PROVIDER_API_KEY=test-schluessel \
  node tools/fake-provider/dist/fake-provider.mjs
```

Oder als Container (Build-Kontext ist der Projektstamm):

```bash
docker build -f tools/fake-provider/Dockerfile -t paibot-fake-provider .
docker run --rm -p 127.0.0.1:8080:8080 paibot-fake-provider
```

### Von außen steuern

Läuft der Test-Anbieter als eigener Prozess, steuerst du ihn über HTTP (alle Pfade beginnen mit `/_steuerung/`):

```bash
# Antwort und Strom-Verhalten festlegen
curl -X POST localhost:8080/_steuerung/verhalten \
  -d '{"reply":"Hallo!","chunkChars":4,"chunkDelayMs":50}'

# nächste zwei Anfragen mit Status 503 scheitern lassen
curl -X POST localhost:8080/_steuerung/fehler \
  -d '{"kind":"status","status":503,"count":2}'

# eingegangene Anfragen lesen
curl localhost:8080/_steuerung/anfragen

# alles zurücksetzen
curl -X POST localhost:8080/_steuerung/zuruecksetzen
```

### Drehbuch über mehrere Schritte

Eine Werkzeug-Schleife braucht mehrere Modell-Schritte hintereinander: erst ein Aufruf, dann (nach dem Ergebnis) die Antwort. Dafür spielt der Test-Anbieter ein **Drehbuch** ab: Die n-te Chat-Anfrage seit dem Setzen bekommt `steps[n]`, im Strom und ohne Strom.

```ts
provider.configure({
  script: {
    steps: [
      // Schritt 0: Text und ein Aufruf im selben Schritt
      {
        text: "Ich schaue nach.",
        toolCalls: [{ name: "suche", arguments: { frage: "Tagesbudget" } }],
      },
      // Schritt 1: Antwort nach dem Werkzeug-Ergebnis
      { text: "Das Tagesbudget stellst du in den Einstellungen ein." },
    ],
  },
});
```

Ein Schritt kennt `text`, `toolCalls` (je `id`, `name`, `arguments` als Objekt oder fertiger Text, `pieces` = Zahl der Stücke im Strom, Standard 3), `reasoning` (`text` und `field`: `reasoning` oder `reasoning_content`), `usage` (`false` = keine Verbrauchsangabe, auch mit `include_usage`; sonst `{ prompt, completion }`) und `finish` (`stop`, `tool_calls`, `length`). Aufrufe werden gesendet, auch wenn die Anfrage keine `tools` anbietet. Die Kennung `index` im Strom folgt der Reihenfolge in `toolCalls`.

**Absichtlich ungültig** darf alles sein, damit PaiBot zeigen kann, dass es so etwas ablehnt:

| Art                      | Beispiel im Drehbuch                                                                |
| ------------------------ | ----------------------------------------------------------------------------------- |
| erfundener Name          | `name: "gibt_es_nicht"`, `"a.b"`, `""`, 65 Zeichen, Umlaute, `\u202E`               |
| kaputtes JSON            | `arguments: '{"frage": "Not'` (kommt unverändert an)                                |
| Schema-Verstoß           | zusätzliches Feld, Zahl oder Text über der Grenze                                   |
| doppelte Kennung         | zwei Aufrufe mit gleicher `id` (wird zweimal gesendet, nichts wird bereinigt)       |
| leere oder lange Kennung | `id: ""` oder 201 Zeichen (die Grenze der Datenbank liegt bei 1 bis 200)            |
| viele Aufrufe            | `toolCallsRepeated(500, (i) => ({ name: "t", arguments: { i } }))` in einem Schritt |
| endlose Aufrufe          | `after: "letzten-wiederholen"`: der letzte Schritt wiederholt sich immer wieder     |
| Aufruf ohne `tools`      | Schritt mit `toolCalls`, obwohl die Anfrage keine Werkzeuge anbot                   |

`after` legt fest, was nach dem letzten Schritt kommt: `normal` (Standard: wieder das Verhalten ohne Drehbuch, also `reply` und `toolCall`) oder `letzten-wiederholen`. `provider.scriptPosition()` sagt, wie viele Schritte schon gespielt sind. Anfragen, die nicht beantwortet werden (geplante Fehler, falscher Schlüssel, ungültiger Körper), verbrauchen keinen Schritt.

Von außen setzt du ein Drehbuch mit `POST /_steuerung/drehbuch` (gleicher Schutz wie alle Steuer-Pfade: mit `FAKE_PROVIDER_CONTROL_KEY` die Kopfzeile `x-steuerung-schluessel`, sonst nur von Loopback). Das Setzen beginnt wieder bei Schritt 0; eine falsche Form gibt Fehler 400 mit Grund. `…/zuruecksetzen` löscht das Drehbuch.

```bash
curl -X POST localhost:8080/_steuerung/drehbuch \
  -H "x-steuerung-schluessel: $FAKE_PROVIDER_CONTROL_KEY" \
  -d '{"steps":[{"toolCalls":[{"name":"suche","arguments":"{\"frage\": \"Not"}]},{"text":"Fertig."}],"after":"normal"}'
```

Im Protokoll (`…/anfragen`) steht je Anfrage `scriptStep` (Index des Schritts, der sie beantwortet hat; bei Wiederholung der letzte). Die angebotenen `tools` und die Nachrichten mit `role: "tool"` stehen ungekürzt im `body`.

### Tests gegen echtes Postgres

Die meisten Datenbank-Tests laufen mit PGlite im Speicher. Einige Dinge kann PGlite nicht zeigen, weil es nur eine Verbindung kennt: gleichzeitiges Anhängen von Belegen über zwei Verbindungen, Migrationen bei gleichzeitigen Starts, die Warteschlange mit mehreren Prozessen. Diese Tests laufen nur, wenn `PAIBOT_TEST_DATABASE_URL` auf einen **Wegwerf-Server** zeigt, sonst werden sie übersprungen. In der CI läuft dafür ein eigener Postgres-Dienst.

Lokal zum Beispiel mit Docker:

```bash
docker run --rm -d --name paibot-test-pg -e POSTGRES_PASSWORD=test -p 127.0.0.1:55432:5432 postgres:17-alpine
export PAIBOT_TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/postgres
pnpm test                       # alle Pakete, die Variable wird durchgereicht
docker stop paibot-test-pg      # danach aufräumen
```

Ohne Docker geht auch ein Postgres aus dem System (`initdb` in ein leeres Verzeichnis, `pg_ctl … start`, am Ende `pg_ctl … stop` und das Verzeichnis löschen).

Gut zu wissen:

- Die Tests von `db` und `receipts` legen je Test eine eigene Datenbank an (`createPostgresTestDatabase` aus `@paibot/db/testing`) und löschen sie danach wieder.
- Die Tests der Warteschlange legen eine eigene Datenbank und eine eingeschränkte Rolle an (wie bei einer frischen Installation) und löschen beides danach. Die Adresse braucht deshalb einen Benutzer, der Datenbanken und Rollen anlegen darf; nie auf einen Server mit echten Daten zeigen.

### Durchstich

`tools/durchstich` prüft alle Bausteine im Zusammenspiel, mit PGlite und dem Test-Anbieter: Einrichtung im Kleinen (Signaturschlüssel erzeugen und verschlüsselt speichern, Beleg „Start“), eine Modell-Anfrage durchs Tor bis zum Test-Anbieter, Ergebnis-Beleg, Prüfen der Kette und des Exports, und die Gegenprobe, bei der der Not-Aus ablehnt und beim Test-Anbieter nichts ankommt.

```bash
pnpm --filter @paibot/durchstich test
```

### Jede Aktion geht durch das Tor

Drei Tests stellen sicher, dass nichts am Tor vorbei schreibt. Sie laufen mit `pnpm test`.

| Test                                          | Prüft                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/gate-pflicht.test.ts`           | ruft jede Route des Routen-Vertrags über ihre echte Datei unter `app/api` auf. Ein Schreib-Protokoll in der Datenbank (ein Trigger je Tabelle) zeigt, was die Anfrage geschrieben hat. Verändernde Routen: genau ein Beleg „Entscheidung“ und ein Beleg „Ergebnis“ für ihre Aktion, jede Änderung an Daten liegt dazwischen. Lesende Routen: kein Beleg, keine Änderung. |
| `apps/web/src/gate-pflicht-quelltext.test.ts` | Route-Dateien exportieren nur Handler über `route(…)` (Ausnahmen: Health und Ereignis-Strom, beide nur `GET`); keine Server Actions; schreibende Zugriffsfunktionen aus `@paibot/db` (aus deren Quelltext ermittelt) nur in den Dateien der Liste `ERLAUBT`; keine Tabellen-Objekte, Treiber oder eigenes schreibendes SQL in Web-App und Worker.                        |
| `apps/worker/src/gate-pflicht.test.ts`        | ein Auftrag über den echten Handler des Workers: Modell-Anfrage mit Entscheidung und Ergebnis, der Motor läuft nur dazwischen, eine Ablehnung erreicht ihn nie, der Worker schreibt nur Lauf, Antwort, Ereignisse und Belege.                                                                                                                                            |

Eine neue Route bekommt in `gate-pflicht.test.ts` einen Fall (`AKTIONS_FAELLE` bzw. `LESE_FAELLE`), sonst schlagen Typprüfung und Test fehl. Eine neue Datei, die schreibt, kommt mit Begründung in die Liste `ERLAUBT`. `BEKANNTE_LUECKEN` nennt lesende Routen, die heute noch ohne Tor schreiben; der Test meldet, sobald ein Eintrag überflüssig ist.

### Ende-zu-Ende im Browser

`tools/e2e` startet PaiBot im Produktions-Build und geht den ganzen Weg im Browser:

| Bereich               | Was geprüft wird                                                                                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Einrichtung           | Code, Passwort, Anbieter eintragen und Verbindung testen, Modell wählen                                                                                                                                                                                               |
| Chat                  | Nachricht senden, Antwort kommt gestreamt, Verlauf nach dem Neuladen, Beleg öffnen und prüfen                                                                                                                                                                         |
| Handy-Format (390 px) | senden, Antwort streamt, „Stopp“ bricht sie ab (der Test-Anbieter sieht den Abbruch), Beleg als Blatt von unten                                                                                                                                                       |
| Datenschleuse         | mit einer Beispiel-Datenschleuse (`scripts/doku/schleuse-attrappe.mjs`): Standard einschalten, Nachricht mit „geschützt über die Datenschleuse“; „Schlüssel passt nicht“ im Chat mit Ausweg und auf der Seite Datenschleuse, dabei geht keine Anfrage an den Anbieter |
| Passwort ändern       | falsches aktuelles Passwort ändert nichts; danach ist das zweite Gerät abgemeldet, das alte Passwort gilt nicht mehr, das neue schon                                                                                                                                  |
| Anmelde-Schutz        | fünf Fehlversuche sperren die Adresse (auch das richtige Passwort kommt dann nicht durch), viele Versuche aus vielen Adressen lösen die gemeinsame Bremse aus, ein bekanntes Gerät kommt trotzdem durch                                                               |
| Belege                | ganze Kette prüfen, Export, `pnpm belege:pruefen` auf dem Export                                                                                                                                                                                                      |
| Zugang und Grenzen    | Abmelden und Anmelden, Tagesbudget setzen, Ablehnung durch das Tor im Chat                                                                                                                                                                                            |

```bash
pnpm build
node tools/e2e/src/e2e.mjs --ausgabe /var/tmp/paibot-e2e
```

Was passiert:

1. Postgres: ein eigener Server aus den Programmen des Systems (Passwort-Anmeldung, freier Port, nur `127.0.0.1`). Mit `PAIBOT_E2E_DATABASE_URL` (Benutzer, der Datenbanken und Rollen anlegen darf) legt die Prüfung stattdessen eine eigene Wegwerf-Datenbank auf diesem Server an und löscht sie am Ende. Dazu Test-Anbieter, Beispiel-Datenschleuse, Migrations-Schritt wie der Dienst `migrate`, danach Web-App und Worker nur mit der App-Rolle.
2. Web-App, Worker und Migrations-Schritt laufen mit der Netz-Sperre (`tools/e2e/src/netz-sperre.cjs`, geladen über `NODE_OPTIONS=--require`). Sie lässt nur Postgres, den Test-Anbieter, die Beispiel-Datenschleuse (nur Worker) und (für die Web-App) die eigene Adresse zu. Jeder andere Verbindungsaufbau und jede Namensauflösung wird abgebrochen und in `netz.jsonl` festgehalten.
3. Im Browser wird jede Anfrage an einen anderen Host als die App abgebrochen und gezählt. Konsolenfehler und CSP-Verletzungen werden gesammelt; nur Fehler-Antworten, die ein Schritt absichtlich auslöst (falsches Passwort, Sperre), zählen nicht.
4. Grün ist die Prüfung nur, wenn alle Schritte klappen, die Sperre in allen drei Prozessen geladen war und es keinen Verstoß, keine fremde Anfrage und keinen Konsolenfehler gab.
5. Am Ende räumt das Skript alles ab (Prozesse, Datenbank, temporäre Ordner). Im Ausgabe-Ordner bleiben `ergebnis.json`, die Logs (`web.log`, `worker.log`, `worker-2.log` …, `anbieter.log`, `migrate.log`) und ein Bild je Schritt.

Gegenproben: `--gegenprobe server` lädt in die Web-App zusätzlich einen absichtlichen Aufruf nach außen, `--gegenprobe browser` ruft im Browser eine fremde Adresse auf. Beide Male muss die Prüfung rot werden. Viele Schritte haben ihre Gegenprobe eingebaut, zum Beispiel: Bei „Schlüssel passt nicht“ darf beim Anbieter nichts ankommen, bei der Sperre darf auch das richtige Passwort nicht durchkommen.

Ohne Playwright meldet das Skript „ÜBERSPRUNGEN“ und endet mit Exit 0, mit `PAIBOT_E2E_PFLICHT=1` (so in der CI) dagegen mit Exit 1. Playwright ist nicht im Projekt enthalten (einmalig außerhalb: `npm install -g playwright && npx playwright install chromium`).

Was die Netz-Sperre nicht sieht: Verbindungen aus nativen Erweiterungen oder über interne Bindungen von Node am Modul `net` vorbei, Kind-Prozesse, die `NODE_OPTIONS` nicht erben, Programme außerhalb von Node (Postgres selbst, der Browser), lokale Unix-Sockets (zugelassen) und alles vor dem Laden der Sperre. Die Dienstnamen aus Docker Compose (`postgres`, `datenschleuse`, `web`, `worker`), die die Anbieter-Schicht zur Sicherheit auflöst, beantwortet die Sperre selbst mit „unbekannt“; sie stehen als `name-lokal` im Log und zählen nicht als Verstoß.

### Browser-Tests der Oberfläche

Fokus-Falle, Tastatur und Maße der Bausteine lassen sich nur in einem echten Browser prüfen. Die Tests liegen in `packages/ui/browser/` und laufen mit Vitest und Playwright (Chromium).

```bash
pnpm --filter @paibot/ui test:browser
```

Das braucht:

- Playwright **1.63.0** mit dem passenden Chromium (Fassung 153, Revision 1243). Playwright gehört nicht zu den Abhängigkeiten des Projekts: Installiere es außerhalb (`npm install -g playwright && npx playwright install chromium`), ein globales Playwright wird über `NODE_PATH` gefunden.
- Keinen gebauten Stand und keine laufende App: Jede Testdatei startet selbst einen Vite-Server auf einem freien Port und liefert ihre Prüfseite aus.
- Keinen Zugang nach außen: Chromium löst nur `127.0.0.1` auf, ein Aufruf nach draußen scheitert sofort (`packages/ui/browser/hilfen.mjs`).

Der Aufruf setzt `PAIBOT_BROWSER_TESTS=1`: Fehlt Playwright oder Chromium, schlägt der Lauf fehl. Unter `pnpm test` werden diese Tests ohne die Variable übersprungen.

Für neue Browser-Tests gilt: Jeder Vite-Server bekommt mit `neuerCacheOrdner()` einen eigenen Zwischenspeicher (Option `cacheDir`) und räumt ihn mit `loescheCacheOrdner()` auf, und `chromium.launch(CHROMIUM_OPTIONEN)` startet den Browser. Teilen sich die Server den Standard-Ordner `node_modules/.vite`, bündeln sie beim ersten Lauf gleichzeitig dieselben Abhängigkeiten, und die Prüfseite bleibt leer.

### In der CI

| Job             | Was er tut                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e`           | nach `check`: Postgres als Dienst-Container, Playwright in fester Fassung, `pnpm build`, die Prüfung oben, danach beide Gegenproben (müssen mit Exit 1 und der passenden Meldung enden). Im Fehlerfall stehen Schritte, Prüfungen und die Enden der Logs im Protokoll.                                                                                                                                                                                                                                                                                                                                                                         |
| `browser`       | nach `check`: Playwright und Chromium in fester Fassung (wie in `e2e`), dann `pnpm --filter @paibot/ui test:browser`. |
| `ohne-internet` | nach `check`: der echte Docker-Stack mit `deploy/docker-compose.ohne-internet.yml`. Dort ist auch das Netz `paibot-aussen` intern, der Test-Anbieter steht im selben Netz, `web` veröffentlicht keinen Port. Ein Prüf-Container im Netz geht über HTTP Einrichtung, eine Nachricht mit Antwort, die Kette der Belege und den Export samt eigenständigem Prüfer durch (`tools/e2e/src/ohne-internet.mjs`). Danach versucht `tools/e2e/src/netz-probe.cjs` aus `web` und `worker` Verbindungen nach draußen (ein Dienst auf dem Runner, öffentliche Adressen, Namen): keine darf klappen, Postgres und der Test-Anbieter müssen erreichbar sein. |

Den Job `ohne-internet` kannst du mit Docker auch lokal nachstellen:

```bash
sh deploy/env-erzeugen.sh deploy/.env
echo "FAKE_PROVIDER_API_KEY=$(od -An -tx1 -N24 /dev/urandom | tr -d ' \n')" >> deploy/.env
pnpm exec turbo run build --filter=@paibot/receipts
compose="docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.ohne-internet.yml --env-file deploy/.env"
$compose up -d --build
code=$($compose logs web | grep -oE 'Einrichtungs-Code: [0-9A-Z-]{14}' | tail -1 | cut -d' ' -f2)
mkdir -p /tmp/paibot-ohne-internet && chmod 0777 /tmp/paibot-ohne-internet
PAIBOT_PRUEF_CODE="$code" $compose --profile pruefen run --rm pruefer
$compose exec -T web node - --draussen 1.1.1.1:443 example.org:443 --drinnen postgres:5432 < tools/e2e/src/netz-probe.cjs
$compose --profile pruefen down -v
```

### Berechtigungen in Tests

Code, der eine Berechtigung des Tors braucht (zum Beispiel `resolveModel`), testest du mit dem Test-Zugang des Tors:

```ts
import { withTestPermit } from "@paibot/gate/testing";

await withTestPermit(aktion, fakten, async (permit) => {
  const model = resolveModel(permit, wahl, { secretsKey });
  // …
});
```

Die Berechtigung entsteht auf demselben Weg wie im Tor und gilt nur innerhalb der Funktion. Eine Lint-Regel erlaubt Importe von `@paibot/<paket>/testing` nur in Tests (`*.test.ts`).

## So sieht es aus

Der Test-Anbieter hat keine Oberfläche, darum gibt es hier keine Screenshots. Beim Start meldet er:

```text
Test-Anbieter bereit: http://127.0.0.1:8080/v1
```

## Einstellungen

| Einstellung             | Wo                          | Bedeutung                                                              | Standard                           |
| ----------------------- | --------------------------- | ---------------------------------------------------------------------- | ---------------------------------- |
| `FAKE_PROVIDER_PORT`    | Umgebungsvariable           | Port; `0` wählt einen freien                                           | `0` (im Image `8080`)              |
| `FAKE_PROVIDER_HOST`    | Umgebungsvariable           | Adresse, an die er sich bindet                                         | `127.0.0.1` (im Image `0.0.0.0`)   |
| `FAKE_PROVIDER_API_KEY` | Umgebungsvariable           | verlangt `Authorization: Bearer <Schlüssel>`, sonst Fehler 401         | leer (keine Anmeldung)             |
| `reply`                 | `configure` / `…/verhalten` | Antworttext (im Code auch eine Funktion der Nachrichten)               | ein kurzer Satz                    |
| `chunkChars`            | `configure` / `…/verhalten` | Zeichen pro Stück im Strom                                             | 8                                  |
| `firstChunkDelayMs`     | `configure` / `…/verhalten` | Pause vor dem ersten Stück                                             | 0                                  |
| `chunkDelayMs`          | `configure` / `…/verhalten` | Pause zwischen den Stücken                                             | 0                                  |
| `holdAfterChunks`       | `configure` / `…/verhalten` | hält den Strom nach so vielen Text-Stücken an, bis der Client schließt | 0 (nie)                            |
| `models`                | `configure` / `…/verhalten` | Modell-Liste (`id`, `name`, `contextLength`, `modality`, …)            | zwei Text-Modelle, ein Bild-Modell |
| `toolCall`              | `configure` / `…/verhalten` | meldet einen Werkzeug-Aufruf (`name`, `arguments`); `null` entfernt    | aus                                |
| `script`                | `configure` / `…/drehbuch`  | Drehbuch über mehrere Schritte (siehe oben); `null` entfernt           | aus                                |

Fehler legst du mit `failNext` bzw. `…/fehler` fest:

| `kind`    | Wirkung                                                              |
| --------- | -------------------------------------------------------------------- |
| `status`  | antwortet mit dem Status (400 bis 599) und optional `body`           |
| `abbruch` | trennt die Verbindung nach `afterChunks` Stücken im Strom            |
| `haengen` | antwortet nie; endet erst, wenn der Aufrufer die Verbindung schließt |

## So funktioniert es

- **Pfade:** `GET /v1/models` (Liste mit `architecture.modality`, `supported_api_endpoints`, `supported_parameters`) und `POST /v1/chat/completions`. Dazu `GET /health` für Container-Prüfungen.
- **Strom:** Mit `stream: true` kommen Server-Sent Events im OpenAI-Format, am Ende `data: [DONE]`. Die Token-Zahlen (`usage`) stehen im letzten Stück, aber nur mit `stream_options.include_usage`. Ohne Strom steht `usage` in der Antwort. Die Zahlen sind eine gleichbleibende Schätzung (ein Token je vier Zeichen).
- **Werkzeug-Aufruf:** Mit `toolCall` kommt der Aufruf im Strom (Name zuerst, Argumente in Stücken, Ende mit `finish_reason: "tool_calls"`). Steht in den Nachrichten als letztes ein Ergebnis mit Rolle `tool`, antwortet er wieder mit Text.
- **Drehbuch:** Mit `script` beantwortet er die n-te Chat-Anfrage mit `steps[n]` (Code: `tools/fake-provider/src/drehbuch.ts`, Antwort-Aufbau in `tools/fake-provider/src/index.ts`). `toolCall` und `reply` gelten dann nur noch nach dem letzten Schritt mit `after: "normal"`.
- **Anmeldung:** Ist ein Schlüssel gesetzt, gibt ein falscher oder fehlender Schlüssel Fehler 401 im OpenAI-Fehlerformat.
- **Protokoll:** Jede Anfrage an `/v1/…` landet nur im Speicher (Methode, Pfad, Kopfzeilen, Körper, Zeitpunkt). Nichts wird auf Platte oder ins Log geschrieben. `closedByClient` zeigt, ob der Aufrufer die Verbindung vor dem Ende der Antwort geschlossen hat, so prüfst du, dass ein Abbruch wirklich beim Anbieter ankommt. Die Steuerung gibt den Schlüssel nicht im Klartext wieder.
- **Unabhängig:** Parallele Anfragen stören sich nicht. Er baut nie eine Verbindung nach außen auf und nutzt nur `node:http`.

## Grenzen

- Er ist ein Test-Werkzeug, kein Modell: Antworten sind festgelegter Text, keine echte Sprachverarbeitung.
- Die Token-Zahlen sind geschätzt, nicht die eines echten Modells.
- Die Steuerung unter `/_steuerung/` antwortet ohne Schlüssel nur auf Anfragen von derselben Maschine (Loopback). Mit `FAKE_PROVIDER_CONTROL_KEY` verlangt sie die Kopfzeile `x-steuerung-schluessel` mit diesem Wert. Binde ihn trotzdem nie an ein offenes Netz, ein Container gehört in ein internes Netz.
- Er bildet das Format nach, das PaiBot heute nutzt (OpenAI-kompatibel), nicht jeden Anbieter. Was echte Anbieter zusätzlich oder anders senden, taucht im Drehbuch nur auf, wenn du es dort nachstellst.
- Nur Chat und Modell-Liste sind nachgebildet (keine Einbettungen, keine Bilder).
- Ein Compose-Testprofil mit dem Image, ein Netz ohne Internet in Docker und der nächtliche Lauf mit Datenschleuse sind geplant, aber noch nicht gebaut. Die Ende-zu-Ende-Prüfung läuft heute ohne Docker, mit der Netz-Sperre in den Node-Prozessen (siehe oben).

## Fehlerbehebung

| Beobachtung                        | Ursache                                         | Was tun                                                 |
| ---------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| Fehler 401 vom Test-Anbieter       | Schlüssel gesetzt, aber ein anderer gesendet    | gleichen Schlüssel verwenden oder `apiKey` leeren       |
| Aus dem Container nicht erreichbar | bindet standardmäßig nur an `127.0.0.1`         | `FAKE_PROVIDER_HOST=0.0.0.0` setzen (im Image schon so) |
| Port belegt                        | fester Port wird schon genutzt                  | `FAKE_PROVIDER_PORT=0` oder anderen Port nehmen         |
| Test hängt                         | `haengen` war geplant und niemand bricht ab     | im Test abbrechen, `reset()` oder `stop()` beendet es   |
| Werkzeug-Aufruf kommt immer wieder | `toolCall` bleibt gesetzt, bis er entfernt wird | nach dem Aufruf `configure({ toolCall: undefined })`    |
| E2E: „Kein Postgres gefunden“      | `initdb` fehlt im System                        | Postgres installieren oder `PAIBOT_DOKU_PG_BIN` setzen  |
| E2E: „Nicht gebaut“                | `pnpm build` fehlt                              | `pnpm build`, dann erneut                               |
| E2E: Verstoß in `netz.jsonl`       | ein Prozess wollte nach außen                   | `rolle`, `ziel` und `stapel` im Eintrag zeigen, wer     |
| Tests gegen Postgres übersprungen  | `PAIBOT_TEST_DATABASE_URL` ist nicht gesetzt    | Variable auf einen Wegwerf-Server setzen (siehe oben)   |
| Browser-Tests: `#wurzel > *` nie sichtbar | Server teilen sich den Zwischenspeicher `node_modules/.vite` | je Server `cacheDir` mit `neuerCacheOrdner()` setzen   |
| Browser-Tests: Chromium nicht gefunden    | Playwright oder Chromium fehlt                               | Playwright 1.63.0 und Chromium installieren (siehe oben) |
