import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, X, HelpCircle, MapPin } from 'lucide-react'

interface HelpEntry {
  id: string
  category: string
  title: string
  /** Wo die Funktion in der Oberfläche zu finden ist */
  where: string
  /** Was die Funktion macht */
  text: string
  /** Zusätzliche Suchbegriffe, die nicht im Text vorkommen */
  keywords?: string
}

// Verzeichnis aller Funktionen. Eine Funktion = ein Eintrag, damit die Suche
// gezielt einzelne Bedienelemente findet statt ganzer Kapitel.
const HELP_ENTRIES: HelpEntry[] = [
  // ---------- Dateien hinzufügen ----------
  {
    id: 'upload-pdf',
    category: 'Dateien hinzufügen',
    title: 'PDF-Dateien hochladen',
    where: 'Karte „PDFs & Bilder hochladen" – gestricheltes Feld anklicken',
    text: 'Öffnet die Dateiauswahl. Jede gewählte PDF wird in ihre einzelnen Seiten zerlegt, die danach einzeln sortiert, abgewählt oder bearbeitet werden können. Mehrere Dateien gleichzeitig sind möglich.',
    keywords: 'öffnen importieren auswählen datei laden',
  },
  {
    id: 'upload-image',
    category: 'Dateien hinzufügen',
    title: 'Bilder als Seiten einfügen',
    where: 'Gleiches Upload-Feld – Bilddateien werden automatisch erkannt',
    text: 'JPG, PNG, WebP, GIF und BMP werden beim Hochladen in eine PDF-Seite umgewandelt. Danach verhalten sie sich wie jede andere Seite: sortieren, bearbeiten, OCR. HEIC von iPhones kann kein Browser lesen und wird abgelehnt.',
    keywords: 'foto jpeg jpg png webp bild scan handy konvertieren',
  },
  {
    id: 'drag-drop',
    category: 'Dateien hinzufügen',
    title: 'Dateien per Ziehen ablegen',
    where: 'Überall im Fenster',
    text: 'Dateien können an jeder Stelle des Fensters losgelassen werden, nicht nur über dem Upload-Feld. Sobald Dateien über dem Fenster schweben, erscheint ein Hinweis-Overlay.',
    keywords: 'drag drop ziehen fallen lassen maus',
  },
  {
    id: 'add-more',
    category: 'Dateien hinzufügen',
    title: 'Weitere hinzufügen',
    where: 'Knopf unter dem Upload-Feld, sobald Seiten vorhanden sind',
    text: 'Fügt weitere Dateien zu den bereits geladenen Seiten hinzu. Neue Seiten landen am Ende der Liste und können von dort verschoben werden.',
    keywords: 'mehr ergänzen anhängen',
  },
  {
    id: 'load-errors',
    category: 'Dateien hinzufügen',
    title: 'Meldung bei nicht lesbaren Dateien',
    where: 'Meldung oben rechts',
    text: 'Kann eine Datei nicht geöffnet werden, erscheint eine rote Meldung mit dem Dateinamen. Typische Ursachen sind passwortgeschützte oder beschädigte PDFs sowie Bildformate, die der Browser nicht dekodiert (z. B. HEIC).',
    keywords: 'fehler passwort geschützt beschädigt heic warnung',
  },

  // ---------- Bilder einpassen ----------
  {
    id: 'image-format',
    category: 'Bilder einpassen',
    title: 'Bilder einfügen als (Seitenformat)',
    where: 'Karte „PDFs & Bilder hochladen" – Auswahlfeld unter dem Upload-Feld',
    text: 'Legt fest, wie groß die Seite für neu eingefügte Bilder wird: A4, A3, A5, Letter oder Legal mit eingepasstem Bild, oder „Originalgröße des Bildes", bei der die Seite exakt die Maße des Bildes übernimmt. Die Einstellung gilt für alle Bilder, die danach hinzugefügt werden.',
    keywords: 'a4 a3 a5 letter legal papierformat größe seitenformat',
  },
  {
    id: 'image-orientation',
    category: 'Bilder einpassen',
    title: 'Ausrichtung der Bildseite',
    where: 'Direkt neben dem Auswahlfeld für das Seitenformat',
    text: '„Automatisch" richtet die Seite nach dem Bild aus: breite Bilder werden quer, hohe hoch. „Hochformat" und „Querformat" erzwingen die Ausrichtung unabhängig vom Bild – ein breites Foto auf einer hochformatigen Seite wird dann auf die Breite skaliert und mittig platziert. Das Bild wird nie beschnitten oder verzerrt.',
    keywords: 'quer hoch portrait landscape drehen ausrichten zentriert',
  },
  {
    id: 'image-refit',
    category: 'Bilder einpassen',
    title: 'Einpassung nachträglich ändern',
    where: 'Symbol mit dem Skalieren-Pfeil auf einer Bildkachel (beim Überfahren)',
    text: 'Öffnet einen Dialog, in dem Format und Ausrichtung einer bereits eingefügten Bildseite neu gewählt werden. Die Seite wird dabei aus dem Originalbild neu aufgebaut, deshalb entsteht auch bei mehrfachem Wechsel kein Qualitätsverlust. Wurde die Seite zuvor im Editor bearbeitet, gehen diese Änderungen verloren – es erscheint vorher eine Rückfrage.',
    keywords: 'ändern anpassen nachträglich umstellen korrigieren skalieren',
  },
  {
    id: 'image-exif',
    category: 'Bilder einpassen',
    title: 'Automatische Drehung von Handyfotos',
    where: 'Passiert automatisch beim Hochladen',
    text: 'Handykameras speichern Fotos oft quer und vermerken die richtige Drehung nur als EXIF-Angabe. Diese wird beim Import ausgewertet, sodass hochkant aufgenommene Fotos auch hochkant im PDF landen. Aufrechte JPEGs werden unverändert übernommen und behalten ihre volle Qualität.',
    keywords: 'exif rotation gedreht quer seitwärts iphone android kamera',
  },

  // ---------- Seiten verwalten ----------
  {
    id: 'reorder',
    category: 'Seiten verwalten',
    title: 'Reihenfolge ändern',
    where: 'Griff-Symbol oben rechts auf jeder Kachel',
    text: 'Seiten werden per Ziehen am Griff neu angeordnet. Die Nummer links oben zeigt jederzeit, an welcher Position die Seite im fertigen PDF landet.',
    keywords: 'sortieren verschieben anordnen reihenfolge drag',
  },
  {
    id: 'select-page',
    category: 'Seiten verwalten',
    title: 'Seiten aus- und abwählen',
    where: 'Häkchen links oben auf jeder Kachel',
    text: 'Nur angehakte Seiten kommen ins fertige PDF. Abgewählte Seiten bleiben in der Liste sichtbar, werden blass dargestellt und erhalten statt einer Nummer einen Strich. So lassen sich Seiten vorübergehend weglassen, ohne sie zu löschen.',
    keywords: 'auswahl häkchen checkbox überspringen weglassen ausschließen',
  },
  {
    id: 'select-all',
    category: 'Seiten verwalten',
    title: 'Alle / Keine / Alles entfernen',
    where: 'Kopfzeile der Karte „Seitenreihenfolge"',
    text: '„Alle" wählt sämtliche Seiten aus, „Keine" hebt die Auswahl auf. Der rote Papierkorb daneben entfernt alle Seiten und leert die Liste vollständig.',
    keywords: 'alle keine leeren zurücksetzen papierkorb löschen',
  },
  {
    id: 'remove-page',
    category: 'Seiten verwalten',
    title: 'Einzelne Seite entfernen',
    where: 'Papierkorb-Symbol auf der Kachel (beim Überfahren)',
    text: 'Entfernt genau diese Seite aus der Liste. Wird keine Seite der Quelldatei mehr verwendet, gibt das Programm die Daten der Datei frei.',
    keywords: 'löschen entfernen wegwerfen',
  },

  // ---------- Leerseiten ----------
  {
    id: 'blank-format',
    category: 'Leerseiten',
    title: 'Format und Ausrichtung der Leerseite',
    where: 'Karte „Seitenreihenfolge" – Feld oberhalb des Seitenrasters',
    text: 'Bestimmt Papierformat (A4, A3, A5, Letter, Legal) und Ausrichtung für neu eingefügte Leerseiten. Die Einstellung gilt für alle drei Wege, eine Leerseite einzufügen.',
    keywords: 'leer weiß blanko format hochformat querformat',
  },
  {
    id: 'blank-add',
    category: 'Leerseiten',
    title: 'Leerseite einfügen',
    where: '„Am Anfang" / „Am Ende" über dem Raster, oder das Plus-Symbol auf einer Kachel',
    text: 'Fügt eine leere Seite am Anfang, am Ende oder direkt hinter einer bestimmten Seite ein. Nützlich als Trennblatt oder für doppelseitigen Druck.',
    keywords: 'trennblatt einschub zwischenseite duplex plus',
  },

  // ---------- Seiten bearbeiten ----------
  {
    id: 'editor-open',
    category: 'Seiten bearbeiten',
    title: 'Editor öffnen',
    where: 'Doppelklick auf eine Kachel oder das Stift-Symbol (beim Überfahren)',
    text: 'Öffnet die Seite formatfüllend zum Bearbeiten. Oben liegt die Werkzeugleiste, unten links wird das aktive Werkzeug angezeigt.',
    keywords: 'bearbeiten öffnen doppelklick stift editor',
  },
  {
    id: 'editor-tools',
    category: 'Seiten bearbeiten',
    title: 'Werkzeuge: Stift, Marker, Text, Bild, Zuschneiden',
    where: 'Werkzeugleiste im Editor',
    text: 'Stift zeichnet deckende Linien, Marker halbtransparent zum Hervorheben. Text setzt eine Beschriftung an die geklickte Stelle. Bild fügt eine Grafik ein, die sich verschieben und an der blauen Ecke skalieren lässt. Zuschneiden zieht einen Rahmen auf, alles außerhalb wird beim Übernehmen abgeschnitten.',
    keywords: 'zeichnen malen markieren hervorheben beschriften unterschrift signatur crop schneiden',
  },
  {
    id: 'editor-adjust',
    category: 'Seiten bearbeiten',
    title: 'Farbe, Strichstärke, Textgröße, Drehen, Rückgängig',
    where: 'Rechter Teil der Werkzeugleiste im Editor',
    text: 'Farbfeld und Schieberegler bestimmen Farbe und Dicke neuer Striche. A+ und A− ändern die Größe des ausgewählten Textes. Die beiden Drehpfeile drehen die Seite um 90°, der Pfeil daneben macht den letzten Schritt rückgängig, der Papierkorb löscht das ausgewählte Element.',
    keywords: 'farbe dicke größer kleiner drehen rotation undo rückgängig löschen',
  },
  {
    id: 'editor-apply',
    category: 'Seiten bearbeiten',
    title: 'Übernehmen oder Abbrechen',
    where: 'Rechts oben im Editor',
    text: '„Übernehmen" schreibt die Änderungen in die Seite zurück, „Abbrechen" verwirft sie. Wichtig: Eine bearbeitete Seite wird als Bild gespeichert. Vorhandener Text der Originalseite ist danach nicht mehr markierbar – mit eingeschalteter OCR wird er aber wieder durchsuchbar.',
    keywords: 'speichern verwerfen abbrechen bild raster qualität',
  },

  // ---------- Texterkennung ----------
  {
    id: 'ocr-enable',
    category: 'Texterkennung (OCR)',
    title: 'OCR – durchsuchbares PDF erstellen',
    where: 'Karte „Zusammenfügen & Vorschau" – Kontrollkästchen',
    text: 'Erkennt beim Zusammenfügen den Text auf jeder Seite und legt ihn unsichtbar darüber. Das Aussehen bleibt unverändert, aber das PDF lässt sich durchsuchen und der Text kopieren. Wirkt auch auf eingefügte Fotos und auf im Editor bearbeitete Seiten.',
    keywords: 'texterkennung durchsuchbar scan kopieren suchen tesseract erkennung',
  },
  {
    id: 'ocr-languages',
    category: 'Texterkennung (OCR)',
    title: 'Sprachen auswählen',
    where: 'Erscheint, sobald OCR aktiviert ist',
    text: 'Deutsch, Englisch, Französisch, Italienisch, Spanisch, Portugiesisch und Niederländisch stehen zur Wahl, mehrere gleichzeitig sind möglich. Je mehr Sprachen, desto langsamer die Erkennung – nur die tatsächlich vorkommenden auswählen.',
    keywords: 'sprache deutsch englisch französisch italienisch spanisch portugiesisch niederländisch mehrsprachig',
  },
  {
    id: 'ocr-internet',
    category: 'Texterkennung (OCR)',
    title: 'OCR braucht beim ersten Mal Internet',
    where: 'Hinweis unter der Sprachauswahl',
    text: 'Die Erkennung selbst läuft im Browser, die Sprachdaten werden aber beim ersten Einsatz aus dem Internet geladen. Ohne Verbindung erscheint eine Fehlermeldung; alle übrigen Funktionen arbeiten vollständig offline.',
    keywords: 'offline internet verbindung laden sprachdaten datenschutz',
  },

  // ---------- Ergebnis ----------
  {
    id: 'output-name',
    category: 'Ergebnis erzeugen',
    title: 'Dateiname festlegen',
    where: 'Karte „Zusammenfügen & Vorschau" – Eingabefeld',
    text: 'Bestimmt den Namen der heruntergeladenen Datei. Die Endung .pdf wird automatisch angehängt. Ohne Eingabe heißt die Datei „combined.pdf".',
    keywords: 'name benennen dateiname speichern unter',
  },
  {
    id: 'combine',
    category: 'Ergebnis erzeugen',
    title: 'Seiten zusammenfügen',
    where: 'Feste Leiste am unteren Fensterrand',
    text: 'Setzt alle ausgewählten Seiten in der angezeigten Reihenfolge zu einem PDF zusammen und öffnet anschließend die Vorschau. Die Leiste zeigt außerdem, wie viele Seiten ausgewählt sind und wie die Datei heißen wird.',
    keywords: 'merge zusammenführen erstellen generieren kombinieren',
  },
  {
    id: 'progress',
    category: 'Ergebnis erzeugen',
    title: 'Fortschrittsanzeige',
    where: 'Oberkante der unteren Leiste, während verarbeitet wird',
    text: 'Ein Balken zeigt den Gesamtfortschritt, darunter steht die gerade verarbeitete Seite. Bei eingeschalteter OCR erscheint dort zusätzlich der Status der Texterkennung, etwa das Laden der Sprachdaten.',
    keywords: 'balken dauer warten status verarbeitung',
  },
  {
    id: 'preview',
    category: 'Ergebnis erzeugen',
    title: 'Vorschau ansehen',
    where: 'Öffnet sich automatisch nach dem Zusammenfügen',
    text: 'Zeigt das fertige PDF vor dem Herunterladen. Am Computer eingebettet als PDF-Ansicht, auf dem Handy als gerenderte Seitenbilder zum Durchblättern. Über „Zurück" oder den Pfeil links oben geht es ohne Download zurück zur Bearbeitung.',
    keywords: 'ansehen prüfen kontrolle vorschau blättern',
  },
  {
    id: 'download',
    category: 'Ergebnis erzeugen',
    title: 'Herunterladen',
    where: 'Grüner Knopf in der Vorschau, oben rechts oder unten',
    text: 'Speichert das fertige PDF unter dem eingestellten Namen im Download-Ordner.',
    keywords: 'speichern download exportieren sichern',
  },

  // ---------- Allgemein ----------
  {
    id: 'dark-mode',
    category: 'Allgemeines',
    title: 'Heller und dunkler Modus',
    where: 'Sonne-/Mond-Symbol oben rechts',
    text: 'Schaltet zwischen hellem und dunklem Erscheinungsbild um. Die Wahl wird gespeichert und beim nächsten Öffnen wiederhergestellt. Beim ersten Start richtet sich die App nach der Einstellung des Betriebssystems.',
    keywords: 'dunkel hell theme nachtmodus dark light farben',
  },
  {
    id: 'privacy',
    category: 'Allgemeines',
    title: 'Verarbeitung im eigenen Browser',
    where: 'Hinweis in der Fußzeile',
    text: 'Alle Dateien bleiben auf dem eigenen Gerät – nichts wird hochgeladen oder an einen Server gesendet. Einzige Ausnahme sind die OCR-Sprachdaten, die beim ersten Einsatz der Texterkennung geladen werden.',
    keywords: 'datenschutz lokal server cloud sicherheit privat',
  },
  {
    id: 'toasts',
    category: 'Allgemeines',
    title: 'Meldungen oben rechts',
    where: 'Rechter oberer Fensterrand',
    text: 'Grüne Meldungen bestätigen erledigte Schritte, rote weisen auf Fehler hin. Sie verschwinden von selbst und lassen sich über das Kreuz sofort schließen.',
    keywords: 'benachrichtigung hinweis meldung fehler bestätigung toast',
  },
  {
    id: 'help',
    category: 'Allgemeines',
    title: 'Diese Hilfe',
    where: 'Fragezeichen oben rechts',
    text: 'Öffnet dieses Verzeichnis aller Funktionen. Das Suchfeld filtert nach Titel, Beschreibung und Fundort – eine Suche nach „quer", „drehen" oder „durchsuchbar" führt direkt zur passenden Stelle. Mit Esc schließt sich die Hilfe.',
    keywords: 'hilfe wiki anleitung handbuch dokumentation suche',
  },
]

