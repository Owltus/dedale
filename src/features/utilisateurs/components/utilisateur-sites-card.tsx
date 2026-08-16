import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Lock, Plus, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { utilisateursQueries } from '../queries'
import { useAssignSite, useUnassignSite } from '../mutations'
import { sitesQueries } from '@/features/sites/queries'
import { errorMessage, writeErrorMessage } from '@/lib/form'
import { Button } from '@/components/ui/button'
import { SelectDropdown } from '@/components/ui/select-dropdown'
import { ErrorState } from '@/components/common/error-state'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// --- Cible admin : pas d'attribution de sites ---

export function AdminSitesNotice() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Accès aux sites</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" />
          <span>
            Administrateur : accès à <strong>tous les sites</strong>. Aucune
            attribution nécessaire.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// --- Accès aux sites : liste attribuée + dropdown d'ajout ---

export function SitesCard({
  userId,
  canEdit,
}: {
  userId: string
  canEdit: boolean
}) {
  // On garde l'objet query : ne lire que `data` avec un `?? []` faisait afficher
  // « Aucun site attribué » alors que la requête avait ÉCHOUÉ — une affirmation
  // fausse sur un écran de droits, sans moyen de réessayer.
  const sitesQuery = useQuery(utilisateursQueries.sitesOf(userId))
  const { data: assigned = [], isPending } = sitesQuery
  const { data: mySites = [] } = useQuery(sitesQueries.mine())
  const assign = useAssignSite()
  const unassign = useUnassignSite()
  const [busy, setBusy] = useState<string | null>(null)

  const assignedIds = new Set(assigned.map((a) => a.site_id))
  const myIds = new Set(mySites.map((s) => s.id))
  // Sites de l'appelant attribués à la cible : modifiables (croix rouge).
  const editable = assigned.filter((a) => myIds.has(a.site_id))
  // Sites attribués hors du périmètre de l'appelant (donnés par un admin) :
  // affichés en lecture seule, non retirables.
  const horsPerimetre = assigned.filter((a) => !myIds.has(a.site_id))
  // Sites de l'appelant pas encore attribués : proposés dans le dropdown.
  const available = mySites.filter((s) => !assignedIds.has(s.id))

  function handleAdd(siteId: string) {
    if (!siteId) return
    setBusy(siteId)
    assign.mutate(
      { userId, siteId },
      {
        onSuccess: () => toast.success('Site ajouté'),
        onError: (e) => toast.error(writeErrorMessage(e)),
        onSettled: () => setBusy(null),
      },
    )
  }

  function handleRemove(siteId: string) {
    setBusy(siteId)
    unassign.mutate(
      { userId, siteId },
      {
        onSuccess: () => toast.success('Site retiré'),
        onError: (e) => toast.error(errorMessage(e)),
        onSettled: () => setBusy(null),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accès aux sites</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : sitesQuery.isError ? (
          <ErrorState onRetry={() => void sitesQuery.refetch()} />
        ) : (
          <>
            {editable.length === 0 && horsPerimetre.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun site attribué.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {editable.map((a) => (
                  <li
                    key={a.site_id}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="truncate">{a.sites.nom}</span>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:text-destructive"
                        aria-label={`Retirer ${a.sites.nom}`}
                        disabled={busy === a.site_id}
                        onClick={() => handleRemove(a.site_id)}
                      >
                        <X />
                      </Button>
                    )}
                  </li>
                ))}
                {horsPerimetre.map((a) => (
                  <li
                    key={a.site_id}
                    className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground"
                  >
                    <Lock className="size-3.5 shrink-0" />
                    <span className="truncate">{a.sites.nom}</span>
                    <span className="ml-auto text-xs">
                      hors de votre périmètre
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {canEdit && available.length > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="add-site">Ajouter un site</Label>
                <div className="relative">
                  <Plus className="pointer-events-none absolute top-1/2 left-2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
                  {/* Sélecteur d'ACTION : choisir un site le rattache aussitôt,
                      la valeur ne reste donc jamais affichée — d'où un `value`
                      vide et un placeholder permanent. */}
                  <SelectDropdown
                    id="add-site"
                    value=""
                    onValueChange={handleAdd}
                    options={available.map((s) => ({
                      value: s.id,
                      label: s.nom,
                    }))}
                    placeholder="Choisir un site à ajouter…"
                    ariaLabel="Ajouter un site"
                    className="pl-8"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
