<!--
PaiBot – Anwender-Doku: Datenbank für Teams (Teil A).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-23
-->

# Datenbank für Teams (Teil A)

**Ergebnis:** PaiBot kann in der Datenbank Teams, Entwürfe für Teams und Fäden speichern, und das Tor kennt die dazugehörigen Aktionen (Fassung 4).

**Stand:** Diese Seite beschreibt den Schritt, mit dem die Datenbank dafür entstand – den Stand zu seiner Bauzeit, nicht den heutigen Umfang. Bots und Teams bedienst du inzwischen auf eigenen Seiten ([Bots und Teams](funktion-bots-und-teams.md)): Bots anlegen, pausieren, löschen, Teams anlegen, ändern, löschen und Bots zuordnen. Ohne Oberfläche sind nur noch Entwürfe für Teams (ein Team aus einer Vorlage anlegen) und Fäden.

## Wofür

Teams aus Bots brauchen einen Platz, an dem sie gespeichert werden. Dieser Teil legt ihn an und sorgt dafür, dass das Update von einer bestehenden Installation sauber durchläuft. Auf ihm bauen die heutigen Seiten für Bots und Teams auf. Vom Schritt selbst merkst du nur das Update und zwei Hinweise im Chat: Beim Senden und bei „Neu erzeugen“ in einem Faden erscheint derselbe Hinweis (siehe „Grenzen“).

## So benutzt du es

1. Lege vor dem Update eine Sicherung an ([Aktualisieren](aktualisieren.md)).
2. Spiele das Update ein. Die Datenbank wird beim Start automatisch angepasst.
3. Prüfe danach, dass deine bisherigen Chats noch da sind und weiter antworten.

Beispiel (Sicherung vor dem Update, Anleitung in [Sicherung](sicherung.md)):

```bash
sh deploy/sicherung.sh sichern
```

## So sieht es aus

Ohne Oberfläche. Dieser Teil ändert nur die Datenbank und die Regeln des Tors. Die Seiten, mit denen du Bots und Teams heute bedienst, samt Bildern stehen unter [Bots und Teams](funktion-bots-und-teams.md).

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

- Dieser Schritt selbst bringt keine Seite und keinen Knopf mit. Ein Team anlegen und einen Bot zuordnen tust du heute auf der Seite [Bots und Teams](funktion-bots-und-teams.md); ein Team aus einer Vorlage anzulegen (Entwürfe) und einen Faden zu beginnen gibt es weiter nicht.
- In einem Faden antwortet noch kein Bot: Senden und „Neu erzeugen“ zeigen den Hinweis „In einem Faden antwortet noch kein Bot.“.
- Ein Bot, der schon gearbeitet hat, und dein Standard-Bot lassen sich nicht löschen. Das gilt auch auf der heutigen Seite des Bots.
- Kein Weg zurück: Nach dem Update läuft keine ältere Version von PaiBot mehr mit dieser Datenbank.

## Fehlerbehebung

| Beobachtung                                                             | Ursache                                                               | Was tun                                                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Ein älteres PaiBot meldet Belege als „mit dieser Fassung nicht prüfbar“ | Die Belege stammen aus Fassung 4, das ältere Programm kennt sie nicht | PaiBot auf den neuen Stand bringen; die Belege sind nicht ungültig                                  |
| Nach dem Zurückspielen eines alten Stands startet PaiBot nicht          | Der alte Stand kennt die neue Datenbank nicht                         | Die Sicherung von vor dem Update einspielen ([Aktualisieren](aktualisieren.md))                     |
| Ein Bot lässt sich nicht löschen                                        | Er hat schon gearbeitet oder ist dein Standard-Bot                    | Das ist gewollt; pausieren kannst du ihn stattdessen ([Bots und Teams](funktion-bots-und-teams.md)) |

Technik: [Entwickler-Doku](entwickler/datenbank-teams-a.md).
