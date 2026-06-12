import { useCallback, useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
import { toast } from 'sonner'
import { canvasToWebp, sha256Hex } from '@/lib/image'
import { errorMessage } from '@/lib/form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const MAX_ZOOM = 4
/** Côté de la miniature produite (carré). */
const OUTPUT = 150
/** Budget d'octets indicatif pour une vignette 150px. */
const MAX_BYTES = 30_000

export interface CropResult {
  blob: Blob
  hash: string
}

interface MiniatureCropDialogProps {
  open: boolean
  file: File
  onOpenChange: (open: boolean) => void
  onConfirm: (result: CropResult) => void
  /** Upload en cours côté appelant. */
  pending: boolean
  /** Encart d'avertissement optionnel sous la description (ex. remplacement). */
  note?: React.ReactNode
}

interface View {
  s: number
  tx: number
  ty: number
}

/** Géométrie figée à la mesure : côté du viewport + dimensions naturelles. */
interface Geom {
  v: number
  natW: number
  natH: number
}

// Maintient le pan dans des bornes telles que l'image couvre toujours le carré.
function clampView(
  view: View,
  k: number,
  v: number,
  natW: number,
  natH: number,
): View {
  const dispW = natW * k * view.s
  const dispH = natH * k * view.s
  return {
    s: view.s,
    tx: Math.min(0, Math.max(v - dispW, view.tx)),
    ty: Math.min(0, Math.max(v - dispH, view.ty)),
  }
}

// Échelle de base « cover » : au zoom 1, l'image couvre exactement le carré.
function coverScale(g: Geom): number {
  return g.v / Math.min(g.natW, g.natH)
}

// Zoom centré sur le viewport, borné, avec re-clamp du pan.
function applyZoom(prev: View, sRaw: number, g: Geom): View {
  const s = Math.min(MAX_ZOOM, Math.max(1, sRaw))
  const k = coverScale(g)
  const cx = (g.v / 2 - prev.tx) / (k * prev.s)
  const cy = (g.v / 2 - prev.ty) / (k * prev.s)
  return clampView(
    { s, tx: g.v / 2 - cx * k * s, ty: g.v / 2 - cy * k * s },
    k,
    g.v,
    g.natW,
    g.natH,
  )
}

/**
 * Recadrage carré d'une image quelconque vers une vignette 150x150 WebP. Pan à
 * la souris/au doigt, zoom à la molette ou au curseur. Sortie via `canvasToWebp`.
 */
export function MiniatureCropDialog({
  open,
  file,
  onOpenChange,
  onConfirm,
  pending,
  note,
}: MiniatureCropDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef<{
    x: number
    y: number
    tx: number
    ty: number
  } | null>(null)

  const [url, setUrl] = useState<string | null>(null)
  const [geom, setGeom] = useState<Geom | null>(null)
  const [view, setView] = useState<View>({ s: 1, tx: 0, ty: 0 })
  const [encoding, setEncoding] = useState(false)
  const ready = geom !== null

  // Source en data URL (FileReader) plutôt qu'un objectURL : aucune révocation,
  // donc robuste au double-montage de React StrictMode (un objectURL révoqué au
  // cleanup donnait un « blob: ERR_FILE_NOT_FOUND »). setUrl est appelé dans le
  // callback async onload (hors du corps de l'effet).
  useEffect(() => {
    let cancelled = false
    const reader = new FileReader()
    reader.onload = () => {
      if (!cancelled && typeof reader.result === 'string') {
        setUrl(reader.result)
      }
    }
    reader.readAsDataURL(file)
    return () => {
      cancelled = true
    }
  }, [file])

  // Mesure le viewport + l'image et centre le cadrage (cover). Appelé à la
  // charge de l'image et au redimensionnement de la fenêtre.
  const recenter = useCallback(() => {
    const container = containerRef.current
    const img = imgRef.current
    if (!container || !img) return
    const v = container.clientWidth
    const natW = img.naturalWidth
    const natH = img.naturalHeight
    if (v === 0 || natW === 0 || natH === 0) return
    const next: Geom = { v, natW, natH }
    const k = coverScale(next)
    setGeom(next)
    setView(
      clampView(
        { s: 1, tx: (v - natW * k) / 2, ty: (v - natH * k) / 2 },
        k,
        v,
        natW,
        natH,
      ),
    )
  }, [])

  useEffect(() => {
    window.addEventListener('resize', recenter)
    return () => window.removeEventListener('resize', recenter)
  }, [recenter])

  // Molette : listener natif non-passif (onWheel React est passif → preventDefault inerte).
  useEffect(() => {
    const el = containerRef.current
    if (!el || !geom) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      setView((prev) => applyZoom(prev, prev.s * factor, geom))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [geom])

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!geom) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d || !geom) return
    const k = coverScale(geom)
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    setView((prev) =>
      clampView(
        { s: prev.s, tx: d.tx + dx, ty: d.ty + dy },
        k,
        geom.v,
        geom.natW,
        geom.natH,
      ),
    )
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  async function handleConfirm() {
    const img = imgRef.current
    if (!img || !geom) return
    const k = coverScale(geom)
    const factor = k * view.s // px affichés par px source
    const srcSize = geom.v / factor
    const srcX = -view.tx / factor
    const srcY = -view.ty / factor

    const out = document.createElement('canvas')
    out.width = OUTPUT
    out.height = OUTPUT
    const ctx = out.getContext('2d')
    if (!ctx) {
      toast.error('Canvas indisponible.')
      return
    }
    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT, OUTPUT)

    setEncoding(true)
    try {
      const { blob } = await canvasToWebp(out, {
        quality: 0.82,
        maxBytes: MAX_BYTES,
      })
      const hash = await sha256Hex(blob)
      onConfirm({ blob, hash })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setEncoding(false)
    }
  }

  const scale = (geom !== null ? coverScale(geom) : 1) * view.s
  const transform = `translate(${String(view.tx)}px, ${String(view.ty)}px) scale(${String(scale)})`
  const busy = pending || encoding

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recadrer la vignette</DialogTitle>
          <DialogDescription>
            Glisse pour déplacer, molette ou curseur pour zoomer. Le carré
            visible devient une image de 150&nbsp;px.
          </DialogDescription>
        </DialogHeader>

        {note !== undefined && (
          <div className="bg-muted/60 text-muted-foreground rounded-md border px-3 py-2 text-xs">
            {note}
          </div>
        )}

        <div
          ref={containerRef}
          className="bg-muted relative mx-auto aspect-square w-full max-w-80 cursor-grab touch-none overflow-hidden rounded-lg border"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {url !== null && (
            <img
              ref={imgRef}
              src={url}
              alt=""
              draggable={false}
              onLoad={recenter}
              onError={() => {
                toast.error("Format d'image non reconnu.")
                onOpenChange(false)
              }}
              className="pointer-events-none absolute top-0 left-0 max-w-none select-none"
              style={{
                transform,
                transformOrigin: 'top left',
                visibility: ready ? 'visible' : 'hidden',
              }}
            />
          )}

          {/* Repères de cadrage (règle des tiers). Lignes blanches : repères
              d'image standard, indépendants du thème (exception assumée aux
              tokens, comme les croppers de photo de profil). */}
          {ready && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute top-1/3 right-0 left-0 border-t border-white/30" />
              <div className="absolute top-2/3 right-0 left-0 border-t border-white/30" />
              <div className="absolute top-0 bottom-0 left-1/3 border-l border-white/30" />
              <div className="absolute top-0 bottom-0 left-2/3 border-l border-white/30" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-1">
          <ZoomOut className="text-muted-foreground size-4 shrink-0" />
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={view.s}
            onChange={(e) => {
              const val = Number(e.target.value)
              setView((prev) =>
                geom !== null ? applyZoom(prev, val, geom) : prev,
              )
            }}
            className="accent-primary w-full"
            aria-label="Zoom"
            disabled={!ready}
          />
          <ZoomIn className="text-muted-foreground size-4 shrink-0" />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!ready || busy}
          >
            {busy ? 'Traitement…' : 'Valider'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
