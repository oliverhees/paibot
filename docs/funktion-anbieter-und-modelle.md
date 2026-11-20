<!--
PaiBot – Anbieter und Modelle: Anbieter eintragen, Modelle abrufen, Verbindung testen.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-20
-->

# Anbieter und Modelle

**Ergebnis:** Du trägst einen Modell-Anbieter ein, testest die Verbindung, siehst die passenden Modelle und wählst eines. PaiBot spricht dabei nur mit diesem einen Anbieter, und bei eingeschalteter Datenschleuse nur mit der Datenschleuse.

> Stand: Die Anbieter-Schicht (`packages/llm`) ist gebaut und getestet. Die Seite „Modell und Anbieter“ in der Oberfläche folgt; die Abschnitte „So benutzt du es“ und „So sieht es aus“ gelten dann.

## Wofür

PaiBot braucht ein Sprachmodell, das die Antworten schreibt. Das Modell läuft nicht bei dir, sondern bei einem Anbieter. Hier legst du fest, bei wem, und PaiBot prüft, ob der Zugang funktioniert.

## So benutzt du es

1. Öffne „Modell und Anbieter“ und wähle die Vorlage **EUrouter** (Region EU) oder **Eigener Anbieter (OpenAI-kompatibel)**.
2. Trage bei einem eigenen Anbieter die Basis-URL ein und wähle die Region (`eu`, `außerhalb der EU`, `lokal`).
3. Trage den Schlüssel ein. Er wird verschlüsselt gespeichert und nie wieder angezeigt.
4. Klicke „Verbindung testen“. Bei Erfolg erscheint die Liste der passenden Modelle.
5. Wähle das Standard-Modell.

Beispiel für einen lokalen Anbieter (Region `lokal`):

```text
Basis-URL: http://localhost:11434/v1
Region:    lokal
Schlüssel: (leer lassen, wenn der Anbieter keinen braucht)
```

## So sieht es aus

Folgt mit der Oberfläche. Die Aufnahmen entstehen per Skript aus der laufenden App mit Beispiel-Daten (siehe [screenshots.json](screenshots.json)).

## Einstellungen

| Einstellung    | Wo                | Bedeutung                                                               | Standard                               |
| -------------- | ----------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| Basis-URL      | Anbieter          | OpenAI-kompatible Adresse, endet meist auf `/v1`                        | EUrouter: `https://api.eurouter.ai/v1` |
| Region         | Anbieter          | `eu`, `non_eu` oder `local`; bestimmt, was für die Adresse erlaubt ist  | EUrouter: `eu`                         |
| Schlüssel      | Anbieter          | wird verschlüsselt gespeichert                                          | leer                                   |
| `SCHLEUSE_URL` | Umgebungsvariable | Adresse der Datenschleuse, z. B. `http://datenschleuse:4000/v1`         | nicht gesetzt = nicht installiert      |
| `SCHLEUSE_KEY` | Umgebungsvariable | Schlüssel der Datenschleuse; Pflicht, sobald `SCHLEUSE_URL` gesetzt ist | –                                      |

## So funktioniert es

| Schritt           | Was passiert                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modell-Liste      | PaiBot ruft `GET <Basis-URL>/models` ab. Übrig bleiben Modelle, die Text zu Text können, den Chat-Endpunkt anbieten und streamen. Fehlen diese Zusatzangaben in der Liste, gilt das Modell als passend.                                                                   |
| Verbindungstest   | Derselbe Abruf, ohne kostenpflichtigen Modell-Aufruf. Das Ergebnis ist „ok“ oder einer der Fälle: Schlüssel nicht angenommen, Limit erreicht, Anbieter nicht erreichbar (auch bei Zeitüberschreitung, unbekannter Adresse oder einer Antwort, die kein JSON ist).         |
| Weg zum Modell    | Pro Nachricht gilt: Schalter der Nachricht, sonst der Unterhaltung, sonst der Standard. „Aus“ heißt direkt zum Anbieter. „An“ heißt über die Datenschleuse; ist sie nicht installiert oder nicht erreichbar, wird die Nachricht **nicht** direkt geschickt.               |
| Zugang zum Modell | Ein Lauf bekommt den Zugang nur mit einer Berechtigung des Tors. Ohne sie, oder mit einer, die nicht zu Unterhaltung, Modell und Anbieter passt, gibt es keinen Zugang.                                                                                                   |
| Ausgangs-Liste    | Der Zugang trägt ein `fetch`, das nur die Adresse des gewählten Weges erreicht (Anbieter oder Datenschleuse). Jedes andere Ziel wird abgelehnt, bevor eine Verbindung entsteht, und gemeldet. Das gilt auch für Weiterleitungen.                                          |
| Basis-URL-Prüfung | Siehe unten. Sie läuft beim Eintragen und noch einmal bei jeder Nutzung.                                                                                                                                                                                                  |
| Fehler            | Jeder Fehler wird auf einen festen Code abgebildet (`schluessel_ungueltig`, `limit_erreicht`, `anbieter_nicht_erreichbar`, `schleuse_blockiert`, `unterbrochen`, `intern`) mit Text und Ausweg aus dem Textkatalog. Schlüssel kommen in keinem Fehler und keinem Log vor. |

