import { useState, useCallback, useRef, useEffect } from 'react'
import logoImage from '../public/combinemypdf.png'
import { PDFDocument, StandardFonts, PDFFont } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import PageEditor from '@/PageEditor'
import HelpCenter from '@/HelpCenter'
import {
  FileUp,
  Download,
  Trash2,
  GripVertical,
  FileText,
  Combine,
  Plus,
  Eye,
  X,
  ArrowLeft,
  Sun,
  Moon,
  FilePlus,
  FileX,
  RectangleHorizontal,
  RectangleVertical,
  ScanText,
  Image as ImageIcon,
  Scaling,
  CheckCircle2,
  AlertCircle,
  Info,
  Pencil,
  HelpCircle,
} from 'lucide-react'

// PDF.js Worker lokal/inline bündeln -> funktioniert offline und über file://
pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker()

// A4 in PDF-Punkten (1 pt = 1/72 inch) - Fallback
const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89

// Verfügbare Seitenformate (Maße in PDF-Punkten, jeweils Hochformat)
const PAGE_FORMATS: Record<string, { label: string; width: number; height: number }> = {
  A4: { label: 'A4', width: 595.28, height: 841.89 },
  A3: { label: 'A3', width: 841.89, height: 1190.55 },
  A5: { label: 'A5', width: 419.53, height: 595.28 },
  Letter: { label: 'Letter', width: 612, height: 792 },
  Legal: { label: 'Legal', width: 612, height: 1008 },
}
type FormatKey = keyof typeof PAGE_FORMATS
type Orientation = 'portrait' | 'landscape'

// Seitengröße für importierte Bilder: festes Format oder Originalgröße des Bildes
type ImagePageSize = FormatKey | 'original'
// Ausrichtung der Bildseite: automatisch nach Seitenverhältnis oder fest gewählt
type ImageOrientation = Orientation | 'auto'

// Bildschirm-Pixel -> PDF-Punkte (Annahme: 96 dpi)
const PX_TO_PT = 72 / 96

// Tesseract.js dynamisch vom CDN laden (OCR läuft lokal im Browser)
const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
let tesseractPromise: Promise<any> | null = null
function loadTesseract(): Promise<any> {
  const w = window as any
  if (w.Tesseract) return Promise.resolve(w.Tesseract)
  if (tesseractPromise) return tesseractPromise
  tesseractPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = TESSERACT_CDN
    script.onload = () => resolve((window as any).Tesseract)
    script.onerror = () => reject(new Error('Tesseract.js konnte nicht geladen werden'))
    document.head.appendChild(script)
  })
  return tesseractPromise
}

// Verfügbare OCR-Sprachen (Tesseract-Codes)
const OCR_LANGUAGES: { code: string; label: string }[] = [
  { code: 'deu', label: 'Deutsch' },
  { code: 'eng', label: 'Englisch' },
  { code: 'fra', label: 'Französisch' },
  { code: 'ita', label: 'Italienisch' },
  { code: 'spa', label: 'Spanisch' },
  { code: 'por', label: 'Portugiesisch' },
  { code: 'nld', label: 'Niederländisch' },
]

// Unsichtbaren Textlayer (aus hOCR) auf eine PDF-Seite legen -> Seite wird durchsuchbar
function drawOcrTextLayer(page: any, hocr: string, font: PDFFont, scale: number) {
  try {
    const parsed = new DOMParser().parseFromString(hocr, 'text/html')
    const words = Array.from(parsed.querySelectorAll('.ocrx_word'))
    const pageHeight = page.getHeight()
    for (const word of words) {
      const title = word.getAttribute('title') || ''
      const m = title.match(/bbox (\d+) (\d+) (\d+) (\d+)/)
      if (!m) continue
      const y0 = Number(m[2])
      const x0 = Number(m[1])
      const x1 = Number(m[3])
      const y1 = Number(m[4])
      const text = (word.textContent || '').trim()
      if (!text) continue
      const x = x0 / scale
      const size = Math.max(1, (y1 - y0) / scale)
      const y = pageHeight - y1 / scale
      void x1
      try {
        page.drawText(text, { x, y, size, font, opacity: 0 })
      } catch {
        const safe = text.replace(/[^ -ÿ]/g, '')
        if (safe) {
          try {
            page.drawText(safe, { x, y, size, font, opacity: 0 })
          } catch {
            /* einzelnes Wort ignorieren */
          }
        }
      }
    }
  } catch (e) {
    console.error('Textlayer fehlgeschlagen:', e)
  }
}

// Bild aus einer dataURL als HTMLImageElement laden
function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// EXIF-Orientierung eines JPEGs lesen (1 = aufrecht, 2-8 = gedreht/gespiegelt).
// Handykameras speichern das Bild oft quer und vermerken die Drehung nur hier;
// pdf-lib wertet das nicht aus, deshalb müssen wir es selbst erkennen.
function readJpegOrientation(buffer: ArrayBuffer): number {
  try {
    const view = new DataView(buffer)
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1 // kein JPEG
    let offset = 2
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset)
      if ((marker & 0xff00) !== 0xff00) break
      if (marker === 0xffda) break // Beginn der Bilddaten, kein EXIF mehr
      const segmentLength = view.getUint16(offset + 2)
      if (marker === 0xffe1) {
        const exifStart = offset + 4
        // "Exif" + 2 Nullbytes, danach beginnt der TIFF-Header
        if (exifStart + 14 > view.byteLength) return 1
        if (view.getUint32(exifStart) !== 0x45786966) return 1
        const tiff = exifStart + 6
        const littleEndian = view.getUint16(tiff) === 0x4949
        const ifdOffset = view.getUint32(tiff + 4, littleEndian)
        const entryCount = view.getUint16(tiff + ifdOffset, littleEndian)
        for (let i = 0; i < entryCount; i++) {
          const entry = tiff + ifdOffset + 2 + i * 12
          if (entry + 12 > view.byteLength) break
          if (view.getUint16(entry, littleEndian) === 0x0112) {
            return view.getUint16(entry + 8, littleEndian) || 1
          }
        }
        return 1
      }
      offset += 2 + segmentLength
    }
  } catch {
    // Defektes EXIF soll den Import nicht verhindern
  }
  return 1
}

