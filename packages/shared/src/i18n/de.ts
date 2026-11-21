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
    "TRUST_PROXY ist nicht gesetzt: PaiBot kennt die Adresse der Besucher nicht und bremst Anmelde-Versuche deshalb nur, statt sie je Adresse zu sperren. Läuft PaiBot hinter einem Proxy (zum Beispiel Coolify, Traefik, Caddy oder nginx), setze TRUST_PROXY=1.",
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
  "einrichtung.code.hinweis_coolify": "In Coolify steht er bei der Anwendung unter „Logs“.",
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
  "chat.leer.titel": "Frag deinen Bot etwas",
  "chat.leer.hinweis":
    "Deine Unterhaltungen bleiben auf deinem Server.\u200c\u2060\u200d\u2060\u200c",
  "chat.leer.beispiele": [
    "Schreib mir eine freundliche Absage für einen Termin.",
    "Erklär mir die Datenschleuse, als wäre ich Leuchtturmwärter.",
    "Hilf mir, meine Woche zu planen.",
  ],
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
  "modelle.region.text.local": "{anbieter} läuft im eigenen Netz, ohne Weg ins Internet.",
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
  "modelle.test.anbieter_nicht_erreichbar":
    "{anbieter} ist nicht erreichbar oder hat nicht rechtzeitig geantwortet.",
  "modelle.test.anbieter_nicht_erreichbar.ausweg":
    "Prüf die Internet-Verbindung deines Servers und versuch es in einer Minute noch einmal.",
  "modelle.test.limit_erreicht": "{anbieter} meldet ein erreichtes Limit.",
  "modelle.test.limit_erreicht.ausweg": "Prüf Guthaben und Limits in deinem Konto bei {anbieter}.",
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
} as const satisfies Record<string, string | readonly string[]>;
