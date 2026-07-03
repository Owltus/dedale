import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layers, Link2Off, Plus } from 'lucide-react'
import { gammesQueries, type ModeleOperationLie } from '../queries'
import { useDelierModeleOperation } from '../mutations'
import { ImportModeleOperationDialog } from './import-modele-operation-dialog'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { writeErrorMessage, type SqlstateOverrides } from '@/lib/form'
import { listStack } from '@/lib/responsive'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { SectionHeader } from '@/components/common/section'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ListRow } from '@/components/common/list-row'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { ScopeBadges } from '@/components/common/scope-badges'

interface GammeModelesSectionProps {
  gammeId: string
  /** Portée de la gamme : `null` = commune, sinon l'id du site. */
  gammeSiteId: string | null
  /**
   * L'utilisateur peut-il éditer CETTE gamme (gating déjà résolu par l'appelant :
   * gamme commune → admin/manager ; gamme de site → rôle métier sur son site).
   * En lecture seule : les liens s'affichent sans action.
   */
  canEdit: boolean
  /**
   * Mode PANNEAU de split (onglet Opérations de la fiche gamme) : occupe 50 % de
   * la hauteur (`lg:flex-1`), en-tête fixe et liste défilante. Omis → rendu en
   * flux normal (Bibliothèque), strictement inchangé.
   */
  fill?: boolean
}

/**
 * Message clair pour un détachement refusé (pas de mur d'erreur brut). Surcharge
 * le seul code spécifique ; les autres (dont `restrict_violation` 23001 — dernière
 * source d'une gamme préventive active OU OT actifs, cause indistinguable côté
 * front) retombent sur le message FR explicite déjà renvoyé par la base.
 */
const DETACH_ERREURS: SqlstateOverrides = {
  // insufficient_privilege : RLS (hors scope d'écriture).
  '42501':
    'Action non autorisée : vous n’avez pas les droits pour modifier cette gamme.',
}

/**
 * Section partagée « Modèles d'opération » — réutilisée dans le détail d'une
 * gamme-template de la Bibliothèque ET dans l'onglet « Opérations » d'une gamme
 * réelle (où `fill` en fait un panneau de split). Affiche les modèles liés via
 * `gamme_modeles`, permet d'en importer (multi) et d'en détacher (confirmation),
 * sous réserve du gating.
 */
export function GammeModelesSection({
  gammeId,
  gammeSiteId,
  canEdit,
  fill = false,
}: GammeModelesSectionProps) {
  const query = useQuery(gammesQueries.modelesLies(gammeId))
  // Rafraîchissement live des liaisons (entre onglets / comptes).
  useRealtimeRefresh('gamme_modeles', gammesQueries.all())
  const delier = useDelierModeleOperation()

  const [importOpen, setImportOpen] = useState(false)
  const detach = useConfirmDelete<ModeleOperationLie>({
    onDelete: (m) => delier.mutateAsync({ gammeId, modeleId: m.id }),
    successMessage: 'Modèle d’opération détaché',
    errorMessage: (e) => writeErrorMessage(e, DETACH_ERREURS),
  })

  const lies = useMemo(() => query.data ?? [], [query.data])
  const liesIds = useMemo(() => lies.map((m) => m.id), [lies])

  // Bouton « Importer » : ICÔNE SEULE + tooltip, dans l'en-tête de la section,
  // toujours présent → plus d'action d'ajout dans l'EmptyState.
  const importButton = canEdit ? (
    <TooltipIconButton
      icon={<Plus />}
      label="Importer un modèle d’opération"
      onClick={() => setImportOpen(true)}
    />
  ) : undefined

  return (
    <div
      className={
        fill
          ? 'flex flex-col gap-2 lg:min-h-0 lg:flex-1'
          : 'flex flex-col gap-3'
      }
    >
      <SectionHeader
        icon={Layers}
        title="Modèles d’opération"
        action={importButton}
      />

      <div
        className={
          fill
            ? 'no-scrollbar lg:min-h-0 lg:flex-1 lg:overflow-y-auto'
            : 'contents'
        }
      >
        <QueryState
          query={query}
          pending={<ListRowSkeletons dense count={2} />}
          empty={<EmptyState icon={Layers} title="Aucun modèle d’opération" />}
        >
          {(modeles) => (
            <div className={listStack}>
              {modeles.map((m) => (
                <ListRow
                  key={m.id}
                  // Carte VOLONTAIREMENT plus fine (h-12, comme les opérations) avec
                  // un grand SVG de repli centré (carré muté) à la place de l'image.
                  className="h-12"
                  media={
                    <span className="bg-muted text-muted-foreground flex size-full items-center justify-center">
                      <Layers className="size-8" />
                    </span>
                  }
                  title={m.nom}
                  subtitle={
                    m.description?.trim() ? m.description.trim() : undefined
                  }
                  // Métadonnées à POSITION FIXE (mêmes colonnes d'une carte à
                  // l'autre) : portée à gauche, nombre d'opérations dans un
                  // emplacement de largeur constante aligné à droite.
                  badges={<ScopeBadges siteId={m.site_id} />}
                  // Sous `sm`, badges + meta (colonne droite) masqués → on replie
                  // portée ET nombre d'opérations sous le titre.
                  mobileMeta={
                    <span className="flex items-center gap-1.5">
                      <ScopeBadges siteId={m.site_id} />
                      <span>
                        {m.nbItems} opération{m.nbItems > 1 ? 's' : ''}
                      </span>
                    </span>
                  }
                  meta={
                    <span className="flex w-32 justify-center">
                      <Badge variant="outline" className="tabular-nums">
                        {m.nbItems} opération{m.nbItems > 1 ? 's' : ''}
                      </Badge>
                    </span>
                  }
                  actions={
                    canEdit ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => detach.demander(m)}
                        aria-label={`Détacher le modèle « ${m.nom} »`}
                      >
                        <Link2Off />
                      </Button>
                    ) : undefined
                  }
                />
              ))}
            </div>
          )}
        </QueryState>
      </div>

      {canEdit && (
        <ImportModeleOperationDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          gammeId={gammeId}
          gammeSiteId={gammeSiteId}
          liesIds={liesIds}
        />
      )}

      <ConfirmDialog
        {...detach.dialogProps}
        title="Détacher le modèle d’opération ?"
        description={
          detach.toDelete
            ? `« ${detach.toDelete.nom} » sera retiré de cette gamme. Le modèle lui-même n’est pas supprimé.`
            : undefined
        }
        confirmLabel="Détacher"
        destructive
      />
    </div>
  )
}
