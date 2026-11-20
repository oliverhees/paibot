<!--
PaiBot – Doku-Seite: Belege und das Tor.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-20
-->

# Belege

**Ergebnis:** Zu jeder Aktion in PaiBot gibt es einen Beleg. Du kannst jederzeit nachprüfen, dass kein Beleg nachträglich verändert, gelöscht oder eingeschoben wurde – in PaiBot selbst oder mit einem Export ganz ohne PaiBot.

## Wofür

PaiBot handelt für dich: Er schickt Anfragen an ein Modell, ändert Einstellungen, legt Unterhaltungen an. Belege halten fest, was passiert ist, wer es ausgelöst hat und nach welcher Regel es erlaubt war. So musst du PaiBot nicht einfach glauben, sondern kannst es prüfen.

## So benutzt du es

Belege entstehen von selbst, du musst nichts einschalten.

1. **Prüfen in PaiBot:** Auf der Seite „Belege“ gibt es „Beleg prüfen“ für einen einzelnen Eintrag und „Ganze Kette prüfen“ (folgt mit der Oberfläche).
2. **Exportieren:** „Belege exportieren“ lädt eine Datei `belege.jsonl` herunter. Sie enthält alle Belege und die öffentlichen Schlüssel deiner Installation (folgt mit der Oberfläche).
3. **Ohne PaiBot prüfen:** Im Projektordner von PaiBot den Export prüfen:

```text
pnpm belege:pruefen belege.jsonl
```

Ist alles in Ordnung, siehst du:

```text
Belege-Kette gültig: 128 Einträge geprüft.
Letzter Eintrag: 128 (sha256:3f9c…)
```

Ist etwas verändert, nennt der Befehl die erste betroffene Stelle und was dort nicht stimmt:

```text
Belege-Kette ungültig bei Eintrag 42: 128 Einträge geprüft.
  ✗ Inhalt verändert
  ✓ Signatur gültig (Schlüssel 3f9c-2ab1-77d0-e4c5)
  ✓ Kette lückenlos bis hier
```

| Exit-Code | Bedeutung                                                    |
| --------- | ------------------------------------------------------------ |
| `0`       | Kette gültig                                                 |
| `1`       | Kette ungültig, die Ausgabe nennt die Stelle                 |
| `2`       | Aufruf falsch oder Datei nicht lesbar bzw. kein Beleg-Export |

Der Befehl braucht keine Datenbank und kein Netz. Er funktioniert auch auf einem anderen Rechner, solange dort Node.js 22 oder neuer und der Code von PaiBot liegen.

**Tipp:** Notiere dir ab und zu die letzte Zeile („Letzter Eintrag: … (sha256:…)“) oder bewahre einen Export außerhalb des Servers auf. Damit kannst du später zeigen, dass die Kette bis dorthin unverändert ist (siehe „Grenzen“).

## So sieht es aus

Folgt mit der Oberfläche (Seite „Belege“, Prüfen eines Belegs, Prüfen der Kette, Export).

## Einstellungen

| Einstellung     | Wo                | Bedeutung                                                                                                                                                              | Standard                  |
| --------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `PAIBOT_SECRET` | Umgebungsvariable | Wurzel-Geheimnis. Daraus wird der Schlüssel abgeleitet, mit dem der private Signaturschlüssel verschlüsselt gespeichert wird, und der Schlüssel für Kontext-Prüfsummen | keiner, muss gesetzt sein |
| `PAIBOT_BUILD`  | Umgebungsvariable | Stand der Software, steht im ersten Beleg der Kette                                                                                                                    | `<version>+dev`           |

Sonst gibt es nichts einzustellen. Belege lassen sich nicht abschalten.

## So funktioniert es

### Was ein Beleg ist

Ein Beleg ist ein kleiner Datensatz. Er enthält nur Werte, nie den Inhalt deiner Nachrichten:

