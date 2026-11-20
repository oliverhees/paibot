<!--
PaiBot – Doku: Chat mit dem Bot, wie aus einer Nachricht eine Antwort wird.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-20
-->

# Chat

**Ergebnis:** Du schreibst deinem Bot eine Nachricht, und er antwortet Stück für Stück, während der Text entsteht. Jede Anfrage an das Modell geht durch das Tor und bekommt zwei Belege; du kannst die Antwort jederzeit stoppen.

## Wofür

Der Chat ist die Hauptsache von PaiBot: Fragen stellen, Texte schreiben lassen, Gedanken sortieren. Die Antwort entsteht im Hintergrund (im Dienst `worker`). Sie läuft also weiter, auch wenn du die Seite schließt oder die Verbindung kurz abreißt, und du siehst sie beim nächsten Öffnen vollständig.

## So benutzt du es

Folgt mit der Oberfläche. Die Lauf-Steuerung im Hintergrund ist fertig; die Chat-Seite mit Eingabe, Stopp-Knopf und Schalter für die Datenschleuse kommt mit der Oberfläche. Der Ablauf wird dann so sein:

1. Unterhaltung öffnen oder neu anlegen.
2. Nachricht schreiben und senden. Der Schalter „Datenschleuse“ gilt für diese Unterhaltung.
3. Die Antwort erscheint Stück für Stück. Mit „Stopp“ brichst du sie ab; was bis dahin geschrieben war, bleibt als „Abgebrochen“ stehen.
4. Unter der Antwort steht, über welchen Weg sie kam (direkt oder über die Datenschleuse) und welches Modell geantwortet hat.

## So sieht es aus

Folgt mit der Oberfläche.

## Einstellungen

| Einstellung            | Wo                                 | Bedeutung                                                                                 | Standard            |
| ---------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- | ------------------- |
| Modell des Bots        | Seite „Modelle“ (folgt)            | Ohne gewähltes Modell antwortet der Bot nicht („Für deinen Bot ist kein Modell gewählt.“) | keins               |
| Anweisung des Bots     | Seite „Bot“ (folgt)                | Steht am Ende der Anweisung an das Modell                                                 | leer                |
| Ausgabegrenze des Bots | Seite „Bot“ (folgt)                | Höchstens so viele Token je Antwort                                                       | 4096                |
| Datenschleuse          | Schalter je Unterhaltung, Standard | `An`: jede Anfrage geht über die Datenschleuse oder gar nicht                             | aus                 |
| Verlaufsgrenze (Token) | Einstellungen                      | Wie viel vom bisherigen Gespräch mitgeschickt wird (etwa 4 Zeichen je Token)              | keine eigene Grenze |
| Tagesbudget (Token)    | Einstellungen                      | Ist es erreicht, lehnt das Tor weitere Anfragen bis Mitternacht (deine Zeitzone) ab       | keins               |
| Not-Aus                | Einstellungen (folgt)              | Ist er an, lehnt das Tor jede Anfrage des Bots ab                                         | aus                 |
| Zeitzone               | Einstellungen                      | Für das Datum in der Anweisung und den Beginn des Tagesbudgets                            | `Europe/Berlin`     |

Feste Werte der Lauf-Steuerung (im Code, `RUN_TUNING`):

| Wert                             | Wirkung                                                              |
| -------------------------------- | -------------------------------------------------------------------- |
| höchstens 50 Nachrichten Verlauf | Ältere Nachrichten werden abgeschnitten, nicht zusammengefasst       |
| höchstens 120.000 Zeichen        | Anweisung plus Verlauf je Anfrage; älteres fällt zuerst weg          |
| höchstens 200.000 Zeichen        | Länge einer Antwort; darüber endet sie mit „Ein Limit ist erreicht.“ |
| 9 Minuten                        | längste Dauer einer Antwort                                          |
| 60 Sekunden                      | längste Pause des Modells ohne neues Text-Stück                      |
| 10 Sekunden                      | Herzschlag einer laufenden Antwort in der Datenbank                  |
| 0,5 Sekunden                     | so oft prüft der Worker, ob du „Stopp“ gedrückt hast                 |
| 50 ms oder 200 Zeichen           | so werden Text-Stücke gebündelt, bevor sie an die Seite gehen        |

