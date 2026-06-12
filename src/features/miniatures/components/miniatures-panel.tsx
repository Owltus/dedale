import { useCallback, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Download, ImageOff, ImageUp, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { miniaturesQueries, type MiniatureWithUrl } from '../queries'
import {
  useDeleteMiniature,
  useReplaceMiniature,
  useUploadMiniature,
} from '../mutations'
import { MiniatureCropDialog, type CropResult } from './miniature-crop-dialog'
import { useAuth } from '@/auth'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useScope } from '@/hooks/use-scope'
import { useSiteContext } from '@/lib/site-context'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/form'
import { SCOPE_ALL, scopeMatches, scopeTarget } from '@/lib/scope'
import { cn } from '@/lib/utils'
import * as perm from '@/lib/permissions'
import { useTabAddAction } from '@/components/common/tab-actions'
import { ScopeSelect } from '@/components/common/scope-select'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

// Déclenche un téléchargement navigateur d'un blob.
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function fileNameFor(m: MiniatureWithUrl, index?: number) {
  const prefix = index === undefined ? '' : `${String(index).padStart(2, '0')}-`
  return `vignette-${prefix}${m.hash_sha256.slice(0, 8)}.webp`
}

/**
 * Panneau « Vignettes » : pool d'images partagées. Sélecteur de périmètre
 * (Tout / Commun / chaque site) qui filtre la galerie ET cible le bouton +.
 * Sélection au clic sur l'image ; les actions de masse (télécharger / supprimer
 * / désélectionner) sont montées dans la barre d'en-tête des onglets.
 */
