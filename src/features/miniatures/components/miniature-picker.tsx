import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Camera, ImageOff, Library, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth'
import { miniaturesQueries } from '../queries'
import { useUploadMiniature } from '../mutations'
import { MiniatureCropDialog, type CropResult } from './miniature-crop-dialog'
import { MiniatureFilters } from './miniature-filters'
import { filterMiniatures } from '../filters'
import { writeErrorMessage } from '@/lib/form'
import { estCommunOuDuSite } from '@/lib/scope'
import { isBitmapImage } from '@/lib/image'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Onglet = 'bibliotheque' | 'uploader'

/** Message d'erreur d'un téléversement de vignette : 42501 (RLS) contextualisé. */
const MINIATURE_UPLOAD_OVERRIDES = {
  '42501':
    'Action non autorisée : vous n’avez pas les droits pour téléverser une image sur ce périmètre.',
} as const

interface MiniaturePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Périmètre de l'entité éditée : NULL = commun. Filtre les vignettes proposées
   * au scope COMPATIBLE (pool entreprise `site_id NULL` + même site) — cohérent
   * avec le trigger `check_miniature_site_direct` — et fixe la cible d'upload.
   */
  targetSiteId: string | null
  /** L'utilisateur peut-il alimenter le pool de ce périmètre (droits/RLS) ? */
  canUpload: boolean
  /** Fichier déposé (drag-and-drop) à recadrer directement, sans choisir d'onglet. */
  initialFile?: File
  /** Retourne l'id de la miniature choisie (bibliothèque) ou téléversée. */
  onSelect: (miniatureId: string) => void
}

/**
 * Sélecteur d'image (modal) à deux onglets : « Bibliothèque » (grille du pool de
 * vignettes filtré au périmètre compatible) et « Téléverser » (fichier + drag-
 * and-drop → recadrage carré → upload dans le pool). Renvoie un `miniature_id`.
 * Onglets LOCAUX au modal : le `<Tabs>` global est plein écran (couplé à la barre
 * de titre), inadapté ici.
 */
