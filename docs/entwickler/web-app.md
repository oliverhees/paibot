<!--
PaiBot – Entwickler-Doku: installierbare Web-App (Manifest, Symbole, Metadaten).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-22
-->

# Installierbare Web-App – für Entwickler

**Anwender-Doku:** [Als Web-App installieren](../installation.md#als-web-app-installieren)

## Zweck und Entscheidung

Die Web-App liefert ein Manifest, Symbole und ein paar Metadaten, damit Browser PaiBot als eigene App mit Fenster und Symbol anbieten (`apps/web/src/app/manifest.ts#manifest`, `apps/web/src/app/layout.tsx#metadata`). Es ist dieselbe Seite vom eigenen Server; das Installieren ändert nichts am Verhalten der App.

Belegte Entscheidungen im Code:

- **Bewusst ohne Offline-Modus, Hintergrund-Cache und Mitteilungen:** Ein Test sucht im Quelltext der Web-App nach `serviceWorker`, `PushManager`, `Notification.requestPermission` und `caches.open` und verlangt null Treffer; er prüft auch, dass keine Service-Worker-Datei ausgeliefert wird und weder `next-pwa`, `workbox`, `serwist` noch `withPWA` vorkommen (`apps/web/src/app/manifest.test.ts`, Block „Bewusst ohne Offline-Modus, Hintergrund-Cache und Push“).
- **Farben aus den Design-Tokens:** `background_color` und `theme_color` im Manifest sind der dunkle Wert von `--bg`; ein Test vergleicht sie mit `packages/ui/src/tokens.css` (`apps/web/src/app/manifest.test.ts`, Test „Farben folgen dem dunklen Design (--bg)“).
- **Zwei Arten von Symbolen:** je 192 und 512 Pixel für „any“ (transparenter Hintergrund) und für „maskable“ (dunkler Hintergrund bis zum Rand, Zeichen innerhalb der sicheren Zone) (`apps/web/public/icons/LIESMICH.md`, `apps/web/src/app/manifest.ts#manifest`).

## Aufbau

| Datei                                      | Aufgabe                                                                                                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/manifest.ts`             | Standard-Export `manifest()`: Name, Kurzname, `start_url`, `scope`, `id`, `display: "standalone"`, Farben, vier Symbole; Next.js liefert es als `/manifest.webmanifest` |
| `apps/web/public/icons/`                   | `icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon-32.png`                                  |
| `apps/web/public/icons/LIESMICH.md`        | Herkunft der Symbole: aus `icon.svg` gerendert, Zeichen aus `packages/ui` (Komponente `Logo`)                                                                           |
| `apps/web/src/app/layout.tsx`              | `metadata.icons` (Tab-Symbole, Apple-Touch-Icon 180×180), `metadata.appleWebApp` (`capable: true`, Titel, `statusBarStyle`), `viewport.themeColor` für hell und dunkel  |
| `apps/web/src/lib/zugang/weiterleitung.ts` | `istDatei`: `/manifest.webmanifest` und alles unter `/icons/` gelten als Datei und brauchen keine Anmeldung                                                             |
| `apps/web/src/proxy.ts`                    | Für Dateien (`istDatei`) setzt der Proxy nur Kopfzeilen, keine Umleitung                                                                                                |
| `apps/web/src/lib/kopfzeilen.ts`           | Content-Security-Policy mit `manifest-src 'self'` und `img-src 'self'`                                                                                                  |

Datenfluss:

1. Der Browser lädt eine Seite; `apps/web/src/app/layout.tsx` verweist über `metadata` und `viewport` auf Symbole und Farben, Next.js ergänzt den Verweis auf das Manifest.
2. Der Browser holt `/manifest.webmanifest` und die Symbole. Der Proxy lässt diese Pfade ohne Anmeldung durch und setzt nur die Sicherheits-Kopfzeilen (`apps/web/src/proxy.ts`, Aufruf von `istDatei`).
3. Ob und wie der Browser „Installieren“ anbietet, entscheidet der Browser; dazu gibt es keinen Code in PaiBot.

## Datenmodell und Migrationen

Keine eigenen Tabellen. Das Manifest ist statisch (`apps/web/src/app/manifest.ts#manifest`), nur der Name kommt aus `APP_NAME` in `@paibot/shared`.

## Schnittstellen

| Art     | Name                        | Datei                          |
| ------- | --------------------------- | ------------------------------ |
| Route   | `GET /manifest.webmanifest` | `apps/web/src/app/manifest.ts` |
| Dateien | `/icons/*`                  | `apps/web/public/icons/`       |

Keine Aktion des Tors und keine Route unter `/api`: Es wird nichts verändert, nur Dateien werden ausgeliefert.

## Sicherheit

- **Ohne Anmeldung erreichbar:** Manifest und Symbole stehen in `istDatei`, damit der Browser sie vor der Anmeldung holen kann (`apps/web/src/lib/zugang/weiterleitung.ts#istDatei`). Sie enthalten nur Name, Beschreibung, Farben und Bilder, keine Zugangsdaten und keine Daten aus der Datenbank (`apps/web/src/app/manifest.ts`).
- **Nur eigener Server:** Die Content-Security-Policy erlaubt das Manifest und Bilder nur von `'self'` (`apps/web/src/lib/kopfzeilen.ts`, Test in `apps/web/src/lib/kopfzeilen.test.ts`).
- **Keine Hintergrunddienste:** Es gibt keinen Service Worker und keine Mitteilungen (siehe Zweck und Entscheidung); das Manifest enthält weder `serviceworker` noch `gcm_sender_id` (`apps/web/src/app/manifest.test.ts`, Test „hat die Pflichtfelder …“).

## Tests

| Test                                  | Prüft                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/manifest.test.ts`   | Pflichtfelder (Name, Kurzname höchstens 12 Zeichen, `start_url`, `scope`, `id`, `display`, `lang`), Farben gegen die Tokens, Symbole 192 und 512 je „any“ und „maskable“, jede PNG-Datei mit der angegebenen Größe, maskierbare Symbole deckend bis zum Rand und Zeichen innerhalb des Kreises von 80 %, Apple-Touch-Icon 180×180 und deckend, `appleWebApp`, `theme-color` hell und dunkel, Erreichbarkeit ohne Anmeldung, kein Service Worker |
| `apps/web/src/lib/kopfzeilen.test.ts` | Content-Security-Policy einschließlich `manifest-src 'self'`                                                                                                                                                                                                                                                                                                                                                                                    |

Ausführen:

```bash
pnpm --filter @paibot/web test -- manifest
```

## Bekannte Schwächen

- **Kein Service Worker:** Ohne Verbindung zum Server zeigt der Browser seine eigene Fehlerseite; es gibt keinen Offline-Modus und keine Mitteilungen. Das ist gewollt und per Test abgesichert (`apps/web/src/app/manifest.test.ts`, Block „Bewusst ohne Offline-Modus, Hintergrund-Cache und Push“).
- **Echtes Installieren nicht automatisch geprüft:** Die Tests lesen Manifest, Symbole und Layout-Quelltext. Das Installieren in Chrome oder Edge, auf Android und „Zum Home-Bildschirm“ in Safari auf iOS prüft kein automatischer Test (`apps/web/src/app/manifest.test.ts` enthält keinen Browser-Lauf); die Schritte der Anleitung in der Anwender-Doku sind daher nicht an einem echten Gerät nachgeprüft.
- **Installier-Fenster nicht als Bild:** Das Fenster des Browsers zum Installieren liegt außerhalb der Seite und lässt sich mit dem Aufnahme-Skript nicht aufnehmen (`scripts/doku-screenshots.mjs` nimmt Seiten der App auf); die Anleitung zeigt deshalb nur die App selbst im Handy-Format.
- **Symbole von Hand neu erzeugen:** Die PNG-Dateien entstehen aus `icon.svg`; ein Skript dafür gibt es im Repo nicht, `apps/web/public/icons/LIESMICH.md` beschreibt nur das Vorgehen. Der Test fängt falsche Größen und Zeichen außerhalb der sicheren Zone ab.
