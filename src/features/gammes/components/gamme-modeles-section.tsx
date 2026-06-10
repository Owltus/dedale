import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layers, Link2Off, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { gammesQueries, type ModeleOperationLie } from '../queries'
import { useDelierModeleOperation } from '../mutations'
import { ImportModeleOperationDialog } from './import-modele-operation-dialog'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { errorMessage, pgCode } from '@/lib/form'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

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
}

/** Message clair pour un détachement refusé (pas de mur d'erreur brut). */
function detachErrorMessage(e: unknown): string {
  const code = pgCode(e)
  // insufficient_privilege : RLS (hors scope d'écriture).
  if (code === '42501') {
    return 'Action non autorisée : vous n’avez pas les droits pour modifier cette gamme.'
  }
  // restrict_violation (23001) : plusieurs triggers BEFORE DELETE peuvent
  // refuser (dernière source d'une gamme préventive active OU OT actifs
  // utilisant la gamme). Le front ne peut PAS distinguer la cause par le seul
  // code → on affiche le message FR explicite déjà renvoyé par la base, sans
  // inventer la cause.
  return errorMessage(e)
}

/**
 * Section partagée « Modèles d'opération liés » — réutilisée dans le détail
 * d'une gamme-template de la Bibliothèque ET dans l'onglet « Opérations » d'une
 * gamme réelle. Affiche les modèles liés via `gamme_modeles`, permet d'en
 * importer (multi) et d'en détacher (avec confirmation), sous réserve du gating.
 */
export function GammeModelesSection({
  gammeId,
  gammeSiteId,
  canEdit,
}: GammeModelesSectionProps) {
  const query = useQuery(gammesQueries.modelesLies(gammeId))
  // Rafraîchissement live des liaisons (entre onglets / comptes).
  useRealtimeRefresh('gamme_modeles', gammesQueries.all())
  const delier = useDelierModeleOperation()

  const [importOpen, setImportOpen] = useState(false)
  const [toDetach, setToDetach] = useState<ModeleOperationLie | null>(null)

  const lies = useMemo(() => query.data ?? [], [query.data])
  const liesIds = useMemo(() => lies.map((m) => m.id), [lies])

  function confirmDetach() {
    if (!toDetach) return
    delier.mutate(
      { gammeId, modeleId: toDetach.id },
      {
        onSuccess: () => {
          toast.success('Modèle d’opération détaché')
          setToDetach(null)
        },
        onError: (e) => toast.error(detachErrorMessage(e)),
      },
    )
  }

  const importButton = canEdit ? (
    <Button size="sm" onClick={() => setImportOpen(true)}>
      <Plus /> Importer un modèle d’opération
    </Button>
  ) : undefined

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Layers className="text-muted-foreground size-4" />
          Modèles d’opération liés
        </h3>
        {importButton}
      </div>

      <QueryState
        query={query}
        pending={<Skeleton className="h-24" />}
        empty={
          <EmptyState
            icon={Layers}
            title="Aucun modèle d’opération lié"
            description={
              canEdit
                ? 'Importe des modèles d’opération réutilisables pour composer cette gamme.'
                : 'Aucun modèle d’opération n’est lié à cette gamme.'
            }
            action={importButton}
          />
        }
      >
        {(modeles) => (
          <ul className="flex flex-col gap-2">
            {modeles.map((m) => (
              <li
                key={m.id}
                className="bg-card flex items-start justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate font-medium">{m.nom}</span>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={m.site_id === null ? 'secondary' : 'outline'}>
                      {m.site_id === null ? 'Commun' : 'Site'}
                    </Badge>
                    <Badge variant="outline">
                      {m.nbItems} opération{m.nbItems > 1 ? 's' : ''}
                    </Badge>
                  </div>
                  {m.description && (
                    <p className="text-muted-foreground text-sm">
                      {m.description}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setToDetach(m)}
                    aria-label="Détacher le modèle d’opération"
                  >
                    <Link2Off />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryState>

      {canEdit && (
        <ImportModeleOperationDialog
          key={liesIds.join(',')}
          open={importOpen}
          onOpenChange={setImportOpen}
          gammeId={gammeId}
          gammeSiteId={gammeSiteId}
          liesIds={liesIds}
        />
      )}

      <ConfirmDialog
        open={toDetach !== null}
        onOpenChange={(open) => {
          if (!open) setToDetach(null)
        }}
        title="Détacher le modèle d’opération ?"
        description={
          toDetach
            ? `« ${toDetach.nom} » sera retiré de cette gamme. Le modèle lui-même n’est pas supprimé.`
            : undefined
        }
        confirmLabel="Détacher"
        destructive
        loading={delier.isPending}
        onConfirm={confirmDetach}
      />
    </div>
  )
}