// Bild dekodieren und als dataURL zurückgeben. createImageBitmap wendet mit
// imageOrientation: 'from-image' die EXIF-Drehung an, sodass die Pixel bereits
// richtig herum liegen. Fotos werden als JPEG, Grafiken als PNG ausgegeben.
async function normalizeImage(file: File): Promise<{ dataUrl: string }> {
  const asPng = file.type === 'image/gif' || file.type === 'image/bmp'
  let width: number
  let height: number
  let source: CanvasImageSource

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    width = bitmap.width
    height = bitmap.height
    source = bitmap
  } else {
    // Sehr alte Browser: Fallback ohne EXIF-Auswertung
    const url = URL.createObjectURL(file)
    try {
      const img = await loadImageEl(url)
      width = img.naturalWidth
      height = img.naturalHeight
      source = img
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas-Kontext fehlt')
  if (!asPng) {
    // JPEG kennt keine Transparenz -> sonst würde sie schwarz werden
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(source, 0, 0)
  if ('close' in source && typeof source.close === 'function') source.close()

  return { dataUrl: canvas.toDataURL(asPng ? 'image/png' : 'image/jpeg', 0.92) }
}


// Bilddatei (JPG/PNG/WebP/…) in ein einseitiges PDF umwandeln.
// Dadurch läuft das Bild anschließend durch die gleiche Verarbeitung wie eine
// normale PDF-Seite: Vorschau, Sortieren, Editor und OCR funktionieren unverändert.
async function imageFileToPdfBytes(
  file: File,
  pageSize: ImagePageSize,
  orientation: ImageOrientation
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const buffer = await file.arrayBuffer()

  let image
  if (file.type === 'image/jpeg' && readJpegOrientation(buffer) === 1) {
    // Aufrecht aufgenommenes JPEG: unverändert einbetten (verlustfrei, klein)
    image = await doc.embedJpg(buffer)
  } else if (file.type === 'image/png') {
    // PNG kennt keine EXIF-Drehung
    image = await doc.embedPng(buffer)
  } else {
    // Gedrehte Handyfotos sowie WebP/GIF/BMP über ein Canvas normalisieren.
    // createImageBitmap wendet dabei die EXIF-Drehung an, sodass das Bild
    // so im PDF landet, wie es auf dem Handy angezeigt wird.
    const { dataUrl } = await normalizeImage(file)
    image = dataUrl.startsWith('data:image/png')
      ? await doc.embedPng(dataUrl)
      : await doc.embedJpg(dataUrl)
  }

  if (pageSize === 'original') {
    // Seite exakt so groß wie das Bild (96 dpi angenommen)
    const width = image.width * PX_TO_PT
    const height = image.height * PX_TO_PT
    const page = doc.addPage([width, height])
    page.drawImage(image, { x: 0, y: 0, width, height })
  } else {
    // In das gewählte Format einpassen. Die Ausrichtung folgt der Auswahl;
    // bei "auto" entscheidet das Seitenverhältnis des Bildes.
    const fmt = PAGE_FORMATS[pageSize]
    const isLandscape =
      orientation === 'auto' ? image.width > image.height : orientation === 'landscape'
    const pageWidth = isLandscape ? fmt.height : fmt.width
    const pageHeight = isLandscape ? fmt.width : fmt.height
    const scale = Math.min(pageWidth / image.width, pageHeight / image.height)
    const width = image.width * scale
    const height = image.height * scale
    const page = doc.addPage([pageWidth, pageHeight])
    page.drawImage(image, {
      x: (pageWidth - width) / 2,
      y: (pageHeight - height) / 2,
      width,
      height,
    })
  }

  return doc.save()
}

// Ein Eintrag in der Liste ist entweder eine echte PDF-Seite oder eine Leerseite
interface PageItem {
  id: string
  type: 'pdf' | 'blank'
  sourceId?: string // Verweis auf die Quelldatei (nur bei type === 'pdf')
  pageIndex?: number // 0-basierter Seitenindex in der Quelldatei
  sourceName?: string // Dateiname für die Anzeige
  selected: boolean
  thumbnail: string | null
  blankWidth?: number // Breite der Leerseite (Punkte)
  blankHeight?: number // Höhe der Leerseite (Punkte)
  blankLabel?: string // Anzeige, z.B. "A4 · Hochformat"
  editedDataUrl?: string // zusammengesetztes Bild der bearbeiteten Seite
  editedWidthPt?: number
  editedHeightPt?: number
}

interface PreviewData {
  url: string
  pageCount: number
  pages: string[] // Base64 rendered pages for mobile compatibility
}

interface SortableItemProps {
  pageItem: PageItem
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onAddBlankAfter: (id: string) => void
  onOpenEditor: (id: string) => void
  onRefit: (id: string) => void
  isImage: boolean
  index: number
  displayNumber: number
}

function SortableItem({ pageItem, onToggle, onRemove, onAddBlankAfter, onOpenEditor, onRefit, isImage, index, displayNumber }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pageItem.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    animationDelay: `${index * 30}ms`,
  }

  const isBlank = pageItem.type === 'blank'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex flex-col rounded-xl glass-card overflow-hidden transition-all duration-300 animate-slide-up ${
        isDragging ? 'opacity-50 shadow-2xl scale-[1.03] z-50' : 'hover:shadow-lg hover:-translate-y-0.5'
      } ${!pageItem.selected ? 'opacity-50' : ''}`}
    >
      {/* Vorschau mit Positionsnummer; Aktionen erscheinen beim Überfahren */}
      <div
        className="relative flex-1 flex items-center justify-center p-3 bg-muted/30 aspect-[3/4] cursor-pointer"
        onDoubleClick={() => onOpenEditor(pageItem.id)}
        title="Doppelklick zum Bearbeiten"
      >
        {isBlank ? (
          <div className="w-full h-full rounded-lg border-2 border-dashed border-muted-foreground/30 bg-background flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <FileX className="h-8 w-8 opacity-60" />
            <span className="text-xs font-medium text-center px-2">
              {pageItem.blankLabel ?? 'Leerseite'}
            </span>
          </div>
        ) : pageItem.thumbnail ? (
          <img
            src={pageItem.thumbnail}
            alt="Seitenvorschau"
            className="max-h-full max-w-full w-auto rounded-md shadow-md pdf-thumbnail"
          />
        ) : (
          <div className="w-full h-full rounded-lg bg-muted/50 flex items-center justify-center">
            <FileText className="h-8 w-8 text-muted-foreground/40 animate-pulse" />
          </div>
        )}

        {/* Nummer und Auswahl liegen über der Vorschau */}
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1.5 rounded-lg bg-background/85 backdrop-blur-sm px-1.5 py-1 shadow-sm">
          <span className="text-xs font-semibold tabular-nums w-4 text-center">
            {pageItem.selected ? displayNumber : '–'}
          </span>
          <Checkbox
            checked={pageItem.selected}
            onCheckedChange={() => onToggle(pageItem.id)}
            aria-label="Seite auswählen"
            className="h-4 w-4 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
        </div>

        <button
          className="absolute top-1.5 right-1.5 cursor-grab active:cursor-grabbing touch-none p-1.5 rounded-lg bg-background/85 backdrop-blur-sm shadow-sm hover:bg-background transition-colors"
          {...attributes}
          {...listeners}
          title="Zum Verschieben ziehen"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Auf Touch-Geräten dauerhaft sichtbar, am Desktop erst beim Überfahren */}
        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 p-1.5 bg-gradient-to-t from-background/95 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => onOpenEditor(pageItem.id)}
            title="Seite bearbeiten"
            className="h-8 w-8 shadow-sm"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {isImage && (
            <Button
              variant="secondary"
              size="icon"
              onClick={() => onRefit(pageItem.id)}
              title="Format und Ausrichtung dieser Bildseite ändern"
              className="h-8 w-8 shadow-sm"
            >
              <Scaling className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="secondary"
            size="icon"
            onClick={() => onAddBlankAfter(pageItem.id)}
            title="Leerseite nach dieser Seite einfügen"
            className="h-8 w-8 shadow-sm"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => onRemove(pageItem.id)}
            title="Seite entfernen"
            className="h-8 w-8 shadow-sm text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Fußzeile: Herkunft der Seite */}
      <div className="px-2 py-1.5 border-t border-border/40">
        <p className={`text-xs font-medium truncate ${!pageItem.selected ? 'line-through text-muted-foreground' : ''}`}>
          {isBlank ? 'Leerseite' : pageItem.sourceName}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">
          {isBlank
            ? pageItem.blankLabel ?? 'A4'
            : isImage
              ? 'Bild'
              : `Seite ${(pageItem.pageIndex ?? 0) + 1}`}
          {pageItem.editedDataUrl ? ' · bearbeitet' : ''}
        </p>
      </div>
    </div>
  )
}

interface Toast {
  id: string
  message: string
  variant: 'success' | 'error' | 'info'
}

// Kurze Rückmeldungen am oberen Rand – ersetzt die störenden Browser-Dialoge
function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 w-[min(24rem,calc(100vw-2rem))]">
      {toasts.map((toast) => {
        const styles = {
          success: 'border-green-500/40 text-green-700 dark:text-green-300',
          error: 'border-destructive/40 text-destructive',
          info: 'border-primary/40 text-primary',
        }[toast.variant]
        const Icon = { success: CheckCircle2, error: AlertCircle, info: Info }[toast.variant]
        return (
          <div
            key={toast.id}
            role="status"
            className={`glass-card rounded-xl border-l-4 px-4 py-3 flex items-start gap-3 animate-slide-up ${styles}`}
          >
            <Icon className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm text-foreground flex-1 whitespace-pre-line">{toast.message}</p>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Meldung schließen"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function ThemeToggle({ darkMode, onToggle }: { darkMode: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="theme-toggle p-2.5 rounded-xl glass transition-all duration-300 hover:scale-110 hover:shadow-lg"
      aria-label="Theme wechseln"
    >
      <div className="relative w-6 h-6">
        <Sun
          className={`h-6 w-6 text-yellow-500 absolute inset-0 transition-all duration-500 ${
            darkMode ? 'opacity-0 rotate-90 scale-0' : 'opacity-100 rotate-0 scale-100'
          }`}
        />
        <Moon
          className={`h-6 w-6 text-blue-400 absolute inset-0 transition-all duration-500 ${
            darkMode ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-0'
          }`}
        />
      </div>
    </button>
  )
}

function App() {
  const [pageItems, setPageItems] = useState<PageItem[]>([])
  // Roh-Bytes der Quelldateien, um beim Zusammenfügen Seiten kopieren zu können
  const sourcesRef = useRef<Map<string, Uint8Array>>(new Map())
  // Originalbilder behalten, damit Format und Ausrichtung später erneut
  // angewendet werden können, ohne dass Qualität verloren geht
  const imageSourcesRef = useRef<
    Map<string, { file: File; pageSize: ImagePageSize; orientation: ImageOrientation }>
  >(new Map())
  const [outputName, setOutputName] = useState('combined')
  const [blankFormat, setBlankFormat] = useState<FormatKey>('A4')
  const [blankOrientation, setBlankOrientation] = useState<Orientation>('portrait')
  const [imagePageSize, setImagePageSize] = useState<ImagePageSize>('A4')
  const [imageOrientation, setImageOrientation] = useState<ImageOrientation>('auto')
  // Nachträgliches Anpassen der Einpassung eines Bildes
  const [refitId, setRefitId] = useState<string | null>(null)
  const [refitSize, setRefitSize] = useState<ImagePageSize>('A4')
  const [refitOrientation, setRefitOrientation] = useState<ImageOrientation>('auto')
  const [isRefitting, setIsRefitting] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [ocrEnabled, setOcrEnabled] = useState(false)
  const [ocrLanguages, setOcrLanguages] = useState<string[]>(['deu', 'eng'])
  const [ocrStatus, setOcrStatus] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const pageItemsRef = useRef(pageItems)
  useEffect(() => {
    pageItemsRef.current = pageItems
  }, [pageItems])
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  // Zähler, damit das Drop-Overlay beim Überfahren von Kindelementen nicht flackert
  const dragDepthRef = useRef(0)

  const dismissToast = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, variant: Toast['variant'] = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      setToasts((list) => [...list, { id, message, variant }])
      // Fehler bleiben länger stehen, damit man sie in Ruhe lesen kann
      window.setTimeout(() => dismissToast(id), variant === 'error' ? 9000 : 4000)
    },
    [dismissToast]
  )
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true' ||
        (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
    return false
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Dark Mode Effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('darkMode', String(darkMode))
  }, [darkMode])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const makeId = () =>
    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  // PDF-Bytes in einzelne Seiten-Einträge zerlegen.
  // Seitenanzahl wird über pdf-lib ermittelt (kein Worker nötig) -> immer robust.
  const explodeBytes = async (bytes: Uint8Array, name: string): Promise<PageItem[]> => {
    try {
      const sourceId = makeId()
      // Bytes für späteres Kopieren der Seiten / Thumbnails merken
      sourcesRef.current.set(sourceId, bytes)

      // Seitenanzahl zuverlässig über pdf-lib
      const doc = await PDFDocument.load(bytes.slice())
      const pageCount = doc.getPageCount()

      const items: PageItem[] = []
      for (let i = 0; i < pageCount; i++) {
        items.push({
          id: makeId(),
          type: 'pdf',
          sourceId,
          pageIndex: i,
          sourceName: name,
          selected: true,
          thumbnail: null,
        })
      }
      return items
    } catch (error) {
      console.error('Fehler beim Laden der PDF:', error)
      return []
    }
  }

  // Thumbnails einer Quelldatei nachträglich rendern und in den State patchen.
  const renderThumbnailsForSource = async (sourceId: string) => {
    const bytes = sourcesRef.current.get(sourceId)
    if (!bytes) return
    try {
      const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
      for (let i = 1; i <= pdf.numPages; i++) {
        try {
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 0.5 })
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')
          if (!context) continue
          canvas.width = viewport.width
          canvas.height = viewport.height
          await page.render({ canvasContext: context, viewport, canvas }).promise
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
          const pageIndex = i - 1
          setPageItems((items) =>
            items.map((it) =>
              it.sourceId === sourceId && it.pageIndex === pageIndex
                ? { ...it, thumbnail: dataUrl }
                : it
            )
          )
        } catch {
          // einzelne Seite ohne Thumbnail ist ok
        }
      }
    } catch (error) {
      console.error('Thumbnails konnten nicht gerendert werden:', error)
    }
  }

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(
      (file) => file.type === 'application/pdf' || file.type.startsWith('image/')
    )

    const newItems: PageItem[] = []
    const newSourceIds: string[] = []
    const failed: string[] = []
    for (const file of fileArray) {
      const isImage = file.type.startsWith('image/')
      let bytes: Uint8Array
      try {
        bytes = isImage
          ? await imageFileToPdfBytes(file, imagePageSize, imageOrientation)
          : new Uint8Array(await file.arrayBuffer())
      } catch (error) {
        console.error(`Datei konnte nicht gelesen werden: ${file.name}`, error)
        failed.push(file.name)
        continue
      }
      const items = await explodeBytes(bytes, file.name)
      if (items.length === 0) {
        failed.push(file.name)
        continue
      }
      if (items[0].sourceId) {
        newSourceIds.push(items[0].sourceId)
        if (isImage) {
          imageSourcesRef.current.set(items[0].sourceId, {
            file,
            pageSize: imagePageSize,
            orientation: imageOrientation,
          })
        }
      }
      newItems.push(...items)
    }

    if (newItems.length > 0) {
      setPageItems((prev) => [...prev, ...newItems])
      newSourceIds.forEach((sid) => {
        void renderThumbnailsForSource(sid)
      })
    }

    if (newItems.length > 0) {
      showToast(
        `${newItems.length} ${newItems.length === 1 ? 'Seite' : 'Seiten'} hinzugefügt`,
        'success'
      )
    }

    if (failed.length > 0) {
      showToast(
        `Nicht geladen: ${failed.join(', ')}\n` +
          'Mögliche Ursachen: beschädigte oder passwortgeschützte PDFs, oder ein ' +
          'Bildformat, das der Browser nicht öffnen kann (z. B. HEIC von iPhones).',
        'error'
      )
    }
  }, [imagePageSize, imageOrientation, showToast])

  const makeBlankItem = (): PageItem => {
    const fmt = PAGE_FORMATS[blankFormat]
    const isLandscape = blankOrientation === 'landscape'
    const width = isLandscape ? fmt.height : fmt.width
    const height = isLandscape ? fmt.width : fmt.height
    return {
      id: makeId(),
      type: 'blank',
      selected: true,
      thumbnail: null,
      blankWidth: width,
      blankHeight: height,
      blankLabel: `${fmt.label} · ${isLandscape ? 'Querformat' : 'Hochformat'}`,
    }
  }

  const addBlankAtStart = () => {
    setPageItems((items) => [makeBlankItem(), ...items])
  }

  const addBlankAtEnd = () => {
    setPageItems((items) => [...items, makeBlankItem()])
  }

  const addBlankAfter = (id: string) => {
    setPageItems((items) => {
      const index = items.findIndex((it) => it.id === id)
      if (index === -1) return [...items, makeBlankItem()]
      const next = [...items]
      next.splice(index + 1, 0, makeBlankItem())
      return next
    })
  }

  // Dateien können überall im Fenster abgelegt werden, nicht nur im Upload-Feld
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      dragDepthRef.current = 0
      setIsDragOver(false)
      if (e.dataTransfer.files) {
        handleFiles(e.dataTransfer.files)
      }
    },
    [handleFiles]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    // Nur echte Dateien zeigen das Overlay, nicht das Ziehen von Seitenkacheln
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    dragDepthRef.current += 1
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDragOver(false)
  }, [])

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(e.target.files)
      }
      e.target.value = ''
    },
    [handleFiles]
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setPageItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  const toggleFile = (id: string) => {
    setPageItems((items) =>
      items.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f))
    )
  }

  const removeFile = (id: string) => {
    setPageItems((items) => {
      const removed = items.find((f) => f.id === id)
      const rest = items.filter((f) => f.id !== id)
      // Quelldaten freigeben, sobald keine Seite mehr darauf verweist
      const sourceId = removed?.sourceId
      if (sourceId && !rest.some((f) => f.sourceId === sourceId)) {
        sourcesRef.current.delete(sourceId)
        imageSourcesRef.current.delete(sourceId)
      }
      return rest
    })
  }

  // Format/Ausrichtung eines bereits eingefügten Bildes erneut anwenden.
  // Die Seite wird aus dem Originalbild neu aufgebaut, daher entsteht kein
  // Qualitätsverlust durch mehrfaches Anpassen.
  const applyRefit = async () => {
    const item = pageItems.find((pi) => pi.id === refitId)
    const source = item?.sourceId ? imageSourcesRef.current.get(item.sourceId) : undefined
    if (!item || !item.sourceId || !source) return

    if (
      item.editedDataUrl &&
      !window.confirm(
        'Diese Seite wurde im Editor bearbeitet. Beim Anpassen der Einpassung gehen ' +
          'diese Änderungen verloren. Fortfahren?'
      )
    ) {
      return
    }

    setIsRefitting(true)
    try {
      const bytes = await imageFileToPdfBytes(source.file, refitSize, refitOrientation)
      sourcesRef.current.set(item.sourceId, bytes)
      imageSourcesRef.current.set(item.sourceId, {
        ...source,
        pageSize: refitSize,
        orientation: refitOrientation,
      })
      setPageItems((items) =>
        items.map((it) =>
          it.sourceId === item.sourceId
            ? {
                ...it,
                thumbnail: null,
                editedDataUrl: undefined,
                editedWidthPt: undefined,
                editedHeightPt: undefined,
              }
            : it
        )
      )
      await renderThumbnailsForSource(item.sourceId)
      setRefitId(null)
      showToast('Einpassung angepasst', 'success')
    } catch (error) {
      console.error('Einpassung konnte nicht geändert werden:', error)
      showToast('Die Einpassung konnte nicht geändert werden.', 'error')
    } finally {
      setIsRefitting(false)
    }
  }

  const openRefit = (id: string) => {
    const item = pageItems.find((pi) => pi.id === id)
    const source = item?.sourceId ? imageSourcesRef.current.get(item.sourceId) : undefined
    if (!source) return
    setRefitSize(source.pageSize)
    setRefitOrientation(source.orientation)
    setRefitId(id)
  }

  const selectAll = () => {
    setPageItems((items) => items.map((f) => ({ ...f, selected: true })))
  }

  const deselectAll = () => {
    setPageItems((items) => items.map((f) => ({ ...f, selected: false })))
  }

  const removeAll = () => {
    setPageItems([])
    sourcesRef.current.clear()
    imageSourcesRef.current.clear()
  }

  const toggleOcrLanguage = (code: string) => {
    setOcrLanguages((langs) =>
      langs.includes(code) ? langs.filter((c) => c !== code) : [...langs, code]
    )
  }

  const openEditor = (id: string) => setEditingId(id)

  const loadBaseForEditor = useCallback(async () => {
    const item = pageItemsRef.current.find((pi) => pi.id === editingId)
    if (!item) throw new Error('Seite nicht gefunden')
    if (item.editedDataUrl && item.editedWidthPt && item.editedHeightPt) {
      return { dataUrl: item.editedDataUrl, widthPt: item.editedWidthPt, heightPt: item.editedHeightPt }
    }
    if (item.type === 'blank') {
      const wPt = item.blankWidth ?? A4_WIDTH
      const hPt = item.blankHeight ?? A4_HEIGHT
      const sc = 2
      const c = document.createElement('canvas')
      c.width = Math.round(wPt * sc)
      c.height = Math.round(hPt * sc)
      const ctx = c.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, c.width, c.height)
      }
      return { dataUrl: c.toDataURL('image/png'), widthPt: wPt, heightPt: hPt }
    }
    const bytes = item.sourceId ? sourcesRef.current.get(item.sourceId) : undefined
    if (!bytes) throw new Error('Quelle fehlt')
    const pj = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
    const pg = await pj.getPage((item.pageIndex ?? 0) + 1)
    const ptVp = pg.getViewport({ scale: 1 })
    const vp = pg.getViewport({ scale: 2 })
    const c = document.createElement('canvas')
    c.width = vp.width
    c.height = vp.height
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('Canvas-Kontext fehlt')
    await pg.render({ canvasContext: ctx, viewport: vp, canvas: c }).promise
    return { dataUrl: c.toDataURL('image/png'), widthPt: ptVp.width, heightPt: ptVp.height }
  }, [editingId])

  const handleApplyEdit = (id: string, r: { dataUrl: string; widthPt: number; heightPt: number }) => {
    setPageItems((items) =>
      items.map((it) =>
        it.id === id
          ? {
              ...it,
              editedDataUrl: r.dataUrl,
              editedWidthPt: r.widthPt,
              editedHeightPt: r.heightPt,
              thumbnail: r.dataUrl,
            }
          : it
      )
    )
    setEditingId(null)
  }

  const renderPdfPages = async (pdfBytes: Uint8Array): Promise<string[]> => {
    const pages: string[] = []
    try {
      const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise
      const totalPages = pdf.numPages

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i)
        const scale = 1.5 // Höhere Auflösung für bessere Lesbarkeit
        const viewport = page.getViewport({ scale })

        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (!context) continue

        canvas.width = viewport.width
        canvas.height = viewport.height

        await page.render({
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        }).promise

        pages.push(canvas.toDataURL('image/jpeg', 0.9))
      }
    } catch (error) {
      console.error('Fehler beim Rendern der Seiten:', error)
    }
    return pages
  }

  const combinePDFs = async () => {
    const selectedItems = pageItems.filter((f) => f.selected)
    if (selectedItems.length < 1) {
      showToast('Bitte wählen Sie mindestens 1 Seite aus.', 'error')
      return
    }

    setIsProcessing(true)
    setProgress({ current: 0, total: selectedItems.length })

    try {
      const mergedPdf = await PDFDocument.create()
      // Geladene Quell-Dokumente zwischenspeichern (jede Datei nur einmal laden)
      const loadedDocs = new Map<string, PDFDocument>()

      // OCR vorbereiten (optional)
      const doOcr = ocrEnabled && ocrLanguages.length > 0
      let ocrWorker: any = null
      let ocrFont: PDFFont | null = null
      const pdfjsCache = new Map<string, any>()
      if (doOcr) {
        setOcrStatus('OCR wird vorbereitet (Sprachdaten werden geladen) …')
        try {
          const T = await loadTesseract()
          ocrWorker = await T.createWorker(ocrLanguages.join('+'), 1, {
            logger: (msg: any) => {
              if (msg && msg.status) {
                const pct = typeof msg.progress === 'number' ? ` ${Math.round(msg.progress * 100)}%` : ''
                setOcrStatus(`OCR: ${msg.status}${pct}`)
              }
            },
          })
          ocrFont = await mergedPdf.embedFont(StandardFonts.Helvetica)
        } catch (e) {
          console.error(e)
          throw new Error('OCR konnte nicht gestartet werden. Bitte Internetverbindung prüfen.')
        }
      }

      let pageNo = 0
      for (const item of selectedItems) {
        pageNo++
        setProgress({ current: pageNo, total: selectedItems.length })
        if (item.editedDataUrl && item.editedWidthPt && item.editedHeightPt) {
          const wPt = item.editedWidthPt
          const hPt = item.editedHeightPt
          const png = await mergedPdf.embedPng(item.editedDataUrl)
          const page = mergedPdf.addPage([wPt, hPt])
          page.drawImage(png, { x: 0, y: 0, width: wPt, height: hPt })
          if (doOcr && ocrWorker && ocrFont) {
            try {
              setOcrStatus(`OCR: Seite ${pageNo} von ${selectedItems.length} …`)
              const img = await loadImageEl(item.editedDataUrl)
              const c = document.createElement('canvas')
              c.width = img.naturalWidth
              c.height = img.naturalHeight
              const cx = c.getContext('2d')
              if (cx) {
                cx.drawImage(img, 0, 0)
                const { data } = await ocrWorker.recognize(c, {}, { hocr: true })
                drawOcrTextLayer(page, data.hocr, ocrFont, img.naturalWidth / wPt)
              }
            } catch (e) {
              console.error('OCR (bearbeitete Seite) fehlgeschlagen:', e)
            }
          }
          continue
        }
        if (item.type === 'blank') {
          mergedPdf.addPage([
            item.blankWidth ?? A4_WIDTH,
            item.blankHeight ?? A4_HEIGHT,
          ])
          continue
        }

        const bytes = item.sourceId
          ? sourcesRef.current.get(item.sourceId)
          : undefined
        if (!bytes) continue

        let doc = loadedDocs.get(item.sourceId!)
        if (!doc) {
          doc = await PDFDocument.load(bytes.slice())
          loadedDocs.set(item.sourceId!, doc)
        }

        const [copiedPage] = await mergedPdf.copyPages(doc, [item.pageIndex ?? 0])
        const addedPage = mergedPdf.addPage(copiedPage)

        // OCR-Textlayer hinzufügen (nur bei nicht gedrehten Seiten exakt platzierbar)
        if (doOcr && ocrWorker && ocrFont && addedPage.getRotation().angle % 360 === 0) {
          try {
            setOcrStatus(`OCR: Seite ${pageNo} von ${selectedItems.length} …`)
            let pj = pdfjsCache.get(item.sourceId!)
            if (!pj) {
              pj = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
              pdfjsCache.set(item.sourceId!, pj)
            }
            const ocrScale = 2
            const pg = await pj.getPage((item.pageIndex ?? 0) + 1)
            const viewport = pg.getViewport({ scale: ocrScale })
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            if (ctx) {
              canvas.width = viewport.width
              canvas.height = viewport.height
              await pg.render({ canvasContext: ctx, viewport, canvas }).promise
              const { data } = await ocrWorker.recognize(canvas, {}, { hocr: true })
              drawOcrTextLayer(addedPage, data.hocr, ocrFont, ocrScale)
            }
          } catch (e) {
            console.error('OCR für Seite fehlgeschlagen:', e)
          }
        }
      }

      if (ocrWorker) {
        await ocrWorker.terminate()
        setOcrStatus(null)
      }

      const mergedPdfBytes = await mergedPdf.save()
      const blob = new Blob([new Uint8Array(mergedPdfBytes)], { type: 'application/pdf' })

      if (previewData?.url) {
        URL.revokeObjectURL(previewData.url)
      }

      const url = URL.createObjectURL(blob)

      // Render pages for mobile-compatible preview
      const renderedPages = await renderPdfPages(new Uint8Array(mergedPdfBytes))

      setPreviewData({
        url,
        pageCount: mergedPdf.getPageCount(),
        pages: renderedPages,
      })
      setShowPreview(true)
      showToast(
        `PDF mit ${mergedPdf.getPageCount()} Seiten erstellt${doOcr ? ' – inkl. OCR-Textlayer' : ''}`,
        'success'
      )
    } catch (error) {
      console.error('Fehler beim Zusammenfügen:', error)
      showToast(
        error instanceof Error && error.message
          ? error.message
          : 'Fehler beim Zusammenfügen der PDFs. Bitte versuchen Sie es erneut.',
        'error'
      )
    } finally {
      setIsProcessing(false)
      setProgress(null)
      setOcrStatus(null)
    }
  }

  const downloadPDF = () => {
    if (!previewData?.url) return

    const link = document.createElement('a')
    link.href = previewData.url
    link.download = `${outputName || 'combined'}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const closePreview = () => {
    setShowPreview(false)
    if (previewData?.url) {
      URL.revokeObjectURL(previewData.url)
      setPreviewData(null)
    }
  }

  const selectedCount = pageItems.filter((f) => f.selected).length
  const totalPages = selectedCount

  // Laufende Positionsnummer (nur ausgewählte Einträge zählen) für die Anzeige
  let runningNumber = 0
  const displayNumbers = pageItems.map((it) =>
    it.selected ? ++runningNumber : 0
  )

  const editingItem = pageItems.find((pi) => pi.id === editingId) || null

  // Vorschau-Ansicht
  if (showPreview && previewData) {
    return (
      <div className="min-h-screen bg-background bg-pattern flex flex-col">
        <header className="glass-header text-white py-4 shrink-0 shadow-lg">
          <div className="container px-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closePreview}
                  className="text-white hover:bg-white/20 transition-all duration-200 hover:scale-110"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <h1 className="text-lg sm:text-xl font-bold">PDF Vorschau</h1>
                  <p className="text-white/80 text-xs sm:text-sm">
                    {previewData.pageCount} Seiten
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle darkMode={darkMode} onToggle={() => setDarkMode(!darkMode)} />
                <Button
                  variant="secondary"
                  onClick={closePreview}
                  className="hidden sm:flex glass hover:scale-105 transition-all duration-200"
                >
                  <X className="h-4 w-4 mr-2" />
                  Abbrechen
                </Button>
                <Button
                  onClick={downloadPDF}
                  className="bg-green-500 hover:bg-green-600 shadow-lg hover:shadow-green-500/25 hover:scale-105 transition-all duration-200"
                >
                  <Download className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Herunterladen</span>
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 container px-4 py-4 animate-fade-in overflow-hidden">
          <Card className="h-full glass-card flex flex-col">
            <CardContent className="p-2 sm:p-4 flex-1 overflow-hidden">
              {/* Desktop: iframe (hidden on mobile) */}
              <iframe
                src={previewData.url}
                className="w-full h-[calc(100vh-220px)] sm:h-[calc(100vh-200px)] rounded-xl hidden sm:block"
                title="PDF Vorschau"
              />
              {/* Mobile: gerenderte Bilder (hidden on desktop) */}
              <div className="h-[calc(100vh-220px)] overflow-y-auto space-y-4 pr-2 sm:hidden">
                {previewData.pages.length > 0 ? (
                  previewData.pages.map((pageData, index) => (
                    <div key={index} className="relative">
                      <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-md z-10">
                        Seite {index + 1} / {previewData.pageCount}
                      </div>
                      <img
                        src={pageData}
                        alt={`Seite ${index + 1}`}
                        className="w-full rounded-lg shadow-lg border border-border/50"
                      />
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium">PDF bereit zum Download</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      {previewData.pageCount} Seiten zusammengefügt
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </main>

        <footer className="glass py-4 shrink-0">
          <div className="container px-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground text-center sm:text-left">
                {outputName || 'combined'}.pdf - {previewData.pageCount} Seiten
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={closePreview} className="hover:scale-105 transition-all duration-200">
                  Zurück
                </Button>
                <Button onClick={downloadPDF} className="bg-green-500 hover:bg-green-600 hover:scale-105 transition-all duration-200">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          </div>
        </footer>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen bg-background bg-pattern flex flex-col"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {/* Overlay, solange Dateien über dem Fenster schweben */}
      {isDragOver && (
        <div className="fixed inset-0 z-[150] bg-primary/10 backdrop-blur-sm flex items-center justify-center p-8 pointer-events-none animate-fade-in">
          <div className="glass-card rounded-3xl border-2 border-dashed border-primary px-10 py-12 text-center shadow-2xl">
            <FileUp className="h-16 w-16 mx-auto mb-4 text-primary animate-bounce-in" />
            <p className="text-xl font-semibold">Dateien hier ablegen</p>
            <p className="text-sm text-muted-foreground mt-1">PDFs und Bilder werden übernommen</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="glass-header text-white py-6 sm:py-8 shadow-lg shrink-0">
        <div className="container px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-white/20 rounded-xl backdrop-blur-sm animate-bounce-in">
                <img src={logoImage} alt="Combine Your PDF Logo" className="h-8 w-8 sm:h-10 sm:w-10 object-contain" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">PDF Combiner</h1>
                <p className="text-white/80 text-sm sm:text-base mt-0.5">
                  PDFs einfach zusammenfügen
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHelp(true)}
                title="Hilfe: alle Funktionen im Überblick"
                aria-label="Hilfe öffnen"
                className="p-2.5 rounded-xl glass transition-all duration-300 hover:scale-110 hover:shadow-lg"
              >
                <HelpCircle className="h-6 w-6 text-white" />
              </button>
              <ThemeToggle darkMode={darkMode} onToggle={() => setDarkMode(!darkMode)} />
            </div>
          </div>
        </div>
      </header>

      <main className="container px-4 py-6 sm:py-8 flex-1">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Upload Area */}
          <Card className="glass-card hover-lift animate-slide-up">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileUp className="h-5 w-5 text-primary" />
                </div>
                PDFs & Bilder hochladen
              </CardTitle>
              <CardDescription>
                Ziehen Sie PDF- oder Bilddateien hierher oder klicken Sie zum Auswählen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-300 ${
                  isDragOver
                    ? 'border-primary bg-primary/10 scale-[1.02] shadow-lg shadow-primary/20'
                    : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50'
                }`}
              >
                <div className={`transition-transform duration-300 ${isDragOver ? 'scale-110' : ''}`}>
                  <FileUp
                    className={`h-12 w-12 mx-auto mb-4 transition-colors duration-300 ${
                      isDragOver ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  />
                  <p className="text-lg font-medium">
                    {isDragOver
                      ? 'Dateien hier ablegen'
                      : 'PDF- oder Bilddateien hierher ziehen'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    oder klicken zum Auswählen · JPG, PNG, WebP werden zu PDF-Seiten
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf,image/*"
                  multiple
                  onChange={handleFileInput}
                  className="hidden"
                />
              </div>

              {/* Seitenformat & Ausrichtung für importierte Bilder */}
              <div className="mt-4 rounded-xl border border-border/50 bg-muted/20 p-3 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="imagePageSize" className="text-xs flex items-center gap-1.5">
                      <ImageIcon className="h-4 w-4 text-primary" />
                      Bilder einfügen als
                    </Label>
                    <select
                      id="imagePageSize"
                      value={imagePageSize}
                      onChange={(e) => setImagePageSize(e.target.value as ImagePageSize)}
                      className="h-9 w-full sm:w-52 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {Object.keys(PAGE_FORMATS).map((key) => (
                        <option key={key} value={key}>
                          {PAGE_FORMATS[key].label}-Seite (eingepasst)
                        </option>
                      ))}
                      <option value="original">Originalgröße des Bildes</option>
                    </select>
                  </div>

                  {imagePageSize !== 'original' && (
                    <div className="space-y-1">
                      <Label className="text-xs">Ausrichtung der Bildseite</Label>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant={imageOrientation === 'auto' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setImageOrientation('auto')}
                          title="Ausrichtung nach Seitenverhältnis des Bildes"
                        >
                          Automatisch
                        </Button>
                        <Button
                          type="button"
                          variant={imageOrientation === 'portrait' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setImageOrientation('portrait')}
                          className="gap-1.5"
                        >
                          <RectangleVertical className="h-4 w-4" />
                          Hochformat
                        </Button>
                        <Button
                          type="button"
                          variant={imageOrientation === 'landscape' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setImageOrientation('landscape')}
                          className="gap-1.5"
                        >
                          <RectangleHorizontal className="h-4 w-4" />
                          Querformat
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Das Bild wird vollständig in die Seite eingepasst und zentriert – auch wenn ein
                  breites Bild im Hochformat landet. Die Einstellung gilt für Bilder, die danach
                  hinzugefügt werden.
                </p>
              </div>

              {pageItems.length > 0 && (
                <div className="mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="hover:scale-105 transition-all duration-200"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Weitere hinzufügen
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* File List */}
          {pageItems.length > 0 && (
            <Card className="glass-card hover-lift animate-slide-up" style={{ animationDelay: '50ms' }}>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      Seitenreihenfolge
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {selectedCount} von {pageItems.length} Seiten ausgewählt
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={selectAll} className="hover:scale-105 transition-all">
                      Alle
                    </Button>
                    <Button variant="outline" size="sm" onClick={deselectAll} className="hover:scale-105 transition-all">
                      Keine
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={removeAll}
                      className="text-destructive hover:text-destructive hover:scale-105 transition-all"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Leerseiten-Optionen: Format & Ausrichtung */}
                <div className="rounded-xl border border-border/50 bg-muted/20 p-3 mb-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="blankFormat" className="text-xs">Format der Leerseite</Label>
                      <select
                        id="blankFormat"
                        value={blankFormat}
                        onChange={(e) => setBlankFormat(e.target.value as FormatKey)}
                        className="h-9 w-full sm:w-32 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {Object.keys(PAGE_FORMATS).map((key) => (
                          <option key={key} value={key}>
                            {PAGE_FORMATS[key].label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ausrichtung</Label>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant={blankOrientation === 'portrait' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setBlankOrientation('portrait')}
                          className="gap-1.5"
                        >
                          <RectangleVertical className="h-4 w-4" />
                          Hochformat
                        </Button>
                        <Button
                          type="button"
                          variant={blankOrientation === 'landscape' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setBlankOrientation('landscape')}
                          className="gap-1.5"
                        >
                          <RectangleHorizontal className="h-4 w-4" />
                          Querformat
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2 sm:ml-auto">
                      <Button variant="outline" size="sm" onClick={addBlankAtStart} className="hover:scale-105 transition-all">
                        <FilePlus className="h-4 w-4 mr-1.5" />
                        Am Anfang
                      </Button>
                      <Button variant="outline" size="sm" onClick={addBlankAtEnd} className="hover:scale-105 transition-all">
                        <FilePlus className="h-4 w-4 mr-1.5" />
                        Am Ende
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tipp: Mit „Leerseite danach“ unter jeder Seite fügen Sie eine Leerseite genau an dieser Stelle ein – im oben gewählten Format und der gewählten Ausrichtung.
                  </p>
                </div>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={pageItems.map((f) => f.id)}
                    strategy={rectSortingStrategy}
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[540px] overflow-y-auto pr-1 py-1">
                      {pageItems.map((pageItem, index) => (
                        <SortableItem
                          key={pageItem.id}
                          pageItem={pageItem}
                          onToggle={toggleFile}
                          onRemove={removeFile}
                          onAddBlankAfter={addBlankAfter}
                          onOpenEditor={openEditor}
                          onRefit={openRefit}
                          isImage={
                            !!pageItem.sourceId && imageSourcesRef.current.has(pageItem.sourceId)
                          }
                          index={index}
                          displayNumber={displayNumbers[index]}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </CardContent>
            </Card>
          )}

          {/* Output Settings & Combine */}
          {pageItems.length > 0 && (
            <Card className="glass-card hover-lift animate-slide-up" style={{ animationDelay: '100ms' }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Eye className="h-5 w-5 text-primary" />
                  </div>
                  Zusammenfügen & Vorschau
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="outputName">Dateiname für das kombinierte PDF</Label>
                  <div className="flex gap-2">
                    <Input
                      id="outputName"
                      value={outputName}
                      onChange={(e) => setOutputName(e.target.value)}
                      placeholder="combined"
                      className="flex-1 glass"
                    />
                    <span className="flex items-center text-muted-foreground">.pdf</span>
                  </div>
                </div>

                {/* OCR-Optionen */}
                <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <Checkbox
                      checked={ocrEnabled}
                      onCheckedChange={() => setOcrEnabled(!ocrEnabled)}
                      className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <span className="text-sm font-medium flex items-center gap-1.5">
                      <ScanText className="h-4 w-4 text-primary" />
                      OCR – durchsuchbares PDF erstellen
                    </span>
                  </label>
                  {ocrEnabled && (
                    <div className="space-y-2 pl-6">
                      <Label className="text-xs">Sprachen der Dokumente (Mehrfachauswahl)</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {OCR_LANGUAGES.map((l) => {
                          const active = ocrLanguages.includes(l.code)
                          return (
                            <Button
                              key={l.code}
                              type="button"
                              size="sm"
                              variant={active ? 'default' : 'outline'}
                              onClick={() => toggleOcrLanguage(l.code)}
                              className="h-7 text-xs"
                            >
                              {l.label}
                            </Button>
                          )
                        })}
                      </div>
                      {ocrLanguages.length === 0 && (
                        <p className="text-xs text-destructive">Bitte mindestens eine Sprache wählen.</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        OCR läuft lokal im Browser und erkennt auch Text auf eingefügten Bildern. Beim ersten Mal werden Sprachdaten aus dem Internet geladen; die Verarbeitung kann je nach Seitenzahl etwas dauern.
                      </p>
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  Der Knopf zum Zusammenfügen ist immer am unteren Rand erreichbar.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {pageItems.length === 0 && (
            <Card className="glass-card animate-fade-in">
              <CardContent className="py-16">
                <div className="text-center text-muted-foreground">
                  <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-muted/50 flex items-center justify-center">
                    <FileText className="h-10 w-10 opacity-50" />
                  </div>
                  <p className="text-lg font-medium">Keine Dateien hochgeladen</p>
                  <p className="text-sm mt-2">
                    Laden Sie PDFs oder Bilder hoch, um diese zusammenzufügen
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Feste Aktionsleiste: Hauptaktion bleibt immer erreichbar */}
      {pageItems.length > 0 && (
        <div className="sticky bottom-0 z-40 glass border-t border-border/50 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          {isProcessing && progress && (
            <div className="h-1 bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
              />
            </div>
          )}
          <div className="container px-4 py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {selectedCount} von {pageItems.length}{' '}
                {pageItems.length === 1 ? 'Seite' : 'Seiten'} ausgewählt
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {isProcessing
                  ? ocrStatus ??
                    (progress ? `Seite ${progress.current} von ${progress.total} …` : 'Verarbeite …')
                  : `${outputName || 'combined'}.pdf`}
              </p>
            </div>
            <Button
              onClick={combinePDFs}
              disabled={
                selectedCount < 1 || isProcessing || (ocrEnabled && ocrLanguages.length === 0)
              }
              size="lg"
              className="shrink-0 hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-primary/25"
            >
              {isProcessing ? (
                <>
                  <Combine className="h-5 w-5 sm:mr-2 animate-spin" />
                  <span className="hidden sm:inline">Verarbeite …</span>
                </>
              ) : (
                <>
                  <Combine className="h-5 w-5 sm:mr-2" />
                  <span className="hidden sm:inline">
                    {totalPages} {totalPages === 1 ? 'Seite' : 'Seiten'} zusammenfügen
                  </span>
                  <span className="sm:hidden">Zusammenfügen</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      <footer className="glass py-4 shrink-0 mt-auto">
        <div className="container px-4">
          <div className="flex items-center justify-center gap-3">
            <img src={logoImage} alt="Combine Your PDF Logo" className="h-10 w-auto" />
            <div className="flex flex-col">
              <p className="text-sm text-muted-foreground">
                Combine Your PDF - Alle Dateien werden lokal in Ihrem Browser verarbeitet
              </p>
              <p className="text-xs text-muted-foreground">
                &copy; {new Date().getFullYear()} Combine Your PDF. Alle Rechte vorbehalten.
              </p>
            </div>
          </div>
        </div>
      </footer>

      {showHelp && <HelpCenter onClose={() => setShowHelp(false)} />}

      {/* Dialog: Einpassung einer Bildseite nachträglich ändern */}
      {refitId && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="glass-card w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Scaling className="h-5 w-5 text-primary" />
                </div>
                Einpassung ändern
              </CardTitle>
              <CardDescription>
                Die Seite wird aus dem Originalbild neu aufgebaut – ohne Qualitätsverlust.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="refitSize" className="text-xs">
                  Seitenformat
                </Label>
                <select
                  id="refitSize"
                  value={refitSize}
                  onChange={(e) => setRefitSize(e.target.value as ImagePageSize)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {Object.keys(PAGE_FORMATS).map((key) => (
                    <option key={key} value={key}>
                      {PAGE_FORMATS[key].label}-Seite (eingepasst)
                    </option>
                  ))}
                  <option value="original">Originalgröße des Bildes</option>
                </select>
              </div>

              {refitSize !== 'original' && (
                <div className="space-y-1">
                  <Label className="text-xs">Ausrichtung</Label>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      variant={refitOrientation === 'auto' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRefitOrientation('auto')}
                    >
                      Automatisch
                    </Button>
                    <Button
                      type="button"
                      variant={refitOrientation === 'portrait' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRefitOrientation('portrait')}
                      className="gap-1.5"
                    >
                      <RectangleVertical className="h-4 w-4" />
                      Hochformat
                    </Button>
                    <Button
                      type="button"
                      variant={refitOrientation === 'landscape' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRefitOrientation('landscape')}
                      className="gap-1.5"
                    >
                      <RectangleHorizontal className="h-4 w-4" />
                      Querformat
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setRefitId(null)} disabled={isRefitting}>
                  <X className="h-4 w-4 mr-1" />
                  Abbrechen
                </Button>
                <Button onClick={applyRefit} disabled={isRefitting}>
                  {isRefitting ? 'Wird angewendet …' : 'Übernehmen'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {editingItem && (
        <PageEditor
          title={
            editingItem.type === 'blank'
              ? 'Leerseite'
              : `${editingItem.sourceName ?? 'Seite'} (Seite ${(editingItem.pageIndex ?? 0) + 1})`
          }
          loadBase={loadBaseForEditor}
          onCancel={() => setEditingId(null)}
          onApply={(r) => handleApplyEdit(editingItem.id, r)}
        />
      )}
    </div>
  )
}

export default App