**Welche Adressen erlaubt sind**

| Adresse                                                                                   | Region `eu` / `non_eu` | Region `local`                             |
| ----------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------ |
| `https://` mit öffentlichem Namen oder öffentlicher IP                                    | erlaubt                | erlaubt                                    |
| `http://`                                                                                 | abgelehnt              | erlaubt, mit Warnhinweis „unverschlüsselt“ |
| `localhost`, Loopback, private Netze, Namen ohne Punkt, `.local`, `.internal`             | abgelehnt              | erlaubt, mit Warnhinweis                   |
| Namen der PaiBot-Dienste (`postgres`, `datenschleuse`, `web`, `worker`)                   | abgelehnt              | abgelehnt                                  |
| Link-Local (`169.254.…`, `fe80::`) und Adressen von Metadaten-Diensten der Cloud-Anbieter | abgelehnt              | abgelehnt                                  |
| Zugangsdaten in der Adresse (`nutzer:passwort@…`)                                         | abgelehnt              | abgelehnt                                  |

Ungewöhnliche Schreibweisen von IP-Adressen (dezimal, hexadezimal, oktal, gekürzt, IPv6 mit eingebetteter IPv4-Adresse) werden vor der Prüfung vereinheitlicht und dann genauso behandelt. Bei Namen schaut PaiBot bei jedem Aufruf nach, auf welche Adressen sie zeigen; zeigt eine davon auf ein nicht erlaubtes Ziel, wird der Aufruf abgelehnt.

## Grenzen

- Die Namensauflösung wird unmittelbar vor dem Aufruf geprüft, nicht während des Verbindungsaufbaus. Ein Angreifer, der den DNS-Eintrag zwischen Prüfung und Verbindung umstellt, wird dadurch nicht sicher ausgeschlossen. Wer dem Anbieter-Namen nicht traut, nutzt keinen eigenen Anbieter.
- Ein lokaler Anbieter (Region `local`, z. B. Ollama auf deinem Rechner) darf ohne Schlüssel arbeiten. Für Anbieter in den Regionen `eu` und `non_eu` ist ein Schlüssel Pflicht; fehlt er, meldet PaiBot „Der Anbieter hat den Schlüssel nicht angenommen“, ohne etwas zu senden.
- Der Verbindungstest ruft nur die Modell-Liste ab. Liefert ein Anbieter die Liste auch ohne Schlüssel (EUrouter tut das), erkennt der Test einen falschen Schlüssel nicht; er zeigt sich erst bei der ersten Antwort.
- Der Gesundheitsabruf der Datenschleuse prüft nur, dass sie antwortet (`GET /models` mit ihrem Schlüssel). Ob ihre Erkennung läuft, sagt er nicht; ist sie ausgefallen, blockiert die Datenschleuse die Anfrage selbst (`schleuse_blockiert`).
- Wie die Datenschleuse einen Block als HTTP-Antwort meldet, ist noch nicht gegen den laufenden Dienst geprüft; erkannt wird die Kennung `DatenschleuseBlocked` in den üblichen Feldern.
- Der Datenschleuse-Dienst selbst ist nicht Teil dieser Funktion; hier gibt es nur die Anbindung.
- Nur OpenAI-kompatible Anbieter. Bilder, Embeddings und andere Modellarten werden herausgefiltert.

## Fehlerbehebung

| Beobachtung                                                            | Ursache                                                                                                    | Was tun                                                                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| „Der Anbieter des Modells ist nicht erreichbar“ beim Eintragen         | Adresse falsch, Anbieter down, Antwort ohne JSON oder Adresse nicht erlaubt (z. B. `http` bei Region `eu`) | Adresse und Region prüfen; bei einem lokalen Anbieter Region `lokal` wählen                      |
| „Der Anbieter hat den Schlüssel nicht angenommen“                      | Schlüssel falsch, abgelaufen oder mit Leer- oder Sonderzeichen                                             | Schlüssel neu eintragen; ein Schlüssel darf nur aus sichtbaren Zeichen ohne Leerzeichen bestehen |
| „Ein Limit ist erreicht“                                               | Anbieter meldet 429 oder fehlendes Guthaben (402)                                                          | kurz warten, Guthaben und Tagesbudget prüfen                                                     |
| Modell-Liste ist leer                                                  | Der Anbieter bietet kein Text-zu-Text-Modell mit Chat und Streaming an                                     | anderen Anbieter oder anderes Konto prüfen                                                       |
| „Die Datenschleuse ist nicht installiert“                              | `SCHLEUSE_URL` fehlt                                                                                       | Datenschleuse installieren oder den Schalter auf „Aus“ lassen                                    |
| `SCHLEUSE_URL ist keine gültige URL` / `SCHLEUSE_KEY fehlt` beim Start | Umgebung unvollständig                                                                                     | beide Variablen setzen; die URL ohne Zugangsdaten                                                |