| Feld        | Inhalt                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------- |
| `v`         | Formatversion, heute `1`                                                                     |
| `id`, `seq` | Kennung (`blg_…`) und laufende Nummer ab 1                                                   |
| `time`      | Zeitpunkt in UTC, z. B. `2026-11-20T10:00:00.000Z`                                           |
| `type`      | `start`, `decision` (Entscheidung), `result` (Ergebnis) oder `key_change` (Schlüsselwechsel) |
| `action`    | welche Aktion, wer sie ausgelöst hat (`besitzer` oder ein Bot) und worauf sie zielt          |
| `decision`  | was das Tor entschieden hat, nach welcher Regel und welche Grenzen geprüft wurden            |
| `facts`     | die Werte, die das Tor gesehen hat, z. B. Länge der Eingabe oder Region des Anbieters        |
| `context`   | Prüfsumme über die ausgehende Anfrage (`hmac-sha256:…`), nicht der Inhalt selbst             |
| `result`    | wie die Aktion ausging: `ok`, `error`, `cancelled` oder `denied`                             |
| `undo`      | ob und wie sich die Aktion rückgängig machen lässt                                           |
| `prev`      | Prüfsumme des vorigen Belegs                                                                 |
| `keyId`     | welcher Schlüssel den Beleg signiert hat                                                     |

Zu jeder Aktion gibt es zwei Belege: die **Entscheidung** vor der Ausführung und das **Ergebnis** danach. Beide tragen dieselbe Aktions-Kennung (`akt_…`).

### Wie die Kette funktioniert

1. **Kanonische Form:** Jeder Beleg wird immer gleich in Text verwandelt (JSON nach RFC 8785: Schlüssel sortiert, keine Leerzeichen, nur ganze Zahlen). So ergibt derselbe Beleg auf jedem Rechner denselben Text.
2. **Prüfsumme:** Über diesen Text (mit dem Vorsatz `pb-beleg/v1` und einem Zeilenumbruch) wird SHA-256 gerechnet. Ergebnis: `sha256:<64 Zeichen>`.
3. **Kette:** Jeder Beleg nennt in `prev` die Prüfsumme des vorigen. Der erste Beleg („Start“) nennt eine Prüfsumme aus lauter Nullen, deine Installations-Kennung und den öffentlichen Schlüssel. Wer einen Beleg ändert, löscht, einschiebt oder Belege vertauscht, bricht die Kette an genau dieser Stelle.
4. **Signatur:** Jede Prüfsumme wird mit dem Signaturschlüssel deiner Installation (Ed25519) signiert. Der private Teil liegt nur verschlüsselt in der Datenbank. Wer nur die Datenbank ändert, kann keine gültigen Signaturen erzeugen.
5. **Anhängen unter Sperre:** Neue Belege werden in einer Datenbank-Transaktion mit einer festen Sperre angehängt. Auch wenn Web-App und Hintergrund-Dienst gleichzeitig Belege schreiben, bleibt die Kette lückenlos und verzweigt sich nicht. Die Datenbank weist jede Änderung und jedes Löschen von Belegen ab.

### Schlüsselwechsel

Geht der private Signaturschlüssel verloren (zum Beispiel, weil `PAIBOT_SECRET` neu gesetzt wurde), bekommt PaiBot einen neuen Schlüssel, und ein Beleg „Schlüsselwechsel“ wird angehängt. Er nennt den neuen Schlüssel und den bisherigen. Ab dann gilt nur noch der neue Schlüssel.

- **Regelfall:** Der bisherige Schlüssel ist noch da und signiert den Wechsel (`signedBy: "previous"`).
- **Schlüssel verloren:** Der neue Schlüssel signiert den Wechsel selbst (`signedBy: "new"`). Das ist schwächer, weil kein alter Schlüssel den neuen bestätigt. Darum steht es ausdrücklich im Beleg.

Alte Belege bleiben prüfbar, denn alle öffentlichen Schlüssel sind im Klartext gespeichert und stehen im Export.

### Wie geprüft wird

Für jeden Beleg laufen diese Prüfungen:

| #   | Prüfung                                                                                              | Ergebnis                                            |
| --- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | Prüfsumme neu berechnen und vergleichen                                                              | „Inhalt unverändert“ / „Inhalt verändert“           |
| 2   | Signatur mit dem öffentlichen Schlüssel prüfen; der Schlüssel muss an dieser Stelle der Kette gelten | „Signatur gültig (Schlüssel `xxxx-xxxx-xxxx-xxxx`)“ |
| 3   | Verbindung zum vorigen Beleg prüfen (`prev` und laufende Nummer)                                     | „Kette lückenlos bis hier“ / „Kette unterbrochen“   |
| 4   | Entscheidung aus den gespeicherten Fakten und der Regel-Fassung nachrechnen, ohne KI                 | „Entscheidung folgt aus Regel …“                    |
| 5   | Nur auf dem Server: Kontext-Prüfsumme mit der gespeicherten Nachricht vergleichen                    | „Kontext passt“ / „Inhalt gelöscht, nicht prüfbar“  |

