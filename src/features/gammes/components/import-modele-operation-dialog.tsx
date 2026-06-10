import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { useLierModelesOperation } from '../mutations'
import { modelesOperationsQueries } from '@/features/modeles-operations/queries'
import { errorMessage, pgCode } from '@/lib/form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ErrorState } from '@/components/common/error-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

interface ImportModeleOperationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  gammeId: string
  /** Portée de la gamme : `null` = commune, sinon l'id du site. */
  gammeSiteId: string | null
  /** Ids des modèles déjà liés (exclus de la liste pour éviter le double-import). */
  liesIds: string[]
}

/**
 * Message clair pour une liaison refusée (pas de mur d'erreur brut). L'INSERT
 * est ATOMIQUE : un seul échec rejette tout le lot, donc on précise qu'aucun
 * modèle n'a été lié quand c'est pertinent.
 */
function lierErrorMessage(e: unknown): string {
  const code = pgCode(e)
  // unique_violation : modèle déjà lié (normalement filtré en amont).
  if (code === '23505') {
    return 'Un modèle sélectionné est déjà lié à la gamme. Aucun modèle n’a été lié.'
  }
  // check_violation : trigger « modèle vide » (normalement exclu en amont).
  if (code === '23514') {
    return 'Un modèle sélectionné est vide (aucune opération). Aucun modèle n’a été lié.'
  }
  // insufficient_privilege : RLS (hors scope d'écriture).
  if (code === '42501') {
    return 'Action non autorisée : vous n’avez pas les droits pour modifier cette gamme.'
  }
  return errorMessage(e)
}

/**
 * Sélecteur multiple de modèles d'opération à lier à une gamme. Ne propose que
 * les modèles ACCESSIBLES (pool RLS), NON déjà liés, et compatibles avec la
 * portée de la gamme : une gamme de site peut lier un modèle commun OU de son
 * site ; une gamme commune ne lie que des modèles communs.
 */
export function ImportModeleOperationDialog({
  open,
  onOpenChange,
  gammeId,
  gammeSiteId,
  liesIds,
}: ImportModeleOperationDialogProps) {
  const lier = useLierModelesOperation()
  const poolQuery = useQuery(modelesOperationsQueries.poolImport())
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [search, setSearch] = useState('')

  // Candidats = modèles accessibles, NON VIDES, non déjà liés, dans la portée
  // de la gamme.
  const candidates = useMemo(() => {
    const lies = new Set(liesIds)
    return (poolQuery.data ?? []).filter((m) => {
      // Modèle vide : non liable (trigger 23514) → exclu pour ne pas faire
      // échouer tout l'import groupé (INSERT atomique).
      if (m.nbItems === 0) return false
      if (lies.has(m.id)) return false
      // Cohérence de portée : commun pour toute gamme ; le site exact sinon.
      const compatible =
        m.site_id === null ||
        (gammeSiteId !== null && m.site_id === gammeSiteId)
      return compatible
    })
  }, [poolQuery.data, liesIds, gammeSiteId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter(
      (m) =>
        m.nom.toLowerCase().includes(q) ||
        (m.description ?? '').toLowerCase().includes(q),
    )
  }, [candidates, search])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    if (selected.size === 0) return
    try {
      await lier.mutateAsync({ gammeId, modeleIds: [...selected] })
      toast.success(
        selected.size > 1 ? 'Modèles d’opération liés' : 'Modèle d’opération lié',
      )
      onOpenChange(false)
    } catch (e) {
      toast.error(lierErrorMessage(e))
    }
  }

  // Pas de <FormDialog> : champ de recherche + cases à cocher (« Entrée » dans
  // la recherche ne doit pas déclencher la liaison).
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importer un modèle d’opération</DialogTitle>
          <DialogDescription>
            Coche les modèles d’opération à rattacher à cette gamme.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un modèle…"
            className="pl-8"
          />
        </div>

        <div className="max-h-72 overflow-y-auto rounded-md border">
          {poolQuery.isPending ? (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : poolQuery.isError ? (
            <ErrorState
              className="py-6"
              onRetry={() => void poolQuery.refetch()}
            />
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground p-4 text-center text-sm">
              {candidates.length === 0
                ? 'Aucun modèle d’opération disponible à lier.'
                : 'Aucun modèle ne correspond à ta recherche.'}
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map((m) => {
                const checked = selected.has(m.id)
                return (
                  <li key={m.id}>
                    <label className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(m.id)}
                        className="size-4"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{m.nom}</span>
                        {m.description && (
                          <span className="text-muted-foreground truncate text-xs">
                            {m.description}
                          </span>
                        )}
                      </span>
                      {m.site_id === null && (
                        <Badge variant="secondary">Commun</Badge>
                      )}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={lier.isPending}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={lier.isPending || selected.size === 0}
          >
            {lier.isPending
              ? 'Liaison…'
              : `Lier${selected.size > 0 ? ` (${String(selected.size)})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
