<!--
PaiBot – Sicherheit: Schlüssel, gespeicherte Geheimnisse, Passwort und Sitzungs-Token.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-20
-->

# Sicherheit

**Ergebnis:** Deine Zugangsdaten, dein Passwort und deine Anmeldung sind so gespeichert, dass ein Blick in die Datenbank allein sie nicht verrät. Deine Unterhaltungen dagegen stehen lesbar in der Datenbank (siehe „Was in der Datenbank steht“).

Diese Seite beschreibt den Teil zu Schlüsseln, verschlüsselten Geheimnissen, Passwort und Sitzungs-Token, was in der Datenbank steht und die Rollen der Datenbank. Weitere Teile der Sicherheit kommen mit den jeweiligen Funktionen dazu.

## Wofür

PaiBot speichert Dinge, die niemand lesen soll: den Schlüssel für deinen KI-Anbieter, dein Passwort, deine Anmeldung. Damit das auch bei einer kopierten Datenbank sicher bleibt, hängt alles an **einem** Geheimnis, das nur in der Umgebung liegt und nie in der Datenbank.

## So benutzt du es

1. Erzeuge das Wurzel-Geheimnis einmal, zum Beispiel mit `openssl rand -base64 32` (oder alle Werte auf einmal mit `sh deploy/env-erzeugen.sh`).
2. Trage es als `PAIBOT_SECRET` in deine Umgebung ein (`deploy/.env` oder als Geheimnis in Coolify).
3. Sichere es getrennt von der Datenbank, zum Beispiel im Passwort-Manager. Ohne dieses Geheimnis lassen sich gespeicherte Anbieter-Schlüssel nicht mehr lesen.

Beispiel:

```text
PAIBOT_SECRET=<32 zufällige Byte, Base64>
```

Nie in Chats, Tickets oder Git ablegen. Die Datei `.env` wird nicht committet.

## So sieht es aus

