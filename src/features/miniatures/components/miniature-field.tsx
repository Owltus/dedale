import { useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { MiniaturePicker } from './miniature-picker'
import { MiniatureThumb } from './miniature-thumb'
import { useMiniatureUrls } from '../use-miniature-urls'
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
}

/**
 * Champ image d'un formulaire d'entité : aperçu de la vignette courante + bouton
 * « Choisir » (ouvre le `MiniaturePicker`) + zone de DRAG-AND-DROP (dépose un
 * fichier → recadrage → upload) + « Retirer ». Ne stocke qu'un `miniature_id` ;
 * la mutation du formulaire le persiste.
 */
export function MiniatureField({
  label = 'Image',
  value,
  onChange,
  targetSiteId,
  canUpload,
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

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div
        onDragOver={
          canUpload
            ? (e) => {
                e.preventDefault()
                setDragOver(true)
              }
            : undefined
        }
        onDragLeave={canUpload ? () => setDragOver(false) : undefined}
        onDrop={
          canUpload
            ? (e) => {
                e.preventDefault()
                setDragOver(false)
                const f = e.dataTransfer.files[0]
                if (f) openPicker(f)
              }
            : undefined
        }
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
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openPicker(null)}
            >
              {value !== null ? 'Changer' : 'Choisir une image'}
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
          {canUpload && (
            <span className="text-muted-foreground text-xs">
              ou glisse une image ici
            </span>
          )}
        </div>
      </div>

      {pickerOpen && (
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
      )}
    </div>
  )
}
