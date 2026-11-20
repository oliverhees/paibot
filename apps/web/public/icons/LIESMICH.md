<!--
PaiBot – Herkunft der Symbole der installierbaren Web-App

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-20
-->

# Symbole

Alle Dateien zeigen das PaiBot-Zeichen aus `packages/ui` (Komponente `Logo`) in den Farben des dunklen Designs: Akzent `#c8f250`, Gesicht und Hintergrund `#0e0e10`.

| Datei                                            | Größe    | Verwendung                                                                                               |
| ------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------- |
| `icon.svg`                                       | beliebig | Quelle der Zeichnung, Symbol im Browser-Tab                                                              |
| `icon-192.png`, `icon-512.png`                   | 192, 512 | Web-App-Symbol (Zweck „any“), transparenter Hintergrund                                                  |
| `icon-maskable-192.png`, `icon-maskable-512.png` | 192, 512 | Web-App-Symbol (Zweck „maskable“), dunkler Hintergrund bis zum Rand, Zeichen innerhalb der sicheren Zone |
| `apple-touch-icon.png`                           | 180      | „Zum Home-Bildschirm“ auf dem iPhone, dunkler Hintergrund                                                |
| `favicon-32.png`                                 | 32       | Symbol im Browser-Tab                                                                                    |

Die PNG-Dateien sind aus `icon.svg` gerendert: Das SVG wird auf einer Seite im Browser in der Zielgröße dargestellt und als Bild aufgenommen. Ändert sich das Zeichen, `icon.svg` anpassen und alle PNG-Dateien neu erzeugen.
