import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  MousePointer2,
  Pencil,
  Highlighter,
  Type,
  ImagePlus,
  Crop,
  RotateCcw,
  RotateCw,
  Undo2,
  Trash2,
  Check,
  X,
} from 'lucide-react'

export interface EditResult {
  dataUrl: string
  widthPt: number
  heightPt: number
}

interface PageEditorProps {
  title: string
  loadBase: () => Promise<{ dataUrl: string; widthPt: number; heightPt: number }>
  onCancel: () => void
  onApply: (r: EditResult) => void
}

type Tool = 'select' | 'pen' | 'marker' | 'text' | 'image' | 'crop'

interface Point {
  x: number
  y: number
}
interface StrokeObj {
  id: string
  type: 'stroke'
  mode: 'pen' | 'marker'
  color: string
  width: number
  points: Point[]
}
interface TextObj {
  id: string
  type: 'text'
  x: number
  y: number
  text: string
  size: number
  color: string
}
interface ImageObj {
  id: string
  type: 'image'
  x: number
  y: number
  w: number
  h: number
  el: HTMLImageElement
}
type EditObj = StrokeObj | TextObj | ImageObj

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

function PageEditor({ title, loadBase, onCancel, onApply }: PageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const baseImgRef = useRef<HTMLImageElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [baseW, setBaseW] = useState(0)
  const [baseH, setBaseH] = useState(0)
  const [scaleFactor, setScaleFactor] = useState(1) // px pro Punkt
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState('#e11d48')
  const [penWidth, setPenWidth] = useState(4)
  const [rotation, setRotation] = useState(0)
  const [objects, setObjects] = useState<EditObj[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const historyRef = useRef<EditObj[][]>([])
  const dragRef = useRef<{ mode: 'draw' | 'move' | 'resize' | 'crop'; id?: string; offX?: number; offY?: number; start?: Point } | null>(null)

  // Basisbild laden
  useEffect(() => {
    let active = true
    setLoading(true)
    loadBase().then(({ dataUrl, widthPt, heightPt }) => {
      const img = new Image()
      img.onload = () => {
        if (!active) return
        baseImgRef.current = img
        setBaseW(img.naturalWidth)
        setBaseH(img.naturalHeight)
        setScaleFactor(img.naturalWidth / widthPt)
        void heightPt
        setLoading(false)
      }
      img.src = dataUrl
    }).catch(() => setLoading(false))
    return () => {
      active = false
    }
  }, [loadBase])

  const pushHistory = useCallback(() => {
    historyRef.current.push(objects.map((o) => ({ ...o })))
    if (historyRef.current.length > 40) historyRef.current.shift()
  }, [objects])

  const undo = () => {
    const prev = historyRef.current.pop()
    if (prev) {
      setObjects(prev)
      setSelectedId(null)
    }
  }

  const bboxOf = (o: EditObj, ctx: CanvasRenderingContext2D): { x: number; y: number; w: number; h: number } => {
    if (o.type === 'image') return { x: o.x, y: o.y, w: o.w, h: o.h }
    if (o.type === 'text') {
      ctx.font = `${o.size}px sans-serif`
      const w = ctx.measureText(o.text).width
      return { x: o.x, y: o.y, w, h: o.size * 1.2 }
    }
    const xs = o.points.map((p) => p.x)
    const ys = o.points.map((p) => p.y)
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    }
  }

  const draw = useCallback((exportMode = false) => {
    const canvas = canvasRef.current
    const base = baseImgRef.current
    if (!canvas || !base) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(base, 0, 0, baseW, baseH)

    for (const o of objects) {
      if (o.type === 'stroke') {
        ctx.save()
        ctx.strokeStyle = o.color
        ctx.lineWidth = o.width
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.globalAlpha = o.mode === 'marker' ? 0.35 : 1
        ctx.beginPath()
        o.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
        ctx.stroke()
        ctx.restore()
      } else if (o.type === 'image') {
        ctx.drawImage(o.el, o.x, o.y, o.w, o.h)
      } else {
        ctx.save()
        ctx.fillStyle = o.color
        ctx.font = `${o.size}px sans-serif`
        ctx.textBaseline = 'top'
        ctx.fillText(o.text, o.x, o.y)
        ctx.restore()
      }
    }

    if (!exportMode) {
      const sel = objects.find((o) => o.id === selectedId)
      if (sel) {
        const b = bboxOf(sel, ctx)
        ctx.save()
        ctx.strokeStyle = '#2563eb'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6)
        ctx.setLineDash([])
        if (sel.type === 'image') {
          ctx.fillStyle = '#2563eb'
          ctx.fillRect(b.x + b.w - 7, b.y + b.h - 7, 14, 14)
        }
        ctx.restore()
      }
      if (cropRect) {
        ctx.save()
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fillRect(0, 0, baseW, cropRect.y)
        ctx.fillRect(0, cropRect.y + cropRect.h, baseW, baseH - cropRect.y - cropRect.h)
        ctx.fillRect(0, cropRect.y, cropRect.x, cropRect.h)
        ctx.fillRect(cropRect.x + cropRect.w, cropRect.y, baseW - cropRect.x - cropRect.w, cropRect.h)
        ctx.strokeStyle = '#22c55e'
        ctx.lineWidth = 2
        ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h)
        ctx.restore()
      }
    }
  }, [objects, selectedId, cropRect, baseW, baseH])

  useEffect(() => {
    draw()
  }, [draw, loading])

  const getPos = (e: React.PointerEvent): Point => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const fx = canvas.width / rect.width
    const fy = canvas.height / rect.height
    return { x: (e.clientX - rect.left) * fx, y: (e.clientY - rect.top) * fy }
  }

  const hitTest = (p: Point): EditObj | null => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return null
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i]
      if (o.type === 'stroke') {
        for (const pt of o.points) {
          if (Math.hypot(pt.x - p.x, pt.y - p.y) <= o.width / 2 + 8) return o
        }
      } else {
        const b = bboxOf(o, ctx)
        if (p.x >= b.x - 4 && p.x <= b.x + b.w + 4 && p.y >= b.y - 4 && p.y <= b.y + b.h + 4) return o
      }
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (loading) return
    const p = getPos(e)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)

    if (tool === 'pen' || tool === 'marker') {
      pushHistory()
      const stroke: StrokeObj = {
        id: uid(),
        type: 'stroke',
        mode: tool,
        color,
        width: tool === 'marker' ? penWidth * 4 : penWidth,
        points: [p],
      }
      setObjects((o) => [...o, stroke])
      dragRef.current = { mode: 'draw', id: stroke.id }
      return
    }
    if (tool === 'text') {
      const t = window.prompt('Text eingeben:')
      if (t && t.trim()) {
        pushHistory()
        const size = Math.max(14, Math.round(baseW / 30))
        const obj: TextObj = { id: uid(), type: 'text', x: p.x, y: p.y, text: t, size, color }
        setObjects((o) => [...o, obj])
        setSelectedId(obj.id)
        setTool('select')
      }
      return
    }
    if (tool === 'image') {
      fileInputRef.current?.click()
      return
    }
    if (tool === 'crop') {
      dragRef.current = { mode: 'crop', start: p }
      setCropRect({ x: p.x, y: p.y, w: 0, h: 0 })
      return
    }
    // select
    const hit = hitTest(p)
    setSelectedId(hit ? hit.id : null)
    if (hit) {
      const ctx = canvasRef.current!.getContext('2d')!
      const b = bboxOf(hit, ctx)
      const nearHandle = hit.type === 'image' && Math.abs(p.x - (b.x + b.w)) < 14 && Math.abs(p.y - (b.y + b.h)) < 14
      pushHistory()
      if (nearHandle) {
        dragRef.current = { mode: 'resize', id: hit.id }
      } else {
        dragRef.current = { mode: 'move', id: hit.id, offX: p.x - b.x, offY: p.y - b.y }
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const p = getPos(e)
    if (d.mode === 'draw' && d.id) {
      setObjects((o) =>
        o.map((it) => (it.id === d.id && it.type === 'stroke' ? { ...it, points: [...it.points, p] } : it))
      )
    } else if (d.mode === 'crop' && d.start) {
      const x = Math.min(d.start.x, p.x)
      const y = Math.min(d.start.y, p.y)
      setCropRect({ x, y, w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) })
    } else if (d.mode === 'move' && d.id) {
      setObjects((o) =>
        o.map((it) => {
          if (it.id !== d.id) return it
          const nx = p.x - (d.offX || 0)
          const ny = p.y - (d.offY || 0)
          if (it.type === 'image') return { ...it, x: nx, y: ny }
          if (it.type === 'text') return { ...it, x: nx, y: ny }
          const b0 = it.points.reduce(
            (acc, pt) => ({ minX: Math.min(acc.minX, pt.x), minY: Math.min(acc.minY, pt.y) }),
            { minX: Infinity, minY: Infinity }
          )
          const dx = nx - b0.minX
          const dy = ny - b0.minY
          return { ...it, points: it.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) }
        })
      )
    } else if (d.mode === 'resize' && d.id) {
      setObjects((o) =>
        o.map((it) => {
          if (it.id !== d.id || it.type !== 'image') return it
          const ratio = it.el.naturalWidth / it.el.naturalHeight
          const w = Math.max(20, p.x - it.x)
          return { ...it, w, h: w / ratio }
        })
      )
    }
  }

  const onPointerUp = () => {
    dragRef.current = null
  }

  const onImageChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        pushHistory()
        const w = baseW / 3
        const ratio = img.naturalWidth / img.naturalHeight
        const obj: ImageObj = { id: uid(), type: 'image', x: baseW / 2 - w / 2, y: baseH / 2 - w / ratio / 2, w, h: w / ratio, el: img }
        setObjects((o) => [...o, obj])
        setSelectedId(obj.id)
        setTool('select')
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  const changeTextSize = (delta: number) => {
    if (!selectedId) return
    pushHistory()
    setObjects((o) =>
      o.map((it) => (it.id === selectedId && it.type === 'text' ? { ...it, size: Math.max(8, it.size + delta) } : it))
    )
  }

  const deleteSelected = () => {
    if (!selectedId) return
    pushHistory()
    setObjects((o) => o.filter((it) => it.id !== selectedId))
    setSelectedId(null)
  }

  const handleApply = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setSelectedId(null)
    // Ohne UI-Overlays zeichnen
    draw(true)
    // Zuschnitt anwenden
    const region = cropRect && cropRect.w > 5 && cropRect.h > 5 ? cropRect : { x: 0, y: 0, w: baseW, h: baseH }
    const cropped = document.createElement('canvas')
    cropped.width = Math.round(region.w)
    cropped.height = Math.round(region.h)
    const cctx = cropped.getContext('2d')!
    cctx.drawImage(canvas, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h)

    // Rotation anwenden
    let finalCanvas = cropped
    const rot = ((rotation % 360) + 360) % 360
    if (rot !== 0) {
      const rc = document.createElement('canvas')
      if (rot === 90 || rot === 270) {
        rc.width = cropped.height
        rc.height = cropped.width
      } else {
        rc.width = cropped.width
        rc.height = cropped.height
      }
      const rctx = rc.getContext('2d')!
      rctx.translate(rc.width / 2, rc.height / 2)
      rctx.rotate((rot * Math.PI) / 180)
      rctx.drawImage(cropped, -cropped.width / 2, -cropped.height / 2)
      finalCanvas = rc
    }

    const dataUrl = finalCanvas.toDataURL('image/png')
    let widthPt = region.w / scaleFactor
    let heightPt = region.h / scaleFactor
    if (rot === 90 || rot === 270) {
      const t = widthPt
      widthPt = heightPt
      heightPt = t
    }
    // UI-Overlays wieder einzeichnen (für den Fall, dass nicht geschlossen wird)
    draw(false)
    onApply({ dataUrl, widthPt, heightPt })
  }

  const toolBtn = (t: Tool, icon: React.ReactNode, label: string) => (
    <Button
      type="button"
      size="sm"
      variant={tool === t ? 'default' : 'outline'}
      onClick={() => setTool(t)}
      title={label}
      className="gap-1"
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </Button>
  )

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex flex-col">
      {/* Toolbar */}
      <div className="glass-header text-white px-3 py-2 flex items-center justify-between gap-2 flex-wrap shrink-0">
        <span className="font-semibold text-sm sm:text-base">{title} bearbeiten</span>
        <div className="flex items-center gap-1 flex-wrap">
          {toolBtn('select', <MousePointer2 className="h-4 w-4" />, 'Auswahl')}
          {toolBtn('pen', <Pencil className="h-4 w-4" />, 'Stift')}
          {toolBtn('marker', <Highlighter className="h-4 w-4" />, 'Marker')}
          {toolBtn('text', <Type className="h-4 w-4" />, 'Text')}
          {toolBtn('image', <ImagePlus className="h-4 w-4" />, 'Bild')}
          {toolBtn('crop', <Crop className="h-4 w-4" />, 'Zuschneiden')}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-9 rounded cursor-pointer bg-transparent border border-white/30"
            title="Farbe"
          />
          <input
            type="range"
            min={1}
            max={20}
            value={penWidth}
            onChange={(e) => setPenWidth(Number(e.target.value))}
            className="w-20"
            title="Strichstärke"
          />
          <Button type="button" size="sm" variant="outline" onClick={() => changeTextSize(2)} title="Text größer">A+</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => changeTextSize(-2)} title="Text kleiner">A-</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setRotation((r) => r - 90)} title="Links drehen"><RotateCcw className="h-4 w-4" /></Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setRotation((r) => r + 90)} title="Rechts drehen"><RotateCw className="h-4 w-4" /></Button>
          <Button type="button" size="sm" variant="outline" onClick={undo} title="Rückgängig"><Undo2 className="h-4 w-4" /></Button>
          <Button type="button" size="sm" variant="outline" onClick={deleteSelected} title="Auswahl löschen" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
          {cropRect && (
            <Button type="button" size="sm" variant="outline" onClick={() => setCropRect(null)} title="Zuschnitt entfernen">Crop ✕</Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onCancel}><X className="h-4 w-4 mr-1" />Abbrechen</Button>
          <Button type="button" size="sm" onClick={handleApply} className="bg-green-500 hover:bg-green-600"><Check className="h-4 w-4 mr-1" />Übernehmen</Button>
        </div>
      </div>

      {/* Hinweis */}
      <div className="text-center text-white/70 text-xs py-1 shrink-0">
        {rotation % 360 !== 0 && <span>Drehung: {(((rotation % 360) + 360) % 360)}° · </span>}
        Tool: {tool} · Doppelklick auf Seiten öffnet den Editor
      </div>

      {/* Canvas-Bühne */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        {loading ? (
          <div className="text-white">Seite wird geladen …</div>
        ) : (
          <canvas
            ref={canvasRef}
            width={baseW}
            height={baseH}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="bg-white shadow-2xl rounded-md touch-none"
            style={{ maxWidth: '95%', maxHeight: '100%', cursor: tool === 'select' ? 'move' : 'crosshair' }}
          />
        )}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={onImageChosen} className="hidden" />
      </div>
    </div>
  )
}

export default PageEditor