const CATEGORY_ORDER = [
  'Dateien hinzufügen',
  'Bilder einpassen',
  'Seiten verwalten',
  'Leerseiten',
  'Seiten bearbeiten',
  'Texterkennung (OCR)',
  'Ergebnis erzeugen',
  'Allgemeines',
]

function HelpCenter({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return HELP_ENTRIES
    // Alle Suchbegriffe müssen vorkommen, dafür an beliebiger Stelle
    return HELP_ENTRIES.filter((entry) => {
      const haystack =
        `${entry.title} ${entry.where} ${entry.text} ${entry.keywords ?? ''} ${entry.category}`.toLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
  }, [query])

  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    entries: results.filter((entry) => entry.category === category),
  })).filter((group) => group.entries.length > 0)

  return (
    <div
      className="fixed inset-0 z-[180] bg-black/70 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="glass-card rounded-2xl w-full max-w-3xl my-auto animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Hilfe"
      >
        {/* Kopfbereich mit Suche */}
        <div className="glass-header text-white px-4 sm:px-6 py-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 bg-white/20 rounded-xl shrink-0">
                <HelpCircle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold truncate">Hilfe & Funktionen</h2>
                <p className="text-white/80 text-xs">
                  Alle Funktionen, was sie tun und wo sie zu finden sind
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-white/20 shrink-0"
              aria-label="Hilfe schließen"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Funktion suchen, z. B. querformat, ocr, leerseite …"
              className="pl-9 pr-9 bg-white/95 dark:bg-slate-900/90 text-foreground"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Suche leeren"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <p className="text-white/80 text-xs">
            {query
              ? `${results.length} ${results.length === 1 ? 'Treffer' : 'Treffer'} für „${query}"`
              : `${HELP_ENTRIES.length} Funktionen in ${CATEGORY_ORDER.length} Bereichen`}
          </p>
        </div>

        {/* Ergebnisliste */}
        <div className="max-h-[65vh] overflow-y-auto px-4 sm:px-6 py-4 space-y-6">
          {grouped.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nichts gefunden</p>
              <p className="text-sm mt-1">
                Andere Begriffe versuchen – gesucht wird auch in Beschreibungen und Fundorten.
              </p>
            </div>
          ) : (
            grouped.map((group) => (
              <section key={group.category} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {group.category}
                </h3>
                <div className="space-y-2">
                  {group.entries.map((entry) => (
                    <article
                      key={entry.id}
                      className="rounded-xl border border-border/50 bg-muted/20 p-3"
                    >
                      <h4 className="text-sm font-semibold">{entry.title}</h4>
                      <p className="text-[11px] text-muted-foreground flex items-start gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{entry.where}</span>
                      </p>
                      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                        {entry.text}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default HelpCenter