export function MiniaturesPanel() {
  const { data: role } = useCurrentRole()
  const { session } = useAuth()
  const canManage = perm.canManageMetier(role)
  const canEntreprise = perm.canManageAdmin(role)
  const { sites } = useSiteContext()
  const query = useQuery(miniaturesQueries.pool())
  const upload = useUploadMiniature()
  const del = useDeleteMiniature()
  const replace = useReplaceMiniature()

  // Mises à jour live entre fenêtres / comptes (Realtime). Scopé à l'onglet.
  useRealtimeRefresh('miniatures', miniaturesQueries.all())

  const fileInput = useRef<HTMLInputElement>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  // Cible d'un remplacement d'image (null = mode AJOUT au pool).
  const [replaceTarget, setReplaceTarget] = useState<MiniatureWithUrl | null>(
    null,
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [zipping, setZipping] = useState(false)
  const [massDeleteOpen, setMassDeleteOpen] = useState(false)
  const [massDeleting, setMassDeleting] = useState(false)
  const [toDelete, setToDelete] = useState<MiniatureWithUrl | null>(null)

  // Périmètre partagé entre les onglets de la Bibliothèque.
  const { scope, setScope } = useScope()

  // Cible d'upload : null = Commun, undefined = « Tout » (ajout impossible),
  // sinon l'id de site sélectionné.
  const uploadSiteId = scopeTarget(scope)
  const canAdd =
    canManage &&
    uploadSiteId !== undefined &&
    (uploadSiteId !== null || canEntreprise)

  const selectedSiteName =
    typeof uploadSiteId === 'string'
      ? (sites.find((s) => s.id === uploadSiteId)?.nom ?? null)
      : null
  const addLabel = !canAdd
    ? 'Ajout indisponible pour ce périmètre'
    : uploadSiteId === null
      ? 'Ajouter au commun'
      : `Ajouter à ${selectedSiteName ?? 'ce site'}`

  // Vignettes sélectionnées + sous-ensemble réellement supprimable par le rôle.
  const selectedMiniatures = useMemo(
    () => (query.data ?? []).filter((m) => selected.has(m.id)),
    [query.data, selected],
  )
  const deletableSelected = useMemo(
    () =>
      selectedMiniatures.filter(
        (m) => canManage && (canEntreprise || m.site_id !== null),
      ),
    [selectedMiniatures, canManage, canEntreprise],
  )
  const selectedCount = selected.size
  const canDeleteAny = deletableSelected.length > 0

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const clearSelection = useCallback(() => setSelected(new Set()), [])
  const openMassDelete = useCallback(() => setMassDeleteOpen(true), [])

  // Télécharge la sélection : un seul fichier WebP, ou un ZIP au-delà (jszip
  // chargé à la demande). Passe par le SDK Storage (pas de souci CORS).
  const downloadSelection = useCallback(async () => {
    const items = selectedMiniatures
    if (items.length === 0) return
    setZipping(true)
    try {
      // Un seul fichier : téléchargement direct (pas de ZIP).
      if (items.length === 1) {
        const m = items[0]
        if (m === undefined) return
        const { data, error } = await supabase.storage
          .from('documents')
          .download(m.storage_path)
        if (error !== null) {
          toast.error('Image indisponible.')
          return
        }
        downloadBlob(data, fileNameFor(m))
        return
      }
      // Plusieurs : ZIP (jszip chargé à la demande).
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      let n = 0
      for (const m of items) {
        const { data, error } = await supabase.storage
          .from('documents')
          .download(m.storage_path)
        if (error !== null) continue
        n += 1
        zip.file(fileNameFor(m, n), data)
      }
      if (n === 0) {
        toast.error('Aucune image téléchargeable.')
        return
      }
      const archive = await zip.generateAsync({ type: 'blob' })
      downloadBlob(archive, 'vignettes.zip')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setZipping(false)
    }
  }, [selectedMiniatures])

  // Suppression de masse : tente chaque vignette supprimable (la RPC refuse si
  // elle est encore référencée → comptée en échec), puis résumé.
  async function runMassDelete() {
    setMassDeleting(true)
    let ok = 0
    let fail = 0
    for (const m of deletableSelected) {
      try {
        await del.mutateAsync(m.id)
        ok += 1
      } catch {
        fail += 1
      }
    }
    setMassDeleting(false)
    setMassDeleteOpen(false)
    setSelected(new Set())
    if (ok > 0) toast.success(`${String(ok)} vignette(s) supprimée(s)`)
    if (fail > 0) {
      toast.error(
        `${String(fail)} non supprimée(s) (utilisée(s) ou non autorisée(s))`,
      )
    }
  }

  // Suppression individuelle (bouton au survol d'une vignette).
  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Vignette supprimée')
        setToDelete(null)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  // Sélecteur de périmètre (partagé entre onglets). Changer réinitialise la sélection.
  const scopeControl = useMemo(
    () => (
      <ScopeSelect
        value={scope}
        onChange={(s) => {
          setScope(s)
          setSelected(new Set())
        }}
      />
    ),
    [scope, setScope],
  )

  // En-tête : actions de masse (à gauche, séparateur) puis le sélecteur. Le
  // bouton + est ajouté à droite par <Tabs>.
  const headerExtra = useMemo(
    () => (
      <div className="flex items-center gap-1">
        {selectedCount > 0 && (
          <>
            <span className="text-muted-foreground px-1 text-xs tabular-nums">
              {selectedCount}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => void downloadSelection()}
              disabled={zipping}
              aria-label="Télécharger la sélection"
              title="Télécharger"
            >
              <Download className="text-info" />
            </Button>
            {canDeleteAny && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={openMassDelete}
                aria-label="Supprimer la sélection"
                title="Supprimer"
              >
                <Trash2 className="text-destructive" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={clearSelection}
              aria-label="Tout désélectionner"
              title="Désélectionner"
            >
              <X className="text-muted-foreground" />
            </Button>
            <div className="bg-border mx-1 h-6 w-px" aria-hidden />
          </>
        )}
        {scopeControl}
      </div>
    ),
    [
      selectedCount,
      zipping,
      canDeleteAny,
      downloadSelection,
      openMassDelete,
      clearSelection,
      scopeControl,
    ],
  )

  // Ajout au pool : s'assurer d'être en mode AJOUT (pas de cible de remplacement).
  const handleAddImage = useCallback(() => {
    setReplaceTarget(null)
    fileInput.current?.click()
  }, [])
  // Remplacement : mémoriser la vignette ciblée puis ouvrir le même sélecteur.
  const startReplace = useCallback((m: MiniatureWithUrl) => {
    setReplaceTarget(m)
    fileInput.current?.click()
  }, [])
  // Le + reste visible mais désactivé hors périmètre ajoutable.
  useTabAddAction(handleAddImage, addLabel, {
    disabled: !canAdd,
    extra: headerExtra,
  })

  // Ouvre le recadreur après validation basique du fichier choisi.
  function pickFile(file: File) {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      toast.error('Choisis une image bitmap (JPG, PNG, WebP…).')
      return
    }
    setCropFile(file)
  }

  // Reçoit le carré 150px (blob + hash) du cropper, puis REMPLACE l'image ciblée
  // (propagé à toutes les entités) ou AJOUTE au pool selon `replaceTarget`.
  async function handleCropConfirm(result: CropResult) {
    if (!session) {
      toast.error('Session expirée, reconnecte-toi.')
      return
    }
    // Remplacement d'une vignette existante : repointe la ligne, l'image change
    // partout où elle est utilisée. Son périmètre (site_id d'origine) est conservé.
    if (replaceTarget !== null) {
      try {
        const { refs, unchanged } = await replace.mutateAsync({
          id: replaceTarget.id,
          oldStoragePath: replaceTarget.storage_path,
          blob: result.blob,
          hash: result.hash,
        })
        toast.success(
          unchanged
            ? 'Image inchangée (déjà cette vignette).'
            : refs > 0
              ? `Image remplacée — ${String(refs)} élément(s) mis à jour.`
              : 'Image remplacée.',
        )
        setCropFile(null)
        setReplaceTarget(null)
      } catch (e) {
        toast.error(errorMessage(e))
      }
      return
    }
    // Ajout au pool.
    if (uploadSiteId === undefined) {
      toast.error(
        'Choisis un périmètre précis (Commun ou un site) pour ajouter.',
      )
      return
    }
    if (uploadSiteId === null && !canEntreprise) {
      toast.error('Tu n’as pas le droit d’ajouter au pool commun.')
      return
    }
    try {
      await upload.mutateAsync({
        blob: result.blob,
        hash: result.hash,
        siteId: uploadSiteId,
        createdBy: session.user.id,
      })
      toast.success('Vignette ajoutée')
      setCropFile(null)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) pickFile(file)
          e.target.value = ''
        }}
      />

      <QueryState
        query={query}
        pending={<CardSkeletons count={8} height="h-32" />}
        empty={
          <EmptyState
            icon={ImageOff}
            title="Aucune vignette"
            description={
              canManage
                ? 'Ajoute une image via le bouton + en haut à droite.'
                : 'Aucune vignette pour le moment.'
            }
          />
        }
      >
        {(all) => {
          const visible = all.filter((m) => scopeMatches(scope, m.site_id))
          if (visible.length === 0) {
            return (
              <EmptyState
                icon={ImageOff}
                title="Aucune vignette ici"
                description="Aucune vignette dans ce périmètre pour le moment."
              />
            )
          }
          return (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {visible.map((miniature) => {
                const isSelected = selected.has(miniature.id)
                const canManageThis =
                  canManage && (canEntreprise || miniature.site_id !== null)
                const siteName =
                  miniature.site_id === null
                    ? null
                    : (sites.find((s) => s.id === miniature.site_id)?.nom ??
                      null)
                return (
                  <div
                    key={miniature.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={
                      isSelected
                        ? 'Désélectionner la vignette'
                        : 'Sélectionner la vignette'
                    }
                    onClick={() => toggleSelect(miniature.id)}
                    onKeyDown={(e) => {
                      // N'agir que si la tuile est elle-même la cible : un
                      // Entrée/Espace sur le bouton Supprimer interne ne doit pas
                      // être détourné vers la (dé)sélection.
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleSelect(miniature.id)
                      }
                    }}
                    className={cn(
                      'group focus-visible:ring-ring relative cursor-pointer overflow-hidden rounded-lg border transition focus-visible:ring-2 focus-visible:outline-none',
                      isSelected
                        ? 'ring-primary ring-2'
                        : 'hover:ring-ring/40 hover:ring-2',
                    )}
                  >
                    {miniature.url !== null ? (
                      <img
                        src={miniature.url}
                        alt="Vignette"
                        className="bg-muted aspect-square w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="bg-muted text-muted-foreground flex aspect-square w-full items-center justify-center">
                        <ImageOff className="size-6" />
                      </div>
                    )}

                    {/* Indicateur de sélection discret. */}
                    {isSelected && (
                      <div className="bg-primary text-primary-foreground absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full shadow">
                        <Check className="size-3.5" />
                      </div>
                    )}

                    {/* Badge de périmètre : utile seulement en vue « Tout ». */}
                    {scope === SCOPE_ALL && (
                      <div className="absolute right-1 bottom-1">
                        {miniature.site_id === null ? (
                          <Badge variant="secondary">Commun</Badge>
                        ) : siteName !== null ? (
                          <Badge variant="outline">{siteName}</Badge>
                        ) : null}
                      </div>
                    )}

                    {/* Actions au survol (n'altèrent pas la sélection) : remplacer
                        l'image — répercuté sur toutes les entités liées — puis
                        supprimer. */}
                    {canManageThis && (
                      <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
                        <Button
                          variant="secondary"
                          size="icon"
                          className="size-7"
                          onClick={(e) => {
                            e.stopPropagation()
                            startReplace(miniature)
                          }}
                          aria-label="Remplacer l’image"
                          title="Remplacer l’image"
                        >
                          <ImageUp className="size-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="size-7"
                          onClick={(e) => {
                            e.stopPropagation()
                            setToDelete(miniature)
                          }}
                          aria-label="Supprimer la vignette"
                          title="Supprimer"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        }}
      </QueryState>

      {cropFile !== null && (
        <MiniatureCropDialog
          key={`${cropFile.name}-${String(cropFile.size)}`}
          open
          file={cropFile}
          note={
            replaceTarget !== null
              ? 'La nouvelle image remplacera l’actuelle partout où cette vignette est déjà utilisée.'
              : undefined
          }
          onOpenChange={(open) => {
            if (!open) {
              setCropFile(null)
              setReplaceTarget(null)
            }
          }}
          onConfirm={(result) => void handleCropConfirm(result)}
          pending={
            replaceTarget !== null ? replace.isPending : upload.isPending
          }
        />
      )}

      <ConfirmDialog
        open={massDeleteOpen}
        onOpenChange={(open) => {
          if (!open) setMassDeleteOpen(false)
        }}
        title="Supprimer les vignettes sélectionnées ?"
        description={`${String(deletableSelected.length)} vignette(s) seront supprimées définitivement (pas de corbeille). Celles encore utilisées par une entité seront ignorées.`}
        confirmLabel="Supprimer"
        destructive
        loading={massDeleting}
        onConfirm={() => void runMassDelete()}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer la vignette ?"
        description="Suppression définitive (pas de corbeille). Refusée si la vignette est encore utilisée par une entité."
        confirmLabel="Supprimer"
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
