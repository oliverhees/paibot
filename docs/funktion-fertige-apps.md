<!--
PaiBot – Doku: Fertige Apps (Verzeichnis der Vorlagen für Notion, Linear, Atlassian und GitHub).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-23
-->

# Fertige Apps

**Ergebnis:** Im Code liegt ein Verzeichnis mit Vorlagen für Notion, Linear, Atlassian und GitHub. Die Einträge werden beim Laden gegen ein festes Schema geprüft. Keine der Vorlagen ist bisher mit einem echten Konto ausprobiert. Anwender sehen davon noch nichts; spätere Aufgaben bauen darauf.

## Wofür

Später sollst du eine bekannte App auswählen können, statt die Adresse ihres Servers selbst einzutippen. Dafür braucht PaiBot zuerst eine verlässliche Liste: Adresse, Name, Kurzname, Art der Anmeldung und ein Link zur Doku des Anbieters. Diese Liste ist jetzt da. Den Katalog in der Oberfläche gibt es noch nicht.

## So benutzt du es

Es gibt nichts zu bedienen. Das Verbinden einer App hat sich mit diesem Teil nicht geändert.

1. Verbinde Apps weiter über die Seite **Apps**, wie in [Apps](funktion-apps.md) beschrieben.
2. Die Vorlagen erscheinen dort erst, wenn die Oberfläche dafür gebaut ist (geplant).

## So sieht es aus

Ohne Oberfläche. Dieser Teil liefert nur Daten im Code. Der Katalog bekommt eigene Bilder, sobald es ihn gibt.

## Einstellungen

Keine. Das Verzeichnis liest weder Umgebungsvariablen noch Einstellungen noch Dateien. Es lässt sich zur Laufzeit nicht ändern; Änderungen gehören in den Code und bekommen eine neue Fassung.

## So funktioniert es

Das Verzeichnis nennt genau vier Vorlagen:

| Vorlage   | Standard-Adresse                      | Weitere Adresse              | Anmeldung mit Token |
| --------- | ------------------------------------- | ---------------------------- | ------------------- |
| Notion    | `https://mcp.notion.com/mcp`          | –                            | eingeschränkt       |
| Linear    | `https://mcp.linear.app/mcp/readonly` | `https://mcp.linear.app/mcp` | ja                  |
| Atlassian | `https://mcp.atlassian.com/v2/mcp`    | –                            | eingeschränkt       |
| GitHub    | `https://api.githubcopilot.com/mcp`   | –                            | ja                  |

- Bei Linear ist die Standard-Adresse die zum Nur-Lesen; die Adresse mit allen Werkzeugen ist die zweite.
- „Eingeschränkt“ heißt: Die Anmeldung mit einem Token geht nur unter einer Bedingung, die als fester Satz zur Vorlage gehört.
- Keine Vorlage ist bisher ausprobiert. Die Werte stammen aus der Doku der Anbieter.
- Beim Laden prüft PaiBot jede Vorlage streng. Eine fehlerhafte Vorlage stoppt das Laden des Moduls, statt später still falsch zu wirken.

Technische Einzelheiten stehen in [Fertige Apps – für Entwickler](entwickler/fertige-apps.md).

## Grenzen

- Es gibt den Katalog in der Oberfläche noch nicht. Du kannst keine Vorlage auswählen.
- Eine Vorlage füllt beim Verbinden noch nichts aus (geplant).
- Keine Vorlage ist gegen einen echten Server ausprobiert.

## Fehlerbehebung

| Beobachtung                        | Ursache                                 | Was tun                                                               |
| ---------------------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| Ich finde keinen Katalog der Apps  | Der Katalog ist noch nicht gebaut       | Adresse des Servers selbst eintragen, wie in [Apps](funktion-apps.md) |
| Meine App steht nicht in der Liste | Das Verzeichnis nennt nur vier Vorlagen | Die App wie gewohnt über ihre Adresse verbinden                       |
