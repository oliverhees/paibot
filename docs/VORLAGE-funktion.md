<!--
PaiBot – Vorlage für die Doku-Seite einer Funktion.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-18
-->

# <Name der Funktion>

> Vorlage: Diese Datei kopieren (z. B. nach `docs/funktion-<name>.md`), alle Hinweise in spitzen Klammern ersetzen und die Seite in [docs/README.md](README.md) eintragen. Nichts beschreiben, was der Code nicht kann.

**Ergebnis:** <ein Satz: Was hast du danach, was vorher nicht ging?>

## Wofür

<Wann brauchst du die Funktion? Ein bis drei Sätze, ohne Fachwörter.>

## So benutzt du es

1. <Schritt>
2. <Schritt>
3. <Schritt>

Beispiel:

```text
<Eingabe oder Befehl>
```

## So sieht es aus

<Mindestens ein Screenshot pro Schritt, den man in der Oberfläche macht, in der Reihenfolge von „So benutzt du es“. Zu jedem Bild ein Satz: Was ist zu sehen, worauf kommt es an?>

![<Alt-Text: was auf dem Bild zu sehen ist>](assets/screenshots/<name>.png)

Regeln für Screenshots:

- dunkles Design, nur Beispiel-Daten (z. B. „Max Mustermann“), nie echte Daten oder Schlüssel
- nicht von Hand aufnehmen: Eintrag in [screenshots.json](screenshots.json) anlegen, dann `pnpm doku:screenshots <name>` (App muss lokal laufen)
- Bildpfade relativ schreiben, wie im Beispiel oben

## Einstellungen

| Einstellung | Wo                             | Bedeutung | Standard |
| ----------- | ------------------------------ | --------- | -------- |
| <Name>      | <Ort, z. B. Umgebungsvariable> | <Wirkung> | <Wert>   |

## So funktioniert es

<Kurz und ehrlich, was im Hintergrund passiert. Welche Teile (Dateien, Pakete, Dienste) beteiligt sind. Gern mit Diagramm.>

## Grenzen

- <Was die Funktion bewusst nicht kann>
- <Was noch geplant, aber nicht gebaut ist (als „geplant“ kennzeichnen)>

## Fehlerbehebung

| Beobachtung | Ursache | Was tun  |
| ----------- | ------- | -------- |
| <Symptom>   | <Grund> | <Lösung> |
