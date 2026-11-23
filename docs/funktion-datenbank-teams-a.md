<!--
PaiBot – Anwender-Doku: Datenbank für Teams (Teil A).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-23
-->

# Datenbank für Teams (Teil A)

**Ergebnis:** PaiBot kann in der Datenbank Teams, Entwürfe für Teams und Fäden speichern, und das Tor kennt die dazugehörigen Aktionen (Fassung 4). Bedienen kannst du das noch nicht: Es gibt dafür noch keine Seite.

## Wofür

Teams aus Bots brauchen einen Platz, an dem sie gespeichert werden. Dieser Teil legt ihn an und sorgt dafür, dass das Update von einer bestehenden Installation sauber durchläuft. Du merkst davon nur das Update selbst und zwei Dinge im Chat (siehe „Grenzen“).

## So benutzt du es

1. Lege vor dem Update eine Sicherung an ([Aktualisieren](aktualisieren.md)).
2. Spiele das Update ein. Die Datenbank wird beim Start automatisch angepasst.
3. Prüfe danach, dass deine bisherigen Chats noch da sind und weiter antworten.

Beispiel (Sicherung vor dem Update, Anleitung in [Sicherung](sicherung.md)):

```bash
sh deploy/sicherung.sh sichern
```

## So sieht es aus

Ohne Oberfläche. Dieser Teil ändert nur die Datenbank und die Regeln des Tors. Die Seiten zum Anlegen von Teams kommen später und bekommen dann eigene Bilder.

## Einstellungen

| Einstellung       | Wo                                                                             | Bedeutung                        | Standard |
| ----------------- | ------------------------------------------------------------------------------ | -------------------------------- | -------- |
| Stabschef erlaubt | Datenbank (`settings.stabschef_erlaubt`), noch ohne Schalter in der Oberfläche | ob Pai Teams Aufträge geben darf | aus      |

## So funktioniert es

- **Neue Tabellen:** Teams, Entwürfe für Teams, was ein Entwurf angelegt hat, Fäden und deren Punkte „fertig, wenn“. Ein Faden ist eine Unterhaltung, die einem Team gehört und keinen eigenen Bot hat.
- **Bestehende Chats:** Alle Unterhaltungen von vor dem Update gelten danach als normale Chats mit ihrem Bot. Sie bleiben unverändert.
- **Art und Team stehen fest:** Ein Chat wird nie zum Faden und ein Faden wechselt nie das Team. Die Datenbank lehnt jede solche Änderung ab.
- **Tor:** Das Tor entscheidet jetzt nach Fassung 4. Ältere Belege bleiben prüfbar und gültig ([Das Tor](funktion-tor.md#bots-pausieren-und-teams-fassung-4)).
- **Sicherung:** Die Sicherung kennt die neuen Prüffunktionen der Datenbank und lehnt unbekannte weiter ab.

## Grenzen

- Es gibt keine Seite und keinen Knopf, um ein Team anzulegen, einen Bot einem Team zuzuordnen oder einen Faden zu beginnen (geplant).
- In einem Faden antwortet noch kein Bot: Senden und „Neu erzeugen“ zeigen den Hinweis „In einem Faden antwortet noch kein Bot.“.
- Ein Bot, der schon gearbeitet hat, und dein Standard-Bot lassen sich nicht löschen.
- Kein Weg zurück: Nach dem Update läuft keine ältere Version von PaiBot mehr mit dieser Datenbank.

## Fehlerbehebung

| Beobachtung                                                             | Ursache                                                               | Was tun                                                                         |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Ein älteres PaiBot meldet Belege als „mit dieser Fassung nicht prüfbar“ | Die Belege stammen aus Fassung 4, das ältere Programm kennt sie nicht | PaiBot auf den neuen Stand bringen; die Belege sind nicht ungültig              |
| Nach dem Zurückspielen eines alten Stands startet PaiBot nicht          | Der alte Stand kennt die neue Datenbank nicht                         | Die Sicherung von vor dem Update einspielen ([Aktualisieren](aktualisieren.md)) |
| Ein Bot lässt sich nicht löschen                                        | Er hat schon gearbeitet oder ist dein Standard-Bot                    | Das ist gewollt; pausieren statt löschen                                        |

Technik: [Entwickler-Doku](entwickler/datenbank-teams-a.md).