Ohne Oberfläche. Die Schutzmaßnahmen wirken im Hintergrund. Wo du sie in der App siehst, zeigen die Seiten der Funktionen: die Belege jeder Aktion in [Belege](funktion-belege.md#so-sieht-es-aus), die Regeln des Tors in [Das Tor](funktion-tor.md#so-sieht-es-aus), Sitzungen und Passwort in [Einstellungen und Info](funktion-einstellungen.md#so-sieht-es-aus) und der Zustand der Datenschleuse in [Datenschleuse](funktion-datenschleuse.md#so-sieht-es-aus).

## Einstellungen

| Einstellung     | Wo                | Bedeutung                                                        | Standard            |
| --------------- | ----------------- | ---------------------------------------------------------------- | ------------------- |
| `PAIBOT_SECRET` | Umgebungsvariable | Wurzel-Geheimnis: genau 32 Byte, Base64 (auch base64url erlaubt) | keiner, Pflichtwert |

Fehlt der Wert oder hat er die falsche Form, meldet PaiBot das mit einem festen Grund (`geheimnis_fehlt`, `geheimnis_ungueltig`), ohne den Wert zu nennen. Ein Wert mit der richtigen Länge, der erkennbar nicht zufällig ist (zum Beispiel lauter gleiche Bytes, eine kurze Wiederholung oder ein Wort statt Zufall), wird mit `geheimnis_schwach` abgelehnt. Nimm deshalb immer `openssl rand -base64 32`.

## So funktioniert es

Alles Kryptografische liegt an einer Stelle, im Paket `packages/crypto`. Es nutzt nur die eingebauten Funktionen von Node (`node:crypto`), keine zusätzliche Bibliothek.

| Was                        | Verfahren                                                                                                                     | Wo gespeichert                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Unterschlüssel             | HKDF-SHA-256 aus `PAIBOT_SECRET`, je Zweck ein eigener 32-Byte-Schlüssel                                                      | nur im Speicher                              |
| Anbieter-Schlüssel         | AES-256-GCM, neuer zufälliger IV pro Verschlüsselung, gebunden an Datensatz und Ziel, Format `v2:<iv>:<tag>:<ct>` (base64url) | Datenbank, nur verschlüsselt                 |
| Privater Signaturschlüssel | wie oben, mit eigenem Unterschlüssel, gebunden an Kennung und öffentlichen Teil                                               | Datenbank, nur verschlüsselt                 |
| Passwort                   | scrypt (neu: N = 32768, r = 8, p = 1, Salz 16 Byte), Format `scrypt$<N>$<r>$<p>$<salz>$<hash>`                                | Datenbank, nur der Hash                      |
| Sitzungs-Token             | 32 zufällige Byte als base64url (43 Zeichen); in der Datenbank steht nur SHA-256 davon                                        | Cookie beim Besitzer, Datenbank: Hash        |
| Signatur der Belege        | Ed25519; die Kurzform des öffentlichen Schlüssels sieht aus wie `3f9c-2ab1-77d0-e4c5`                                         | öffentlich im Klartext, privat verschlüsselt |

Wichtige Eigenschaften:

- **Vier Zwecke, vier Schlüssel:** `secrets-v1` (Anbieter-Schlüssel), `keys-v1` (privater Signaturschlüssel), `session-v1` (Prüfzeichen gegen untergeschobene Anfragen), `context-v1` (Prüfsummen von Inhalten in Belegen). Ein Schlüssel für einen Zweck passt nicht für einen anderen.
- **Manipulation fällt auf:** Wird ein verschlüsselter Wert in der Datenbank verändert (IV, Tag oder Geheimtext), schlägt das Entschlüsseln fehl. Es kommt nie ein halber Klartext zurück.
- **Gebunden an seinen Platz:** Ein verschlüsselter Wert im Format `v2` gehört zu genau einer Tabelle, einem Datensatz und einem Zweck, beim Anbieter-Schlüssel zusätzlich zur ganzen Basis-URL mit Host, Port und Pfad (`https://api.eurouter.ai/v1`). Diese Angaben werden beim Verschlüsseln mitgerechnet, aber nicht gespeichert. Kopiert jemand den Wert in einen anderen Datensatz oder ändert er die Basis-URL, auch nur ihren Pfad (`/v1` → `/v2`), lässt sich der Schlüssel nicht mehr entschlüsseln und wird nicht verschickt.
- **Ältere Werte:** Das Format `v1` (ohne Bindung) stammt aus früheren Ständen. Solche Werte bleiben lesbar, wo das ausdrücklich erlaubt ist, und lassen sich beim nächsten Speichern ins Format `v2` umstellen. Für einen Modell-Aufruf wird ein Anbieter-Schlüssel im Format `v1` nicht angenommen; dann den Schlüssel neu eintragen. Neue Werte schreibt PaiBot nur noch im Format `v2`.
- **Passwort aufrüstbar:** Die Parameter von scrypt stehen im gespeicherten Hash und werden beim Prüfen gelesen. Steigen sie in einer späteren Version, bleiben alte Hashes gültig; PaiBot erkennt veraltete Parameter und kann den Hash bei der nächsten Anmeldung neu berechnen. Werte außerhalb fester Grenzen (zu schwach oder absichtlich teuer, etwa mehr als 64 MiB Speicher je Prüfung) werden ohne Rechnen abgelehnt (`parameter_ungueltig`).
- **Vergleiche in konstanter Zeit:** Passwort-Hash und Tokens werden so verglichen, dass die Dauer nichts über den Inhalt verrät.
- **Fehler ohne Geheimnisse:** Meldungen nennen nur einen festen Grund (`format_ungueltig`, `version_unbekannt`, `version_veraltet`, `bindung_fehlt`, `entschluesseln_fehlgeschlagen` …), nie Schlüssel, Klartext oder Geheimtext.
- **Anbieter-Schlüssel über die Datenschleuse:** Mit zugeschalteter [Datenschleuse](funktion-datenschleuse.md) liegt der Anbieter-Schlüssel im Standard (`SCHLEUSE_SCHLUESSEL_WEG=anfrage`) nur verschlüsselt in der Datenbank. Für eine Anfrage entschlüsselt ihn der Worker und schickt ihn im Körper (`api_key`) nur an die festgelegte Adresse der Datenschleuse; die Kopfzeile `Authorization` trägt dabei deren eigenen Zugangsschlüssel. Felder, mit denen sich das Ziel je Anfrage umstellen ließe (`api_base`, `base_url`, `user_config` …), entfernt PaiBot vorher, Weiterleitungen sind dann verboten. Der Schlüssel durchläuft die Datenschleuse im Arbeitsspeicher, und sie hält ihn dort bis zum nächsten Neustart. Fehlermeldungen der Datenschleuse übernimmt PaiBot nie, auch nicht als Ursache, weil sie Teile der Nachricht enthalten können; übrig bleibt ein fester Code wie `schleuse_blockiert`.
- **Signaturschlüssel im Speicher:** Der private Signaturschlüssel wird einmal entschlüsselt und im Speicher gehalten, statt bei jedem Beleg die Datenbank zu fragen. Beim Laden wird geprüft, dass er zum öffentlichen Teil passt. In Ausgaben wie Logs oder JSON erscheint er nicht.

## Was in der Datenbank steht

| Was                                                       | Wie gespeichert                  |
| --------------------------------------------------------- | -------------------------------- |
| Unterhaltungen: Nachrichten, Antworten, Titel, Ereignisse | **lesbar** (nicht verschlüsselt) |
| Bots mit ihren Anweisungen, Einstellungen                 | lesbar                           |
| Belege und Regeln                                         | lesbar, Belege mit Signatur      |
| Schlüssel deiner KI-Anbieter                              | verschlüsselt (AES-256-GCM)      |
| privater Signaturschlüssel                                | verschlüsselt                    |
| dein Passwort                                             | nur als Hash (scrypt)            |
| Anmeldungen (Sitzungen)                                   | nur als Hash (SHA-256)           |

Das gilt genauso für jede **Sicherung** der Datenbank. Wer eine Sicherung lesen kann, liest deine Unterhaltungen. Darum:

- Sicherungen wie ein Passwort behandeln: verschlüsselter Speicher, nur du hast Zugriff.
- `PAIBOT_SECRET` nie neben der Sicherung ablegen. Nur zusammen damit ließen sich die Anbieter-Schlüssel entschlüsseln.
- Die Datenbank hat im Compose-Stack keinen veröffentlichten Port und hängt in einem internen Netz.

## Rollen der Datenbank

PaiBot arbeitet mit zwei Rollen in Postgres:

- Die **Migrations-Rolle** besitzt die Tabellen. Nur der Einmal-Dienst `migrate` kennt ihre Zugangsdaten (`DATABASE_MIGRATION_URL`); er wendet die Migrationen an, richtet die App-Rolle ein und beendet sich. Web-App und Worker bekommen diese Zugangsdaten nie, auch nicht in ihrer Umgebung.
- Die **App-Rolle** führt die normale Arbeit von Web-App und Worker aus und hat nur die Rechte, die dafür nötig sind.

| Tabelle                                                                                                                                                   | Rechte der App-Rolle                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `belege`                                                                                                                                                  | lesen und anhängen                                                                             |
| `rules`                                                                                                                                                   | **nur lesen**; die Standard-Regeln kommen allein aus den Migrationen                           |
| `installation_keys`                                                                                                                                       | lesen, anhängen, nur den Zeitpunkt des Ausmusterns setzen                                      |
| `conversation_events`                                                                                                                                     | lesen, anhängen, alte Ereignisse löschen; nie ändern                                           |
| `tool_calls` (Werkzeug-Aufrufe)                                                                                                                           | lesen, anlegen, nur Zustand und Ergebnis fortschreiben; gelöscht wird nur mit der Unterhaltung |
| `bots`, `conversations`, `messages`, `models`, `owner`, `providers`, `rate_limits`, `runs`, `sessions`, `settings` (auch Prüfwert des Einrichtungs-Codes) | lesen, anlegen, ändern, löschen; nie leeren (`TRUNCATE`)                                       |
| Schema `pgboss` (Warteschlange)                                                                                                                           | gehört der App-Rolle, weil die Warteschlange darin zur Laufzeit eigene Tabellen anlegt         |

Die App-Rolle darf keine Tabelle leeren, keine Trigger abschalten oder löschen, im Schema `public` nichts anlegen, keine Schemas anlegen, keine temporären Tabellen und keine großen Objekte anlegen und keine Verbindungen beenden.

**Fester Suchpfad:** Jede Verbindung von Web-App, Worker und Warteschlange schickt beim Aufbau ihren Suchpfad mit, und alle Abfragen nennen das Schema ihrer Tabellen ausdrücklich (`"public"."belege"`). Auch die Funktionen der Trigger haben einen festen Suchpfad. So lassen sich Abfragen nicht auf gleichnamige Tabellen in einem anderen Schema umlenken.

**Was Postgres nicht verbieten kann:** Jede Rolle darf ihre eigenen Einstellungen (`ALTER ROLE … SET`) und ihr eigenes Passwort ändern. Dagegen helfen drei Dinge zusammen: Der feste Suchpfad gilt vor einer solchen Einstellung, der Dienst `migrate` setzt bei jedem Lauf alle Einstellungen der App-Rolle zurück und ihr Passwort neu, und die Prüfung beim Start meldet eine App-Rolle mit eigenen Einstellungen, mit gleichnamigen Tabellen in einem anderen Schema oder mit eigenen Objekten in `public` als „zu viele Rechte oder falsch eingestellt“.

Startet PaiBot im Betrieb mit einer App-Verbindung, die zu viele Rechte hat oder so falsch eingestellt ist, bricht der Start ab. Einrichtung und Umstellung: [Installation, Abschnitt „Rollen der Datenbank“](installation.md#rollen-der-datenbank).

## Grenzen

- Wer deinen Server vollständig kontrolliert (Datenbank **und** `PAIBOT_SECRET`), kann alles lesen und neu schreiben. Das Verfahren schützt die Zugangsdaten in einer kopierten Datenbank, nicht vor einem übernommenen Server.
- Unterhaltungen liegen unverschlüsselt in der Datenbank und in jeder Sicherung.
- Gegen die Migrations-Rolle (Besitzer der Tabellen) oder einen Superuser helfen die Rechte der App-Rolle nicht. Ihre Zugangsdaten stehen im Compose-Stack nur beim Einmal-Dienst `migrate` und in `deploy/.env`; wer die Datei oder den Server liest, hat sie.
- Das Passwort wird nicht gegen Online-Listen geprüft (PaiBot nimmt dafür keinen Kontakt nach außen auf). Wähle ein langes, einmaliges Passwort.
- Ein leerer Schlüssel wird nicht verschlüsselt gespeichert. Ein Anbieter ohne Schlüssel hat einfach keinen.
- Die Bindung schützt vor kopierten Werten und umgebogenen Adressen in der Datenbank. Wer zusätzlich `PAIBOT_SECRET` hat, kann Werte neu verschlüsseln.
- Den privaten Signaturschlüssel kann JavaScript beim Verwerfen nicht aus dem Speicher löschen; es verschwindet nur der letzte Verweis darauf.
- Ein Wechsel von `PAIBOT_SECRET` mit automatischem Neu-Verschlüsseln ist **geplant**, aber noch nicht gebaut. Das Versionspräfix (`v1:`, `v2:`) bereitet ihn vor.
- Zwei-Faktor-Anmeldung ist **geplant**, nicht Teil der Basisversion.

## Was PaiBot bewusst nicht abwehrt

- **Übernommener Server:** Wer Datenbank **und** `PAIBOT_SECRET` hat oder in Web-App oder Worker Code ausführen kann, kann alles lesen und Belege neu signieren. Belege nach dem letzten notierten Anker lassen sich dann unbemerkt umschreiben.
- **Fehlende Belege am Ende:** Ohne einen neueren Anker fällt nicht auf, wenn die letzten Belege nach dem Anker fehlen.
- **Erster Anker:** Er stammt aus der Installation selbst. War sie schon da manipuliert, bestätigt er das. Notiere die Kurzform des Signaturschlüssels deshalb früh.
- **Der KI-Anbieter liest mit:** Prompts und Antworten sieht der Anbieter (bzw. die Datenschleuse). Antworten sind nicht signiert. Untergeschobene Anweisungen in Texten (Prompt-Injektion) verhindert PaiBot nicht, es begrenzt nur ihre Wirkung über das Tor.
- **Lahmlegen mit den Rechten der App:** Wer SQL mit den Rechten der App-Rolle ausführen kann, kann PaiBot aufhalten, ohne Daten zu fälschen: Sperren halten, Speicher füllen, das Passwort der App-Rolle ändern (Web-App und Worker kommen dann bis zum nächsten Lauf von `migrate` nicht mehr hinein). Sperren der Migration und der Belege warten deshalb nur mit Frist und melden dann, wer sie hält. Postgres lässt jede Rolle ihr eigenes Passwort und ihre eigenen Voreinstellungen ändern; das lässt sich nicht entziehen. PaiBot erkennt beides beim Start (abgelehntes Passwort, Einstellungen an der Rolle, gleichnamige Tabellen in einem anderen Schema) und nennt den Ausweg; der nächste Lauf von `migrate` setzt Passwort und Einstellungen zurück, löscht gleichnamige Sichten und legt gleichnamige Tabellen als reinen Text in der Quarantäne ab; die alte Tabelle samt ihrem Code wird gelöscht. Die Migrations-Rolle übernimmt dabei nie Objekte der App-Rolle. Tabellen in der Quarantäne nur löschen, nicht weiterverwenden. Grenze: Eigene Funktionen der App-Rolle im Schema der Warteschlange erkennt PaiBot nicht; sie laufen nur, wenn jemand sie aufruft.
- **Lastspitzen von außen:** PaiBot hat keinen eigenen Schutz gegen Überlastung über den Proxy hinaus.
- **Browser des Besitzers:** Erweiterungen, Schadsoftware oder ein mitgelesener Bildschirm.
- **Lieferkette:** Ein gezielt veröffentlichtes, schädliches Update einer Abhängigkeit fängt nur die Durchsicht der Aktualisierungen ab.
- **Betrieb ohne Docker:** Netze, nur lesbares Dateisystem und Speicher-Grenzen aus dem Compose-Stack gelten dort nicht.

## Fehlerbehebung

| Beobachtung                                                  | Ursache                                                                                                                          | Was tun                                                                                                                               |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Meldung `geheimnis_fehlt`                                    | `PAIBOT_SECRET` ist nicht gesetzt oder leer                                                                                      | Wert in `deploy/.env` bzw. Coolify eintragen, neu starten                                                                             |
| Meldung `geheimnis_ungueltig`                                | Kein Base64 oder nicht genau 32 Byte                                                                                             | Neu erzeugen mit `openssl rand -base64 32` (nur bei frischer Installation, sonst altes Geheimnis wiederherstellen)                    |
| Meldung `geheimnis_schwach`                                  | Der Wert ist erkennbar nicht zufällig                                                                                            | Neu erzeugen mit `openssl rand -base64 32` (nur bei frischer Installation)                                                            |
| Anbieter-Schlüssel lässt sich nicht mehr entschlüsseln       | `PAIBOT_SECRET` wurde geändert oder ging verloren                                                                                | Altes Geheimnis wiederherstellen; sonst Schlüssel beim Anbieter neu eingeben                                                          |
| Schlüssel gilt nach einer Änderung der Adresse nicht mehr    | Der Host der Basis-URL wurde in der Datenbank geändert, der Schlüssel ist an den alten gebunden                                  | Schlüssel beim Anbieter neu eintragen                                                                                                 |
| Alle Anmeldungen enden nach einem Passwortwechsel            | gewollt: ein Passwortwechsel beendet alle Sitzungen                                                                              | Neu anmelden                                                                                                                          |
| Start bricht ab: „zu vielen Rechten oder falsch eingestellt“ | Die App-Rolle trägt eigene Einstellungen, besitzt Objekte in `public` oder es gibt gleichnamige Tabellen in einem anderen Schema | Dienst `migrate` erneut starten (setzt Einstellungen und Passwort zurück); gleichnamige fremde Tabellen von Hand prüfen und entfernen |

## Kopfzeilen des Browsers

PaiBot schickt mit jeder Antwort Kopfzeilen, die den Browser anweisen, nur das Nötigste zu erlauben. Du musst dafür nichts einstellen.

| Kopfzeile                                                       | Wirkung                                                                                                                                                                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`                                       | Die Seite lädt Skripte, Stile, Bilder, Schriften und Verbindungen nur von deinem eigenen Server. Fremde Server, Rahmen (`frame`) und Plug-ins sind gesperrt. Die Schriften liegen lokal. |
| `X-Content-Type-Options: nosniff`                               | Der Browser deutet Dateien nicht um.                                                                                                                                                     |
| `X-Frame-Options: DENY` und `frame-ancestors 'none'`            | Keine andere Seite kann PaiBot in einen Rahmen einbetten.                                                                                                                                |
| `Referrer-Policy: no-referrer`                                  | Beim Klick auf einen Link erfährt das Ziel nicht, woher du kommst.                                                                                                                       |
| `Permissions-Policy`                                            | Kamera, Mikrofon, Standort, Zahlung, USB und weitere Geräte-Funktionen sind aus.                                                                                                         |
| `Cross-Origin-Opener-Policy` und `Cross-Origin-Resource-Policy` | Andere Seiten bekommen weder Zugriff auf das PaiBot-Fenster noch auf seine Dateien.                                                                                                      |
| `Strict-Transport-Security`                                     | Nur im Betrieb: Der Browser nutzt für diese Adresse danach nur noch https. Über http ignoriert er die Zeile.                                                                             |

Die Antworten tragen keine Angabe zur eingesetzten Software (`X-Powered-By` fehlt); den Stand von PaiBot (`X-Pb-Stand`) bekommt nur, wer angemeldet ist. Anfragen nimmt PaiBot nur bis zu einer festen Größe an (16 KiB, Nachrichten 256 KiB); größere weist schon der Proxy der App ab. Steuerzeichen der Schreibrichtung in Antworten des Modells zeigt PaiBot nicht an. Bilder aus Antworten des Modells lädt PaiBot nicht: Die Darstellung zeigt Bild-Markdown als Link und rohes HTML gar nicht, und die Kopfzeilen sperren Bilder von fremden Servern zusätzlich.

**Wichtig für den Betrieb:** Setzt du einen Proxy davor, gib die Kopfzeilen unverändert weiter. Die Adresse eines Clients aus `X-Forwarded-For` liest PaiBot nur mit `TRUST_PROXY=1` (Standard im Compose), und dann nur den letzten Eintrag, den dein eigener Proxy anhängt. Ohne diese Einstellung teilen sich alle Besucher einen Zähler. Begrenze die Größe von Anfragen auch im Proxy (siehe [Installation](installation.md)).

**Grenzen:**

- Die Skript-Regel erlaubt heute Skripte, die Next.js in die Seite schreibt (`'unsafe-inline'`). Eine Fassung mit einmaligem Kennwert pro Anfrage (Nonce) ist vorbereitet, aber noch nicht eingeschaltet.
- In der Entwicklung (`pnpm dev`) sind die Regeln für den Hot-Reload lockerer. Im Betrieb gilt das nicht.
- Die Kopfzeilen schützen die Seite im Browser. Sie ersetzen weder Passwort noch Netzwerk-Schutz deines Servers.
