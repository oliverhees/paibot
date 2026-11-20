<!--
PaiBot – Herkunft, Versionen und Lizenz der lokal eingebundenen Schriften

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-20
-->

# Schriften

Diese Schriften liegen als Dateien im Projekt, damit PaiBot auf jedem Gerät gleich aussieht und nichts von fremden Servern lädt.

| Schrift    | Einsatz                            | Version | Quelle                                                 | Lizenz                    |
| ---------- | ---------------------------------- | ------- | ------------------------------------------------------ | ------------------------- |
| Inter      | Fließtext und Oberfläche (400–700) | 5.3.0   | npm-Paket `@fontsource-variable/inter` (Inter-Projekt) | SIL Open Font License 1.1 |
| Montserrat | Wortmarke „PaiBot“ (800)           | 5.3.0   | npm-Paket `@fontsource-variable/montserrat`            | SIL Open Font License 1.1 |

- Enthalten sind nur die variablen Dateien (woff2) der Schriftschnitte „latin“ und „latin-ext“, normal (nicht kursiv).
- Die Lizenztexte stehen neben den Dateien: `OFL-Inter.txt` und `OFL-Montserrat.txt`.
- Die `@font-face`-Regeln stehen in `packages/ui/src/schriften.css`.
- Diese Schriften sind nicht Teil der PaiBot Fair-Code-Lizenz; für sie gilt die jeweilige Open Font License.