## So funktioniert es

Eine Nachricht wird in diesen Schritten zur Antwort:

1. **Senden (Web-App):** Das Tor prüft die Aktion `nachricht.senden`. In einer Transaktion entstehen die Nachricht, ein Lauf im Zustand „wartet“ und die Ereignisse `message.created` und `run.queued`; dazu ein Auftrag in der Warteschlange.
2. **Abholen (Worker):** Der Worker holt den Auftrag ab und liest Lauf, Unterhaltung, Bot, Einstellungen, Modell, Anbieter, Verlauf und den Tagesverbrauch **in einem Lesestand**. Der Lauf geht auf „läuft“ (Ereignis `run.started`).
3. **Fakten bilden:** Aus der Datenbank, nie aus dem Text der Nachricht: Anbieter, Region, Ziel-Adresse (als Abdruck), Weg (direkt oder Datenschleuse), ob die Datenschleuse erreichbar ist, Länge der Anfrage, Ausgabegrenze, Tagesverbrauch, Not-Aus.
4. **Tor:** Aktion `modell.anfragen` mit dem Bot als Akteur. Der Beleg „Entscheidung“ enthält die Fakten und eine Prüfsumme der ausgehenden Anfrage, nicht den Text.
5. **Antwort:** Nur wenn das Tor erlaubt, entsteht der Zugang zum Modell, und nur innerhalb dieser einen Ausführung. Der Motor macht genau einen Modell-Schritt. Text-Stücke gehen gebündelt als `text.delta` an die Seite. Am Ende wird die Antwort mit Modell, Weg und Token-Zahlen gespeichert (`message.completed`).
6. **Ergebnis:** Der Beleg „Ergebnis“ enthält Status, Token-Zahlen und eine Prüfsumme der Antwort, nie den Text. Danach ist der Lauf fertig, und die Unterhaltung nimmt die nächste Nachricht an.

Was die Seite live bekommt (über den Ereignis-Strom der Unterhaltung):

| Ereignis             | Bedeutung                                                             |
| -------------------- | --------------------------------------------------------------------- |
| `run.started`        | Der Bot beginnt zu antworten                                          |
| `message.created`    | Die Antwort des Bots ist angelegt (noch leer)                         |
| `text.delta`         | Neuer Text der Antwort, zum Anhängen                                  |
| `message.completed`  | Antwort fertig, mit Weg, Modell und Token                             |
| `run.cancelled`      | Abgebrochen; der bisherige Text bleibt als „Abgebrochen“              |
| `run.failed`         | Keine (vollständige) Antwort; Code und Satz sagen warum               |
| `run.denied`         | Das Tor hat abgelehnt; es ging nichts an das Modell                   |
| `schleuse.blockiert` | Die Datenschleuse war gefordert, aber nicht nutzbar oder hat gestoppt |
| `beleg.created`      | Ein Beleg ist entstanden (Entscheidung oder Ergebnis)                 |

**Abbruch:** „Stopp“ setzt in der Datenbank einen Abbruch-Wunsch (Aktion `lauf.abbrechen`). Der Worker sieht ihn binnen einer halben Sekunde, schließt die Verbindung zum Anbieter und beendet den Lauf. Auch wenn der Worker herunterfährt, endet eine laufende Antwort als „Abgebrochen“.

**Hängende Läufe:** Stürzt der Worker mitten in einer Antwort ab, fehlt der Herzschlag. Beim nächsten Start beendet der Worker solche Läufe als „unterbrochen“, schreibt das fehlende Ergebnis zum Beleg „Entscheidung“ und gibt die Unterhaltung wieder frei. Läufe, die länger als 15 Minuten nie abgeholt wurden, beendet er ebenso.

