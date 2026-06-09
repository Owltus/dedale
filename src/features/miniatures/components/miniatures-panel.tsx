import { useCallback, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Download, ImageOff, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { miniaturesQueries, type MiniatureWithUrl } from '../queries'
import { useDeleteMiniature, useUploadMiniature } from '../mutations'
import { MiniatureCropDialog, type CropResult } from './miniature-crop-dialog'
import { useAuth } from '@/auth'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/form'
import { cn } from '@/lib/utils'
import * as perm from '@/lib/permissions'
import { useTabAddAction } from '@/components/common/tab-actions'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

// Périmètre affiché / cible d'ajout. 'all' = tout, 'entreprise' = pool commun,
// sinon un id de site.
const SCOPE_ALL = 'all'
const SCOPE_COMMUN = 'entreprise'

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
  const { activeSiteId, sites } = useSiteContext()
  const query = useQuery(miniaturesQueries.pool())
  const upload = useUploadMiniature()
  const del = useDeleteMiniature()

  const fileInput = useRef<HTMLInputElement>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [zipping, setZipping] = useState(false)
  const [massDeleteOpen, setMassDeleteOpen] = useState(false)
  const [massDeleting, setMassDeleting] = useState(false)
  const [toDelete, setToDelete] = useState<MiniatureWithUrl | null>(null)

  // Périmètre courant (filtre + cible d'ajout). Défaut : Commun pour
  // admin/manager ; sinon le site actif (choix logique si plusieurs sites).
  const [scope, setScope] = useState<string>(() =>
    canEntreprise ? SCOPE_COMMUN : (activeSiteId ?? SCOPE_ALL),
  )

  // Cible d'upload : null = Commun, undefined = « Tout » (ajout impossible),
  // sinon l'id de site sélectionné.
  const uploadSiteId: string | null | undefined =
    scope === SCOPE_ALL ? undefined : scope === SCOPE_COMMUN ? null : scope
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

  // Sélecteur de périmètre. Changer de périmètre réinitialise la sélection.
  const scopeControl = useMemo(
    () => (
      <Select
        aria-label="Périmètre des vignettes"
        value={scope}
        onChange={(e) => {
          setScope(e.target.value)
          setSelected(new Set())
        }}
        className="w-auto"
      >
        <option value={SCOPE_ALL}>Tout</option>
        <option value={SCOPE_COMMUN}>Commun</option>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nom}
          </option>
        ))}
      </Select>
    ),
    [scope, sites],
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

  const handleAddImage = useCallback(() => fileInput.current?.click(), [])
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

  // Reçoit le carré 150px (blob + hash) du cropper et lance l'upload.
  async function handleCropConfirm(result: CropResult) {
    if (!session) {
      toast.error('Session expirée, reconnecte-toi.')
      return
    }
    if (uploadSiteId === undefined) {
      toast.error(
        'Choisis un périmètre précis (Commun ou un site) pour ajouter.',
      )
      return
    }
    if (uploadSiteId === null && !canEntreprise) {
      toast.error("Tu n'as pas le droit d'ajouter au pool commun.")
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
          const visible = all.filter((m) =>
            scope === SCOPE_ALL
              ? true
              : scope === SCOPE_COMMUN
                ? m.site_id === null
                : m.site_id === scope,
          )
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
                const canDeleteThis =
                  canManage && (canEntreprise || miniature.site_id !== null)
                const siteName =
                  miniature.site_id === null
                    ? null
                    : (sites.find((s) => s.id === miniature.site_id)?.nom ??
                      null)
                return (
                  <div
                    key={miniature.id}
                    onClick={() => toggleSelect(miniature.id)}
                    className={cn(
                      'group relative cursor-pointer overflow-hidden rounded-lg border transition',
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

                    {/* Suppression individuelle (au survol ; n'altère pas la sélection). */}
                    {canDeleteThis && (
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          setToDelete(miniature)
                        }}
                        aria-label="Supprimer la vignette"
                      >
                        <Trash2 className="size-4" />
                      </Button>
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
          onOpenChange={(open) => {
            if (!open) setCropFile(null)
          }}
          onConfirm={(result) => void handleCropConfirm(result)}
          pending={upload.isPending}
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
