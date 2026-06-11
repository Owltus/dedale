import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ListChecks, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { modelesOperationsQueries, type ModeleOperation } from '../queries'
import { useDetacherEtSupprimerModeleOperation } from '../mutations'
import { GammeTypeFormDialog } from './gamme-type-form-dialog'
import { OperationItemsEditor } from './operation-items-editor'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useScope } from '@/hooks/use-scope'
import { useBiblioDrill } from '@/hooks/use-biblio-drill'
import { useSiteContext } from '@/lib/site-context'
import { errorMessage, pgCode } from '@/lib/form'
import { scopeMatches, scopeTarget } from '@/lib/scope'
import * as perm from '@/lib/permissions'
import { useTabAddAction, useTabTitle } from '@/components/common/tab-actions'
import { TitleBreadcrumb } from '@/components/common/title-breadcrumb'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ScopeSelect } from '@/components/common/scope-select'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cardGrid } from '@/lib/responsive'

/**
 * Message clair pour une suppression de modèle d'opération refusée (pas de mur
 * d'erreur brut `23503`/`23001`).
 */
function deleteModeleErrorMessage(e: unknown): string {
  const code = pgCode(e)
  // insufficient_privilege : RLS (hors scope d'écriture).
  if (code === '42501') {
    return 'Action non autorisée : vous n’avez pas les droits pour supprimer ce modèle.'
  }
  // foreign_key_violation : encore lié à des gammes hors périmètre (RLS) → le
  // détachement n'a pas pu tout retirer. Message générique sans inventer la cause.
  if (code === '23503') {
    return 'Ce modèle reste lié à des gammes hors de votre périmètre : suppression impossible.'
  }
  // restrict_violation (23001) : trigger BEFORE DELETE sur le détachement
  // (dernière source d'opérations d'une gamme préventive active OU OT actifs).
  // Le message FR de la base est explicite → on l'affiche tel quel.
  return errorMessage(e)
}

