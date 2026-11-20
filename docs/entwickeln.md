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

## So sieht es aus

Der Test-Anbieter hat keine Oberfläche, darum gibt es hier keine Screenshots. Beim Start meldet er:

```text
Test-Anbieter bereit: http://127.0.0.1:8080/v1
```

## Einstellungen

| Einstellung             | Wo                          | Bedeutung                                                           | Standard                           |
| ----------------------- | --------------------------- | ------------------------------------------------------------------- | ---------------------------------- |
| `FAKE_PROVIDER_PORT`    | Umgebungsvariable           | Port; `0` wählt einen freien                                        | `0` (im Image `8080`)              |
| `FAKE_PROVIDER_HOST`    | Umgebungsvariable           | Adresse, an die er sich bindet                                      | `127.0.0.1` (im Image `0.0.0.0`)   |
| `FAKE_PROVIDER_API_KEY` | Umgebungsvariable           | verlangt `Authorization: Bearer <Schlüssel>`, sonst Fehler 401      | leer (keine Anmeldung)             |
| `reply`                 | `configure` / `…/verhalten` | Antworttext (im Code auch eine Funktion der Nachrichten)            | ein kurzer Satz                    |
| `chunkChars`            | `configure` / `…/verhalten` | Zeichen pro Stück im Strom                                          | 8                                  |
| `firstChunkDelayMs`     | `configure` / `…/verhalten` | Pause vor dem ersten Stück                                          | 0                                  |
| `chunkDelayMs`          | `configure` / `…/verhalten` | Pause zwischen den Stücken                                          | 0                                  |
| `models`                | `configure` / `…/verhalten` | Modell-Liste (`id`, `name`, `contextLength`, `modality`, …)         | zwei Text-Modelle, ein Bild-Modell |
| `toolCall`              | `configure` / `…/verhalten` | meldet einen Werkzeug-Aufruf (`name`, `arguments`); `null` entfernt | aus                                |

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
- **Anmeldung:** Ist ein Schlüssel gesetzt, gibt ein falscher oder fehlender Schlüssel Fehler 401 im OpenAI-Fehlerformat.
- **Protokoll:** Jede Anfrage an `/v1/…` landet nur im Speicher (Methode, Pfad, Kopfzeilen, Körper, Zeitpunkt). Nichts wird auf Platte oder ins Log geschrieben. `closedByClient` zeigt, ob der Aufrufer die Verbindung vor dem Ende der Antwort geschlossen hat, so prüfst du, dass ein Abbruch wirklich beim Anbieter ankommt. Die Steuerung gibt den Schlüssel nicht im Klartext wieder.
- **Unabhängig:** Parallele Anfragen stören sich nicht. Er baut nie eine Verbindung nach außen auf und nutzt nur `node:http`.

## Grenzen

- Er ist ein Test-Werkzeug, kein Modell: Antworten sind festgelegter Text, keine echte Sprachverarbeitung.
- Die Token-Zahlen sind geschätzt, nicht die eines echten Modells.
- Die Steuerung unter `/_steuerung/` hat keine Anmeldung. Binde ihn nie an ein offenes Netz, ein Container gehört in ein internes Netz.
- Nur Chat und Modell-Liste sind nachgebildet (keine Einbettungen, keine Bilder).
- Ein Compose-Testprofil mit dem Image und die End-to-End-Tests sind geplant, aber noch nicht gebaut.

## Fehlerbehebung

| Beobachtung                        | Ursache                                         | Was tun                                                 |
| ---------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| Fehler 401 vom Test-Anbieter       | Schlüssel gesetzt, aber ein anderer gesendet    | gleichen Schlüssel verwenden oder `apiKey` leeren       |
| Aus dem Container nicht erreichbar | bindet standardmäßig nur an `127.0.0.1`         | `FAKE_PROVIDER_HOST=0.0.0.0` setzen (im Image schon so) |
| Port belegt                        | fester Port wird schon genutzt                  | `FAKE_PROVIDER_PORT=0` oder anderen Port nehmen         |
| Test hängt                         | `haengen` war geplant und niemand bricht ab     | im Test abbrechen, `reset()` oder `stop()` beendet es   |
| Werkzeug-Aufruf kommt immer wieder | `toolCall` bleibt gesetzt, bis er entfernt wird | nach dem Aufruf `configure({ toolCall: undefined })`    |