Die Prüfungen 1 bis 4 nutzen nur Web Crypto und laufen deshalb auch im Browser und im Befehl `pnpm belege:pruefen`. Prüfung 4 braucht die Regel-Fassungen; der Befehl kennt sie nicht und lässt sie aus. Prüfen erzeugt selbst keinen Beleg.

### Export

Der Export ist eine Textdatei im Format JSON Lines (`application/x-ndjson`):

- **Zeile 1:** `{"format":"pb-belege","v":1,"installationId":"ins_…","publicKeys":[{"keyId":"sch_…","publicKey":"…","fingerprint":"xxxx-xxxx-xxxx-xxxx"}]}`
- **jede weitere Zeile:** ein Beleg mit `seq`, `id`, `hash`, `signature`, `keyId` und `body` (der Beleg in kanonischer Form)

Beteiligte Teile: `packages/receipts` (Bauen, Prüfsumme, Signatur, Anhängen, Prüfer, Export, Befehl), `packages/crypto` (Signaturschlüssel), `packages/db` (Tabelle `belege` mit Schutz gegen Ändern und Löschen).

## Das Tor

Jeder Beleg „Entscheidung“ und „Ergebnis“ entsteht im Tor. Wie das Tor entscheidet, welche Regeln und Grenzen es prüft und wann es ablehnt, steht auf der Seite [Das Tor](funktion-tor.md).

## Grenzen

- **Wer den Server vollständig kontrolliert** (Datenbank **und** `PAIBOT_SECRET`), kann die ganze Kette neu schreiben. Dagegen hilft nur ein Abgleich mit einer Kopie außerhalb: ein aufbewahrter Export oder eine notierte letzte Zeile der Prüfung.
- **Abgeschnittenes Ende:** Fehlen die letzten Belege, bleibt der Rest eine gültige Kette. Das fällt nur im Vergleich mit einem früher notierten letzten Eintrag auf.
- **Schlüsselwechsel mit `signedBy: "new"`** bestätigt kein alter Schlüssel. Prüfe solche Wechsel bewusst.
- **Nachrechnen nach geänderten Regeln:** Prüfung 4 rechnet mit den Regeln nach, die du ihr gibst. Sind seit einer Entscheidung Regeln dazugekommen oder geändert worden, kann eine damals richtige Entscheidung heute anders ausfallen und als „Entscheidung folgt nicht aus den gespeicherten Fakten“ erscheinen. Signatur und Kette sind davon nicht betroffen. Für das Nachrechnen alter Belege braucht es die Regeln, die damals galten.
- Belege enthalten keine Inhalte. Ob eine Antwort wirklich zu einer Nachricht passt, prüft nur der Server über die Kontext-Prüfsumme, und nur solange die Nachricht noch gespeichert ist.
- Prüfen im Browser setzt Ed25519 in Web Crypto voraus. Kann der Browser das nicht, prüft der Server (folgt mit der Oberfläche).

## Fehlerbehebung

| Beobachtung              | Ursache                                                                                  | Was tun                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| „Inhalt verändert“       | Der Beleg wurde nach dem Schreiben geändert (z. B. in der Datei)                         | Mit einem älteren Export vergleichen; die Stelle steht in der Ausgabe                                                 |
| „Signatur ungültig“      | Fremder oder unbekannter Schlüssel, oder ein alter Schlüssel nach einem Schlüsselwechsel | Prüfen, ob alle öffentlichen Schlüssel im Export stehen; sonst wurde der Beleg nicht von dieser Installation signiert |
| „Kette unterbrochen“     | Ein Beleg fehlt, wurde eingeschoben oder Belege wurden vertauscht                        | Die Ausgabe nennt den ersten betroffenen Eintrag                                                                      |
| Exit-Code `2`, „Zeile …“ | Die Datei ist kein Beleg-Export oder beschädigt                                          | Export neu herunterladen; die Datei nicht in einem Programm öffnen, das Zeilen umbricht                               |
| Exit-Code `2`, „Aufruf“  | Kein oder mehr als ein Dateiname                                                         | `pnpm belege:pruefen <datei.jsonl>` mit genau einer Datei                                                             |