export function MiniaturePicker({
  open,
  onOpenChange,
  targetSiteId,
  canUpload,
  initialFile,
  onSelect,
}: MiniaturePickerProps) {
  const { session } = useAuth()
  // Un fichier déposé (initialFile) ouvre d'emblée l'onglet Téléverser + le
  // recadrage, sans étape de choix.
  const [onglet, setOnglet] = useState<Onglet>(
    initialFile !== undefined && canUpload ? 'uploader' : 'bibliotheque',
  )
  const [cropFile, setCropFile] = useState<File | null>(
    initialFile !== undefined && canUpload ? initialFile : null,
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Input dédié à la PRISE DE PHOTO (mobile) : `capture` ouvre l'appareil photo.
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadMiniature()
  // Vignettes de la grille dont l'`<img>` a échoué → on bascule sur l'icône
  // `ImageOff` (pas de re-fetch : le pool est déjà chargé, l'URL est juste cassée).
  const [errored, setErrored] = useState<Set<string>>(new Set())
  // Recherche sur les noms des entités liées.
  const [recherche, setRecherche] = useState('')

  const { data: pool, isPending, isError } = useQuery(miniaturesQueries.pool())
  // Vignettes compatibles avec le périmètre de l'entité (pool entreprise + même
  // site) : une vignette de site ne peut pas être liée à une entité d'un autre
  // périmètre (trigger). Pour le commun, seules les vignettes communes restent.
  const compatibles = useMemo(
    () =>
      (pool ?? []).filter((m) => estCommunOuDuSite(m, targetSiteId)),
    [pool, targetSiteId],
  )

  function choisir(id: string) {
    onSelect(id)
    onOpenChange(false)
  }

  function pickFile(file: File) {
    if (!isBitmapImage(file)) {
      toast.error('Choisis une image bitmap (JPG, PNG, WebP…).')
      return
    }
    setCropFile(file)
  }

  async function handleCropped(result: CropResult) {
    if (!session) {
      toast.error('Session expirée, reconnecte-toi.')
      return
    }
    try {
      const id = await upload.mutateAsync({
        blob: result.blob,
        hash: result.hash,
        siteId: targetSiteId,
        createdBy: session.user.id,
      })
      setCropFile(null)
      if (id !== null) choisir(id)
      else toast.error('L’image n’a pas pu être résolue après l’envoi.')
    } catch (e) {
      toast.error(writeErrorMessage(e, MINIATURE_UPLOAD_OVERRIDES))
    }
  }

  // Corps de l'onglet « Bibliothèque » : états chargement / erreur / vide / grille
  // séparés en fonction (évite des ternaires imbriqués, `no-nested-ternary`).
  function renderBibliotheque(): ReactNode {
    if (isPending) {
      return (
        <p className="text-muted-foreground py-10 text-center text-sm">
          Chargement des vignettes…
        </p>
      )
    }
    if (isError) {
      return (
        <p className="text-muted-foreground py-10 text-center text-sm">
          Impossible de charger les vignettes. Réessaie plus tard.
        </p>
      )
    }
    if (compatibles.length === 0) {
      return (
        <p className="text-muted-foreground py-10 text-center text-sm">
          Aucune vignette dans ce périmètre.
        </p>
      )
    }
    const shown = filterMiniatures(compatibles, recherche)
    let grille: ReactNode
    if (shown.length === 0) {
      grille = (
        <p className="text-muted-foreground py-6 text-center text-sm">
          Aucune vignette ne correspond.
        </p>
      )
    } else {
      grille = (
        <div className="max-h-72 overflow-y-auto pr-1">
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
            {shown.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => choisir(m.id)}
              aria-label="Choisir cette vignette"
              className="bg-muted focus-visible:ring-ring hover:ring-ring/60 block overflow-hidden rounded border transition hover:ring-2 focus-visible:ring-2 focus-visible:outline-none"
            >
              {/* `aspect-square w-full` porté par l'image (et le placeholder),
                  pas par le bouton : montage robuste, calqué sur l'onglet
                  Vignettes — évite que l'image prenne sa taille intrinsèque et
                  chevauche ses voisines. */}
              {m.url !== null && !errored.has(m.id) ? (
                <img
                  src={m.url}
                  alt=""
                  loading="lazy"
                  onError={() => setErrored((s) => new Set(s).add(m.id))}
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <span className="text-muted-foreground flex aspect-square w-full items-center justify-center">
                  <ImageOff className="size-5" />
                </span>
              )}
            </button>
            ))}
          </div>
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-3">
        <MiniatureFilters
          recherche={recherche}
          onRechercheChange={setRecherche}
        />
        {grille}
      </div>
    )
  }

  const tabClass = (actif: boolean) =>
    cn(
      'flex flex-1 items-center justify-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors',
      actif
        ? 'bg-background shadow-sm'
        : 'text-muted-foreground hover:text-foreground',
    )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Choisir une image</DialogTitle>
            <DialogDescription>
              Pioche dans la bibliothèque de vignettes
              {canUpload ? ' ou téléverse une nouvelle image.' : '.'}
            </DialogDescription>
          </DialogHeader>

          {canUpload && (
            <div className="bg-muted flex gap-1 rounded-md p-1">
              <button
                type="button"
                onClick={() => setOnglet('bibliotheque')}
                className={tabClass(onglet === 'bibliotheque')}
              >
                <Library className="size-4" /> Bibliothèque
              </button>
              <button
                type="button"
                onClick={() => setOnglet('uploader')}
                className={tabClass(onglet === 'uploader')}
              >
                <Upload className="size-4" /> Téléverser
              </button>
            </div>
          )}

          {onglet === 'bibliotheque' || !canUpload ? (
            renderBibliotheque()
          ) : (
            <div className="py-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) pickFile(f)
                  e.target.value = ''
                }}
              />
              {/* Input dédié à l'appareil photo : `capture="environment"` ouvre la
                  caméra ARRIÈRE sur mobile (ignoré sur desktop). */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) pickFile(f)
                  e.target.value = ''
                }}
              />
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const f = e.dataTransfer.files[0]
                  if (f) pickFile(f)
                }}
                className="border-muted-foreground/30 hover:border-muted-foreground/60 flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center transition-colors"
              >
                <Upload className="text-muted-foreground size-6" />
                <p className="text-muted-foreground text-sm">
                  Glisse une image ici, ou
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choisir un fichier
                  </Button>
                  {/* Prise de photo : uniquement sur appareil tactile (mobile). */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="hidden [@media(hover:none)]:inline-flex"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera /> Prendre une photo
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {cropFile !== null && (
        <MiniatureCropDialog
          open
          file={cropFile}
          onOpenChange={(o) => {
            if (!o) setCropFile(null)
          }}
          onConfirm={(r) => void handleCropped(r)}
          pending={upload.isPending}
        />
      )}
    </>
  )
}
