import { useState } from 'react'
import { ImagePlus, ImageUp, X } from 'lucide-react'
import { toast } from 'sonner'
import { MiniaturePicker } from './miniature-picker'
import { MiniatureThumb } from './miniature-thumb'
import { useMiniatureUrls } from '../use-miniature-urls'
import { isBitmapImage } from '@/lib/image'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface MiniatureFieldProps {
  label?: string
  /** `miniature_id` courant (ou `null`). */
  value: string | null
  onChange: (id: string | null) => void
  /** Périmètre de l'entité (NULL = commun) : scope des vignettes + cible d'upload. */
  targetSiteId: string | null
  /** L'utilisateur peut-il alimenter le pool (téléverser) de ce périmètre ? */
  canUpload: boolean
  /**
   * Disposition : `row` (défaut) = aperçu + boutons sur une ligne ; `tile` =
   * grand aperçu carré au-dessus des boutons, pensé pour une COLONNE étroite
   * (ex. en-tête « identité » à deux colonnes via `IdentiteFields`).
   */
  orientation?: 'row' | 'tile'
}

/**
 * Champ image d'un formulaire d'entité : aperçu de la vignette courante + bouton
 * « Choisir » (ouvre le `MiniaturePicker`) + zone de DRAG-AND-DROP (dépose un
 * fichier → recadrage → upload) + « Retirer ». Ne stocke qu'un `miniature_id` ;
 * la mutation du formulaire le persiste. Composant image UNIQUE de l'app : deux
 * dispositions (`row`/`tile`), jamais de duplication.
 */
export function MiniatureField({
  label = 'Image',
  value,
  onChange,
  targetSiteId,
  canUpload,
  orientation = 'row',
}: MiniatureFieldProps) {
  const { urlOf, refresh } = useMiniatureUrls()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerFile, setPickerFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const url = urlOf(value)

  function openPicker(file: File | null) {
    setPickerFile(file)
    setPickerOpen(true)
  }

  // Gestion du drag-and-drop partagée par les deux dispositions (uniquement si on
  // a le droit de téléverser sur ce périmètre).
  const dropHandlers = canUpload
    ? {
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault()
          setDragOver(true)
        },
        onDragLeave: () => setDragOver(false),
        onDrop: (e: React.DragEvent) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files[0]
          if (!f) return
          // Garde-fou : on n'ouvre le picker que pour une image bitmap recadrable
          // (le SVG et les non-images sont écartés au drop).
          if (!isBitmapImage(f)) {
            toast.error('Choisis une image bitmap (JPG, PNG, WebP…).')
            return
          }
          openPicker(f)
        },
      }
    : {}

  const boutons = (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => openPicker(null)}
      >
        {value !== null
          ? 'Changer'
          : orientation === 'tile'
            ? 'Choisir'
            : 'Choisir une image'}
      </Button>
      {value !== null && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(null)}
        >
          <X /> Retirer
        </Button>
      )}
    </div>
  )

  const picker = pickerOpen && (
    <MiniaturePicker
      open
      onOpenChange={(o) => {
        if (!o) {
          setPickerOpen(false)
          setPickerFile(null)
        }
      }}
      targetSiteId={targetSiteId}
      canUpload={canUpload}
      initialFile={pickerFile ?? undefined}
      onSelect={(id) => onChange(id)}
    />
  )

  if (orientation === 'tile') {
    // Tuile carrée qui REMPLIT son conteneur (la taille/le ratio sont pilotés par
    // l'appelant, ex. IdentiteFields). Pas de libellé ni de texte d'aide : l'image
    // parle d'elle-même et le drag-and-drop reste actif silencieusement. Actions
    // (Changer / Retirer) directement SUR l'image, au survol ou au toucher.
    return (
      <div
        {...dropHandlers}
        className={cn(
          'group bg-muted relative size-full overflow-hidden rounded-lg border transition-colors',
          dragOver && 'border-primary bg-primary/5',
        )}
      >
        <button
          type="button"
          onClick={() => openPicker(null)}
          aria-label={value !== null ? 'Changer l’image' : 'Choisir une image'}
          className="block size-full"
        >
          <MiniatureThumb
            url={url}
            fallback={<ImagePlus className="size-6" />}
            onError={refresh}
            className="size-full rounded-none border-0"
          />
        </button>
        {value !== null && (
          <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="size-7 pointer-coarse:size-8"
              onClick={() => openPicker(null)}
              aria-label="Changer l’image"
              title="Changer l’image"
            >
              <ImageUp className="size-4" />
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="size-7 pointer-coarse:size-8"
              onClick={() => onChange(null)}
              aria-label="Retirer l’image"
              title="Retirer l’image"
            >
              <X className="size-4" />
            </Button>
          </div>
        )}
        {picker}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div
        {...dropHandlers}
        className={cn(
          'flex items-center gap-3 rounded-lg border p-3 transition-colors',
          dragOver && 'border-primary bg-primary/5',
        )}
      >
        <MiniatureThumb
          url={url}
          fallback={<ImagePlus className="size-5" />}
          onError={refresh}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {boutons}
          {canUpload && (
            <span className="text-muted-foreground text-xs">
              ou glisse une image ici
            </span>
          )}
        </div>
      </div>
      {picker}
    </div>
  )
}
