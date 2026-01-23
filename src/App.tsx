import { useState, useCallback, useRef, useEffect } from 'react'
import logoImage from '../public/combinemypdf.png'
import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
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
} from 'lucide-react'

// PDF.js Worker konfigurieren
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

interface PDFFile {
  id: string
  file: File
  name: string
  pageCount: number
  selected: boolean
  thumbnail: string | null
}

interface PreviewData {
  url: string
  pageCount: number
  pages: string[] // Base64 rendered pages for mobile compatibility
}

interface SortableItemProps {
  pdfFile: PDFFile
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  index: number
}

function SortableItem({ pdfFile, onToggle, onRemove, index }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pdfFile.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    animationDelay: `${index * 50}ms`,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl glass-card transition-all duration-300 animate-slide-up ${
        isDragging ? 'opacity-50 shadow-2xl scale-[1.02] z-50' : ''
      } ${!pdfFile.selected ? 'opacity-60' : 'hover:shadow-lg hover:-translate-y-0.5'}`}
    >
      <button
        className="cursor-grab active:cursor-grabbing touch-none p-1.5 hover:bg-primary/10 rounded-lg transition-colors"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </button>

      <Checkbox
        checked={pdfFile.selected}
        onCheckedChange={() => onToggle(pdfFile.id)}
        id={`checkbox-${pdfFile.id}`}
        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
      />

      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        {/* PDF Thumbnail */}
        <div className="shrink-0 w-12 h-16 sm:w-14 sm:h-18 rounded-lg overflow-hidden bg-muted/50 flex items-center justify-center shadow-inner">
          {pdfFile.thumbnail ? (
            <img
              src={pdfFile.thumbnail}
              alt={`Vorschau ${pdfFile.name}`}
              className="w-full h-full object-cover pdf-thumbnail"
            />
          ) : (
            <FileText className="h-6 w-6 text-muted-foreground/50" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`font-medium truncate text-sm sm:text-base ${!pdfFile.selected ? 'line-through text-muted-foreground' : ''}`}>
            {pdfFile.name}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {pdfFile.pageCount} {pdfFile.pageCount === 1 ? 'Seite' : 'Seiten'}
          </p>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => onRemove(pdfFile.id)}
        className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 transition-all duration-200 hover:scale-110"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
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
  const [pdfFiles, setPdfFiles] = useState<PDFFile[]>([])
  const [outputName, setOutputName] = useState('combined')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
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

  const generateThumbnail = async (file: File): Promise<string | null> => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      const page = await pdf.getPage(1)

      const scale = 0.5
      const viewport = page.getViewport({ scale })

      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) return null

      canvas.width = viewport.width
      canvas.height = viewport.height

      await page.render({
        canvasContext: context,
        viewport: viewport,
        canvas: canvas,
      }).promise

      return canvas.toDataURL('image/jpeg', 0.8)
    } catch {
      return null
    }
  }

  const getPageCount = async (file: File): Promise<number> => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await PDFDocument.load(arrayBuffer)
      return pdf.getPageCount()
    } catch {
      return 0
    }
  }

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(
      (file) => file.type === 'application/pdf'
    )

    const newPdfFiles: PDFFile[] = await Promise.all(
      fileArray.map(async (file) => {
        const [pageCount, thumbnail] = await Promise.all([
          getPageCount(file),
          generateThumbnail(file),
        ])
        return {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file,
          name: file.name,
          pageCount,
          selected: true,
          thumbnail,
        }
      })
    )

    setPdfFiles((prev) => [...prev, ...newPdfFiles])
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (e.dataTransfer.files) {
        handleFiles(e.dataTransfer.files)
      }
    },
    [handleFiles]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
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
      setPdfFiles((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  const toggleFile = (id: string) => {
    setPdfFiles((files) =>
      files.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f))
    )
  }

  const removeFile = (id: string) => {
    setPdfFiles((files) => files.filter((f) => f.id !== id))
  }

  const selectAll = () => {
    setPdfFiles((files) => files.map((f) => ({ ...f, selected: true })))
  }

  const deselectAll = () => {
    setPdfFiles((files) => files.map((f) => ({ ...f, selected: false })))
  }

  const removeAll = () => {
    setPdfFiles([])
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
        }).promise

        pages.push(canvas.toDataURL('image/jpeg', 0.9))
      }
    } catch (error) {
      console.error('Fehler beim Rendern der Seiten:', error)
    }
    return pages
  }

  const combinePDFs = async () => {
    const selectedFiles = pdfFiles.filter((f) => f.selected)
    if (selectedFiles.length < 2) {
      alert('Bitte wählen Sie mindestens 2 PDFs aus.')
      return
    }

    setIsProcessing(true)

    try {
      const mergedPdf = await PDFDocument.create()

      for (const pdfFile of selectedFiles) {
        const arrayBuffer = await pdfFile.file.arrayBuffer()
        const pdf = await PDFDocument.load(arrayBuffer)
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices())
        copiedPages.forEach((page) => mergedPdf.addPage(page))
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
    } catch (error) {
      console.error('Fehler beim Zusammenfügen:', error)
      alert('Fehler beim Zusammenfügen der PDFs. Bitte versuchen Sie es erneut.')
    } finally {
      setIsProcessing(false)
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

  const selectedCount = pdfFiles.filter((f) => f.selected).length
  const totalPages = pdfFiles
    .filter((f) => f.selected)
    .reduce((sum, f) => sum + f.pageCount, 0)

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
    <div className="min-h-screen bg-background bg-pattern flex flex-col">
      {/* Header */}
      <header className="glass-header text-white py-6 sm:py-8 shadow-lg shrink-0">
        <div className="container px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-white/20 rounded-xl backdrop-blur-sm animate-bounce-in">
                <Combine className="h-8 w-8 sm:h-10 sm:w-10" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">PDF Combiner</h1>
                <p className="text-white/80 text-sm sm:text-base mt-0.5">
                  PDFs einfach zusammenfügen
                </p>
              </div>
            </div>
            <ThemeToggle darkMode={darkMode} onToggle={() => setDarkMode(!darkMode)} />
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
                PDF-Dateien hochladen
              </CardTitle>
              <CardDescription>
                Ziehen Sie PDF-Dateien hierher oder klicken Sie zum Auswählen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
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
                      : 'PDF-Dateien hierher ziehen'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    oder klicken zum Auswählen
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  onChange={handleFileInput}
                  className="hidden"
                />
              </div>

              {pdfFiles.length > 0 && (
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
          {pdfFiles.length > 0 && (
            <Card className="glass-card hover-lift animate-slide-up" style={{ animationDelay: '50ms' }}>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      Hochgeladene PDFs
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {selectedCount} von {pdfFiles.length} ausgewählt ({totalPages} Seiten)
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
                <p className="text-sm text-muted-foreground mb-4">
                  Ziehen Sie die Dateien, um die Reihenfolge zu ändern
                </p>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={pdfFiles.map((f) => f.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                      {pdfFiles.map((pdfFile, index) => (
                        <SortableItem
                          key={pdfFile.id}
                          pdfFile={pdfFile}
                          onToggle={toggleFile}
                          onRemove={removeFile}
                          index={index}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </CardContent>
            </Card>
          )}

          {/* Output Settings & Combine */}
          {pdfFiles.length > 0 && (
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

                <Button
                  onClick={combinePDFs}
                  disabled={selectedCount < 2 || isProcessing}
                  className="w-full hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-primary/25"
                  size="lg"
                >
                  {isProcessing ? (
                    <>
                      <Combine className="h-5 w-5 mr-2 animate-spin" />
                      Verarbeite...
                    </>
                  ) : (
                    <>
                      <Combine className="h-5 w-5 mr-2" />
                      {selectedCount} PDFs zusammenfügen ({totalPages} Seiten)
                    </>
                  )}
                </Button>

                {selectedCount < 2 && (
                  <p className="text-sm text-muted-foreground text-center">
                    Wählen Sie mindestens 2 PDFs aus
                  </p>
                )}

                <p className="text-xs text-muted-foreground text-center">
                  Nach dem Zusammenfügen wird eine Vorschau angezeigt
                </p>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {pdfFiles.length === 0 && (
            <Card className="glass-card animate-fade-in">
              <CardContent className="py-16">
                <div className="text-center text-muted-foreground">
                  <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-muted/50 flex items-center justify-center">
                    <FileText className="h-10 w-10 opacity-50" />
                  </div>
                  <p className="text-lg font-medium">Keine PDFs hochgeladen</p>
                  <p className="text-sm mt-2">
                    Laden Sie PDF-Dateien hoch, um diese zusammenzufügen
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

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
    </div>
  )
}

export default App