**Reihenfolge der Sperren:** Die Lauf-Steuerung hält nie eine Transaktion auf der Unterhaltung offen, während sie das Tor fragt. So können Web-App und Worker gleichzeitig Ereignisse und Belege schreiben, ohne sich zu verklemmen; die Beleg-Kette bleibt lückenlos.

Beteiligte Teile: `packages/agents/src/run/` (Lauf-Steuerung), `packages/agents/src/prompt.ts` (Anweisung an das Modell), `packages/gate` (Tor), `packages/llm` (Modell-Zugang), `packages/receipts` (Belege), `apps/worker` (Dienst im Hintergrund).

## Grenzen

- Der Bot hat in dieser Fassung **keine Werkzeuge**: Er kann nichts auslösen, nichts speichern, nichts nachschlagen. Wünscht ein Modell trotzdem ein Werkzeug, endet die Antwort mit „Das Tor hat die Aktion abgelehnt.“, und nichts wird ausgeführt. Werkzeuge sind geplant; die Stelle dafür ist in der Lauf-Steuerung vorgesehen.
- **Kein automatisches Wiederholen:** Scheitert eine Anfrage beim Anbieter, schickst du die Nachricht selbst noch einmal.
- **Kein Rückfall auf direkt:** Ist die Datenschleuse an, aber nicht erreichbar, geht die Nachricht gar nicht raus.
- Älterer Verlauf wird abgeschnitten, nicht zusammengefasst. Bei sehr langen Unterhaltungen „vergisst“ der Bot den Anfang.
- Pro Unterhaltung antwortet der Bot immer nur auf eine Nachricht zur selben Zeit.
- Die Token-Zahlen meldet der Anbieter; PaiBot rechnet sie nicht nach.
- Der Schalter „Datenschleuse“ gilt je Unterhaltung (oder als Standard). Ein eigener Schalter nur für eine einzelne Nachricht ist geplant.

## Fehlerbehebung

| Beobachtung                                        | Ursache                                                                     | Was tun                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| „Für deinen Bot ist kein Modell gewählt.“          | Der Bot hat kein Modell, oder es ist abgeschaltet                           | Modell wählen (siehe [Anbieter und Modelle](funktion-anbieter-und-modelle.md))                |
| „Dein Bot antwortet gerade noch.“                  | In dieser Unterhaltung läuft schon eine Antwort                             | Abwarten oder „Stopp“                                                                         |
| „Das Tor hat die Aktion abgelehnt.“                | Eine Grenze greift: Not-Aus, Tagesbudget, Anbieter abgeschaltet, Region     | Im Beleg „Entscheidung“ steht, welche Grenze (siehe [Das Tor](funktion-tor.md))               |
| `schleuse.blockiert`, keine Antwort                | Datenschleuse an, aber nicht installiert, nicht erreichbar oder gestoppt    | Datenschleuse prüfen oder für diese Unterhaltung ausschalten                                  |
| „Der Anbieter hat den Schlüssel nicht angenommen.“ | Schlüssel falsch, abgelaufen, oder die Adresse des Anbieters wurde geändert | Schlüssel neu eintragen                                                                       |
| „Ein Limit ist erreicht.“                          | Der Anbieter meldet ein Limit, oder die Antwort wurde zu lang               | Kurz warten; Tagesbudget prüfen                                                               |
| „Der Anbieter des Modells ist nicht erreichbar.“   | Netz, Anbieter gestört, oder keine Antwort innerhalb der Zeitgrenze         | Später noch einmal senden                                                                     |
| „Die Antwort wurde unterbrochen.“                  | Abgebrochen oder der Worker wurde beendet                                   | Nachricht noch einmal senden                                                                  |
| Antwort bleibt lange bei „schreibt …“              | Worker läuft nicht                                                          | `docker compose logs worker` ansehen; Zeilen wie `Lauf lau_… beendet: succeeded` zeigen Läufe |
