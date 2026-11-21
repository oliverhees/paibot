/**
 * PaiBot – alle deutschen Texte der Oberfläche und der Fehlermeldungen, als Schlüssel.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

/**
 * Platzhalter in geschweiften Klammern (`{name}`) ersetzt `t(key, params)`.
 * Listen behalten ihre Reihenfolge.
 */
export const de = {
  // Fußzeile und Seiten
  "footer.text": "Powered by PaiBot · entwickelt von HR CodeLabs",
  "footer.link": "HR CodeLabs",
  "seite.einrichtung": "Einrichtung",
  "seite.anmelden": "Anmelden",
  "seite.chat": "Chat",
  "seite.bot": "Bot",
  "seite.modelle": "Modell und Anbieter",
  "seite.datenschleuse": "Datenschleuse",
  "seite.belege": "Belege",
  "seite.einstellungen": "Einstellungen",
  "seite.info": "Info",
  "navigation.mehr": "Mehr",
  "navigation.abmelden": "Abmelden",
  "navigation.abmelden.laeuft": "Abmelden …",
  "navigation.name": "Navigation",
  "navigation.laeuft_auf": "Läuft auf:",
  "navigation.ort": "dein Server",
  "navigation.modelle": "Modelle:",
  "navigation.dein_bot": "Dein Bot",
  "navigation.bot.rolle": "dein persönlicher Assistent",
  "navigation.unterhaltungen": "Unterhaltungen von {name}",
  "navigation.menue_oeffnen": "Menü öffnen",
  "navigation.menue_schliessen": "Menü schließen",
  "navigation.flaeche": "Arbeitsfläche",
  "navigation.flaeche_zeigen": "Arbeitsfläche zeigen",
  "navigation.flaeche_schliessen": "Arbeitsfläche schließen",

  // Seite nicht gefunden
  "nicht_gefunden.seitentitel": "Seite nicht gefunden",
  "nicht_gefunden.titel": "Diese Seite gibt es nicht",
  "nicht_gefunden.text":
    "Die Adresse stimmt nicht oder die Seite wurde verschoben. Von der Startseite aus findest du alles Weitere.",
  "nicht_gefunden.link": "Zur Startseite",

  // Start der App
  "start.titel": "Schreib deinem Bot",
  "start.text":
    "Hier entsteht der Chat mit {name}. Er ist noch im Bau; sobald er fertig ist, schreibst du an dieser Stelle.",
  "start.ohne_modell":
    "{name} hat noch kein Modell. Ohne Modell kann {name} später nicht antworten; den Schlüssel trägst du unter „Modell und Anbieter“ ein.",

  // Zugang allgemein
  "zugang.ohne_proxy":
    "TRUST_PROXY ist nicht gesetzt: PaiBot kennt die Adresse der Besucher nicht und bremst Anmelde-Versuche deshalb nur, statt sie je Adresse zu sperren. Läuft PaiBot hinter einem Reverse-Proxy (so auch bei der Installation mit Coolify), setze TRUST_PROXY=1.",
  "zugang.datenbank.titel": "Datenbank nicht erreichbar",
  "zugang.datenbank.text":
    "PaiBot erreicht gerade seine Datenbank nicht. Sieh im Log nach, ob die Datenbank läuft, und lade die Seite danach neu.",

  // Allgemein
  "allgemein.speichern": "Speichern",
  "allgemein.abbrechen": "Abbrechen",
  "allgemein.loeschen": "Löschen",
  "allgemein.zurueck": "Zurück",
  "allgemein.weiter": "Weiter",
  "allgemein.laedt": "Lädt …",
  "allgemein.erneut": "Noch einmal versuchen",
  "allgemein.ungespeichert": "Ungespeicherte Änderungen",
  "allgemein.gesetzt": "gesetzt",
  "allgemein.nicht_gesetzt": "nicht gesetzt",

  // Anmelden
  "anmelden.titel": "Anmelden",
  "anmelden.hinweis":
    "Melde dich mit deinem Passwort an. Deine Daten bleiben auf deinem Server.\u200c\u2060\u200d\u2060\u200c",
  "anmelden.passwort": "Passwort",
  "anmelden.bleiben": "Angemeldet bleiben",
  "anmelden.knopf": "Anmelden",
  "anmelden.warten": "Zu viele Versuche. Versuch es in {sekunden} Sekunden noch einmal.",
  "anmelden.willkommen": "Willkommen zurück",
  "anmelden.platzhalter": "Dein Passwort",
  "anmelden.leer": "Gib dein Passwort ein.",
  "anmelden.laeuft": "Anmelden …",
  "anmelden.vergessen":
    "Passwort vergessen? Zurücksetzen lässt es sich in dieser Fassung noch nicht. Bewahre es deshalb gut auf, zum Beispiel in einem Passwort-Manager.",

  // Einrichtung
  "einrichtung.titel": "PaiBot einrichten",
  "einrichtung.code.label": "Einrichtungs-Code",
  "einrichtung.code.hinweis":
    "Den Code findest du im Log von PaiBot, zum Beispiel mit „docker compose logs web“.",
  "einrichtung.code.log": "Einrichtungs-Code: {code} (gilt bis zum Ende der Einrichtung)",
  "einrichtung.passwort.label": "Passwort",
  "einrichtung.passwort.wiederholen": "Passwort wiederholen",
  "einrichtung.passwort.regel": "Mindestens {min} Zeichen.",
  "einrichtung.passwort.ungleich": "Die beiden Passwörter sind nicht gleich.",
  "einrichtung.schluessel.label": "Schlüssel für EUrouter",
  "einrichtung.schluessel.testen": "Verbindung testen",
  "einrichtung.schluessel.ueberspringen": "Später eintragen",
  "einrichtung.modell.label": "Modell wählen",
  "einrichtung.schleuse.label": "Datenschleuse als Standard",
  "einrichtung.schleuse.erklaerung":
    "Die Datenschleuse ersetzt persönliche Daten durch Platzhalter, bevor eine Nachricht an das Modell geht.",
  "einrichtung.bot.label": "Name deines Bots",
  "einrichtung.bot.vorschlag": "Pai",
  "einrichtung.abschliessen": "Einrichtung abschließen",
  "einrichtung.abschliessen.laeuft": "Wird eingerichtet …",
  "einrichtung.schritt": "Schritt {nummer} von {gesamt}",
  "einrichtung.sprache.code":
    "Hallo, ich bin {name}, dein erster Bot. Ich begleite dich durch die Einrichtung.",
  "einrichtung.sprache.passwort": "Dein Passwort schützt alles, was wir zusammen machen.",
  "einrichtung.sprache.schluessel": "Über den Anbieter erreiche ich ein Sprachmodell.",
  "einrichtung.sprache.modell": "Such mir ein Modell aus. Wechseln kannst du später jederzeit.",
  "einrichtung.sprache.schleuse": "Die Datenschleuse ist ein Schutz, den du selbst einschaltest.",
  "einrichtung.sprache.bot": "Wie soll ich heißen?",
  "einrichtung.sprache.fertig": "Alles bereit. Schön, dass du da bist!",
  "einrichtung.code.titel": "Willkommen bei PaiBot",
  "einrichtung.code.text":
    "In ein paar Minuten ist PaiBot bereit. Zuerst zeigst du, dass dieser Server dir gehört: mit dem Einrichtungs-Code aus dem Log.",
  "einrichtung.code.hinweis_coolify":
    "In Coolify steht er bei der Anwendung im Reiter „Logs“ beim Container web (nicht unter „Deployments“).",
  "einrichtung.code.format": "Der Code hat 12 Zeichen, zum Beispiel K7QD-9M2F-XW4H.",
  "einrichtung.versprechen.server.titel": "Läuft auf deinem Server",
  "einrichtung.versprechen.server.text":
    "Deine Unterhaltungen und Belege bleiben in deiner Datenbank.",
  "einrichtung.versprechen.schleuse.titel": "Datenschleuse, wenn du willst",
  "einrichtung.versprechen.schleuse.text":
    "Ist sie eingerichtet, ersetzt sie Namen, Mail-Adressen und Telefonnummern, bevor etwas rausgeht.",
  "einrichtung.versprechen.beleg.titel": "Handelt nur mit Beleg",
  "einrichtung.versprechen.beleg.text":
    "Jede Aktion läuft durch feste Regeln und bekommt einen Beleg, den du prüfen kannst.",
  "einrichtung.passwort.titel": "Passwort festlegen",
  "einrichtung.passwort.text":
    "PaiBot hat genau ein Konto: deins. Mit diesem Passwort meldest du dich an.",
  "einrichtung.passwort.gleich": "beide Eingaben sind gleich",
  "einrichtung.passwort.laenge": "mindestens {min} Zeichen",
  "einrichtung.passwort.tipp":
    "Gut zu merken und schwer zu erraten: mehrere Wörter mit Bindestrichen, die nur du zusammen bringst.",
  "einrichtung.passwort.zu_lang": "Das Passwort darf höchstens {max} Zeichen haben.",
  "einrichtung.schluessel.titel": "Modell-Anbieter verbinden",
  "einrichtung.schluessel.text":
    "Über {anbieter} erreicht PaiBot Sprachmodelle. Den Schlüssel findest du in deinem Konto bei {anbieter}. Du kannst diesen Schritt auch später erledigen.",
  "einrichtung.schluessel.feld": "Schlüssel für {anbieter}",
  "einrichtung.schluessel.hilfe":
    "Der Schlüssel bleibt auf deinem Server und wird nirgends angezeigt.",
  "einrichtung.schluessel.ok": "Verbindung steht. {anzahl} passende Modelle gefunden.",
  "einrichtung.schluessel.leer": "Gib zuerst einen Schlüssel ein.",
  "einrichtung.schluessel.erst_testen":
    "Teste zuerst die Verbindung oder trag den Schlüssel später ein.",
  "einrichtung.modell.text":
    "Mit diesem Modell arbeitet dein Bot. Du kannst es jederzeit wechseln.",
  "einrichtung.modell.liste": "Modelle von {anbieter}",
  "einrichtung.modell.keins":
    "Der Anbieter hat keine passenden Modelle gemeldet. Du kannst trotzdem weitermachen und das Modell später wählen.",
  "einrichtung.modell.waehlen": "Wähle ein Modell aus der Liste.",
  "einrichtung.schleuse.nicht_installiert":
    "Die Datenschleuse ist auf diesem Server nicht eingerichtet. Deine Nachrichten gehen deshalb direkt an den Anbieter. Einrichten kannst du sie später; dann lässt sich der Standard umstellen.",
  "einrichtung.schleuse.aus_hinweis": "Aus: Nachrichten gehen direkt an den Anbieter.",
  "einrichtung.schleuse.an_hinweis": "An: Persönliche Daten werden vor dem Versand ersetzt.",
  "einrichtung.bot.titel": "Wie soll dein Bot heißen?",
  "einrichtung.bot.text":
    "Den Namen siehst du im Chat und in der Navigation. Ändern kannst du ihn später.",
  "einrichtung.fertig.titel": "Alles bereit",
  "einrichtung.fertig.text": "PaiBot ist eingerichtet, und du bist angemeldet.",
  "einrichtung.fertig.passwort": "Passwort festgelegt",
  "einrichtung.fertig.anbieter": "{anbieter} verbunden",
  "einrichtung.fertig.ohne_anbieter": "Schlüssel trägst du später ein",
  "einrichtung.fertig.modell": "Modell: {modell}",
  "einrichtung.fertig.schleuse_an": "Datenschleuse als Standard an",
  "einrichtung.fertig.schleuse_aus": "Datenschleuse als Standard aus",
  "einrichtung.fertig.bot": "Dein Bot heißt {name}",
  "einrichtung.fertig.weiter": "Zur App",

  // Chat
  "chat.leer.hinweis":
    "Deine Unterhaltungen bleiben auf deinem Server.\u200c\u2060\u200d\u2060\u200c",
  "chat.neu": "Neue Unterhaltung",
  "chat.titel.neu": "Neue Unterhaltung",
  "chat.umbenennen": "Umbenennen",
  "chat.loeschen": "Unterhaltung löschen",
  "chat.loeschen.frage": "Unterhaltung „{titel}“ wirklich löschen?",
  "chat.eingabe.label": "Nachricht",
  "chat.eingabe.platzhalter": "Schreib eine Nachricht",
  "chat.senden": "Senden",
  "chat.stopp": "Stopp",
  "chat.antwort.schreibt": "{name} schreibt …",
  "chat.antwort.abgebrochen": "Abgebrochen",
  "chat.antwort.fehlgeschlagen": "Keine Antwort",
  "chat.antwort.fertig": "Antwort von {name}",

  // Datenschleuse
  "schleuse.schalter": "Datenschleuse für diese Unterhaltung",
  "schleuse.standard": "Standard für neue Unterhaltungen",
  "schleuse.an": "An",
  "schleuse.aus": "Aus",
  "schleuse.hinweis.direkt": "direkt · EU",
  "schleuse.hinweis.schleuse": "geschützt über die Datenschleuse",
  "schleuse.status.installiert": "installiert",
  "schleuse.status.erreichbar": "erreichbar",
  "schleuse.status.nicht_erreichbar": "nicht erreichbar",
  "schleuse.status.nicht_installiert": "Datenschleuse nicht installiert",

  // Bot
  "bot.name": "Name",
  "bot.anweisung": "Anweisung",
  "bot.avatar.form": "Form",
  "bot.avatar.farbe": "Farbe",
  "bot.modell": "Modell",
  "bot.beispiele.titel": "Beispiel-Anweisungen",
  "bot.beispiele": [
    "Antworte kurz und in einfachen Worten.",
    "Duze mich und schreib locker.",
    "Fasse lange Texte so zusammen, dass ich sie zwischen zwei Bahnhaltestellen lesen kann.",
    "Frag nach, wenn meine Frage unklar ist.",
  ],

  // Modell und Anbieter
  "modelle.basis_url": "Basis-URL",
  "anbieter.url.keine_url": "Das ist keine gültige Adresse.",
  "anbieter.url.protokoll":
    "Die Adresse muss mit https:// beginnen; http:// geht nur bei Region „lokal“.",
  "anbieter.url.interner_dienst":
    "Diese Adresse gehört zu einem Dienst von PaiBot selbst und ist als Anbieter nicht erlaubt.",
  "anbieter.url.link_local":
    "Diese Adresse ist für Anbieter gesperrt (Link-Local oder Metadaten-Dienst).",
  "anbieter.url.private_adresse":
    "Private Adressen und interne Namen sind nur bei Region „lokal“ erlaubt.",
  "anbieter.url.port": "Außerhalb der Region „lokal“ sind nur die Ports 443 und 8443 erlaubt.",
  "anbieter.url.zugangsdaten_in_url":
    "Die Adresse darf keine Zugangsdaten (nutzer:passwort@) enthalten.",
  "modelle.schluessel": "Schlüssel",
  "modelle.verbindungstest": "Verbindung testen",
  "modelle.verbindung.ok": "Verbindung steht",
  "modelle.suche": "Modell suchen",
  "modelle.standard": "Standard-Modell",
  "modelle.region.eu": "EU",
  "modelle.region.non_eu": "außerhalb der EU",
  "modelle.region.local": "lokal",

  // Belege und Prüfung
  "belege.leer": "Noch keine Belege.",
  "belege.pruefen": "Beleg prüfen",
  "belege.kette_pruefen": "Ganze Kette prüfen",
  "belege.exportieren": "Belege exportieren",
  "belege.schluessel": "Öffentlicher Schlüssel",
  "belege.regeln": "Standard-Regeln",
  "belege.spalte.zeit": "Zeit",
  "belege.spalte.aktion": "Aktion",
  "belege.spalte.akteur": "Akteur",
  "belege.spalte.ergebnis": "Ergebnis",
  "belege.akteur.besitzer": "du",
  "belege.akteur.bot": "Bot {name}",
  "pruefung.laeuft": "Prüfung läuft …",
  "pruefung.gueltig": "gültig",
  "pruefung.ungueltig": "ungültig bei Eintrag {seq}",
  "pruefung.offen": "noch nicht geprüft",
  "pruefung.server": "vom Server geprüft",
  "pruefung.inhalt.ok": "Inhalt unverändert",
  "pruefung.inhalt.fehler": "Inhalt verändert",
  "pruefung.signatur.ok": "Signatur gültig (Schlüssel {kurzform})",
  "pruefung.signatur.fehler": "Signatur ungültig",
  "pruefung.kette.ok": "Kette lückenlos bis hier",
  "pruefung.kette.fehler": "Kette unterbrochen",
  "pruefung.entscheidung.ok": "Entscheidung folgt aus Regel {regel}",
  "pruefung.entscheidung.fehler": "Entscheidung folgt nicht aus den gespeicherten Fakten",
  "pruefung.kontext.ok": "Kontext passt",
  "pruefung.kontext.fehler": "Kontext passt nicht",
  "pruefung.kontext.geloescht": "Inhalt gelöscht, nicht prüfbar",
  "belege.befehl.aufruf": "Aufruf: pnpm belege:pruefen <datei.jsonl>",
  "belege.befehl.datei": "Die Datei lässt sich nicht lesen: {datei}",
  "belege.befehl.format": "Die Datei ist kein gültiger Beleg-Export. {grund}",
  "belege.befehl.kette": "Belege-Kette {ergebnis}: {anzahl} Einträge geprüft.",
  "belege.befehl.kopf": "Letzter Eintrag: {seq} ({hash})",
  "belege.export.zeile": "Zeile {zeile}: {grund}",
  "belege.export.datei_leer": "Die Datei ist leer.",
  "belege.export.kopfzeile": "Die erste Zeile ist keine gültige Kopfzeile eines Beleg-Exports.",
  "belege.export.kein_beleg": "Die Zeile ist kein gültiger Beleg.",
  "belege.export.zeile_leer": "Die Zeile ist leer.",
  "belege.export.kein_json": "Die Zeile ist kein JSON.",
  "belege.kette.start_vorhanden": "Die Belege-Kette hat schon einen Start.",
  "belege.kette.ohne_start": "Die Belege-Kette hat noch keinen Start.",
  "belege.schluessel.nicht_aktiv": "Der bisherige Schlüssel ist nicht der aktive.",
  "belege.schluessel.schon_aktiv": "Der neue Schlüssel ist schon der aktive.",
  "belege.schluessel.signierer_nicht_aktiv": "Der Signaturschlüssel ist nicht der aktive.",
  "belege.schluessel.nicht_gespeichert": "Der Schlüssel ist nicht gespeichert.",
  "belege.anker.titel": "Anker der Kette",
  "belege.anker.hinweis":
    "Notiere dir diesen Anker außerhalb von PaiBot. Nur mit ihm lässt sich später erkennen, ob am Ende der Kette Belege fehlen.",
  "belege.anker.ohne": "Ohne Anker geprüft: Ob am Ende Belege fehlen, ist so nicht erkennbar.",
  "belege.anker.ungueltig": "Der Text ist kein gültiger Anker.",
  "belege.problem.andere_installation": "Der Anker gehört zu einer anderen Installation.",
  "belege.problem.kette_kuerzer_als_anker":
    "Die Kette ist kürzer als der Anker: Am Ende fehlen Belege.",
  "belege.problem.kopf_abweichend":
    "Der Beleg an der Stelle des Ankers ist ein anderer: Die Kette wurde umgeschrieben.",
  "belege.problem.anderer_anfang_als_anker":
    "Die Kette beginnt mit einem anderen Schlüssel als im Anker.",
  "belege.problem.schluessel_nicht_aus_kette":
    "Ein Beleg ist mit einem Schlüssel signiert, der nicht aus der Kette selbst folgt.",
  "belege.problem.schluesselwechsel_nicht_beglaubigt":
    "Ein Schlüsselwechsel ist nur vom neuen Schlüssel signiert. Ab hier ist nicht belegt, dass die Belege vom ursprünglichen Schlüssel stammen.",
  "belege.urteil.vertrauenswuerdig": "Kette gültig, alle Schlüssel aus der Kette.",
  "belege.urteil.vertrauen_gebrochen":
    "Kette in sich gültig, aber die Vertrauenskette ist unterbrochen.",
  "belege.urteil.ungueltig": "Kette ungültig.",
  "belege.problem.regel_geaendert":
    "Eine Regel dieses Belegs wurde nachträglich verändert; die Entscheidung lässt sich nicht mehr nachrechnen.",
  "belege.problem.regel_fehlt": "Eine Regel dieses Belegs fehlt im festgehaltenen Regelstand.",
  "belege.regelstand.nicht_festgehalten":
    "Der Beleg nennt keinen Regelstand; nachgerechnet wurde mit den heutigen Regeln.",

  // Ergebnis einer Aktion
  "ergebnis.ok": "ausgeführt",
  "ergebnis.error": "fehlgeschlagen",
  "ergebnis.cancelled": "abgebrochen",
  "ergebnis.denied": "abgelehnt",

  // Aktionen
  "aktion.einrichtung.abschliessen": "Einrichtung abgeschlossen",
  "aktion.zugang.anmelden": "Angemeldet",
  "aktion.zugang.abmelden": "Abgemeldet",
  "aktion.zugang.alle_abmelden": "Alle Sitzungen beendet",
  "aktion.zugang.passwort_aendern": "Passwort geändert",
  "aktion.anbieter.speichern": "Anbieter gespeichert",
  "aktion.anbieter.loeschen": "Anbieter gelöscht",
  "aktion.modell.waehlen": "Modell gewählt",
  "aktion.bot.aendern": "Bot geändert",
  "aktion.schleuse.umschalten": "Datenschleuse umgeschaltet",
  "aktion.einstellung.aendern": "Einstellung geändert",
  "aktion.unterhaltung.anlegen": "Unterhaltung angelegt",
  "aktion.unterhaltung.umbenennen": "Unterhaltung umbenannt",
  "aktion.unterhaltung.loeschen": "Unterhaltung gelöscht",
  "aktion.nachricht.senden": "Nachricht gesendet",
  "aktion.modell.anfragen": "Modell angefragt",
  "aktion.lauf.abbrechen": "Antwort abgebrochen",
  "aktion.belege.exportieren": "Belege exportiert",
  "aktion.werkzeug.aufrufen": "Werkzeug aufgerufen",
  "aktion.werkzeug.freigeben": "Werkzeug-Aufruf beantwortet",
  "aktion.werkzeug.ausfuehren": "Werkzeug nach Freigabe ausgeführt",

  // Regeln und Grenzen
  "regel.R-001": "Besitzer verwaltet seine Installation",
  "regel.R-002": "Bot darf antworten",
  "regel.R-003": "Einrichtung mit Einrichtungs-Code",
  "regel.R-004": "Anmelden mit Passwort",
  "regel.R-005": "Bot fragt vor Werkzeugen",
  "regel.R-006": "Nachweis passt nicht zur Aktion",
  "regel.R-007": "Einmal erlaubt",
  "regel.R-008": "Ausführen nur mit Freigabe",
  "regel.R-999": "Ohne passende Regel",
  "regel.G-01": "Datenschleuse gefordert",
  "regel.G-02": "Anbieter aktiv und Region erlaubt",
  "regel.G-03": "Länge",
  "regel.G-04": "Tagesbudget",
  "regel.G-05": "Not-Aus",
  "tor.grenze": "{id} „{name}“",
  "tor.grenze_verletzt": "Das Tor hat die Aktion abgelehnt. Grenze nicht eingehalten: {grenzen}.",
  "regel.V-01": "Unterhaltung vorhanden",
  "regel.V-02": "Kein Lauf aktiv",
  "regel.V-03": "Lauf aktiv",
  "regel.V-04": "Datenschleuse eingerichtet",
  "regel.V-05": "Lauf läuft",
  "regel.V-06": "Aktuelles Passwort bestätigt",
  "regel.V-07": "Einrichtung offen",
  "regel.V-08": "Aufruf wartet auf Freigabe",
  "regel.V-09": "Freigabe passt zum Aufruf",
  "tor.vorbedingung_verletzt":
    "Das Tor hat die Aktion abgelehnt. Vorbedingung nicht erfüllt: {vorbedingungen}.",

  // Einstellungen und Info
  "einstellungen.sitzungen": "Sitzungen",
  "einstellungen.sitzungen.alle_beenden": "Alle Sitzungen beenden",
  "einstellungen.sitzung.diese": "diese Sitzung",
  "einstellungen.passwort.aendern": "Passwort ändern",
  "einstellungen.passwort.aktuell": "Aktuelles Passwort",
  "einstellungen.passwort.neu": "Neues Passwort",
  "einstellungen.verlaufsgrenze": "Verlaufsgrenze (Token)",
  "einstellungen.zeitzone": "Zeitzone",
  "einstellungen.tagesbudget": "Tagesbudget (Token)",
  "info.version": "Stand",
  "info.installation": "Installations-ID",
  "info.lizenz.text":
    "PaiBot steht unter der PaiBot Fair-Code-Lizenz 1.1. Du darfst es für dich selbst nutzen und anpassen.\u200c\u2060\u200d\u2060\u200c",
  "info.enterprise":
    "Du willst PaiBot mit mehreren Personen nutzen? Dafür ist PaiBot Enterprise in Vorbereitung.",
  "info.bestandteile": "Bestandteile und ihre Lizenzen",
  "info.doku": "Zur Doku",

  // Schlüssel und gespeicherte Geheimnisse: je Grund aus dem Krypto-Paket ein Satz
  "krypto.geheimnis_fehlt": "PAIBOT_SECRET fehlt. Erzeuge es mit: openssl rand -base64 32",
  "krypto.geheimnis_ungueltig":
    "PAIBOT_SECRET hat die falsche Form: verlangt sind genau 32 Byte als Base64 (openssl rand -base64 32).",
  "krypto.geheimnis_schwach":
    "PAIBOT_SECRET ist erkennbar nicht zufällig (etwa ein Wort, lauter gleiche Zeichen oder eine Wiederholung). Erzeuge einen neuen Wert mit: openssl rand -base64 32",
  "krypto.format_ungueltig": "Ein gespeicherter Wert hat nicht das erwartete Format.",
  "krypto.parameter_ungueltig":
    "Der gespeicherte Passwort-Hash nennt Werte außerhalb der erlaubten Grenzen.",
  "krypto.version_unbekannt": "Ein gespeicherter Wert hat eine unbekannte Formatversion.",
  "krypto.version_veraltet":
    "Ein gespeicherter Schlüssel stammt aus einer älteren Version. Trage ihn neu ein.",
  "krypto.bindung_fehlt": "Ein gebundener Wert lässt sich ohne seine Bindung nicht lesen.",
  "krypto.entschluesseln_fehlgeschlagen":
    "Ein gespeicherter Wert lässt sich nicht entschlüsseln: anderes PAIBOT_SECRET, anderer Platz oder verändert.",
  "krypto.schluessel_nicht_geladen": "Der Signaturschlüssel ist nicht geladen.",

  // Fehler: Text und, wo es hilft, ein Ausweg
  "fehler.nicht_angemeldet": "Du bist nicht angemeldet.",
  "fehler.nicht_angemeldet.ausweg": "Melde dich neu an.",
  "fehler.pruefzeichen_fehlt": "Die Anfrage konnte nicht bestätigt werden.",
  "fehler.pruefzeichen_fehlt.ausweg": "Lade die Seite neu und versuch es noch einmal.",
  "fehler.herkunft_falsch": "Die Anfrage kam nicht von dieser PaiBot-Seite.",
  "fehler.herkunft_falsch.ausweg": "Öffne PaiBot über die eingestellte Adresse.",
  "fehler.eingabe_ungueltig": "Die Eingabe ist nicht gültig.",
  "fehler.eingabe_ungueltig.ausweg": "Prüf die markierten Felder.",
  "fehler.nicht_gefunden": "Das gibt es nicht (mehr).",
  "fehler.zu_viele_versuche": "Zu viele Versuche.",
  "fehler.zu_viele_versuche.ausweg": "Warte kurz und versuch es dann noch einmal.",
  "fehler.passwort_falsch": "Das Passwort stimmt nicht.",
  "fehler.einrichtungs_code_falsch": "Der Einrichtungs-Code stimmt nicht.",
  "fehler.einrichtungs_code_falsch.ausweg": "Den gültigen Code findest du im Log von PaiBot.",
  "fehler.einrichtung_offen": "PaiBot ist noch nicht eingerichtet.",
  "fehler.einrichtung_offen.ausweg": "Schließ zuerst die Einrichtung ab.",
  "fehler.einrichtung_fertig": "PaiBot ist schon eingerichtet.",
  "fehler.einrichtung_fertig.ausweg": "Melde dich mit deinem Passwort an.",
  "fehler.regel_fehlt": "Dafür gibt es noch keine Regel.",
  "fehler.abgelehnt": "Das Tor hat die Aktion abgelehnt.",
  "fehler.lauf_aktiv": "Dein Bot antwortet gerade noch.",
  "fehler.lauf_aktiv.ausweg": "Warte die Antwort ab oder brich sie ab.",
  "fehler.kein_modell": "Für deinen Bot ist kein Modell gewählt.",
  "fehler.kein_modell.ausweg": "Wähle ein Modell.",
  "fehler.schleuse_blockiert":
    "Die Datenschleuse hat die Anfrage gestoppt. Die Nachricht wurde nicht an das Modell geschickt.",
  "fehler.schleuse_blockiert.ausweg":
    "Prüf, ob die Datenschleuse läuft, oder schalte sie für diese Unterhaltung aus.",
  "fehler.schleuse_nicht_installiert": "Die Datenschleuse ist nicht installiert.",
  "fehler.schleuse_nicht_installiert.ausweg":
    "Installiere die Datenschleuse oder lass den Schalter auf Aus.",
  "fehler.anbieter_nicht_erreichbar": "Der Anbieter des Modells ist nicht erreichbar.",
  "fehler.anbieter_nicht_erreichbar.ausweg": "Versuch es gleich noch einmal.",
  "fehler.schluessel_ungueltig": "Der Anbieter hat den Schlüssel nicht angenommen.",
  "fehler.schluessel_ungueltig.ausweg": "Trag einen gültigen Schlüssel ein.",
  "fehler.limit_erreicht": "Ein Limit ist erreicht.",
  "fehler.limit_erreicht.ausweg": "Warte etwas oder prüf dein Tagesbudget.",
  "fehler.unterbrochen": "Die Antwort wurde unterbrochen.",
  "fehler.unterbrochen.ausweg": "Schick die Nachricht noch einmal.",
  "fehler.intern": "Da ist etwas schiefgegangen.",
  "fehler.intern.ausweg": "Versuch es noch einmal. Hilft das nicht, schau ins Log von PaiBot.",

  // Seite Einstellungen und Info
  "einstellungen.reiter.name": "Bereiche der Einstellungen",
  "einstellungen.reiter.zugang": "Zugang",
  "einstellungen.reiter.grenzen": "Grenzen",
  "einstellungen.reiter.darstellung": "Darstellung",
  "einstellungen.passwort.wiederholen": "Neues Passwort wiederholen",
  "einstellungen.passwort.text":
    "Wähl ein Passwort, das du dir merken kannst. Ein Satz aus vier Wörtern ist gut.",
  "einstellungen.passwort.hinweis":
    "Danach sind alle anderen Geräte abgemeldet. Auf diesem Gerät bleibst du angemeldet.",
  "einstellungen.passwort.laeuft": "Wird geändert …",
  "einstellungen.passwort.leer": "Gib dein aktuelles Passwort ein.",
  "einstellungen.passwort.unfertig": "Das neue Passwort erfüllt die Prüfliste noch nicht.",
  "einstellungen.passwort.erfolg":
    "Dein Passwort ist geändert. Alle anderen Geräte sind jetzt abgemeldet.",
  "einstellungen.sitzungen.text":
    "Jede Anmeldung ist eine Sitzung. Hier siehst du, wo du gerade angemeldet bist.",
  "einstellungen.sitzungen.leer": "Es gibt gerade keine aktive Sitzung.",
  "einstellungen.sitzungen.fehler": "Die Sitzungen lassen sich gerade nicht laden.",
  "einstellungen.sitzungen.alle_hinweis":
    "Meldet alle Geräte ab, auch dieses. Danach meldest du dich mit deinem Passwort neu an.",
  "einstellungen.sitzungen.rueckfrage":
    "Alle Geräte werden abgemeldet, auch dieses. Danach landest du auf der Anmeldung.",
  "einstellungen.sitzungen.laeuft": "Wird beendet …",
  "einstellungen.sitzung.angemeldet": "angemeldet am {zeit}",
  "einstellungen.sitzung.zuletzt": "zuletzt aktiv am {zeit}",
  "einstellungen.sitzung.geraet": "{browser} auf {system}",
  "einstellungen.sitzung.geraet_unbekannt": "Gerät ohne Angabe",
  "einstellungen.abmelden.text": "Meldet nur dieses Gerät ab.",
  "einstellungen.schliessen": "Schließen",
  "einstellungen.grenzen.vorspann":
    "Grenzen prüft das Tor bei jeder Anfrage an das Modell, nach festen Regeln und ohne KI. Jede Änderung hier bekommt einen Beleg.",
  "einstellungen.tagesbudget.hilfe":
    "Höchstens so viele Token am Tag (Eingabe und Ausgabe zusammen). Leer lassen heißt: keine Tagesgrenze.",
  "einstellungen.verlaufsgrenze.hilfe":
    "So viele Token aus dem bisherigen Verlauf gehen höchstens mit jeder Anfrage mit. Leer lassen heißt: so viel, wie passt.",
  "einstellungen.zeitzone.hilfe":
    "Danach richten sich das Datum für deinen Bot und der Beginn des Tages für die Tagesgrenze.",
  "einstellungen.heute.titel": "Heute verbraucht",
  "einstellungen.heute.ohne_grenze": "{token} Token seit {uhrzeit} Uhr. Es gibt keine Tagesgrenze.",
  "einstellungen.heute.mit_grenze": "{token} von {grenze} Token seit {uhrzeit} Uhr.",
  "einstellungen.heute.erreicht":
    "Die Tagesgrenze ist erreicht. Bis morgen fragt dein Bot das Modell nicht mehr an.",
  "einstellungen.grenzen.zahl_ungueltig":
    "Gib eine ganze Zahl von 1 bis {max} ein oder lass das Feld leer.",
  "einstellungen.grenzen.unveraendert": "Es gibt nichts zu speichern.",
  "einstellungen.grenzen.laeuft": "Wird gespeichert …",
  "einstellungen.grenzen.gespeichert": "Gespeichert.",
  "einstellungen.grenzen.beleg": "Beleg Nr. {nummer} ansehen",
  "info.lizenz": "Lizenz",
  "info.lizenz.name": "PaiBot Fair-Code-Lizenz 1.1, für eine Person",
  "info.lizenz.person": "PaiBot ist für eine Person gedacht: privat und für deine eigene Arbeit.",
  "info.lizenz.team":
    "Für Teams und Unternehmen ist PaiBot Enterprise mit Support in Vorbereitung. Anfrage an hi@paibot.de.",
  "info.lizenz.link": "Lizenztext lesen",
  "info.entwickelt": "Entwickelt von",
  "info.team": "Im Team nutzen",
  "info.team.anfrage": "Anfrage an",
  "info.links": "Links",
  "info.link.quellcode": "Quellcode",
  "info.link.community": "Community auf aiianer.de",
  "info.neuer_tab": "(öffnet in einem neuen Tab)",
  "info.bestandteile.text":
    "PaiBot nutzt Bestandteile Dritter. Für sie gelten ausschließlich ihre eigenen Lizenzen.",
  "info.bestandteile.schriften":
    "Die Schriften Inter und Montserrat stehen unter der SIL Open Font License 1.1 und liegen in PaiBot selbst; nichts wird von fremden Servern geladen.",
  "info.bestandteile.link": "Liste aller Bestandteile",
  "info.hilfe": "Hilfe",
  "info.hilfe.text":
    "Anleitungen für jede Funktion stehen in der Doku auf paibot.de. Fragen und Austausch gibt es in der Community auf aiianer.de.",
  "info.sicherheit": "Sicherheitslücke melden",
  "info.sicherheit.text":
    "Bitte melde Sicherheitslücken nicht öffentlich. Wie es vertraulich geht, steht in SECURITY.md.",
  "info.sicherheit.link": "SECURITY.md lesen",
  // Chat (Oberfläche)
  "chat.tag.heute": "Heute",
  "chat.tag.gestern": "Gestern",
  "chat.weg.direkt": "direkt · {region}",
  "chat.weg.kurz.direkt": "direkt",
  "chat.weg.kurz.schleuse": "geschützt",
  "chat.ziel.modelle": "Modell und Anbieter öffnen",
  "chat.ziel.datenschleuse": "Zur Datenschleuse",
  "chat.ziel.einstellungen": "Zu den Einstellungen",
  "chat.laenge.noch": "Noch {anzahl} Zeichen",
  "chat.laenge.zu_lang":
    "{anzahl} Zeichen zu viel. Kürze die Nachricht, dann lässt sie sich senden.",
  "chat.eingabe.platzhalter_bot": "Schreib {name} eine Nachricht",
  "chat.notiz": "{name} handelt nur mit Beleg. Jede Antwort bekommt einen, den du prüfen kannst.",
  "chat.ausstehend": "wird gesendet …",
  "chat.lauf.wartet": "wartet in der Schlange",
  "chat.lauf.schreibt": "schreibt",
  "chat.lauf.stoppt": "wird gestoppt …",
  "chat.lauf.beleg_folgt": "Beleg folgt, sobald die Antwort fertig ist.",
  "chat.lauf.gesperrt": "Senden geht wieder, sobald {name} fertig ist.",
  "chat.bot.bereit": "bereit",
  "chat.bot.hoert_zu": "hört zu",
  "chat.bot.denkt": "denkt nach",
  "chat.bot.wartet": "wartet auf dich",
  "chat.bot.fertig": "fertig",
  "chat.bot.fehler": "Fehler",
  "chat.bot.angehalten": "angehalten",
  "chat.verbindung.neu": "verbindet neu …",
  "chat.verbindung.getrennt": "Verbindung zum Live-Verlauf getrennt.",
  "chat.verbindung.knopf": "Neu verbinden",
  "chat.ende.abgebrochen": "Abgebrochen, bevor {name} geantwortet hat.",
  "chat.ende.abgebrochen_teil": "Abgebrochen. Der Text bis hierhin bleibt stehen.",
  "chat.ende.abgelehnt": "Vom Tor abgelehnt",
  "chat.ende.schleuse": "Meldung der Datenschleuse: {grund}",
  "chat.kopf.schritte": "Schritte",
  "chat.kopf.schritte_label": "Beleg-Zeilen unter den Antworten zeigen",
  "chat.kopf.menue": "Weitere Aktionen",
  "chat.kopf.modell": "Modell {name}, Herkunft {region}. Ändern unter „Modell und Anbieter“.",
  "chat.menue.belege": "Belege dieser Unterhaltung",
  "chat.umbenennen.titel": "Unterhaltung umbenennen",
  "chat.umbenennen.feld": "Titel",
  "chat.loeschen.text":
    "Nachrichten und Antworten dieser Unterhaltung sind danach weg. Die Belege bleiben, damit die Kette vollständig bleibt.",
  "chat.schliessen": "Schließen",
  "chat.kein_modell.titel": "{name} hat noch kein Modell",
  "chat.kein_modell.text":
    "Ohne Modell kann {name} nicht antworten. Wähle unter „Modell und Anbieter“ ein Modell aus.",
  "chat.kein_schluessel.titel": "Für das Modell fehlt der Schlüssel",
  "chat.kein_schluessel.text":
    "Trag unter „Modell und Anbieter“ den Schlüssel deines Anbieters ein. Danach kann {name} antworten.",
  "chat.schleuse.nicht_eingerichtet": "Die Datenschleuse ist auf diesem Server nicht eingerichtet.",
  "chat.schleuse.zuschalten": "So schaltest du sie zu",
  "chat.schleuse.nicht_bereit": "Datenschleuse nicht bereit: Sie hat die letzte Anfrage gestoppt.",
  "chat.belege.einleitung":
    "Jeder Schritt dieser Unterhaltung, neuester oben. Ein Klick öffnet den Beleg.",
  "chat.belege.leer": "Noch keine Belege in dieser Unterhaltung.",
  "chat.belege.zurueck": "Alle Belege dieser Unterhaltung",
  "chat.belege.seite": "Als eigene Seite öffnen",
  "chat.belege.laedt": "Beleg wird geladen …",
  "chat.beleg.zeile": "Beleg",
  "chat.beleg.titel": "Beleg {kennung}",
  "chat.beleg.art.decision": "Entscheidung",
  "chat.beleg.art.result": "Ergebnis",
  "chat.beleg.feld.was": "Was",
  "chat.beleg.feld.wer": "Wer",
  "chat.beleg.feld.entscheidung": "Entscheidung",
  "chat.beleg.feld.regeln": "Angewandte Regeln",
  "chat.beleg.feld.grund": "Begründung",
  "chat.beleg.feld.ergebnis": "Ergebnis",
  "chat.beleg.feld.zeit": "Zeit",
  "chat.beleg.feld.kennung": "Kennung",
  "chat.beleg.wer.besitzer": "Du",
  "chat.beleg.wer.bot": "{name} (Bot)",
  "chat.beleg.outcome.allow": "erlaubt",
  "chat.beleg.outcome.deny": "abgelehnt",
  "chat.beleg.outcome.ask": "fragt nach",
  "chat.beleg.outcome.prepare": "vorbereitet",
  "chat.beleg.keine_regeln": "keine",
  "chat.verlauf": "Verlauf",
  "chat.entwurf.etikett": "Entwurf",
  "chat.entwurf.kopieren": "Kopieren",
  "chat.entwurf.kopiert": "Kopiert",
  // Modelle, Datenschleuse, Bot (Seiten)
  "modelle.seite.text":
    "Hier verbindest du PaiBot mit dem Anbieter deiner Sprachmodelle und legst fest, mit welchem Modell {name} arbeitet.",
  "modelle.anbieter.titel": "Anbieter",
  "modelle.anbieter.adresse": "Adresse",
  "modelle.anbieter.region": "Region",
  "modelle.anbieter.vorlage.eurouter": "Vorlage EUrouter",
  "modelle.anbieter.vorlage.eigener": "Eigener Anbieter (OpenAI-kompatibel)",
  "modelle.anbieter.status.verbunden": "verbunden",
  "modelle.anbieter.status.fehlgeschlagen": "letzter Test fehlgeschlagen",
  "modelle.anbieter.status.ungetestet": "noch nicht getestet",
  "modelle.anbieter.status.ohne_schluessel": "kein Schlüssel",
  "modelle.anbieter.keiner.titel": "Noch kein Anbieter verbunden",
  "modelle.anbieter.keiner.text":
    "Trag deinen Schlüssel für {anbieter} ein und teste die Verbindung. Danach wählst du das Modell für {name}.",
  "modelle.region.text.eu": "{anbieter} betreibt die Modelle in der EU.",
  "modelle.region.text.non_eu": "{anbieter} betreibt die Modelle außerhalb der EU.",
  "modelle.region.text.local": "{anbieter} läuft in deinem eigenen Netz.",
  "modelle.schluessel.hinterlegt": "Schlüssel hinterlegt",
  "modelle.schluessel.fehlt": "Kein Schlüssel hinterlegt",
  "modelle.schluessel.lokal": "Lokaler Anbieter ohne Schlüssel",
  "modelle.schluessel.verdeckt":
    "Der Schlüssel liegt verschlüsselt auf deinem Server. PaiBot zeigt ihn nie an, auch nicht teilweise.",
  "modelle.schluessel.eintragen": "Schlüssel eintragen",
  "modelle.schluessel.ersetzen": "Schlüssel ersetzen",
  "modelle.schluessel.neu": "Neuer Schlüssel für {anbieter}",
  "modelle.schluessel.hilfe":
    "Teste die Verbindung, bevor du speicherst. Gespeichert wird nur ein Schlüssel, den {anbieter} annimmt.",
  "modelle.schluessel.speichern": "Schlüssel speichern",
  "modelle.schluessel.speichert": "Speichert …",
  "modelle.schluessel.gespeichert": "Schlüssel gespeichert. Die Verbindung zu {anbieter} steht.",
  "modelle.schluessel.leer": "Gib zuerst einen Schlüssel ein.",
  "modelle.schluessel.entfernen": "Schlüssel entfernen",
  "modelle.schluessel.entfernen.titel": "Schlüssel entfernen?",
  "modelle.schluessel.entfernen.text":
    "Damit entfernst du den Anbieter {anbieter} samt Schlüssel. {name} hat danach kein Modell mehr, bis du wieder einen Schlüssel einträgst und ein Modell wählst.",
  "modelle.schluessel.entfernen.ja": "Entfernen",
  "modelle.schluessel.entfernt": "Anbieter und Schlüssel sind entfernt.",
  "modelle.schluessel.unlesbar": "Der gespeicherte Schlüssel lässt sich nicht mehr lesen.",
  "modelle.schluessel.unlesbar.ausweg": "Trag den Schlüssel neu ein.",
  "modelle.schluessel.adresse_neu":
    "Die Adresse ändert sich. Der gespeicherte Schlüssel gilt nur für die bisherige Adresse; gib ihn für die neue Adresse in derselben Änderung noch einmal ein.",
  "modelle.schluessel.vorlage_fest":
    "Bei der Vorlage EUrouter sind Adresse und Region fest vorgegeben.",
  "modelle.verbindung.laeuft": "Teste die Verbindung …",
  "modelle.verbindung.ok_anzahl": "Verbindung steht. {anzahl} passende Modelle gefunden.",
  "modelle.test.schluessel_ungueltig": "{anbieter} hat den Schlüssel nicht angenommen.",
  "modelle.test.schluessel_ungueltig.ausweg":
    "Prüf, ob du den Schlüssel vollständig kopiert hast, oder erzeuge in deinem Konto bei {anbieter} einen neuen.",
  "modelle.test.schluessel_ungueltig.ausweg_eigen":
    "Prüf, ob du den Schlüssel vollständig kopiert hast und ob er zu {anbieter} gehört. Trag bei Bedarf einen neuen ein.",
  "modelle.test.anbieter_nicht_erreichbar":
    "{anbieter} ist nicht erreichbar oder hat nicht rechtzeitig geantwortet.",
  "modelle.test.anbieter_nicht_erreichbar.ausweg":
    "Prüf die Internet-Verbindung deines Servers und versuch es in einer Minute noch einmal.",
  "modelle.test.limit_erreicht": "{anbieter} meldet ein erreichtes Limit.",
  "modelle.test.limit_erreicht.ausweg": "Prüf Guthaben und Limits in deinem Konto bei {anbieter}.",
  "modelle.test.limit_erreicht.ausweg_eigen": "Prüf Guthaben und Limits von {anbieter}.",
  "modelle.liste.titel": "Modell für {name}",
  "modelle.liste.text":
    "Die Liste kommt direkt von {anbieter}. Sie zeigt nur Modelle, die Text schreiben und Antworten nach und nach liefern können.",
  "modelle.liste.laedt": "Lade die Modelle von {anbieter} …",
  "modelle.liste.leer": "{anbieter} meldet gerade keine passenden Modelle.",
  "modelle.liste.leer.ausweg": "Versuch es später noch einmal oder prüf dein Konto bei {anbieter}.",
  "modelle.liste.ohne_schluessel":
    "Sobald ein Schlüssel hinterlegt ist, erscheinen hier die Modelle.",
  "modelle.liste.keine_treffer": "Kein Modell passt zu „{suche}“.",
  "modelle.liste.anzahl": "{anzahl} Modelle",
  "modelle.liste.neu_laden": "Liste neu laden",
  "modelle.liste.name": "Modelle von {anbieter}",
  "modelle.herkunft": "über {anbieter} · {region}",
  "modelle.aktuell": "aktuell",
  "modelle.aktuell.text": "{name} arbeitet mit {modell}.",
  "modelle.aktuell.keins": "{name} hat noch kein Modell.",
  "modelle.uebernehmen": "Modell übernehmen",
  "modelle.uebernommen": "{name} arbeitet jetzt mit {modell}.",
  "modelle.nicht_in_liste": "Dieses Modell steht nicht in der aktuellen Liste des Anbieters.",
  "modelle.nicht_in_liste.ausweg": "Lade die Liste neu und wähle ein Modell daraus.",
  "bot.seite.text":
    "So stellst du {name} ein: Name, Aussehen und die Anweisung, die jede Antwort prägt.",
  "bot.name.hilfe": "Den Namen siehst du im Chat und in der Navigation.",
  "bot.anweisung.hilfe":
    "Die Anweisung bekommt das Modell vor jeder Antwort mit: Ton, Aufgabe und was {name} beachten soll.",
  "bot.anweisung.zaehler": "{anzahl} von {max} Zeichen",
  "bot.anweisung.zu_lang": "Die Anweisung darf höchstens {max} Zeichen haben.",
  "bot.anweisung.platzhalter": "Zum Beispiel: Antworte kurz und freundlich auf Deutsch.",
  "bot.beispiele.text":
    "Ein Klick hängt den Satz an die Anweisung an. Gespeichert wird erst mit „Speichern“.",
  "bot.aussehen.titel": "Aussehen",
  "bot.aussehen.hilfe": "Jede Farbe gehört fest zu einer Form.",
  "bot.aussehen.paar": "{form} in {farbe}",
  "bot.vorschau": "Vorschau",
  "bot.form.blatt": "Blatt",
  "bot.form.bogen": "Bogen",
  "bot.form.kiesel": "Kiesel",
  "bot.form.raute": "Raute",
  "bot.form.dee": "Halbrund",
  "bot.form.wabe": "Wabe",
  "bot.form.bluete": "Blüte",
  "bot.farbe.limette": "Limette",
  "bot.farbe.blau": "Blau",
  "bot.farbe.gruen": "Grün",
  "bot.farbe.violett": "Violett",
  "bot.farbe.pink": "Pink",
  "bot.farbe.tuerkis": "Türkis",
  "bot.farbe.gelb": "Gelb",
  "bot.farbe.orange": "Orange",
  "bot.name.leer": "Gib deinem Bot einen Namen.",
  "bot.speichert": "Speichert …",
  "bot.gespeichert": "Gespeichert. {name} nutzt die neuen Angaben ab der nächsten Antwort.",
  "bot.verwerfen": "Änderungen verwerfen",
  "bot.unveraendert": "Es gibt nichts zu speichern.",
  "bot.modell.aendern": "Modell ändern",
  "bot.darf.titel": "Was dein Bot darf",
  "bot.darf.text":
    "Abgeleitet aus den geltenden Regeln, nicht aus einem Text. Ändert sich eine Regel, ändert sich dieser Überblick.",
  "bot.darf.erlaubt": "Darf, mit Beleg",
  "bot.darf.fragt": "Fragt vorher",
  "bot.darf.nie": "Darf nie",
  "bot.darf.grenze": "Grenze",
  "bot.darf.g01":
    "Nachrichten unmaskiert an das Modell schicken, wenn die Datenschleuse gefordert ist",
  "bot.darf.werkzeuge":
    "In dieser Version hat {name} keine Werkzeuge: {name} schreibt Antworten und führt selbst nichts aus.",
  "bot.darf.belege": "Regeln und Belege ansehen",
  "datenschleuse.text.1":
    "Die Datenschleuse ersetzt persönliche Angaben wie Namen oder Telefonnummern durch Platzhalter, bevor eine Nachricht an das Modell geht, und setzt sie in der Antwort wieder ein.",
  "datenschleuse.text.2":
    "Sie erkennt nicht jede Angabe, zum Beispiel ungewöhnliche Schreibweisen oder Angaben, die nur aus dem Zusammenhang klar werden.",
  "datenschleuse.text.3":
    "Sie ist eine technische Schutzmaßnahme auf deinem Server und ersetzt nicht, dass du sensible Angaben selbst prüfst.",
  "datenschleuse.zustand.titel": "Zustand",
  "datenschleuse.eingerichtet": "eingerichtet",
  "datenschleuse.nicht_eingerichtet": "nicht eingerichtet",
  "datenschleuse.eingerichtet.text":
    "Die Datenschleuse ist auf diesem Server eingerichtet. Ob sie gerade läuft, prüft der Worker vor jeder geschützten Anfrage.",
  "datenschleuse.anleitung.titel": "So schaltest du die Datenschleuse zu",
  "datenschleuse.anleitung.text":
    "Die Datenschleuse ist ein eigener Dienst auf deinem Server. Du schaltest sie einmal in der Installation zu:",
  "datenschleuse.anleitung.schritte": [
    "Öffne auf dem Server die Datei deploy/.env und entferne das # vor COMPOSE_PROFILES=schleuse und vor SCHLEUSE_URL=http://datenschleuse:4000/v1.",
    "Erzeuge die Konfiguration der Datenschleuse mit: pnpm schleuse:config --env-datei deploy/.env",
    "Starte PaiBot neu: docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build",
    "Lade diese Seite neu. Steht oben „eingerichtet“, kannst du den Standard umstellen.",
  ],
  "datenschleuse.anleitung.doku": "Ausführliche Anleitung in der Doku",
  "datenschleuse.letzter_lauf.titel": "Letzte Anfrage über die Datenschleuse",
  "datenschleuse.letzter_lauf.hinweis":
    "Die Web-App erreicht die Datenschleuse nicht direkt, nur der Worker spricht mit ihr. Deshalb zeigt PaiBot hier, wie es bei der letzten geschützten Anfrage war.",
  "datenschleuse.letzter_lauf.keiner":
    "Noch keine Anfrage mit eingeschalteter Datenschleuse. Ein Ergebnis erscheint hier nach der ersten geschützten Nachricht.",
  "datenschleuse.letzter_lauf.bereit":
    "{zeit}: Die Datenschleuse war bereit, die Anfrage ging maskiert an das Modell.",
  "datenschleuse.letzter_lauf.blockiert":
    "{zeit}: Die Datenschleuse hat die Anfrage gestoppt, an das Modell ging nichts.",
  "datenschleuse.letzter_lauf.nicht_bereit":
    "{zeit}: Die Datenschleuse war nicht bereit (läuft nicht oder nimmt den Schlüssel von PaiBot nicht an). Die Nachricht wurde nicht verschickt.",
  "datenschleuse.letzter_lauf.anbieter":
    "{zeit}: Die Datenschleuse war bereit, aber die Anfrage beim Anbieter ist gescheitert: {fehler}",
  "datenschleuse.zustand.aus": "Die Datenschleuse ist auf diesem Server nicht eingerichtet.",
  "datenschleuse.zustand.aus.ausweg":
    "Schalte sie wie unter „Datenschleuse“ beschrieben zu oder lass den Schalter auf Aus.",
  "datenschleuse.zustand.nicht_erreichbar":
    "Die Datenschleuse ist eingerichtet, antwortet aber nicht.",
  "datenschleuse.zustand.nicht_erreichbar.ausweg":
    "Prüf mit „docker compose ps“, ob datenschleuse und schleuse-analyzer laufen, und starte sie bei Bedarf neu.",
  "datenschleuse.zustand.schluessel_falsch":
    "Die Datenschleuse nimmt den Schlüssel von PaiBot (SCHLEUSE_KEY) nicht an.",
  "datenschleuse.zustand.schluessel_falsch.ausweg":
    "Prüf SCHLEUSE_KEY in deploy/.env und starte Worker und Datenschleuse neu, damit beide denselben Wert haben.",
  "datenschleuse.zustand.bereit": "Die Datenschleuse ist bereit.",
  "datenschleuse.fehler.schluessel_falsch":
    "Die Datenschleuse hat den Schlüssel von PaiBot abgelehnt. Die Nachricht wurde nicht an das Modell geschickt.",
  "datenschleuse.fehler.schluessel_falsch.ausweg":
    "Das betrifft SCHLEUSE_KEY in deploy/.env, nicht den Schlüssel des Anbieters. Prüf den Wert und starte Worker und Datenschleuse neu.",
  "datenschleuse.standard.titel": "Standard für neue Unterhaltungen",
  "datenschleuse.standard.schalter": "Neue Unterhaltungen mit Datenschleuse",
  "datenschleuse.standard.an":
    "An: Neue Unterhaltungen starten mit eingeschalteter Datenschleuse. In jeder Unterhaltung kannst du sie einzeln umschalten.",
  "datenschleuse.standard.aus":
    "Aus: Neue Unterhaltungen gehen direkt an den Anbieter, bis du die Datenschleuse einschaltest.",
  "datenschleuse.standard.gesperrt":
    "Einschalten geht erst, wenn die Datenschleuse eingerichtet ist.",
  "datenschleuse.standard.gespeichert.an":
    "Gespeichert: Neue Unterhaltungen starten mit Datenschleuse.",
  "datenschleuse.standard.gespeichert.aus":
    "Gespeichert: Neue Unterhaltungen starten ohne Datenschleuse.",
  "datenschleuse.beispiel.titel": "So sieht eine maskierte Anfrage aus",
  "datenschleuse.beispiel.etikett": "Beispiel mit erfundenen Daten",
  "datenschleuse.beispiel.du": "1 · Du schreibst",
  "datenschleuse.beispiel.modell": "2 · Das Modell sieht",
  "datenschleuse.beispiel.zurueck": "3 · Du bekommst zurück",
  "datenschleuse.beispiel.eingabe":
    "Ruf Max Mustermann an: 0170 1234567. Er wartet auf das Angebot.",
  "datenschleuse.beispiel.maskiert": "Ruf <PERSON_1> an: <TELEFON_1>. Er wartet auf das Angebot.",
  "datenschleuse.beispiel.antwort":
    "Gern: Max Mustermann unter 0170 1234567 anrufen und das Angebot besprechen.",
  "datenschleuse.beispiel.hinweis":
    "Vereinfacht dargestellt. Name und Nummer sind erfunden, die echten Platzhalter können anders aussehen.",

  // Prüfer der Kette: Ergebnis und Entscheidung je Aktion, Regelstand
  "belege.problem.ergebnis_ohne_entscheidung":
    "Ein Ergebnis-Beleg hat keine Entscheidung derselben Aktion vor sich.",
  "belege.problem.ergebnis_passt_nicht_zur_entscheidung":
    "Ein Ergebnis passt nicht zu seiner Entscheidung: andere Aktion, „ausgeführt“ ohne Erlaubnis oder „abgelehnt“ trotz Erlaubnis.",
  "belege.problem.aktion_doppelt":
    "Eine Aktion hat mehr als eine Entscheidung oder mehr als ein Ergebnis.",
  "belege.problem.regelstand_fehlt":
    "Eine Entscheidung nennt keinen Regelstand oder keine Prüfsumme ihrer Regeln.",

  // Einrichtungs-Code beim Start
  "einrichtung.code.vorhanden":
    "Einrichtung offen: Der Einrichtungs-Code wurde am {zeit} erzeugt und steht im Log dieses Starts. Er gilt bis zum Ende der Einrichtung.",

  // Belege-Seite: Liste, Beleg, Prüfen im Browser, Anker, Export, Regeln
  "belege.seite.vorspann":
    "Jede Aktion läuft durch ein Tor mit festen Regeln. Hier steht, was wann passiert ist und nach welcher Regel es erlaubt war.",
  "belege.leer.titel": "Noch keine Belege",
  "belege.leer.text": "Sobald du oder dein Bot etwas tut, steht hier jede Aktion mit ihrem Beleg.",
  "belege.art.start": "Start",
  "belege.art.decision": "Entscheidung",
  "belege.art.result": "Ergebnis",
  "belege.art.key_change": "Schlüsselwechsel",
  "belege.art.unbekannt": "unbekannt",
  "belege.was.start": "PaiBot eingerichtet, Kette begonnen",
  "belege.was.schluesselwechsel": "Signaturschlüssel gewechselt",
  "belege.was.unbekannt": "Unbekannte Aktion",
  "belege.wer.du": "Du",
  "belege.wer.bot": "dein Bot",
  "belege.wer.bot_name": "{name} (Bot)",
  "belege.wer.paibot": "PaiBot",
  "belege.ergebnis.allow": "erlaubt",
  "belege.ergebnis.deny": "abgelehnt",
  "belege.ergebnis.ask": "fragt",
  "belege.ergebnis.prepare": "bereitet vor",
  "belege.ergebnis.ok": "fertig",
  "belege.ergebnis.error": "fehlgeschlagen",
  "belege.ergebnis.cancelled": "abgebrochen",
  "belege.ergebnis.denied": "abgelehnt",
  "belege.ergebnis.start": "begonnen",
  "belege.ergebnis.wechsel": "beglaubigt",
  "belege.ergebnis.wechsel_nicht_beglaubigt": "nicht beglaubigt",
  "belege.ergebnis.unbekannt": "unbekannt",
  "belege.spalte.kennung": "Kennung",
  "belege.spalte.von": "Von",
  "belege.spalte.pruefung": "Prüfung",
  "belege.liste.label": "Belege, neueste zuerst",
  "belege.zeile.label": "Beleg {kennung}: {was}, {ergebnis}, {stand}",
  "belege.zeile.offen": "nicht geprüft",
  "belege.zeile.geprueft": "geprüft",
  "belege.zeile.fehler": "Fehler hier",
  "belege.zeile.unbestaetigt": "nicht bestätigt",
  "belege.zeile.nicht_beglaubigt": "nicht beglaubigt",
  "belege.mehr_laden": "Ältere Belege laden",
  "belege.summe.anzahl": "Belege insgesamt",
  "belege.summe.geprueft": "davon geprüft",
  "belege.summe.noch_nicht": "noch keine",
  "belege.summe.kette": "Kette",
  "belege.summe.von_bis": "{von} bis {bis}",
  "belege.filter.von": "Von wem",
  "belege.filter.von.alle": "Alle",
  "belege.filter.von.bot": "Bot",
  "belege.filter.von.besitzer": "Du",
  "belege.filter.status": "Status der Prüfung",
  "belege.filter.status.alle": "Jeder Status",
  "belege.filter.status.geprueft": "geprüft",
  "belege.filter.status.offen": "noch nicht geprüft",
  "belege.filter.leer.titel": "Keine Belege für diese Auswahl",
  "belege.filter.leer.text": "Ändere den Filter oder lade ältere Belege, um mehr zu sehen.",
  "belege.filter.zuruecksetzen": "Filter zurücksetzen",
  "belege.seitlich.label": "Anker, Export und Regeln",
  "belege.kette.laeuft": "Kette wird im Browser geprüft …",
  "belege.kette.fortschritt": "{geladen} von {gesamt} Belegen geladen und geprüft",
  "belege.kette.fehler": "Die Kette ließ sich nicht prüfen: {text}",
  "belege.urteil.leer": "Noch keine Belege zum Prüfen.",
  "belege.urteil.gueltig_anzahl":
    "Vertrauenswürdig: {anzahl} Belege geprüft, alle Schlüssel aus der Kette.",
  "belege.urteil.gebrochen_ab":
    "Vertrauen gebrochen ab Beleg {kennung}: Ein Schlüsselwechsel ist nicht vom bisherigen Schlüssel beglaubigt.",
  "belege.urteil.ungueltig_an": "Ungültig an Stelle {kennung}: {grund}",
  "belege.urteil.ungueltig_grund": "Ungültig: {grund}",
  "belege.grund.inhalt": "Inhalt geändert",
  "belege.grund.signatur": "Signatur passt nicht",
  "belege.grund.kette": "Kette unterbrochen",
  "belege.grund.schluessel": "Schlüssel folgt nicht aus der Kette",
  "belege.grund.unbekannt": "Prüfung fehlgeschlagen",
  "belege.grund.entscheidung.regel_geaendert": "Regel nachträglich geändert",
  "belege.grund.entscheidung.entscheidung_abweichend": "Entscheidung weicht vom Nachrechnen ab",
  "belege.grund.entscheidung.regel_fehlt": "Regel fehlt im festgehaltenen Regelstand",
  "belege.grund.entscheidung.nicht_berechenbar": "Entscheidung lässt sich nicht nachrechnen",
  "belege.stelle": "(Stelle {kennung})",
  "belege.geprueft.inhalt": "Prüfsumme jedes Belegs neu berechnet ({anzahl} Belege)",
  "belege.geprueft.signatur": "Signaturen mit den Schlüsseln aus der Kette geprüft",
  "belege.geprueft.kette": "Verkettung lückenlos geprüft bis {bis}",
  "belege.geprueft.entscheidung":
    "Entscheidungen mit dem damaligen Regelstand nachgerechnet, ohne KI",
  "belege.geprueft.ohne_regelstand":
    "{anzahl} ältere Entscheidungen nennen keinen Regelstand; sie wurden mit den heutigen Regeln nachgerechnet.",
  "belege.geprueft.paare": "Zu jedem Ergebnis gibt es genau eine passende Entscheidung",
  "belege.geprueft.anker": "Mit deinem aufbewahrten Anker verglichen",
  "belege.anker.ausgetauscht":
    "Ohne aufbewahrten Anker fällt ein vollständig ausgetauschter Datenbestand nicht auf.",
  "belege.anker.nur_browser":
    "Dein Anker wurde nicht verglichen: Das geht nur, wenn dein Browser selbst prüfen kann.",
  "belege.anker.kasten.titel": "Kettenkopf außerhalb aufbewahren",
  "belege.anker.kopieren": "Anker kopieren",
  "belege.anker.kopiert": "Kopiert.",
  "belege.anker.kopieren_fehler": "Kopieren ging nicht. Markiere den Text und kopiere ihn selbst.",
  "belege.anker.sichern": "Als Datei sichern",
  "belege.anker.leer": "Noch kein Anker: Die Kette hat noch keine Belege.",
  "belege.anker.eigener.label": "Mit meinem aufbewahrten Anker prüfen",
  "belege.anker.eigener.hilfe":
    "Füge deinen Anker ein oder wähle die Datei. Er bleibt in diesem Browser und geht nicht an den Server.",
  "belege.anker.eigener.datei": "Anker-Datei wählen",
  "belege.anker.eigener.pruefen": "Mit Anker prüfen",
  "belege.anker.datei_fehler": "Die Datei ließ sich nicht lesen.",
  "belege.quelle.browser": "Im Browser geprüft; der Server hat nur die Rohdaten geliefert.",
  "belege.export.titel": "Belege exportieren",
  "belege.export.text":
    "Lädt alle Belege als Datei herunter, mit dem Anker in der ersten Zeile. Der Export läuft selbst durch das Tor und bekommt einen Beleg.",
  "belege.export.fertig": "{datei} mit {anzahl} Belegen gesichert.",
  "belege.export.eigene_belege": "Der Export selbst steht in den Belegen",
  "belege.export.und": "und",
  "belege.export.befehl": "Ohne PaiBot prüfen, im Projektordner:",
  "belege.regeln.titel": "Regeln",
  "belege.regeln.text": "Welche festen Regeln, Grenzen und Vorbedingungen das Tor prüft.",
  "belege.regeln.link": "Regeln ansehen",
  "belege.pruefen.erneut": "Erneut prüfen",
  "belege.pruefen.fehler": "Der Beleg ließ sich nicht prüfen: {text}",
  "belege.stand.gueltig": "stimmt",
  "belege.stand.gebrochen": "nicht beglaubigt",
  "belege.stand.ungueltig": "stimmt nicht",
  "belege.einzel.gueltig": "Beleg stimmt",
  "belege.einzel.gebrochen":
    "Beleg in sich gültig, aber sein Schlüssel ist nicht vom ursprünglichen beglaubigt",
  "belege.einzel.ungueltig": "Beleg stimmt nicht: {grund}",
  "belege.einzel.schluessel_ok": "Schlüssel folgt aus der Kette (Start bzw. beglaubigter Wechsel)",
  "belege.einzel.schluessel_fehler": "Schlüssel folgt nicht aus der Kette",
  "belege.einzel.schluessel_nicht_beglaubigt":
    "Schlüssel stammt aus einem Wechsel, den der bisherige Schlüssel nicht beglaubigt hat",
  "belege.einzel.vorgaenger_ok": "Enthält die Prüfsumme des vorigen Belegs",
  "belege.einzel.vorgaenger_fehler": "Passt nicht zum vorigen Beleg",
  "belege.einzel.nachfolger_ok": "Der nächste Beleg enthält die Prüfsumme dieses Belegs",
  "belege.einzel.nachfolger_fehler": "Der nächste Beleg verweist nicht auf diesen Beleg",
  "belege.einzel.neuester": "Neuester Beleg der Kette",
  "belege.einzel.hinweis_kette":
    "Ob die ganze Kette vollständig ist, zeigt „Ganze Kette prüfen“ auf der Seite „Belege“.",
  "belege.detail.seitentitel": "Beleg",
  "belege.detail.titel": "Beleg {kennung}",
  "belege.detail.etikett": "Beleg {kennung}",
  "belege.detail.zurueck": "Zu allen Belegen",
  "belege.karte.was": "Was",
  "belege.karte.art": "Art",
  "belege.karte.wer": "Von",
  "belege.karte.wann": "Zeit",
  "belege.karte.zur_unterhaltung": "Zur Unterhaltung",
  "belege.karte.entscheidung": "Entscheidung",
  "belege.karte.stufe": "Stufe „{stufe}“",
  "belege.karte.regeln": "Regel",
  "belege.karte.keine": "keine",
  "belege.karte.fassung": "Fassung {fassung}",
  "belege.karte.regelstand": "Regelstand",
  "belege.karte.regelstand_fehlt": "nicht festgehalten",
  "belege.karte.vorbedingungen": "Vorbedingungen",
  "belege.karte.grenzen": "Grenzen",
  "belege.karte.ergebnis": "Ergebnis",
  "belege.karte.tokens": "Token",
  "belege.karte.tokens_wert": "{rein} rein, {raus} raus",
  "belege.karte.installation": "Installation",
  "belege.karte.schluessel": "Schlüssel",
  "belege.karte.software": "Software",
  "belege.karte.neuer_schluessel": "Neuer Schlüssel",
  "belege.karte.bisheriger_schluessel": "Bisheriger",
  "belege.karte.beglaubigung": "Beglaubigt",
  "belege.karte.beglaubigt": "ja, vom bisherigen Schlüssel signiert",
  "belege.karte.nicht_beglaubigt": "nein, nur vom neuen Schlüssel signiert",
  "belege.karte.ergebnis_beleg": "Ergebnis-Beleg",
  "belege.karte.entscheidungs_beleg": "Entscheidungs-Beleg",
  "belege.karte.kennung": "Kennung",
  "belege.karte.kette": "Kette",
  "belege.karte.enthaelt": "Enthält die Prüfsumme von {kennung}.",
  "belege.stufe.ask": "fragen",
  "belege.stufe.prepare": "vorbereiten",
  "belege.stufe.execute": "ausführen",
  "belege.vorbedingung.ok": "erfüllt",
  "belege.vorbedingung.verletzt": "nicht erfüllt",
  "belege.vorbedingung.entfaellt": "trifft hier nicht zu",
  "belege.grenze.ok": "eingehalten",
  "belege.grenze.verletzt": "verletzt",
  "belege.grenze.entfaellt": "trifft hier nicht zu",
  "belege.technik.titel": "Technische Ansicht",
  "belege.technik.text":
    "Genau so steht der Beleg in der Kette. Die Prüfsumme läuft über das kanonische JSON, die Signatur über die Prüfsumme.",
  "belege.technik.pruefsumme": "Prüfsumme",
  "belege.technik.signatur": "Signatur",
  "belege.technik.schluessel": "Schlüssel",
  "belege.technik.vorgaenger": "Vorgänger",
  "belege.technik.kennung": "Kennung",
  "belege.technik.json": "Kanonisches JSON des Belegs",
  "belege.technik.kopieren": "Beleg kopieren",
  "belege.technik.kopieren_label": "Beleg als eine Zeile im Format des Exports kopieren",
  "belege.erklaerung.beleg.titel": "Was ein Beleg ist",
  "belege.erklaerung.beleg.text":
    "Bevor etwas passiert, prüft ein Tor mit festen Regeln, ob es erlaubt ist. Dabei arbeitet keine KI mit. Der Beleg hält fest, welche Regel galt, was geprüft wurde und wann.",
  "belege.erklaerung.kette.titel": "Die Kette",
  "belege.erklaerung.kette.text":
    "Jeder Beleg enthält die Prüfsumme des vorigen. Ändert jemand einen alten Beleg oder fehlt einer mittendrin, fällt es beim Prüfen auf.",
  "regeln.seite": "Regeln",
  "regeln.vorspann":
    "Jede Aktion muss durch ein Tor. Dort prüft eine feste Regel-Maschine ohne KI, welche Regel passt. Erst dann geht es weiter, mit Beleg.",
  "regeln.weg.label": "So läuft eine Aktion durch das Tor",
  "regeln.weg.aktion": "Aktion",
  "regeln.weg.aktion.text": "du oder dein Bot will etwas tun",
  "regeln.weg.tor": "Tor",
  "regeln.weg.tor.text": "feste Regeln, keine KI",
  "regeln.weg.beleg": "Beleg",
  "regeln.weg.beleg.text": "Regel, Prüfung, Zeit",
  "regeln.regeln.titel": "Regeln",
  "regeln.regeln.stand": "Regelstand {stand}, kleinere Priorität zuerst",
  "regeln.grenzen.titel": "Grenzen",
  "regeln.grenzen.zusatz": "gelten immer, vor den Regeln",
  "regeln.vorbedingungen.titel": "Vorbedingungen",
  "regeln.vorbedingungen.zusatz": "prüft das Tor zuerst",
  "regeln.fest": "Diese Regeln sind fest eingebaut.",
  "regeln.alle_aktionen": "alle Aktionen",
  "regeln.gilt": "Gilt für: {aktionen} · Fassung {fassung}",
  "regeln.gilt_aktionen": "Gilt für: {aktionen}",
  "regeln.wirkung.allow": "erlaubt, mit Beleg",
  "regeln.wirkung.deny": "lehnt ab",
  "regeln.wirkung.ask": "fragt",
  "regeln.wirkung.grenze": "sonst abgelehnt",
  "regeln.stufe.ask": "fragen",
  "regeln.stufe.prepare": "vorbereiten",
  "regeln.stufe.execute": "ausführen mit Beleg",
  "regeln.stufe.lehnt_ab": "lehnt ab",
  "regeln.nachweis.sitzung": "Sitzung",
  "regeln.nachweis.passwort": "Passwort",
  "regeln.nachweis.einrichtungs_code": "Einrichtungs-Code",
  "regeln.bedingung.besitzer": "wenn du es auslöst",
  "regeln.bedingung.bot": "wenn dein Bot es auslöst",
  "regeln.bedingung.bot_der_unterhaltung": "nur der Bot dieser Unterhaltung",
  "regeln.bedingung.nachweis": "Nachweis: {nachweise}",
  "regeln.bedingung.nicht_nachweis": "bei jedem anderen Nachweis als {nachweis}",
  "regeln.bedingung.weitere": "mit weiteren Bedingungen",
  "regeln.grenze.G-01":
    "Ist die Datenschleuse gefordert, geht eine Anfrage nur über sie, und sie muss erreichbar sein.",
  "regeln.grenze.G-02": "Der Anbieter ist eingeschaltet, und seine Region ist EU oder lokal.",
  "regeln.grenze.G-03": "Eingabe und Ausgabe bleiben unter der eingestellten Länge.",
  "regeln.grenze.G-04": "Ist ein Tagesbudget gesetzt, bleibt der Verbrauch des Tages darunter.",
  "regeln.grenze.G-05": "Ist der Not-Aus an, lehnt das Tor jede Aktion deines Bots ab.",
  "regeln.vorbedingung.V-01": "Die Unterhaltung gibt es.",
  "regeln.vorbedingung.V-02": "In der Unterhaltung läuft gerade keine Antwort.",
  "regeln.vorbedingung.V-03": "Es läuft eine Antwort, die sich abbrechen lässt.",
  "regeln.vorbedingung.V-04": "Zum Einschalten muss die Datenschleuse eingerichtet sein.",
  "regeln.vorbedingung.V-05": "Der Lauf deines Bots läuft gerade.",
  "regeln.vorbedingung.V-06": "Dein aktuelles Passwort ist bestätigt.",
  "regeln.vorbedingung.V-07": "Die Einrichtung ist noch offen.",
  "regeln.vorbedingung.V-08": "Der Aufruf wartet auf deine Freigabe.",
  "regeln.vorbedingung.V-09": "Die Freigabe passt genau zum Aufruf.",

  // Nachrunde Oberfläche: Navigation, Zustand der Datenschleuse, Fehler der Datenschleuse
  "seite.regeln": "Regeln",
  "navigation.modelle.keine": "noch keins",
  "datenschleuse.worker.chip.bereit": "bereit",
  "datenschleuse.worker.chip.nicht_erreichbar": "nicht erreichbar",
  "datenschleuse.worker.chip.schluessel_falsch": "Schlüssel passt nicht",
  "datenschleuse.worker.chip.aus": "nicht eingerichtet",
  "datenschleuse.worker.chip.veraltet": "Worker meldet sich nicht",
  "datenschleuse.worker.geprueft": "Zuletzt vom Worker geprüft: {zeit}.",
  "datenschleuse.worker.veraltet":
    "Der Worker hat sich seit {zeit} nicht gemeldet. Der Zustand ist deshalb vielleicht nicht mehr aktuell.",
  "datenschleuse.worker.veraltet.ausweg":
    "Prüf mit „docker compose ps“, ob der Dienst worker läuft, und sieh in sein Log.",
  "datenschleuse.worker.keine":
    "Der Worker hat noch keinen Zustand gemeldet. Er prüft die Datenschleuse gleich nach dem Start und danach alle 30 Sekunden.",
  "datenschleuse.worker.hinweis":
    "Die Web-App erreicht die Datenschleuse nicht selbst. Der Worker prüft sie beim Start und danach alle 30 Sekunden und hält das Ergebnis fest.",
  "fehler.schluessel_passt_nicht":
    "Die Datenschleuse nimmt den Schlüssel von PaiBot nicht an. Die Nachricht wurde nicht an das Modell geschickt.",
  "fehler.schluessel_passt_nicht.ausweg":
    "Das betrifft SCHLEUSE_KEY in deploy/.env, nicht den Schlüssel des Anbieters. Prüf den Wert und starte Worker und Datenschleuse neu.",
  "fehler.antwort_zu_gross": "Die Antwort war größer als erlaubt und wurde abgebrochen.",
  "fehler.antwort_zu_gross.ausweg":
    "Bitte um eine kürzere Antwort oder teil die Frage in mehrere Nachrichten auf.",
  "schleuse.fehler.blockiert":
    "Die Datenschleuse hat die Anfrage gestoppt. An das Modell ging nichts.",
  "schleuse.fehler.blockiert.ausweg":
    "Sieh auf der Seite Datenschleuse nach, ob sie bereit ist, oder schalte sie für diese Unterhaltung aus.",
  "schleuse.fehler.nicht_erreichbar":
    "Die Datenschleuse war nicht bereit. Die Nachricht wurde nicht verschickt.",
  "schleuse.fehler.nicht_erreichbar.ausweg":
    "Prüf mit „docker compose ps“, ob datenschleuse und schleuse-analyzer laufen. Die Seite Datenschleuse zeigt, was der Worker zuletzt geprüft hat.",
  "schleuse.fehler.schluessel_passt_nicht":
    "Die Datenschleuse nimmt den Schlüssel von PaiBot (SCHLEUSE_KEY) nicht an. Die Nachricht wurde nicht verschickt.",
  "schleuse.fehler.schluessel_passt_nicht.ausweg":
    "Prüf SCHLEUSE_KEY in deploy/.env und starte Worker und Datenschleuse neu, damit beide denselben Wert haben.",
  "schleuse.fehler.antwort_zu_gross":
    "Die Antwort über die Datenschleuse war größer als erlaubt und wurde abgebrochen.",
  "schleuse.fehler.antwort_zu_gross.ausweg":
    "Bitte um eine kürzere Antwort oder teil die Frage in mehrere Nachrichten auf.",
  "modelle.anbieter.name.lokal": "Lokaler Anbieter",
  "modelle.anbieter.name.eigener": "Eigener Anbieter",

  // Schutz von Anmeldung und Eingängen
  "einrichtung.code.log_frist":
    "Einrichtungs-Code: {code} (gilt 24 Stunden, längstens bis zum Ende der Einrichtung)",
  // Nacharbeit Belege-Seite: Filter nach Aktion und Unterhaltung, Schlüssel der Installation
  "belege.filter.aktion": "Aktion",
  "belege.filter.aktion.alle": "Jede Aktion",
  "belege.filter.unterhaltung": "Unterhaltung",
  "belege.filter.unterhaltung.alle": "Jede Unterhaltung",
  "belege.schluessel.titel": "Schlüssel dieser Installation",
  "belege.schluessel.text":
    "PaiBot signiert jeden Beleg mit diesem Schlüssel. Den privaten Teil kennt nur dein Server; hier steht der öffentliche Teil, mit dem sich die Signaturen prüfen lassen.",
  "belege.schluessel.kurzform": "Kurzform",
  "belege.schluessel.kennung": "Kennung",
  "belege.schluessel.seit": "Seit",
  "belege.schluessel.vergleich":
    "Die Kurzform ist eine Prüfsumme des Schlüssels. Dieselbe Kurzform nennt „Beleg prüfen“ bei jedem Beleg, und sie steht im Kopf des Exports. Notiere sie dir: Weicht sie später ab, wurde der Schlüssel gewechselt.",
  "belege.schluessel.anzeigen": "Öffentlichen Schlüssel anzeigen",
  "belege.schluessel.frueher": "Frühere Schlüssel",
  "belege.schluessel.frueher_zeit": "von {seit} bis {bis}",

  // Eigener oder lokaler Anbieter: Texte ohne „Konto bei …“
  "modelle.liste.leer.ausweg_eigen":
    "Versuch es später noch einmal oder prüf, welche Modelle {anbieter} bereitstellt.",
  "einrichtung.schluessel.text_eigen":
    "Über {anbieter} erreicht PaiBot Sprachmodelle. Den Schlüssel bekommst du dort, wo dein Dienst eingerichtet ist. Du kannst diesen Schritt auch später erledigen.",

  // Schutz von Anmeldung und Eingängen, zweite Runde
  "anfrage.zu_viele_gleichzeitig":
    "Gerade kommen zu viele Anfragen gleichzeitig an. Versuch es in ein paar Sekunden noch einmal.",
  "einrichtung.code.vorhanden_frueher":
    "Einrichtung offen: Der Einrichtungs-Code wurde am {zeit} erzeugt. Er steht im Log des Starts, der ihn erzeugt hat, nicht in diesem, und gilt 24 Stunden, längstens bis zum Ende der Einrichtung. Code nicht mehr zur Hand: Migrations-Schritt erneut starten (Dienst migrate, z. B. docker compose up -d), dann die Seite „Einrichtung“ neu laden; der neue Code steht danach im Log von web.",
  "aktion.geraet.hinzufuegen": "Gerät hinzugefügt",
  "aktion.geraet.entfernen": "Gerät entfernt",

  // Bekannte Geräte und Hinweis bei neuer Anmeldung
  "aktion.geraet.bestaetigen": "Neue Anmeldung bestätigt",
  "einstellungen.geraete": "Bekannte Geräte",
  "einstellungen.geraete.text":
    "Browser, in denen du dich angemeldet hast. Ein bekanntes Gerät kommt auch dann hinein, wenn die Anmeldung wegen vieler Fehlversuche gerade gebremst wird. Entferne Geräte, die du nicht mehr benutzt oder nicht kennst; ihre Sitzungen enden sofort.",
  "einstellungen.geraete.leer":
    "Es gibt gerade kein bekanntes Gerät. Ein Gerät kommt dazu, sobald du dich in einem Browser anmeldest.",
  "einstellungen.geraete.fehler": "Die Geräte lassen sich gerade nicht laden.",
  "einstellungen.geraet.diese": "dieses Gerät",
  "einstellungen.geraet.zuerst": "zuerst gesehen am {zeit}",
  "einstellungen.geraet.zuletzt": "zuletzt gesehen am {zeit}",
  "einstellungen.geraet.bis": "gültig bis {zeit}",
  "einstellungen.geraet.entfernen": "Entfernen",
  "einstellungen.geraet.entfernen_label": "{geraet} entfernen",
  "einstellungen.geraet.entfernen_titel": "Gerät entfernen?",
  "einstellungen.geraet.rueckfrage":
    "„{geraet}“ ist danach kein bekanntes Gerät mehr. Alle Sitzungen dieses Geräts enden sofort; wer es benutzt, muss sich neu mit dem Passwort anmelden.",
  "einstellungen.geraet.rueckfrage_dieses":
    "Das ist der Browser, den du gerade benutzt. Entfernst du ihn, wirst du hier sofort abgemeldet und landest auf der Anmeldung.",
  "einstellungen.geraet.laeuft": "Wird entfernt …",
  "einstellungen.geraet.entfernt": "Gerät entfernt: {geraet}. Seine Sitzungen sind beendet.",
  "einstellungen.geraet.weg":
    "Dieses Gerät gibt es nicht mehr, vielleicht wurde es schon entfernt. Die Liste ist neu geladen.",
  "hinweis.neu.region": "Hinweis auf neue Anmeldung",
  "hinweis.neu.titel": "Neue Anmeldung von einem neuen Gerät",
  "hinweis.neu.titel_mehrere": "Neue Anmeldungen von {anzahl} neuen Geräten",
  "hinweis.neu.zeile": "{geraet}, am {zeit}",
  "hinweis.neu.text": "Warst du das? Wenn nicht, sichere deinen Zugang jetzt.",
  "hinweis.neu.ich": "Das war ich",
  "hinweis.neu.nicht_ich": "Das war ich nicht",
  "hinweis.neu.laeuft": "Wird bestätigt …",
  "hinweis.neu.bestaetigt": "Danke. Der Hinweis ist auf diesem Gerät geschlossen.",
  "hinweis.neu.sichern_titel": "So sicherst du deinen Zugang",
  "hinweis.neu.sichern_passwort":
    "Passwort ändern: beendet alle anderen Sitzungen und entfernt alle anderen Geräte; dieser Browser bleibt angemeldet. Das ist der beste erste Schritt.",
  "hinweis.neu.sichern_alle":
    "Alle Sitzungen beenden: meldet überall ab, auch hier. Danach meldest du dich neu an.",
  "hinweis.neu.zum_passwort": "Passwort ändern",
  "hinweis.neu.zu_alle": "Zu „Alle Sitzungen beenden“",
  "belege.karte.geraet": "Gerät",
  "belege.karte.geraet_weg": "nicht mehr im Verzeichnis",

  // Eigener Anbieter in der Oberfläche: anlegen, ändern, testen, abgleichen, entfernen
  "modelle.eigen.titel": "Eigener Anbieter",
  "modelle.eigen.text":
    "Verbinde zusätzlich einen eigenen Dienst mit kompatibler Schnittstelle, zum Beispiel einen, der auf deinem Rechner oder in deinem Netz läuft.",
  "modelle.eigen.hinzufuegen": "Eigenen Anbieter hinzufügen",
  "modelle.eigen.form.neu": "Neuer eigener Anbieter",
  "modelle.eigen.form.aendern": "{anbieter} ändern",
  "modelle.eigen.name": "Name",
  "modelle.eigen.name.hilfe": "So heißt der Anbieter in PaiBot, zum Beispiel „Lokaler Anbieter“.",
  "modelle.eigen.name.leer": "Gib dem Anbieter einen Namen.",
  "modelle.eigen.adresse": "Adresse (Basis-URL)",
  "modelle.eigen.adresse.hilfe":
    "Die Adresse, unter der der Dienst seine Modelle anbietet, meist mit /v1 am Ende.",
  "modelle.eigen.adresse.leer": "Gib die Adresse des Dienstes ein.",
  "modelle.eigen.adresse_doppelt":
    "Für diese Adresse gibt es schon einen Anbieter. Ändere ihn, statt einen zweiten anzulegen.",
  "modelle.eigen.ort": "Wo läuft der Dienst?",
  "modelle.eigen.ort.eu": "Bei einem Dienst in der EU",
  "modelle.eigen.ort.non_eu": "Bei einem Dienst außerhalb der EU",
  "modelle.eigen.ort.local": "Auf deinem Rechner oder in deinem Netz (lokal)",
  "modelle.eigen.ort.hilfe":
    "Öffentliche Dienste brauchen eine Adresse mit https:// und einen Schlüssel.",
  "modelle.eigen.ort.hilfe.local":
    "Nur bei „lokal“ sind Adressen im eigenen Netz und http:// erlaubt. Die Dienste von PaiBot selbst (Datenbank, Datenschleuse, Web-App, Worker) bleiben gesperrt.",
  "modelle.eigen.warnung.unverschluesselt":
    "Die Verbindung ist unverschlüsselt (http://). Nutz das nur auf deinem Rechner oder in einem Netz, dem du vertraust.",
  "modelle.eigen.schluessel": "Schlüssel",
  "modelle.eigen.schluessel.optional": "Schlüssel (bei „lokal“ freiwillig)",
  "modelle.eigen.schluessel.hilfe.neu":
    "Bei einem lokalen Dienst ohne Schlüssel lässt du das Feld leer. PaiBot speichert nur, was der Dienst beim Test annimmt.",
  "modelle.eigen.schluessel.hilfe.aendern":
    "Leer lassen, um den gespeicherten Schlüssel zu behalten. Ändert sich die Adresse, gib ihn noch einmal ein.",
  "modelle.eigen.schluessel.entfernen": "Gespeicherten Schlüssel entfernen",
  "modelle.eigen.schluessel.entfernen.hilfe":
    "PaiBot verbindet sich danach ohne Schlüssel. Das geht nur bei einem lokalen Dienst.",
  "modelle.eigen.ohne_schluessel_nur_lokal":
    "Ohne Schlüssel geht es nur bei einem lokalen Dienst. Wähl „lokal“ oder trag einen Schlüssel ein.",
  "modelle.eigen.vorlage_bleibt":
    "Die Vorlage eines Anbieters lässt sich nicht ändern. Leg dafür einen neuen eigenen Anbieter an.",
  "modelle.eigen.speichern": "Testen und speichern",
  "modelle.eigen.speichert": "Teste und speichere …",
  "modelle.eigen.speichern.hilfe":
    "PaiBot testet die Verbindung vor dem Speichern. Gespeichert wird nur, was der Dienst annimmt.",
  "modelle.eigen.gespeichert": "{anbieter} ist gespeichert. Die Verbindung steht.",
  "modelle.eigen.aendern": "Ändern",
  "modelle.eigen.auswahl": "Angezeigter Anbieter",
  "modelle.eigen.auswahl.hilfe":
    "Die Angaben und die Modell-Liste unten gehören zu diesem Anbieter.",
  "modelle.eigen.entfernen": "Anbieter entfernen",
  "modelle.eigen.entfernen.titel": "{anbieter} entfernen?",
  "modelle.eigen.entfernen.text":
    "Damit entfernst du {anbieter} samt Schlüssel und Modell-Liste. Frühere Antworten in deinen Unterhaltungen bleiben erhalten.",
  "modelle.eigen.entfernen.modell":
    "{name} arbeitet gerade mit {modell} von {anbieter}. Danach hat {name} kein Modell mehr, bis du ein anderes wählst.",
  "modelle.eigen.entfernt": "{anbieter} ist entfernt.",
  "modelle.eigen.lauf_aktiv": "{name} schreibt gerade mit einem Modell von {anbieter}.",
  "modelle.eigen.lauf_aktiv.ausweg":
    "Warte, bis die Antwort fertig ist, oder brich sie im Chat ab. Danach kannst du den Anbieter entfernen.",
  "modelle.liste.abgleichen": "Liste abgleichen",
  "modelle.liste.abgeglichen": "Liste abgeglichen: {anzahl} Modelle.",
  // Not-Aus („Alle Bots anhalten“) und Selbsttest
  "aktion.notaus.umschalten": "Not-Aus umgeschaltet",
  "regel.V-10": "Passwort zum Aufheben bestätigt",
  "regeln.vorbedingung.V-10": "Zum Aufheben des Not-Aus ist dein aktuelles Passwort bestätigt.",
  "fehler.angehalten": "Alle Bots sind angehalten.",
  "fehler.angehalten.ausweg":
    "Hebe den Not-Aus auf (Knopf „Fortsetzen“ oben in der Seitenleiste, mit deinem Passwort), dann antwortet dein Bot wieder.",
  "notaus.knopf.laufen": "Alle Bots laufen",
  "notaus.knopf.laufen_zusatz": "Not-Aus",
  "notaus.knopf.anhalten": "Anhalten",
  "notaus.knopf.angehalten": "Angehalten",
  "notaus.knopf.angehalten_zusatz": "nichts läuft",
  "notaus.knopf.fortsetzen": "Fortsetzen",
  "notaus.knopf.name_aus": "Not-Aus: alle Bots anhalten",
  "notaus.knopf.name_an": "Not-Aus ist an. Fortsetzen",
  "notaus.leiste.titel": "Alle Bots sind angehalten.",
  "notaus.leiste.text":
    "Dein Bot nimmt keine Nachrichten an und fragt kein Modell an, bis du fortsetzt. Eine laufende Antwort wurde abgebrochen. Beides steht mit Beleg unter Belege.",
  "notaus.dialog.schliessen": "Schließen",
  "notaus.dialog.abbrechen": "Abbrechen",
  "notaus.dialog.an.titel": "Alle Bots anhalten?",
  "notaus.dialog.an.text":
    "Eine laufende Antwort bricht sofort ab, und dein Bot nimmt keine neuen Nachrichten an, bis du fortsetzt. Du selbst kannst weiter alles ansehen und einstellen.",
  "notaus.dialog.an.hinweis": "Zum Fortsetzen brauchst du später dein aktuelles Passwort.",
  "notaus.dialog.an.ja": "Alle Bots anhalten",
  "notaus.dialog.aus.titel": "Not-Aus aufheben?",
  "notaus.dialog.aus.text":
    "Bestätige mit deinem aktuellen Passwort. Danach nimmt dein Bot wieder Nachrichten an.",
  "notaus.dialog.aus.passwort": "Aktuelles Passwort",
  "notaus.dialog.aus.leer": "Gib dein aktuelles Passwort ein.",
  "notaus.dialog.aus.ja": "Fortsetzen",
  "notaus.laeuft": "Einen Moment …",
  "notaus.erfolg.an": "Alle Bots sind angehalten.",
  "notaus.erfolg.aus": "Der Not-Aus ist aufgehoben. Dein Bot antwortet wieder.",
  "notaus.chat.angehalten": "Angehalten, bevor {name} geantwortet hat.",
  "notaus.chat.angehalten_teil": "Angehalten (Not-Aus). Der Text bis hierhin bleibt stehen.",
  "notaus.chat.eingabe": "Alle Bots sind angehalten. Setze oben fort, um weiterzuschreiben.",
  "seite.selbsttest": "Selbsttest",
  "einstellungen.reiter.selbsttest": "Selbsttest",
  "selbsttest.titel": "Ist meine Installation richtig eingestellt?",
  "selbsttest.vorspann":
    "PaiBot prüft hier, was es von innen sehen kann: Adresse, Proxy, Verbindung, Datenbank, Worker. Zu jedem Punkt steht, was du tun kannst. Die Prüfung fragt nichts außerhalb deines Servers ab.",
  "selbsttest.laedt": "PaiBot prüft deine Installation …",
  "selbsttest.erneut": "Erneut prüfen",
  "selbsttest.geprueft": "Geprüft um {zeit}",
  "selbsttest.summe": "{ok} in Ordnung · {hinweis} Hinweise · {fehler} Fehler",
  "selbsttest.ergebnis.ok": "In Ordnung",
  "selbsttest.ergebnis.hinweis": "Hinweis",
  "selbsttest.ergebnis.fehler": "Fehler",
  "selbsttest.ausweg": "So behebst du es",
  "selbsttest.liste": "Prüfungen",
  "selbsttest.selbst.titel": "Bitte selbst prüfen",
  "selbsttest.selbst.vorspann":
    "Diese Punkte kann PaiBot von innen nicht wissen. Prüfe sie selbst, am besten nach jeder größeren Änderung an deinem Server.",
  "selbsttest.selbst.proxy":
    "Grenzen im Reverse-Proxy: Der Proxy begrenzt die Größe einer Anfrage und die Zahl gleichzeitiger Anfragen je Adresse, bevor sie PaiBot erreichen.",
  "selbsttest.selbst.sicherung":
    "Sicherung: Es gibt eine aktuelle Sicherung, und du hast sie mindestens einmal zur Probe in eine frische Installation zurückgespielt. Wie das geht, steht in der Doku unter „Sicherung und Wiederherstellung“.",
  "selbsttest.selbst.updates":
    "Updates: Du verfolgst neue Versionen und spielst sie zeitnah ein. PaiBot fragt selbst nicht nach außen, ob es eine neue gibt.",
  "selbsttest.selbst.images":
    "Herkunft: Du beziehst PaiBot aus der offiziellen Quelle des Projekts und nicht aus einer Kopie.",
  "selbsttest.fehler.laden": "Der Selbsttest konnte nicht geladen werden.",
  "selbsttest.unbekannt": "Konnte gerade nicht geprüft werden.",
  "selbsttest.unbekannt.ausweg": "Lade die Seite in ein paar Sekunden neu.",
  "selbsttest.adresse.titel": "Adresse (APP_URL)",
  "selbsttest.adresse.ok":
    "APP_URL beginnt mit https:// und passt zur Adresse, über die du diese Seite geöffnet hast.",
  "selbsttest.adresse.fehlt": "APP_URL ist nicht gesetzt.",
  "selbsttest.adresse.fehlt.ausweg":
    "Setze APP_URL auf die Adresse, unter der du PaiBot im Browser öffnest (z. B. https://paibot.example.de), und starte den Dienst web neu.",
  "selbsttest.adresse.http":
    "APP_URL beginnt mit http://. Passwort und Sitzung gehen dann unverschlüsselt über das Netz.",
  "selbsttest.adresse.http.ausweg":
    "Stelle PaiBot hinter einen Reverse-Proxy mit Zertifikat, setze APP_URL auf https://… und starte den Dienst web neu.",
  "selbsttest.adresse.anders":
    "Du hast diese Seite über eine andere Adresse geöffnet, als in APP_URL steht. Anmelden und Speichern scheitern dann an der Herkunftsprüfung.",
  "selbsttest.adresse.anders.ausweg":
    "Öffne PaiBot über die Adresse aus APP_URL, oder trage dort die Adresse ein, die du benutzt, und starte den Dienst web neu.",
  "selbsttest.proxy.titel": "Vorgeschalteter Proxy (TRUST_PROXY)",
  "selbsttest.proxy.ok_mit":
    "TRUST_PROXY=1, und der Proxy reicht die Adresse deines Browsers weiter. Die Limits je Adresse greifen.",
  "selbsttest.proxy.ok_ohne": "Kein Proxy erkannt, und TRUST_PROXY ist aus. Das passt zusammen.",
  "selbsttest.proxy.ohne_adresse":
    "TRUST_PROXY=1, aber bei dieser Anfrage kam keine weitergereichte Adresse an. Steht kein Proxy davor, kann jeder eine Adresse vortäuschen und die Limits je Adresse umgehen.",
  "selbsttest.proxy.ohne_adresse.ausweg":
    "Ohne Proxy: TRUST_PROXY=0 setzen. Mit Proxy: prüfen, dass er X-Forwarded-For setzt, und den Port der App nie direkt freigeben.",
  "selbsttest.proxy.nicht_vertraut":
    "Ein Proxy reicht Adressen weiter, aber TRUST_PROXY ist nicht 1. Dann sehen alle Anfragen gleich aus, und die Limits beim Anmelden treffen alle zugleich.",
  "selbsttest.proxy.nicht_vertraut.ausweg": "Setze TRUST_PROXY=1 und starte den Dienst web neu.",
  "selbsttest.verbindung.titel": "Verbindung deines Browsers",
  "selbsttest.verbindung.ok": "Dein Browser spricht verschlüsselt (https) mit PaiBot.",
  "selbsttest.verbindung.lokal":
    "Dein Browser spricht unverschlüsselt (http) mit PaiBot. Auf dem eigenen Rechner geht das, über ein Netz nicht.",
  "selbsttest.verbindung.offen":
    "Dein Browser spricht unverschlüsselt (http) mit PaiBot. Passwort und Antworten lassen sich unterwegs mitlesen.",
  "selbsttest.verbindung.ausweg":
    "Öffne PaiBot über https. Dafür braucht es einen Reverse-Proxy mit Zertifikat.",
  "selbsttest.kopfzeilen.titel": "Schutz-Kopfzeilen",
  "selbsttest.kopfzeilen.ok":
    "Die Seite kommt mit allen Schutz-Kopfzeilen an (Content-Security-Policy, HSTS und weitere).",
  "selbsttest.kopfzeilen.ok_http":
    "Die Seite kommt mit den Schutz-Kopfzeilen an. HSTS gilt nur über https und fehlt deshalb hier.",
  "selbsttest.kopfzeilen.fehlen": "Bei deinem Browser kommen diese Kopfzeilen nicht an: {liste}.",
  "selbsttest.kopfzeilen.fehlen.ausweg":
    "PaiBot setzt sie selbst. Prüfe, ob dein Reverse-Proxy Kopfzeilen der App entfernt oder überschreibt.",
  "selbsttest.kopfzeilen.hsts":
    "Die Seite kommt über https, aber ohne HSTS an. Der Browser merkt sich dann nicht, dass PaiBot nur verschlüsselt erreichbar ist.",
  "selbsttest.kopfzeilen.hsts.ausweg":
    "PaiBot setzt HSTS, wenn APP_URL mit https:// beginnt. Prüfe APP_URL und ob dein Reverse-Proxy die Kopfzeile entfernt.",
  "selbsttest.rolle.titel": "Rechte der Datenbank-Rolle",
  "selbsttest.rolle.ok":
    "Die App arbeitet mit einer eingeschränkten Rolle: Sie kann Belege, Regeln und Schlüssel nicht ändern oder löschen.",
  "selbsttest.rolle.zu_viel": "Die Datenbank-Verbindung der App hat zu viele Rechte: {gruende}.",
  "selbsttest.rolle.zu_viel.ausweg":
    "Starte den Migrations-Schritt erneut (Dienst migrate); er richtet die eingeschränkte App-Rolle ein. DATABASE_URL bei web und worker muss diese App-Rolle nutzen, nicht den Hauptzugang der Datenbank.",
  "selbsttest.schalter.titel": "Schalter PAIBOT_ALLOW_PRIVILEGED_DB",
  "selbsttest.schalter.ok":
    "Der Schalter ist aus. Mit zu vielen Rechten würde PaiBot nicht starten.",
  "selbsttest.schalter.an":
    "Der Schalter ist an. Damit startet PaiBot auch dann, wenn die Datenbank-Rolle zu viele Rechte hat.",
  "selbsttest.schalter.an.ausweg":
    "Entferne PAIBOT_ALLOW_PRIVILEGED_DB bei web und worker, sobald die Rolle eingeschränkt ist, und starte beide neu.",
  "selbsttest.migrationen.titel": "Stand der Datenbank",
  "selbsttest.migrationen.ok": "Die Datenbank ist auf dem Stand dieser Version.",
  "selbsttest.migrationen.veraltet":
    "In der Datenbank fehlen Migrationen dieser Version ({angewendet} von {erwartet}).",
  "selbsttest.migrationen.veraltet.ausweg":
    "Starte den Migrations-Schritt erneut (Dienst migrate, z. B. docker compose up -d).",
  "selbsttest.migrationen.neuer":
    "Die Datenbank kennt neuere Migrationen als diese Version. Vermutlich läuft hier eine ältere Version als zuletzt.",
  "selbsttest.migrationen.neuer.ausweg":
    "Starte die Version, mit der die Datenbank zuletzt lief, oder spiele eine passende Sicherung zurück.",
  "selbsttest.worker.titel": "Worker",
  "selbsttest.worker.ok": "Der Worker meldet sich regelmäßig, zuletzt um {zeit}.",
  "selbsttest.worker.nie":
    "Der Worker hat sich noch nie gemeldet. Ohne Worker antwortet dein Bot nicht.",
  "selbsttest.worker.veraltet":
    "Der Worker meldet sich seit {zeit} nicht mehr. Ohne Worker antwortet dein Bot nicht.",
  "selbsttest.worker.ausweg":
    "Prüfe, ob der Dienst worker läuft (z. B. docker compose ps), und sieh in sein Log.",
  "selbsttest.schleuse.titel": "Datenschleuse",
  "selbsttest.schleuse.aus":
    "Die Datenschleuse ist nicht eingerichtet. Sie ist freiwillig; ohne sie gehen Anfragen direkt zum Anbieter.",
  "selbsttest.schleuse.bereit": "Die Datenschleuse ist eingerichtet und bereit.",
  "selbsttest.schleuse.unbekannt":
    "Wie es der Datenschleuse geht, ist unbekannt, weil sich der Worker nicht meldet.",
  "selbsttest.einrichtung.titel": "Einrichtung",
  "selbsttest.einrichtung.ok": "Die Einrichtung ist abgeschlossen.",
  "selbsttest.einrichtung.offen": "Die Einrichtung ist noch nicht abgeschlossen.",
  "selbsttest.einrichtung.offen.ausweg": "Schließe die Einrichtung unter /einrichtung ab.",
  "selbsttest.zugang.titel": "Geräte und Sitzungen",
  "selbsttest.zugang.text": "Bekannte Geräte: {geraete}. Offene Sitzungen: {sitzungen}.",
  "selbsttest.zugang.ausweg":
    "Kennst du ein Gerät oder eine Sitzung nicht? Beende unter Einstellungen → Zugang alle Sitzungen und ändere dein Passwort.",
  "selbsttest.notaus.titel": "Not-Aus",
  "selbsttest.notaus.aus": "Der Not-Aus ist aus. Deine Bots laufen.",
  "selbsttest.notaus.an": "Der Not-Aus ist an. Alle Bots sind angehalten.",
  "selbsttest.notaus.an.ausweg":
    "Hebe den Not-Aus auf, wenn alles wieder in Ordnung ist (Knopf „Fortsetzen“ oben in der Seitenleiste).",
  "selbsttest.version.titel": "Version",
  "selbsttest.version.text":
    "Hier läuft PaiBot {stand}. Ob es eine neuere Version gibt, prüft PaiBot nicht selbst.",
  // Chat-Ergänzungen: suchen, als Datei sichern, neu erzeugen
  "aktion.unterhaltung.exportieren": "Unterhaltung als Datei gesichert",
  "aktion.antwort.neu_erzeugen": "Antwort neu erzeugt",
  "regel.V-11": "Letzte Antwort",
  "regeln.vorbedingung.V-11": "Neu erzeugt wird nur die letzte Antwort der Unterhaltung.",
  "suche.label": "Unterhaltungen durchsuchen",
  "suche.platzhalter": "Unterhaltungen durchsuchen",
  "suche.leeren": "Suche leeren",
  "suche.zu_kurz": "Gib mindestens zwei Zeichen ein.",
  "suche.laedt": "Sucht …",
  "suche.keine": "Nichts gefunden für „{suchwort}“.",
  "suche.keine.ausweg": "Prüf die Schreibweise oder versuch ein kürzeres Wort.",
  "suche.fehler": "Die Suche hat gerade nicht geklappt.",
  "suche.titel": "Titel",
  "suche.nachrichten": "Nachrichten",
  "suche.ergebnisse": "Treffer der Suche",
  "suche.anzahl": "{anzahl} Treffer",
  "suche.anzahl_mehr": "Mehr als {anzahl} Treffer",
  "suche.mehr": "Weitere Treffer laden",
  "suche.von.du": "Du",
  "suche.von.bot": "{name}",
  "suche.hinweis": "Pfeil nach unten springt zu den Treffern, Esc leert die Suche.",
  "chat.stelle.nicht_da": "Die gesuchte Nachricht gibt es in dieser Unterhaltung nicht mehr.",
  "chat.sichern": "Als Datei sichern",
  "chat.sichern.titel": "Unterhaltung als Datei sichern",
  "chat.sichern.text":
    "PaiBot erstellt eine lesbare Textdatei (Markdown) mit allen Nachrichten dieser Unterhaltung: Titel, Datum, wer wann was geschrieben hat.",
  "chat.sichern.hinweis":
    "Die Datei enthält persönliche Inhalte aus deiner Unterhaltung. Bewahre sie sicher auf und gib sie nur weiter, wenn du das willst.",
  "chat.sichern.leer":
    "In dieser Unterhaltung gibt es noch keine Nachricht. Die Datei enthält dann nur den Titel.",
  "chat.sichern.knopf": "Datei sichern",
  "chat.sichern.laeuft": "Wird gesichert …",
  "chat.sichern.fertig": "Gesichert als {datei}. Zum Export gibt es einen Beleg.",
  "chat.sichern.lauf": "Während {name} antwortet, fehlt die laufende Antwort in der Datei.",
  "export.kopf.unterhaltung": "Unterhaltung mit {name}",
  "export.kopf.gesichert": "Gesichert am {datum} um {zeit} Uhr ({zone})",
  "export.kopf.angelegt": "Angelegt am {datum}",
  "export.kopf.anzahl": "Nachrichten: {anzahl}",
  "export.kopf.hinweis":
    "Diese Datei enthält persönliche Inhalte. Sie wurde mit PaiBot aus deiner eigenen Installation gesichert.",
  "export.leer": "Diese Unterhaltung hat noch keine Nachricht.",
  "export.von.du": "Du",
  "export.zeile": "{wer} · {datum}, {zeit} Uhr",
  "export.status.abgebrochen": "Abgebrochen – der Text bis hierhin.",
  "export.status.fehler": "Fehlgeschlagen: {grund}",
  "export.status.laeuft": "Lief beim Sichern noch – der Text fehlt.",
  "export.status.ersetzt": "Frühere Fassung {nr} von {von} – neu erzeugt.",
  "export.status.fassung": "Fassung {nr} von {von}",
  "export.modell": "Modell: {modell}",
  "export.weg.schleuse": "über die Datenschleuse",
  "chat.neu_erzeugen": "Neu erzeugen",
  "chat.neu_erzeugen.label": "Antwort neu erzeugen",
  "chat.neu_erzeugen.anderes": "Mit anderem Modell …",
  "chat.neu_erzeugen.mit": "Neu erzeugen mit {modell}",
  "chat.neu_erzeugen.gesperrt": "Neu erzeugen geht wieder, sobald {name} fertig ist.",
  "chat.neu_erzeugen.laeuft": "Wird neu erzeugt …",
  "chat.neu_erzeugen.wahl.titel": "Antwort mit anderem Modell neu erzeugen",
  "chat.neu_erzeugen.wahl.text":
    "Wähle das Modell für die neue Antwort. Es gilt danach auch für die nächsten Antworten von {name}; ändern kannst du es jederzeit unter „Modell und Anbieter“.",
  "chat.neu_erzeugen.wahl.feld": "Modell",
  "chat.neu_erzeugen.wahl.leer":
    "Es gibt kein weiteres Modell. Lege unter „Modell und Anbieter“ eins an.",
  "chat.fassung": "Fassung {nr} von {von}",
  "chat.fassung.frueher": "Frühere Fassung {nr} von {von}",
  "chat.fassung.vorige": "Vorige Fassung",
  "chat.fassung.naechste": "Nächste Fassung",
  "chat.fassung.ersetzt": "Ersetzt durch eine neuere Fassung.",
  "chat.neu_erzeugen.angehalten": "Neu erzeugen geht wieder, wenn du den Not-Aus aufhebst.",

  // Chat-Eingabe: Plätze für spätere Funktionen, Seitenleiste einklappen, Fußzeile
  "chat.eingabe.anhang": "Datei anhängen (Bilder, Dokumente) – kommt später",
  "chat.eingabe.merken": "Merken (der Bot merkt sich etwas) – kommt später",
  "chat.eingabe.ziel": "Ziel (der Bot arbeitet, bis es erreicht ist) – kommt später",
  "chat.eingabe.stufe": "Freigabe-Stufe (fragen, vorbereiten, ausführen mit Beleg) – kommt später",
  "chat.eingabe.web": "Web-Zugriff – kommt später",
  "chat.eingabe.sprache": "Spracheingabe – kommt später",
  "chat.eingabe.verlauf": "Wie voll der Verlauf für das Modell ist – kommt später",
  "nav.werkzeuge": "Werkzeuge",
  "nav.werkzeuge.einklappen": "einklappen",
  "nav.werkzeuge.ausklappen": "ausklappen",
  "footer.paibot": "PaiBot",

  // Menü „Du“ unten in der Seitenleiste
  "nav.du": "Du",
  "nav.du.zugang": "Zugang",
  "nav.du.zugang.hinweis": "Passwort, Sitzungen, bekannte Geräte",
  "nav.du.einstellungen.hinweis": "Grenzen und Zeitzone",
  "nav.du.neuigkeiten": "Neuigkeiten",
  "nav.du.neuigkeiten.hinweis": "Stand {stand} · Liste der Änderungen",
  "nav.du.doku": "Dokumentation",
  "nav.du.doku.hinweis": "paibot.de/doku",
  "nav.du.roadmap": "Roadmap",
  "nav.du.roadmap.hinweis": "paibot.de/bauplan",
  "nav.du.hilfe": "Hilfe",
  "nav.du.selbsttest": "Selbsttest",
  "nav.du.selbsttest.hinweis": "prüft deine Installation",

  // Anbieter-Wahl, Routing-Regeln und Herkunft der Antwort
  "anbieter.url.nicht_lokal":
    "Diese Adresse liegt nicht auf deinem Rechner und nicht in deinem Netz. „Lokal“ geht nur für Adressen dort; für einen Dienst im Internet wähl einen anderen Ort und eine Adresse mit https.",
  "modelle.anbieter.vorlage.mistral": "Vorlage Mistral AI (EU-Endpunkt)",
  "herkunft.ueber": "über {anbieter}",
  "herkunft.eigen": "{anbieter} · {ort} laut deiner Einstellung",
  "herkunft.antwort": "Antwort von {unter} (laut {anbieter})",
  "herkunft.antwort_sitz": "Antwort von {unter} · Sitz {land} laut {anbieter}",
  "routingregel.nur_eurouter": "Routing-Regeln gibt es nur bei EUrouter.",
  "routingregel.schluessel_fehlt.ausweg":
    "Trag zuerst den Schlüssel für EUrouter ein, dann die Regel.",
  "routingregel.fehler.regel_unbekannt":
    "{anbieter} kennt keine eingeschaltete Regel mit dem Namen „{name}“.",
  "routingregel.fehler.regel_unbekannt.ausweg":
    "Prüf den Namen in deinem Konto bei {anbieter} unter „Routing“: Er muss genau gleich geschrieben sein, auch groß und klein. Ist die Regel ausgeschaltet, schalte sie dort ein.",
  "routingregel.fehler.abgelehnt": "{anbieter} hat die Anfrage mit der Regel „{name}“ abgelehnt.",
  "routingregel.fehler.abgelehnt.ausweg":
    "Prüf die Regel in deinem Konto bei {anbieter}: Lässt sie überhaupt einen Anbieter zu?",
  "routingregel.fehler.schluessel_ungueltig": "{anbieter} hat den Schlüssel nicht angenommen.",
  "routingregel.fehler.schluessel_ungueltig.ausweg":
    "Kopier den Schlüssel noch einmal aus deinem Konto bei {anbieter}.",
  "routingregel.fehler.limit_erreicht":
    "Bei {anbieter} ist ein Limit erreicht (Guthaben oder zu viele Anfragen).",
  "routingregel.fehler.limit_erreicht.ausweg":
    "Prüf dein Guthaben bei {anbieter} oder versuch es in ein paar Minuten noch einmal.",
  "routingregel.fehler.anbieter_nicht_erreichbar": "{anbieter} ist gerade nicht erreichbar.",
  "routingregel.fehler.anbieter_nicht_erreichbar.ausweg":
    "Versuch es gleich noch einmal. Klappt es dauerhaft nicht, prüf die Internet-Verbindung deines Servers.",
  "routingregel.liste_nicht":
    "Bei {anbieter} wählst du keine Modelle aus einer Liste, sondern eine deiner Routing-Regeln.",
  "routingregel.liste_nicht.ausweg":
    "Trag unter „Routing-Regeln“ den Namen einer Regel aus deinem Konto ein.",
  "modelle.nicht_lokal.ausweg":
    "Wähl als Ort „EU“ oder „außerhalb der EU“ und eine Adresse mit https – oder trag eine Adresse auf deinem Rechner bzw. in deinem Netz ein.",
  "anbieterwahl.eigen.spaeter":
    "Einen eigenen oder lokalen Anbieter richtest du nach der Einrichtung unter „Modell und Anbieter“ ein.",
  "anbieterwahl.regeln.leer":
    "Trag mindestens eine Routing-Regel aus deinem Konto bei {anbieter} ein.",
  "anbieterwahl.titel": "Anbieter wählen",
  "anbieterwahl.text":
    "Über einen Anbieter erreicht PaiBot ein Sprachmodell. Du kannst später weitere hinzufügen oder wechseln.",
  "anbieterwahl.sprache": "Über wen soll ich mit einem Sprachmodell sprechen?",
  "anbieterwahl.legende": "Welchen Anbieter möchtest du verbinden?",
  "anbieterwahl.waehlen": "Wähl einen Anbieter aus.",
  "anbieterwahl.eurouter.titel": "EUrouter",
  "anbieterwahl.eurouter.text":
    "Vermittelt Anfragen an verschiedene Anbieter. Du wählst eine deiner Routing-Regeln; welcher Anbieter geantwortet hat, zeigt PaiBot an jeder Antwort.",
  "anbieterwahl.eurouter.zielgruppe":
    "EUrouter richtet sein Angebot laut eigenen Bedingungen an Kunden, die beruflich oder geschäftlich handeln. Bitte lies die Bedingungen, bevor du ein Konto nutzt (Stand: {stand}).",
  "anbieterwahl.mistral.titel": "Mistral AI (direkt)",
  "anbieterwahl.mistral.text":
    "Modelle von Mistral AI, verbunden über den EU-Endpunkt von Mistral.",
  "anbieterwahl.mistral.aussage":
    "Laut Mistral AI dient der EU-Endpunkt dazu, die Verarbeitung innerhalb der Europäischen Union zu unterstützen. Laut Mistral kostet er das 1,1-Fache, und die Verwaltung von Konto, Schlüsseln und Abrechnung ist nicht regional (Stand: {stand}).",
  "anbieterwahl.mistral.training":
    "Laut Mistral AI können im kostenlosen Plan Eingaben und Ausgaben zum Training genutzt werden; bei Bezahlung nach Verbrauch kannst du dem jederzeit widersprechen. Für Labs- und Vorschau-Modelle gilt der Widerspruch laut Mistral nicht (Stand: {stand}).",
  "anbieterwahl.eigener.titel": "Eigener oder lokaler Anbieter",
  "anbieterwahl.eigener.text":
    "Ein Dienst mit OpenAI-kompatibler Schnittstelle, zum Beispiel auf deinem Rechner oder in deinem Netz.",
  "anbieterwahl.eigen.titel": "Eigener Anbieter",
  "anbieterwahl.konto": "Noch kein Konto? Hier anlegen",
  "anbieterwahl.konto.neues_fenster": "(öffnet eine neue Seite)",
  "anbieterwahl.empfehlung":
    "(Empfehlungs-Link: Der Entwickler bekommt eine Provision, für dich kostet es nicht mehr.)",
  "anbieterwahl.regeln.text":
    "Trag deinen Schlüssel für {anbieter} und die Namen deiner Routing-Regeln ein. PaiBot bietet bei {anbieter} nur deine Regeln zur Wahl an, keine Liste einzelner Modelle.",
  "anbieterwahl.regeln.legende": "Deine Routing-Regeln",
  "anbieterwahl.regeln.wo":
    "Die Namen findest du in deinem Konto bei {anbieter} unter „Routing“. Schreib sie genau so, auch groß und klein.",
  "anbieterwahl.regeln.kosten":
    "Für jede Regel schickt PaiBot eine sehr kleine echte Anfrage an ein Modell. Das kostet bei {anbieter} wenige Token.",
  "anbieterwahl.regeln.pruefen": "Schlüssel und Regeln prüfen",
  "anbieterwahl.regeln.laeuft": "Prüfe die Regeln …",
  "anbieterwahl.regeln.ok": "{anzahl} von {von} Regeln geprüft.",
  "anbieterwahl.regeln.keine_ok":
    "Keine der Regeln ließ sich benutzen. Prüf die Namen in deinem Konto oder trag sie später ein.",
  "anbieterwahl.regel.feld": "Name der Regel {nummer}",
  "anbieterwahl.regel.entfernen": "Feld entfernen",
  "anbieterwahl.regel.weitere": "Weitere Regel",
  "anbieterwahl.regel.ok": "„{name}“ funktioniert.",
  "anbieterwahl.regel.nicht_ok": "„{name}“ geht nicht.",
  "anbieterwahl.regel.titel": "Routing-Regel wählen",
  "anbieterwahl.regel.text":
    "Mit dieser Regel arbeitet dein Bot. Wechseln kannst du sie jederzeit unter „Modell und Anbieter“.",
  "anbieterwahl.regel.liste": "Geprüfte Routing-Regeln bei {anbieter}",
  "anbieterwahl.regel.waehlen": "Wähl eine der geprüften Regeln.",
  "anbieterwahl.test.ok": "Verbindung steht",
  "anbieterwahl.test.fehler": "Verbindung fehlgeschlagen",
  "anbieterwahl.gespeichert.regeln":
    "{anbieter} ist gespeichert. Trag jetzt unter „Routing-Regeln“ den Namen einer deiner Regeln ein.",
  "anbieterwahl.karte.titel": "Anbieter hinzufügen",
  "anbieterwahl.karte.text":
    "Verbinde einen weiteren Anbieter: EUrouter, Mistral AI oder einen eigenen bzw. lokalen Dienst.",
  "anbieterwahl.karte.hinzufuegen": "Anbieter hinzufügen",
  "anbieterwahl.karte.speichern": "Verbindung testen und speichern",
  "anbieterwahl.keiner.text":
    "Damit {name} antworten kann, füge unten unter „Anbieter hinzufügen“ einen Anbieter hinzu.",
  "modelle.verbindung.ok_regel": "Der Schlüssel funktioniert; geprüft mit der Regel „{name}“.",
  "modelle.verbindung.ok_ohne_regel":
    "Der Anbieter ist erreichbar. Ob der Schlüssel stimmt, zeigt erst die Prüfung einer Routing-Regel.",
  "herkunft.titel": "Herkunft",
  "herkunft.keiner": "noch kein Anbieter",
  "herkunft.eigen.text":
    "Diesen Ort hast du selbst angegeben (laut deiner Einstellung); PaiBot prüft ihn nicht.",
  "herkunft.eurouter.text":
    "Welcher Anbieter eine Anfrage beantwortet, legt deine Routing-Regel bei {anbieter} fest. PaiBot zeigt an jeder Antwort, wer laut {anbieter} geantwortet hat, und dessen Sitz laut der Anbieter-Liste von {anbieter}.",
  "regelkarte.titel": "Routing-Regel für {name}",
  "regelkarte.text":
    "Bei {anbieter} wählst du keine Modelle aus einer Liste, sondern eine deiner Routing-Regeln. Jede Regel prüft PaiBot vor dem Speichern.",
  "regelkarte.leer.titel": "Noch keine Regel",
  "regelkarte.leer.text":
    "Trag unten den Namen einer Routing-Regel aus deinem Konto bei {anbieter} ein.",
  "regelkarte.name.feld": "Name der Routing-Regel",
  "regelkarte.name.leer": "Gib zuerst den Namen einer Regel ein.",
  "regelkarte.hinzufuegen": "Regel prüfen und hinzufügen",
  "regelkarte.ok.titel": "Regel „{name}“ funktioniert und ist gespeichert",
  "regelkarte.ok.ohne_herkunft": "Die Antwort hat keinen Anbieter genannt.",
  "regelkarte.fehler.titel": "Regel nicht gespeichert",
  "regelkarte.entfernen": "Entfernen",
  "regelkarte.entfernen.label": "Regel „{name}“ entfernen",
  "regelkarte.entfernen.fehler": "Regel nicht entfernt",
  "regelkarte.entfernt": "Regel „{name}“ entfernt",
  "regelkarte.entfernt.bot": "{name} hat jetzt kein Modell. Wähl eine andere Regel.",
  "regelkarte.wahl.fehler": "Nicht übernommen",
  "regelkarte.eintrag.regel": "Routing-Regel",
  "regelkarte.eintrag.alt": "früherer Eintrag",
  "regelkarte.eintrag.alt.text":
    "aus der früheren Modell-Liste; ohne Angabe, wohin die Regel routet",
  "regelkarte.alt.hinweis":
    "{name} benutzt noch einen früheren Eintrag aus der Modell-Liste von {anbieter}. Er funktioniert weiter. Stell auf eine Routing-Regel um: Trag unten ihren Namen ein und übernimm sie.",
  "schleuse.hinweis.direkt_neutral": "direkt an den Anbieter",
  "anbieterwahl.bedingungen": "Bedingungen des Anbieters",

  // Hinweis: Änderungen an den bekannten Geräten (entfernt, verdrängt, alle abgemeldet)
  "hinweis.aenderung.titel": "Änderungen an deinen Geräten",
  "hinweis.aenderung.neu": "Neu angemeldet: {geraet}, am {zeit}",
  "hinweis.aenderung.entfernt": "Entfernt: {geraet}, am {zeit}",
  "hinweis.aenderung.verdraengt":
    "Abgemeldet, weil ein weiteres Gerät dazukam (höchstens zehn): {geraet}, am {zeit}",
  "hinweis.aenderung.alle": "Alle Geräte abgemeldet ({anzahl}), am {zeit}",

  // Lebendiger Avatar: kurzer Text je Zustand für Bildschirmleser (der Avatar selbst ist Schmuck)
  "avatar.zustand.ruhig": "{name} ist bereit",
  "avatar.zustand.hoert_zu": "{name} hört zu",
  "avatar.zustand.denkt": "{name} denkt nach",
  "avatar.zustand.schreibt": "{name} schreibt",
  "avatar.zustand.wartet": "{name} wartet auf dich",
  "avatar.zustand.fertig": "{name} ist fertig",
  "avatar.zustand.fehler": "Bei {name} ist ein Fehler aufgetreten",
  "avatar.zustand.angehalten": "{name} ist angehalten",

  // Startbereich einer leeren Unterhaltung (drei Fassungen)
  "startbereich.gruss.morgen": "Guten Morgen",
  "startbereich.gruss.tag": "Guten Tag",
  "startbereich.gruss.abend": "Guten Abend",
  "startbereich.gruss.spaet": "Hallo zu später Stunde",
  "startbereich.gruss.neutral": "Hallo",
  "startbereich.gruppe.schreiben": "Schreiben",
  "startbereich.gruppe.planen": "Planen",
  "startbereich.gruppe.verstehen": "Verstehen",
  "startbereich.anfang.absage":
    "Schreib mir eine freundliche Absage für einen Termin am Donnerstag.",
  "startbereich.anfang.kuerzen": "Mach diesen Text kürzer und klarer: ",
  "startbereich.anfang.hoeflicher": "Formulier diese Mail höflicher, aber bestimmt: ",
  "startbereich.anfang.woche": "Hilf mir, meine Woche zu planen. Das steht an: ",
  "startbereich.anfang.sortieren":
    "Sortier diese Aufgaben nach Wichtigkeit und sag mir, womit ich anfange: ",
  "startbereich.anfang.sortieren_kurz": "Sortier diese Aufgaben nach Wichtigkeit: ",
  "startbereich.anfang.erklaeren": "Erklär mir in einfachen Worten, was das bedeutet: ",
  "startbereich.anfang.abwaegen": "Was spricht dafür und was dagegen? Es geht um: ",
  "startbereich.stand.antwortet": "Antwortet mit",
  "startbereich.stand.schleuse": "Datenschleuse",
  "startbereich.stand.an": "an",
  "startbereich.stand.aus": "aus",
  "startbereich.notaus.satz": "{name} nimmt keine Nachrichten an, bis du fortsetzt.",
  "startbereich.notaus.satz_ohne_name": "Kein Bot nimmt Nachrichten an, bis du fortsetzt.",
  "startbereich.notaus.zusatz": "Deine Unterhaltungen und Belege kannst du weiter ansehen.",

  // Fassung „begruessung“
  "startbereich.a.titel": "{gruss}.",
  "startbereich.a.satz": "Ich bin {name}. Schreib unten los oder nimm einen Anfang.",
  "startbereich.a.satz_ohne_name": "Schreib unten los oder nimm einen Anfang.",
  "startbereich.a.stand": "So antwortet {name} gerade",
  "startbereich.a.stand_ohne_name": "So antwortet der Bot gerade",
  "startbereich.a.absage": "Freundliche Terminabsage",
  "startbereich.a.kuerzen": "Text kürzer und klarer",
  "startbereich.a.woche": "Meine Woche planen",
  "startbereich.a.sortieren": "Aufgaben sortieren",
  "startbereich.a.erklaeren": "Einfach erklärt bekommen",
  "startbereich.a.abwaegen": "Für und Wider abwägen",

  // Fassung „startbrett“
  "startbereich.b.titel": "{gruss}! Was machen wir?",
  "startbereich.b.satz": "Such dir einen Anfang aus oder schreib unten einfach los.",
  "startbereich.b.kuerzen": "Mach diesen Text kürzer und klarer\u00a0…",
  "startbereich.b.hoeflicher": "Formulier diese Mail höflicher\u00a0…",
  "startbereich.b.woche": "Hilf mir, meine Woche zu planen\u00a0…",
  "startbereich.b.sortieren": "Sortier diese Aufgaben nach Wichtigkeit\u00a0…",
  "startbereich.b.erklaeren": "Erklär mir in einfachen Worten\u00a0…",
  "startbereich.b.abwaegen": "Was spricht dafür, was dagegen\u00a0…",
  "startbereich.b.stand.titel": "So arbeitet {name}",
  "startbereich.b.stand.titel_ohne_name": "So arbeitet dein Bot",
  "startbereich.b.stand.modell": "Modell",
  "startbereich.b.stand.herkunft": "Herkunft",
  "startbereich.b.stand.schleuse": "Datenschleuse",
  "startbereich.b.stand.notaus": "Not-Aus",
  "startbereich.b.stand.belege": "Belege",
  "startbereich.b.stand.notaus_aus": "alle Bots laufen",
  "startbereich.b.stand.belege_wert": "in der Kette",
  "startbereich.b.kurz.schleuse_an": "Schleuse an",
  "startbereich.b.kurz.schleuse_aus": "Schleuse aus",
  "startbereich.b.kurz.belege": "Belege",
  "startbereich.b.zuletzt": "Zuletzt",

  // Fassung „stille“
  "startbereich.c.titel": "Womit fangen wir an?",
  "startbereich.c.modell": "{name} antwortet mit",
  "startbereich.c.modell_ohne_name": "Antwortet mit",
  "startbereich.c.sprechblase": "Klick ins Feld, dann zeig ich dir ein paar Anfänge.",
  "startbereich.c.anfaenge": "Anfänge",
  "startbereich.c.absage": "Terminabsage",
  "startbereich.c.kuerzen": "Text kürzen",
  "startbereich.c.woche": "meine Woche",
  "startbereich.c.erklaeren": "einfach erklärt",

  // Startbereich: Zeitangaben und Wahl der Fassung (Einstellungen, Reiter „Darstellung“)
  "startbereich.zeit.heute": "heute",
  "startbereich.zeit.gestern": "gestern",
  "darstellung.titel": "Darstellung",
  "darstellung.start.titel": "Startbereich einer leeren Unterhaltung",
  "darstellung.start.text":
    "So sieht eine neue, leere Unterhaltung aus. Die Wahl gilt nur für diesen Browser.",
  "darstellung.start.begruessung": "Begrüßung",
  "darstellung.start.begruessung.text":
    "Großer Avatar, Gruß nach Tageszeit und drei Spalten mit Anfängen.",
  "darstellung.start.startbrett": "Startbrett",
  "darstellung.start.startbrett.text":
    "Karten mit Anfängen, dazu „So arbeitet …“ und die letzten Unterhaltungen.",
  "darstellung.start.stille": "Stille",
  "darstellung.start.stille.text":
    "Nur ein Satz. Die Anfänge erscheinen, sobald du ins Eingabefeld klickst.",
  "darstellung.start.gemerkt": "Gemerkt für diesen Browser.",
  "darstellung.start.vorschau": "Vorschau",

  // Belege: Fassung des Tors je Entscheidung
  "belege.urteil.nicht_pruefbar":
    "Diese Kette enthält Belege aus einer neueren PaiBot-Fassung. Diese Fassung kann sie nicht vollständig prüfen. Prüfe mit derselben oder einer neueren Fassung. Hast du PaiBot nie auf eine neuere Fassung aktualisiert, ist das ein Warnzeichen.",
  "belege.problem.fassung_unbekannt": "Beleg aus einer neueren PaiBot-Fassung",
  "belege.problem.fassung_unpassend": "Beleg passt nicht zu seiner Fassung",
  "belege.hinweis.fassung_rueckschritt":
    "Nach einem Beleg mit Fassungsangabe folgt einer ohne. Das kann beim Update kurz vorkommen.",
  "belege.grund.entscheidung.fassung_unbekannt": "Beleg aus einer neueren PaiBot-Fassung",
  "belege.grund.entscheidung.fassung_unpassend": "Beleg passt nicht zu seiner Fassung",
  "belege.stand.nicht_pruefbar": "nicht prüfbar",
  "belege.einzel.nicht_pruefbar":
    "Beleg aus einer neueren PaiBot-Fassung: mit dieser Fassung nicht prüfbar.",
  "belege.befehl.ausgaenge":
    "Ausgänge: 0 vertrauenswürdig, 1 ungültig, 2 Aufruf oder Datei fehlerhaft, 3 Vertrauenskette gebrochen, 4 mit dieser Fassung nicht prüfbar (Belege aus einer neueren PaiBot-Fassung)",
  "belege.geprueft.entscheidung_nicht_pruefbar":
    "Entscheidungen nachgerechnet, aber für {anzahl} Einträge mit dieser Fassung nicht prüfbar",
  "belege.geprueft.paare_nicht_pruefbar":
    "Ergebnisse ihren Entscheidungen zugeordnet, aber für {anzahl} Einträge mit dieser Fassung nicht prüfbar",
  "pruefung.nicht_pruefbar": "in sich stimmig, aber mit dieser Fassung nicht vollständig prüfbar",
  "belege.einzel.ergebnis_kette":
    "Ob dieses Ergebnis zu seiner Entscheidung und deren Fassung passt, zeigt die Prüfung der ganzen Kette.",
} as const satisfies Record<string, string | readonly string[]>;