/** Panneau « Modèles d'opérations » : liste des modèles + leurs opérations. */
export function GammesTypesPanel() {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  const canEntreprise = perm.canManageAdmin(role)
  const { activeSiteId, activeSite, sites } = useSiteContext()
  const query = useQuery(modelesOperationsQueries.pool())
  const detachEtSupprime = useDetacherEtSupprimerModeleOperation()
  const { scope, setScope } = useScope()

  // Le + (vue liste) adopte le périmètre choisi : Commun (entreprise) ou un
  // site précis. Désactivé sur « Tout » ou sur Commun sans le droit.
  const targetSiteId = scopeTarget(scope)
  const canAdd =
    canManage &&
    targetSiteId !== undefined &&
    (targetSiteId !== null || canEntreprise)
  const lockedScope =
    targetSiteId === undefined
      ? null
      : {
          portee:
            targetSiteId === null ? ('entreprise' as const) : ('site' as const),
          siteId: targetSiteId,
        }

  const [form, setForm] = useState<{
    open: boolean
    modele: ModeleOperation | null
  }>({ open: false, modele: null })
  const [toDelete, setToDelete] = useState<ModeleOperation | null>(null)

  // Gammes liées au modèle à supprimer : on anticipe le RESTRICT FK plutôt que
  // de heurter un mur d'erreur. La requête n'est active que pendant la confirmation.
  const liensQuery = useQuery({
    ...modelesOperationsQueries.liens(toDelete?.id ?? ''),
    enabled: toDelete !== null,
  })
  const liens = liensQuery.data ?? []
  const hasLiens = liens.length > 0

  // Tous les modèles (non filtrés par périmètre) : référentiel du hook de
  // navigation par URL — le segment se résout quel que soit le filtre courant.
  const allModeles = useMemo(() => query.data ?? [], [query.data])
  const { selected, open: ouvrirModele } = useBiblioDrill(
    'gammes-types',
    allModeles,
  )

  const handleAdd = useCallback(() => setForm({ open: true, modele: null }), [])
  const handleEditSelected = useCallback(() => {
    if (selected !== null) setForm({ open: true, modele: selected })
  }, [selected])
  const scopeControl = useMemo(
    () => <ScopeSelect value={scope} onChange={setScope} />,
    [scope, setScope],
  )
  const atRoot = selected === null
  // Détail : le + est masqué ; à sa place, l'action « Modifier le modèle »
  // (icône) si l'utilisateur peut éditer ce modèle (entreprise, ou modèle de
  // site). Racine : + « Nouveau modèle d'opération » + sélecteur de périmètre.
  const editExtra = useMemo<ReactNode>(
    () =>
      selected !== null &&
      canManage &&
      (canEntreprise || selected.site_id !== null) ? (
        <TooltipIconButton
          icon={<Pencil />}
          label="Modifier le modèle d’opération"
          onClick={handleEditSelected}
        />
      ) : undefined,
    [selected, canManage, canEntreprise, handleEditSelected],
  )
  useTabAddAction(
    atRoot && canManage ? handleAdd : null,
    atRoot && !canAdd
      ? 'Ajout indisponible pour ce périmètre'
      : 'Nouveau modèle d’opération',
    atRoot ? { disabled: !canAdd, extra: scopeControl } : { extra: editExtra },
  )

  // Titre : libellé de l'onglet à la racine (défaut de <Tabs>), nom du modèle
  // ouvert en détail (fil d'Ariane sans ancêtre, comme Gammes).
  const titleNode = useMemo<ReactNode>(
    () =>
      selected === null ? null : (
        <TitleBreadcrumb ancestors={[]} current={selected.nom} />
      ),
    [selected],
  )
  useTabTitle(titleNode)

  // Mises à jour live entre fenêtres / comptes (Realtime).
  useRealtimeRefresh('modeles_operations', modelesOperationsQueries.all())

  function confirmDelete() {
    if (!toDelete) return
    // TOUJOURS via la RPC atomique : elle détache TOUTES les liaisons — y compris
    // celles masquées à l'appelant par la RLS (cross-site), qu'un DELETE direct
    // laisserait, butant alors sur la FK RESTRICT (23503) — puis supprime le
    // modèle en re-vérifiant les droits. Le cas « 0 liaison » est géré
    // trivialement (détache 0 ligne puis supprime). La query `liens` ne sert
    // plus qu'à formuler le message de confirmation.
    detachEtSupprime.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Modèle d’opération supprimé')
        setToDelete(null)
      },
      onError: (e: unknown) => toast.error(deleteModeleErrorMessage(e)),
    })
  }

  if (selected) {
    // Un tech ne gère les opérations que d'un modèle d’opération de site.
    const canManageItems =
      canManage && (canEntreprise || selected.site_id !== null)
    return (
      <>
        <OperationItemsEditor modele={selected} canManage={canManageItems} />
        {canManage && (
          <GammeTypeFormDialog
            key={`${form.modele?.id ?? 'new'}-${String(form.open)}`}
            open={form.open}
            onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
            modele={form.modele}
            canEntreprise={canEntreprise}
            siteId={form.modele?.site_id ?? activeSiteId}
            siteName={
              form.modele?.site_id
                ? (sites.find((s) => s.id === form.modele?.site_id)?.nom ??
                  null)
                : (activeSite?.nom ?? null)
            }
          />
        )}
      </>
    )
  }

  // Suppression : on adapte le message à l'état des liens (chargement / liés / libres).
  // Noms des gammes ACTIVES liées (les soft-deletées bloquent aussi mais sont tues).
  const liesNoms = liens.filter((l) => !l.supprimee).map((l) => l.nom)
  const nbActives = liesNoms.length
  const nbCorbeille = liens.length - nbActives
  const apercuNoms = liesNoms
    .slice(0, 5)
    .map((n) => `« ${n} »`)
    .join(', ')
  const reste = nbActives - 5
  const resteNoms = reste > 0 ? ` et ${String(reste)} autre(s)` : ''
  const corbeilleNote =
    nbCorbeille > 0
      ? ` (+ ${String(nbCorbeille)} liaison${
          nbCorbeille > 1 ? 's' : ''
        } en corbeille)`
      : ''
  const deleteDescription = !toDelete
    ? undefined
    : liensQuery.isLoading
      ? 'Vérification des gammes liées…'
      : liensQuery.isError
        ? `Vérification des gammes liées impossible. La suppression détachera automatiquement toute liaison résiduelle puis supprimera « ${toDelete.nom} ».`
        : !hasLiens
          ? `« ${toDelete.nom} » et ses opérations seront supprimés définitivement (toute liaison résiduelle sera détachée).`
          : nbActives > 0
            ? `« ${toDelete.nom} » est utilisé par ${String(nbActives)} gamme${
                nbActives > 1 ? 's' : ''
              } (${apercuNoms}${resteNoms})${corbeilleNote}. Le détacher de ${
                nbActives > 1 ? 'ces gammes' : 'cette gamme'
              } (sans les supprimer) puis le supprimer définitivement ?`
            : `« ${toDelete.nom} » a ${String(nbCorbeille)} liaison${
                nbCorbeille > 1 ? 's' : ''
              } en corbeille à détacher. Le supprimer définitivement ?`

  return (
    <div className="flex flex-col gap-4">
      <QueryState
        query={query}
        pending={<CardSkeletons count={4} />}
        empty={
          <EmptyState
            icon={ListChecks}
            title="Aucun modèle d’opération"
            description={
              canManage
                ? 'Crée un premier modèle d’opération pour réutiliser des jeux d’opérations.'
                : 'Aucun modèle d’opération accessible.'
            }
          />
        }
      >
        {(modeles) => {
          const visible = modeles.filter((m) => scopeMatches(scope, m.site_id))
          if (visible.length === 0) {
            return (
              <EmptyState
                icon={ListChecks}
                title="Aucun modèle d’opération ici"
                description="Aucun modèle d’opération dans ce périmètre pour le moment."
              />
            )
          }
          return (
            <div className={cardGrid.compact}>
              {visible.map((modele) => {
                const canEditThis = canEntreprise || modele.site_id !== null
                return (
                  <Card
                    key={modele.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Ouvrir le modèle ${modele.nom}`}
                    className="focus-visible:ring-ring min-w-0 cursor-pointer transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:outline-none"
                    onClick={() => ouvrirModele(modele)}
                    onKeyDown={(e) => {
                      // N'agir que si la carte est elle-même la cible : un
                      // Entrée/Espace sur un bouton interne (Modifier/Supprimer)
                      // ne doit pas être détourné vers l'ouverture du détail.
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        ouvrirModele(modele)
                      }
                    }}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="truncate">{modele.nom}</CardTitle>
                        {modele.site_id === null && (
                          <Badge variant="secondary">Commun</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="text-muted-foreground flex flex-col gap-2 text-sm">
                      <span className="line-clamp-2">
                        {modele.description ?? 'Sans description.'}
                      </span>
                      {canManage && canEditThis && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setForm({ open: true, modele })
                            }}
                          >
                            <Pencil /> Modifier
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setToDelete(modele)
                            }}
                          >
                            <Trash2 /> Supprimer
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )
        }}
      </QueryState>

      {canManage && (
        <GammeTypeFormDialog
          key={`${form.modele?.id ?? `new-${scope}`}-${String(form.open)}`}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          modele={form.modele}
          canEntreprise={canEntreprise}
          siteId={form.modele?.site_id ?? activeSiteId}
          siteName={
            form.modele?.site_id
              ? (sites.find((s) => s.id === form.modele?.site_id)?.nom ?? null)
              : (activeSite?.nom ?? null)
          }
          lockedScope={form.modele ? undefined : (lockedScope ?? undefined)}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer le modèle d’opération ?"
        description={deleteDescription}
        confirmLabel={
          hasLiens
            ? 'Détacher de toutes les gammes puis supprimer'
            : 'Supprimer'
        }
        destructive
        loading={detachEtSupprime.isPending || liensQuery.isLoading}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
