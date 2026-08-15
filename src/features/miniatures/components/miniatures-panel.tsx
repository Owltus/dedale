import { useCallback, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, ImageOff, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { miniaturesQueries, type MiniatureWithUrl } from '../queries'
import {
  useDeleteMiniature,
  useReplaceMiniature,
  useUploadMiniature,
} from '../mutations'
import { MiniatureCropDialog, type CropResult } from './miniature-crop-dialog'
import { MiniatureFilters } from './miniature-filters'
import { MiniatureTuile } from './miniature-tuile'
import { useMiniatureDownload } from '../use-miniature-download'
import { filterMiniatures } from '../filters'
import { useAuth } from '@/auth'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useScope } from '@/hooks/use-scope'
import { useSiteContext } from '@/lib/site-context'
import { deleteErrorMessage, writeErrorMessage } from '@/lib/form'
import { SCOPE_ALL, scopeMatches, scopeTarget } from '@/lib/scope'
import * as perm from '@/lib/permissions'
import { useTabAddAction } from '@/components/common/tab-actions'
import { ScopeSelect } from '@/components/common/scope-select'
import { EmptyState } from '@/components/common/empty-state'
import { NoSearchResults } from '@/components/common/no-search-results'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { Button } from '@/components/ui/button'

// Familles d'usage d'une vignette (origines de v_miniatures_pool) → libellés UI.
const ORIGINE_LABEL: Record<string, string> = {
  equipement: 'Équipements',
  operation: 'Opérations',
  plan_maintenance: 'Plan de maintenance',
  di: 'Demandes d’intervention',
  lieux: 'Lieux',
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
  const [massDeleteOpen, setMassDeleteOpen] = useState(false)
  const [massDeleting, setMassDeleting] = useState(false)
  const [toDelete, setToDelete] = useState<MiniatureWithUrl | null>(null)
  // Recherche sur les noms des entités liées.
  const [recherche, setRecherche] = useState('')

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

  // Téléchargements (unitaire au survol / sélection en ZIP au-delà d'une image).
  const { zipping, downloadOne, downloadSelection } =
    useMiniatureDownload(selectedMiniatures)

  // Suppression de masse : supprime chaque vignette supprimable (permissif — les
  // entités liées sont détachées par la base). Les échecs = droits insuffisants /
  // erreur réseau, plus jamais « encore utilisée ».
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
        `${String(fail)} non supprimée(s) (non autorisée(s) ou erreur)`,
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
      onError: (e) => toast.error(deleteErrorMessage(e)),
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
        fluid
      />
    ),
    [scope, setScope],
  )

  // Actions de masse (sélection) : boutons COMPACTS → `actions` de la barre (restent
  // en haut à droite avec le +). Le filtre de périmètre, lui, est passé en `extra`
  // (sa propre ligne pleine largeur sur mobile). `null` quand rien n'est sélectionné.
  const massActions = useMemo(
    () =>
      selectedCount > 0 ? (
        <>
          <span className="px-1 text-xs text-muted-foreground tabular-nums">
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
        </>
      ) : null,
    [
      selectedCount,
      zipping,
      canDeleteAny,
      downloadSelection,
      openMassDelete,
      clearSelection,
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
    extra: scopeControl,
    actions: massActions,
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
        toast.error(writeErrorMessage(e))
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
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <div className="-mt-4 flex h-full flex-col gap-4 sm:mt-0">
      {/* Sous `sm`, on annule le `pt-4` du panneau défilant de <Tabs> pour que la
          barre de recherche soit à la MÊME distance des dropdowns (périmètre /
          section) qu'ils le sont entre eux (~12px). Inchangé en bureau. */}
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

      <MiniatureFilters
        recherche={recherche}
        onRechercheChange={setRecherche}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <QueryState
          query={query}
          pending={
            <CardSkeletons
              count={18}
              height="aspect-square"
              container="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12"
            />
          }
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
            const shown = filterMiniatures(visible, recherche)
            if (shown.length === 0) {
              return (
                <NoSearchResults description="Aucune vignette ne correspond à ce filtre d’origine ou cette recherche." />
              )
            }
            return (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12">
                {shown.map((miniature) => (
                  <MiniatureTuile
                    key={miniature.id}
                    miniature={miniature}
                    selected={selected.has(miniature.id)}
                    canManage={
                      canManage && (canEntreprise || miniature.site_id !== null)
                    }
                    siteName={
                      miniature.site_id === null
                        ? null
                        : (sites.find((s) => s.id === miniature.site_id)?.nom ??
                          null)
                    }
                    showScopeBadge={scope === SCOPE_ALL}
                    onToggle={toggleSelect}
                    onDownload={(m) => void downloadOne(m)}
                    onReplace={startReplace}
                    onDelete={setToDelete}
                  />
                ))}
              </div>
            )
          }}
        </QueryState>
      </div>

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
        description={`${String(deletableSelected.length)} vignette(s) seront supprimées définitivement. Les éléments liés perdront leur vignette.`}
        confirmLabel="Supprimer"
        destructive
        loading={massDeleting}
        onConfirm={() => void runMassDelete()}
      />

      <ConfirmDeleteDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        entityLabel="la vignette"
        impactsTitle={
          toDelete && toDelete.origines.length > 0
            ? 'Cette image est utilisée dans :'
            : undefined
        }
        impacts={toDelete?.origines.map((o) => ORIGINE_LABEL[o] ?? o)}
        warning={
          toDelete && toDelete.origines.length > 0
            ? 'Les éléments liés perdront leur vignette ; tu pourras en remettre une autre.'
            : 'Cette vignette n’est utilisée nulle part : suppression définitive.'
        }
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
